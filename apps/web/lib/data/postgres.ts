import type { Layout } from "@sing365/render";
import type { Rule } from "@sing365/rules";
import type { Db } from "@sing365/db";
import type { DataLayer, DirectoryGroup, DirectoryUser, SyncStatus, Template, Tenant } from "./types";

/** Postgres implementation of the DataLayer contract. Every tenant read goes through db.forTenant (RLS). */

interface UserRow {
  id: string;
  email: string;
  aliases: string[];
  display_name: string | null;
  given_name: string | null;
  surname: string | null;
  job_title: string | null;
  department: string | null;
  company_name: string | null;
  office_location: string | null;
  business_phone: string | null;
  mobile_phone: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  photo_url: string | null;
  group_ids: string[] | null;
  custom_attrs: Record<string, string>;
  extension_attrs: Record<string, string> | null;
  overrides: Record<string, string>;
  account_enabled: boolean;
  last_synced_at: Date | null;
}

const toUser = (r: UserRow): DirectoryUser => ({
  id: r.id,
  email: r.email,
  aliases: r.aliases ?? [],
  displayName: r.display_name ?? r.email,
  givenName: r.given_name ?? undefined,
  surname: r.surname ?? undefined,
  jobTitle: r.job_title ?? undefined,
  department: r.department ?? undefined,
  companyName: r.company_name ?? undefined,
  officeLocation: r.office_location ?? undefined,
  businessPhone: r.business_phone ?? undefined,
  mobilePhone: r.mobile_phone ?? undefined,
  streetAddress: r.street_address ?? undefined,
  city: r.city ?? undefined,
  state: r.state ?? undefined,
  postalCode: r.postal_code ?? undefined,
  country: r.country ?? undefined,
  photoUrl: r.photo_url ?? undefined,
  groupIds: r.group_ids ?? [],
  customAttrs: r.custom_attrs ?? {},
  extAttrs: r.extension_attrs ?? {},
  overrides: r.overrides ?? {},
  accountEnabled: r.account_enabled,
  lastSyncedAt: r.last_synced_at ? r.last_synced_at.toISOString() : null,
});

const USER_SELECT = `
  u.id, u.email, u.aliases, u.display_name, u.given_name, u.surname, u.job_title, u.department, u.company_name,
  u.office_location, u.business_phone, u.mobile_phone, u.street_address, u.city, u.state, u.postal_code, u.country,
  null::text as photo_url, u.custom_attrs, u.extension_attrs, u.overrides, u.account_enabled, u.last_synced_at,
  (select array_agg(gm.group_id) from group_members gm where gm.user_id = u.id) as group_ids`;

interface TenantRow {
  id: string;
  entra_tenant_id: string;
  name: string;
  domains: string[];
  deployment_mode: Tenant["deploymentMode"];
  consent_status: Tenant["consentStatus"];
}
const toTenant = (r: TenantRow): Tenant => ({
  id: r.id,
  entraTenantId: r.entra_tenant_id,
  name: r.name,
  domains: r.domains ?? [],
  deploymentMode: r.deployment_mode,
  consentStatus: r.consent_status,
});

export function postgresData(db: Db): DataLayer {
  return {
    async getTenant(id) {
      const [r] = await db.sql<TenantRow[]>`select id, entra_tenant_id, name, domains, deployment_mode, consent_status from tenants where id = ${id}`;
      return r ? toTenant(r) : null;
    },
    async getTenantByEntraId(tid) {
      const [r] = await db.sql<TenantRow[]>`select id, entra_tenant_id, name, domains, deployment_mode, consent_status from tenants where entra_tenant_id = ${tid}`;
      return r ? toTenant(r) : null;
    },
    async listUsers(tenantId) {
      const rows = await db.forTenant(tenantId, (tx) =>
        tx.unsafe<UserRow[]>(`select ${USER_SELECT} from directory_users u where u.deleted_at is null order by u.display_name limit 500`),
      );
      return rows.map(toUser);
    },
    async getUser(tenantId, userId) {
      const rows = await db.forTenant(tenantId, (tx) =>
        tx.unsafe<UserRow[]>(`select ${USER_SELECT} from directory_users u where u.id = $1 and u.deleted_at is null`, [userId]),
      );
      return rows[0] ? toUser(rows[0]) : null;
    },
    async findUserByEmail(tenantId, email) {
      const rows = await db.forTenant(tenantId, (tx) =>
        tx.unsafe<UserRow[]>(
          `select ${USER_SELECT} from directory_users u
           where u.deleted_at is null and (u.email = $1::citext or $1::citext = any(u.aliases)) limit 1`,
          [email.trim().toLowerCase()],
        ),
      );
      return rows[0] ? toUser(rows[0]) : null;
    },
    async listGroups(tenantId) {
      const rows = await db.forTenant(tenantId, (tx) => tx<{ id: string; display_name: string }[]>`
        select id, display_name from directory_groups where deleted_at is null order by display_name`);
      return rows.map((r): DirectoryGroup => ({ id: r.id, displayName: r.display_name }));
    },
    async listTemplates(tenantId) {
      const rows = await db.forTenant(tenantId, (tx) => tx<
        { id: string; name: string; kind: Template["kind"]; status: Template["status"]; version: number; layout: Layout; updated_at: Date }[]
      >`select id, name, kind, status, version, layout, updated_at from templates order by sort_order, name`);
      return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, status: r.status, version: r.version, layout: r.layout, updatedAt: r.updated_at.toISOString() }));
    },
    async getTemplate(tenantId, templateId) {
      return (await this.listTemplates(tenantId)).find((t) => t.id === templateId) ?? null;
    },
    async listRules(tenantId) {
      const rows = await db.forTenant(tenantId, (tx) => tx<
        {
          id: string; template_id: string; priority: number; enabled: boolean; senders: Rule["senders"]; recipients: Rule["recipients"];
          exceptions: Rule["exceptions"]; applies_to: Rule["appliesTo"]; active_from: Date | null; active_until: Date | null;
        }[]
      >`select r.id, r.template_id, t.sort_order as priority, r.enabled, r.senders, r.recipients, r.exceptions, r.applies_to,
               r.active_from, r.active_until
        from rules r join templates t on t.id = r.template_id`);
      return rows.map((r) => ({
        id: r.id,
        templateId: r.template_id,
        priority: r.priority,
        enabled: r.enabled,
        senders: r.senders,
        recipients: r.recipients,
        exceptions: r.exceptions,
        appliesTo: r.applies_to,
        activeFrom: r.active_from,
        activeUntil: r.active_until,
      }));
    },
    async getSyncStatus(tenantId) {
      const [r] = await db.forTenant(tenantId, (tx) => tx<{ status: string; finished_at: Date | null; users_changed: number; error: string | null }[]>`
        select status, finished_at, users_changed, error from sync_runs order by started_at desc limit 1`);
      if (!r) return { state: "never", finishedAt: null, usersChanged: 0 } satisfies SyncStatus;
      return {
        state: r.status as SyncStatus["state"],
        finishedAt: r.finished_at?.toISOString() ?? null,
        usersChanged: r.users_changed,
        error: r.error ?? undefined,
      };
    },
    async createTemplateWithRule(tenantId, input) {
      return db.forTenant(tenantId, async (tx) => {
        const [t] = await tx<{ id: string }[]>`
          insert into templates (tenant_id, kind, name, layout, status, sort_order)
          values (${tenantId}, ${input.kind}, ${input.name}, ${tx.json(input.layout as never)}, ${input.status}, ${input.priority})
          returning id`;
        if (!t) throw new Error("template insert returned no row");
        await tx`
          insert into rules (tenant_id, template_id, senders, recipients, exceptions, applies_to, enabled)
          values (${tenantId}, ${t.id}, ${tx.json(input.rule.senders as never)}, ${tx.json(input.rule.recipients as never)},
                  ${tx.json((input.rule.exceptions ?? {}) as never)}, ${input.rule.appliesTo}, ${input.rule.enabled ?? true})`;
        return t.id;
      });
    },
    async updateTemplate(tenantId, templateId, input) {
      const rows = await db.forTenant(tenantId, (tx) => tx`
        update templates set name = ${input.name}, layout = ${tx.json(input.layout as never)}, version = version + 1
        where id = ${templateId} returning id`);
      if (rows.length === 0) throw new Error("template not found");
    },
  };
}
