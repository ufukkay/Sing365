import {
  applyMemberships,
  finishSyncRun,
  lastDeltaLinks,
  markConsentRevoked,
  refreshTenantDomains,
  softDeleteGroups,
  softDeleteUsers,
  startSyncRun,
  upsertGroups,
  upsertUsers,
  type Db,
  type DirectoryUserInput,
} from "@sing365/db";
import { GraphClient, GraphError } from "./client";

const USER_FIELDS = [
  "id", "mail", "userPrincipalName", "proxyAddresses", "displayName", "givenName", "surname", "jobTitle",
  "department", "companyName", "officeLocation", "businessPhones", "mobilePhone", "streetAddress", "city",
  "state", "postalCode", "country", "accountEnabled", "userType", "onPremisesExtensionAttributes", "assignedLicenses",
];

export const USERS_DELTA_START = `/users/delta?$select=${USER_FIELDS.join(",")}`;
export const GROUPS_DELTA_START = `/groups/delta?$select=id,displayName,mail,members`;

export interface GraphUser {
  id: string;
  mail?: string | null;
  userPrincipalName?: string | null;
  proxyAddresses?: string[];
  displayName?: string | null;
  givenName?: string | null;
  surname?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  companyName?: string | null;
  officeLocation?: string | null;
  businessPhones?: string[];
  mobilePhone?: string | null;
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  accountEnabled?: boolean | null;
  userType?: string | null;
  onPremisesExtensionAttributes?: Record<string, string | null> | null;
  assignedLicenses?: unknown[];
  "@removed"?: { reason: string };
}

export interface GraphGroup {
  id: string;
  displayName?: string | null;
  mail?: string | null;
  "members@delta"?: { "@odata.type"?: string; id: string; "@removed"?: unknown }[];
  "@removed"?: { reason: string };
}

const clean = (s: string | null | undefined) => {
  const v = (s ?? "").trim();
  return v === "" ? null : v;
};

/** Graph user -> directory row. Users without a mailbox address are skipped (return null). */
export function mapUser(u: GraphUser): DirectoryUserInput | null {
  const email = clean(u.mail);
  if (!email) return null;
  if (u.userType && u.userType.toLowerCase() === "guest") return null;
  const aliases = (u.proxyAddresses ?? [])
    .filter((p) => /^smtp:/i.test(p))
    .map((p) => p.slice(5).toLowerCase())
    .filter((a) => a !== email.toLowerCase());
  const ext: Record<string, string> = {};
  for (const [k, v] of Object.entries(u.onPremisesExtensionAttributes ?? {})) if (v) ext[k] = v;
  return {
    entraObjectId: u.id,
    email,
    aliases: [...new Set(aliases)],
    displayName: clean(u.displayName),
    givenName: clean(u.givenName),
    surname: clean(u.surname),
    jobTitle: clean(u.jobTitle),
    department: clean(u.department),
    companyName: clean(u.companyName),
    officeLocation: clean(u.officeLocation),
    businessPhone: clean(u.businessPhones?.[0]),
    mobilePhone: clean(u.mobilePhone),
    streetAddress: clean(u.streetAddress),
    city: clean(u.city),
    state: clean(u.state),
    postalCode: clean(u.postalCode),
    country: clean(u.country),
    managerEntraId: null,
    extensionAttrs: ext,
    accountEnabled: u.accountEnabled !== false,
    mailboxType: "user",
  };
}

export interface SyncResult {
  ok: boolean;
  usersChanged: number;
  usersRemoved: number;
  groupsChanged: number;
  kind: "full" | "delta";
  error?: string;
}

/**
 * Syncs one tenant's users and groups from Graph into Postgres.
 * Uses the last successful delta links, so after the first full run only changes are fetched.
 * Each Graph page is written in its own transaction; the run row records the outcome.
 */
export async function syncTenant(
  db: Db,
  graph: GraphClient,
  tenantId: string,
  opts: { forceFull?: boolean } = {},
): Promise<SyncResult> {
  const links = opts.forceFull ? { users: null, groups: null } : await db.forTenant(tenantId, (tx) => lastDeltaLinks(tx, tenantId));
  const kind = links.users && links.groups ? "delta" : "full";
  const runId = await db.forTenant(tenantId, (tx) => startSyncRun(tx, tenantId, kind));
  let usersChanged = 0;
  let usersRemoved = 0;
  let groupsChanged = 0;

  try {
    let usersDeltaLink = "";
    for await (const page of graph.pages<GraphUser>(links.users ?? USERS_DELTA_START)) {
      const removed = page.value.filter((u) => u["@removed"]).map((u) => u.id);
      const mapped = page.value.filter((u) => !u["@removed"]).map(mapUser);
      const skipped = page.value.filter((u, i) => !u["@removed"] && mapped[i] === null).map((u) => u.id);
      const rows = mapped.filter((u): u is DirectoryUserInput => u !== null);
      await db.forTenant(tenantId, async (tx) => {
        usersChanged += await upsertUsers(tx, tenantId, rows);
        // A user who lost their mailbox (or became a guest) stops being a signature sender.
        await softDeleteUsers(tx, tenantId, [...removed, ...skipped]);
      });
      usersRemoved += removed.length;
      if (page.deltaLink) usersDeltaLink = page.deltaLink;
    }

    let groupsDeltaLink = "";
    for await (const page of graph.pages<GraphGroup>(links.groups ?? GROUPS_DELTA_START)) {
      await db.forTenant(tenantId, async (tx) => {
        const live = page.value.filter((g) => !g["@removed"]);
        await upsertGroups(
          tx,
          tenantId,
          live.filter((g) => g.displayName).map((g) => ({ entraObjectId: g.id, displayName: g.displayName!, mail: clean(g.mail) })),
        );
        await softDeleteGroups(tx, tenantId, page.value.filter((g) => g["@removed"]).map((g) => g.id));
        await applyMemberships(
          tx,
          tenantId,
          live.flatMap((g) =>
            (g["members@delta"] ?? [])
              .filter((m) => !m["@odata.type"] || m["@odata.type"] === "#microsoft.graph.user")
              .map((m) => ({ groupEntraId: g.id, userEntraId: m.id, removed: Boolean(m["@removed"]) })),
          ),
        );
        groupsChanged += live.length;
      });
      if (page.deltaLink) groupsDeltaLink = page.deltaLink;
    }

    await db.forTenant(tenantId, async (tx) => {
      await refreshTenantDomains(tx, tenantId);
      await finishSyncRun(tx, runId, { ok: true, usersDeltaLink, groupsDeltaLink, usersChanged });
    });
    return { ok: true, usersChanged, usersRemoved, groupsChanged, kind };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await db.forTenant(tenantId, (tx) => finishSyncRun(tx, runId, { ok: false, error: err }));
    // Graph answers 410 when a delta token has expired: start again with a full sync.
    if (e instanceof GraphError && e.status === 410 && kind === "delta") return syncTenant(db, graph, tenantId, { forceFull: true });
    if (e instanceof GraphError && e.isConsentProblem) await markConsentRevoked(db, tenantId);
    return { ok: false, usersChanged, usersRemoved, groupsChanged, kind, error: err };
  }
}
