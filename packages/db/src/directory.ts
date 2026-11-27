import type { Db, Tx } from "./index";

/** Directory rows as the sync writes them (Graph field names mapped to columns). */
export interface DirectoryUserInput {
  entraObjectId: string;
  email: string;
  aliases: string[];
  displayName: string | null;
  givenName: string | null;
  surname: string | null;
  jobTitle: string | null;
  department: string | null;
  companyName: string | null;
  officeLocation: string | null;
  businessPhone: string | null;
  mobilePhone: string | null;
  streetAddress: string | null;
  city: string | null;
  country: string | null;
  managerEntraId: string | null;
  extensionAttrs: Record<string, string>;
  accountEnabled: boolean;
  mailboxType: "user" | "shared" | "room" | "other";
}

export interface DirectoryGroupInput {
  entraObjectId: string;
  displayName: string;
  mail: string | null;
}

export interface TenantRow {
  id: string;
  entra_tenant_id: string;
  name: string;
  domains: string[];
  deployment_mode: "client" | "server" | "both";
  consent_status: "pending" | "granted" | "revoked";
}

export async function upsertTenantOnConsent(db: Db, entraTenantId: string, name: string): Promise<TenantRow> {
  const [row] = await db.sql<TenantRow[]>`
    insert into tenants (entra_tenant_id, name, consent_status, consent_granted_at)
    values (${entraTenantId}, ${name}, 'granted', now())
    on conflict (entra_tenant_id) do update
      set consent_status = 'granted', consent_granted_at = now(), name = coalesce(nullif(excluded.name, ''), tenants.name)
    returning id, entra_tenant_id, name, domains, deployment_mode, consent_status`;
  await db.forTenant(row!.id, (tx) => tx`
    insert into subscriptions (tenant_id, plan, status, trial_ends_at)
    values (${row!.id}, 'trial', 'trialing', now() + interval '14 days')
    on conflict (tenant_id) do nothing`);
  return row!;
}

export async function findTenantByEntraId(db: Db, entraTenantId: string): Promise<TenantRow | null> {
  const [row] = await db.sql<TenantRow[]>`
    select id, entra_tenant_id, name, domains, deployment_mode, consent_status
    from tenants where entra_tenant_id = ${entraTenantId}`;
  return row ?? null;
}

export async function markConsentRevoked(db: Db, tenantId: string): Promise<void> {
  await db.sql`update tenants set consent_status = 'revoked' where id = ${tenantId}`;
}

export async function upsertUsers(tx: Tx, tenantId: string, users: DirectoryUserInput[]): Promise<number> {
  let n = 0;
  for (const u of users) {
    await tx`
      insert into directory_users (
        tenant_id, entra_object_id, email, aliases, display_name, given_name, surname, job_title, department,
        company_name, office_location, business_phone, mobile_phone, street_address, city, country,
        manager_entra_id, extension_attrs, account_enabled, mailbox_type, last_synced_at, deleted_at)
      values (
        ${tenantId}, ${u.entraObjectId}, ${u.email.toLowerCase()}, ${u.aliases.map((a) => a.toLowerCase())}::citext[],
        ${u.displayName}, ${u.givenName}, ${u.surname}, ${u.jobTitle}, ${u.department},
        ${u.companyName}, ${u.officeLocation}, ${u.businessPhone}, ${u.mobilePhone}, ${u.streetAddress}, ${u.city}, ${u.country},
        ${u.managerEntraId}, ${tx.json(u.extensionAttrs)}, ${u.accountEnabled}, ${u.mailboxType}, now(), null)
      on conflict (tenant_id, entra_object_id) do update set
        email = excluded.email, aliases = excluded.aliases, display_name = excluded.display_name,
        given_name = excluded.given_name, surname = excluded.surname, job_title = excluded.job_title,
        department = excluded.department, company_name = excluded.company_name, office_location = excluded.office_location,
        business_phone = excluded.business_phone, mobile_phone = excluded.mobile_phone, street_address = excluded.street_address,
        city = excluded.city, country = excluded.country, manager_entra_id = excluded.manager_entra_id,
        extension_attrs = excluded.extension_attrs, account_enabled = excluded.account_enabled,
        mailbox_type = excluded.mailbox_type, last_synced_at = now(), deleted_at = null`;
    n++;
  }
  return n;
}

export async function softDeleteUsers(tx: Tx, tenantId: string, entraIds: string[]): Promise<void> {
  if (entraIds.length === 0) return;
  await tx`update directory_users set deleted_at = now()
           where tenant_id = ${tenantId} and entra_object_id = any(${entraIds}::uuid[]) and deleted_at is null`;
}

export async function upsertGroups(tx: Tx, tenantId: string, groups: DirectoryGroupInput[]): Promise<void> {
  for (const g of groups) {
    await tx`
      insert into directory_groups (tenant_id, entra_object_id, display_name, mail, last_synced_at, deleted_at)
      values (${tenantId}, ${g.entraObjectId}, ${g.displayName}, ${g.mail}, now(), null)
      on conflict (tenant_id, entra_object_id) do update set
        display_name = excluded.display_name, mail = excluded.mail, last_synced_at = now(), deleted_at = null`;
  }
}

export async function softDeleteGroups(tx: Tx, tenantId: string, entraIds: string[]): Promise<void> {
  if (entraIds.length === 0) return;
  await tx`update directory_groups set deleted_at = now()
           where tenant_id = ${tenantId} and entra_object_id = any(${entraIds}::uuid[])`;
}

/** Applies member additions/removals by Entra ids. Members not (yet) synced are skipped. */
export async function applyMemberships(
  tx: Tx,
  tenantId: string,
  changes: { groupEntraId: string; userEntraId: string; removed: boolean }[],
): Promise<void> {
  for (const c of changes) {
    if (c.removed) {
      await tx`delete from group_members gm using directory_groups g, directory_users u
               where gm.group_id = g.id and gm.user_id = u.id and g.tenant_id = ${tenantId}
                 and g.entra_object_id = ${c.groupEntraId} and u.entra_object_id = ${c.userEntraId}`;
    } else {
      await tx`insert into group_members (tenant_id, group_id, user_id)
               select ${tenantId}, g.id, u.id from directory_groups g, directory_users u
               where g.tenant_id = ${tenantId} and u.tenant_id = ${tenantId}
                 and g.entra_object_id = ${c.groupEntraId} and u.entra_object_id = ${c.userEntraId}
               on conflict do nothing`;
    }
  }
}

/** Internal domains = domains of the tenant's active mailboxes. */
export async function refreshTenantDomains(tx: Tx, tenantId: string): Promise<string[]> {
  const rows = await tx<{ d: string }[]>`
    select distinct lower(split_part(email, '@', 2)) as d from directory_users
    where tenant_id = ${tenantId} and deleted_at is null and email like '%@%'`;
  const domains = rows.map((r) => r.d).sort();
  await tx`update tenants set domains = ${domains}::citext[] where id = ${tenantId}`;
  return domains;
}

export interface SyncRunState {
  id: string;
  usersDeltaLink: string | null;
  groupsDeltaLink: string | null;
}

export async function lastDeltaLinks(tx: Tx, tenantId: string): Promise<{ users: string | null; groups: string | null }> {
  const [r] = await tx<{ users_delta_link: string | null; groups_delta_link: string | null }[]>`
    select users_delta_link, groups_delta_link from sync_runs
    where tenant_id = ${tenantId} and status = 'succeeded' order by started_at desc limit 1`;
  return { users: r?.users_delta_link ?? null, groups: r?.groups_delta_link ?? null };
}

export async function startSyncRun(tx: Tx, tenantId: string, kind: "full" | "delta"): Promise<string> {
  const [r] = await tx<{ id: string }[]>`insert into sync_runs (tenant_id, kind) values (${tenantId}, ${kind}) returning id`;
  return r!.id;
}

export async function finishSyncRun(
  tx: Tx,
  runId: string,
  result: { ok: true; usersDeltaLink: string; groupsDeltaLink: string; usersChanged: number } | { ok: false; error: string },
): Promise<void> {
  if (result.ok) {
    await tx`update sync_runs set status = 'succeeded', finished_at = now(), users_delta_link = ${result.usersDeltaLink},
             groups_delta_link = ${result.groupsDeltaLink}, users_changed = ${result.usersChanged} where id = ${runId}`;
  } else {
    await tx`update sync_runs set status = 'failed', finished_at = now(), error = ${result.error.slice(0, 2000)} where id = ${runId}`;
  }
}
