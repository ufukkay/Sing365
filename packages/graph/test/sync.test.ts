import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { createDb, upsertTenantOnConsent, type Db } from "@sing365/db";
import { GraphClient, mapUser, syncTenant, USERS_DELTA_START, GROUPS_DELTA_START } from "../src/index";

/**
 * Integration test against a real Postgres. Needs:
 *   TEST_DATABASE_URL       superuser URL of an empty database (migrations are applied here)
 *   TEST_APP_DATABASE_URL   same database as a NON-superuser role (so RLS applies)
 */
const ADMIN_URL = process.env.TEST_DATABASE_URL;
const APP_URL = process.env.TEST_APP_DATABASE_URL;

const graphUser = (id: string, mail: string | null, extra: Record<string, unknown> = {}) => ({
  id,
  mail,
  displayName: `User ${id.slice(-2)}`,
  jobTitle: "Uzman",
  department: "Satış",
  businessPhones: ["+90 212 000 00 00"],
  proxyAddresses: mail ? [`SMTP:${mail}`, `smtp:alias-${mail}`] : [],
  accountEnabled: true,
  userType: "Member",
  ...extra,
});

const U1 = "00000000-0000-4000-8000-0000000000a1";
const U2 = "00000000-0000-4000-8000-0000000000a2";
const U3 = "00000000-0000-4000-8000-0000000000a3";
const G1 = "00000000-0000-4000-8000-0000000000b1";

/** Fake Graph: routes by URL prefix to queued responses. */
function fakeFetch(routes: Record<string, unknown[]>) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/oauth2/v2.0/token")) return Response.json({ access_token: "t", expires_in: 3600 });
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    const next = key ? routes[key]!.shift() : undefined;
    if (!next) return Response.json({ error: { code: "notFound", message: url } }, { status: 404 });
    if (next instanceof Response) return next;
    return Response.json(next);
  }) as typeof fetch;
  return { impl, calls };
}

describe.runIf(ADMIN_URL && APP_URL)("syncTenant against Postgres", () => {
  let db: Db;
  let tenantId: string;
  const G = "https://graph.microsoft.com/v1.0";

  beforeAll(async () => {
    db = createDb(APP_URL!);
  });
  afterAll(async () => {
    await db?.end();
  });
  beforeEach(async () => {
    const admin = postgres(ADMIN_URL!, { max: 1, onnotice: () => {} });
    await admin`truncate tenants cascade`;
    await admin.end();
    tenantId = (await upsertTenantOnConsent(db, "11111111-1111-4111-8111-111111111111", "Test A.Ş.")).id;
  });

  it("full sync writes users, aliases, groups and memberships, then a delta applies changes", async () => {
    const { impl } = fakeFetch({
      [`${G}${USERS_DELTA_START}`]: [
        { value: [graphUser(U1, "ayse@test.com.tr"), graphUser(U2, "mehmet@test.com.tr")], "@odata.nextLink": `${G}/users/delta?page=2` },
      ],
      [`${G}/users/delta?page=2`]: [{ value: [graphUser(U3, null)], "@odata.deltaLink": `${G}/users/delta?token=1` }],
      [`${G}${GROUPS_DELTA_START}`]: [
        {
          value: [{ id: G1, displayName: "Satış", mail: null, "members@delta": [{ "@odata.type": "#microsoft.graph.user", id: U1 }] }],
          "@odata.deltaLink": `${G}/groups/delta?token=1`,
        },
      ],
      [`${G}/users/delta?token=1`]: [
        { value: [graphUser(U1, "ayse@test.com.tr", { jobTitle: "Müdür" }), { id: U2, "@removed": { reason: "deleted" } }], "@odata.deltaLink": `${G}/users/delta?token=2` },
      ],
      [`${G}/groups/delta?token=1`]: [
        { value: [{ id: G1, displayName: "Satış", "members@delta": [{ id: U1, "@removed": { reason: "deleted" } }] }], "@odata.deltaLink": `${G}/groups/delta?token=2` },
      ],
    });
    const graph = new GraphClient("tid", { clientId: "c", clientSecret: "s" }, impl);

    const first = await syncTenant(db, graph, tenantId);
    expect(first).toMatchObject({ ok: true, kind: "full", usersChanged: 2, groupsChanged: 1 });

    const users = await db.forTenant(tenantId, (tx) => tx`select email, aliases, job_title, deleted_at from directory_users order by email`);
    expect(users.map((u) => u.email)).toEqual(["ayse@test.com.tr", "mehmet@test.com.tr"]);
    expect(users[0]!.aliases).toEqual(["alias-ayse@test.com.tr"]);
    const members = await db.forTenant(tenantId, (tx) => tx`select count(*)::int as n from group_members`);
    expect(members[0]!.n).toBe(1);
    const [tenant] = await db.sql`select domains from tenants where id = ${tenantId}`;
    expect(tenant!.domains).toEqual(["test.com.tr"]);

    const second = await syncTenant(db, graph, tenantId);
    expect(second).toMatchObject({ ok: true, kind: "delta", usersChanged: 1, usersRemoved: 1 });
    const after = await db.forTenant(tenantId, (tx) => tx`select email, job_title, deleted_at is not null as gone from directory_users order by email`);
    expect(after).toEqual([
      { email: "ayse@test.com.tr", job_title: "Müdür", gone: false },
      { email: "mehmet@test.com.tr", job_title: "Uzman", gone: true },
    ]);
    const m2 = await db.forTenant(tenantId, (tx) => tx`select count(*)::int as n from group_members`);
    expect(m2[0]!.n).toBe(0);
  });

  it("restarts with a full sync when Graph says the delta token expired", async () => {
    const { impl } = fakeFetch({
      [`${G}${USERS_DELTA_START}`]: [
        { value: [graphUser(U1, "ayse@test.com.tr")], "@odata.deltaLink": `${G}/users/delta?token=old` },
        { value: [graphUser(U1, "ayse@test.com.tr")], "@odata.deltaLink": `${G}/users/delta?token=new` },
      ],
      [`${G}${GROUPS_DELTA_START}`]: [
        { value: [], "@odata.deltaLink": `${G}/groups/delta?token=old` },
        { value: [], "@odata.deltaLink": `${G}/groups/delta?token=new` },
      ],
      [`${G}/users/delta?token=old`]: [Response.json({ error: { code: "syncStateNotFound", message: "expired" } }, { status: 410 })],
    });
    const graph = new GraphClient("tid", { clientId: "c", clientSecret: "s" }, impl);
    await syncTenant(db, graph, tenantId);
    const r = await syncTenant(db, graph, tenantId);
    expect(r).toMatchObject({ ok: true, kind: "full" });
  });

  it("marks consent revoked when Graph refuses access", async () => {
    const { impl } = fakeFetch({
      [`${G}${USERS_DELTA_START}`]: [Response.json({ error: { code: "Authorization_RequestDenied", message: "Insufficient privileges" } }, { status: 403 })],
    });
    const graph = new GraphClient("tid", { clientId: "c", clientSecret: "s" }, impl);
    const r = await syncTenant(db, graph, tenantId);
    expect(r.ok).toBe(false);
    const [t] = await db.sql`select consent_status from tenants where id = ${tenantId}`;
    expect(t!.consent_status).toBe("revoked");
  });

  it("row level security hides another tenant's rows", async () => {
    const other = (await upsertTenantOnConsent(db, "22222222-2222-4222-8222-222222222222", "Başka Ltd")).id;
    const { impl } = fakeFetch({
      [`${G}${USERS_DELTA_START}`]: [{ value: [graphUser(U1, "ayse@test.com.tr")], "@odata.deltaLink": `${G}/u?1` }],
      [`${G}${GROUPS_DELTA_START}`]: [{ value: [], "@odata.deltaLink": `${G}/g?1` }],
    });
    await syncTenant(db, new GraphClient("tid", { clientId: "c", clientSecret: "s" }, impl), tenantId);
    const mine = await db.forTenant(tenantId, (tx) => tx`select count(*)::int as n from directory_users`);
    const theirs = await db.forTenant(other, (tx) => tx`select count(*)::int as n from directory_users`);
    const none = await db.sql`select count(*)::int as n from directory_users`;
    expect([mine[0]!.n, theirs[0]!.n, none[0]!.n]).toEqual([1, 0, 0]);
  });
});

describe("mapUser", () => {
  it("skips users without a mailbox and guests, keeps smtp aliases only", () => {
    expect(mapUser(graphUser(U1, null))).toBeNull();
    expect(mapUser(graphUser(U1, "g@x.com", { userType: "Guest" }))).toBeNull();
    const u = mapUser(graphUser(U1, "A@x.com", { proxyAddresses: ["SMTP:A@x.com", "smtp:b@x.com", "x500:/o=foo", "sip:a@x.com"] }))!;
    expect(u.aliases).toEqual(["b@x.com"]);
  });

  it("turns empty strings into null", () => {
    expect(mapUser(graphUser(U1, "a@x.com", { jobTitle: "  ", businessPhones: [] }))).toMatchObject({ jobTitle: null, businessPhone: null });
  });
});
