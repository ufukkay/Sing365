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
  state?: string | null;
  postalCode?: string | null;
  country: string | null;
  faxNumber?: string | null;
  usageLocation?: string | null;
  preferredLanguage?: string | null;
  managerEntraId: string | null;
  extensionAttrs: Record<string, string>;
  accountEnabled: boolean;
  mailboxType: "user" | "shared" | "room" | "other";
}

export interface DirectoryGroupInput {
  entraObjectId: string;
  displayName: string;
  mail?: string | null;
}

export interface DirectoryUserProjection {
  /** Microsoft Graph properties included in this sync. */
  properties: readonly string[];
  extensionKeys: readonly string[];
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

export async function upsertUsers(
  tx: Tx,
  tenantId: string,
  users: DirectoryUserInput[],
  projection?: DirectoryUserProjection,
): Promise<number> {
  const properties = projection && new Set(projection.properties);
  const selected = (property: string) => properties?.has(property) ?? true;
  const extensionKeys = new Set(
    projection && selected("onPremisesExtensionAttributes")
      ? projection.extensionKeys.map((key) => key.toLowerCase())
      : [],
  );
  const keysToReplace = [...extensionKeys];
  let n = 0;
  for (const u of users) {
    const extensions = projection
      ? Object.fromEntries(
          Object.entries(u.extensionAttrs)
            .map(([key, value]) => [key.toLowerCase(), value] as const)
            .filter(([key]) => extensionKeys.has(key)),
        )
      : u.extensionAttrs;
    await tx`
      insert into directory_users (
        tenant_id, entra_object_id, email, aliases, display_name, given_name, surname, job_title, department,
        company_name, office_location, business_phone, mobile_phone, street_address, city, state, postal_code, country,
        fax_number, usage_location, preferred_language, manager_entra_id, extension_attrs, account_enabled, mailbox_type, last_synced_at, deleted_at)
      values (
        ${tenantId}, ${u.entraObjectId}, ${u.email.toLowerCase()},
        ${selected("proxyAddresses") ? u.aliases.map((a) => a.toLowerCase()) : []}::citext[],
        ${selected("displayName") ? u.displayName : null},
        ${selected("givenName") ? u.givenName : null},
        ${selected("surname") ? u.surname : null},
        ${selected("jobTitle") ? u.jobTitle : null},
        ${selected("department") ? u.department : null},
        ${selected("companyName") ? u.companyName : null},
        ${selected("officeLocation") ? u.officeLocation : null},
        ${selected("businessPhones") ? u.businessPhone : null},
        ${selected("mobilePhone") ? u.mobilePhone : null},
        ${selected("streetAddress") ? u.streetAddress : null},
        ${selected("city") ? u.city : null},
        ${selected("state") ? u.state ?? null : null},
        ${selected("postalCode") ? u.postalCode ?? null : null},
        ${selected("country") ? u.country : null},
        ${selected("faxNumber") ? u.faxNumber ?? null : null},
        ${selected("usageLocation") ? u.usageLocation ?? null : null},
        ${selected("preferredLanguage") ? u.preferredLanguage ?? null : null},
        ${projection ? null : u.managerEntraId}, ${tx.json(extensions)},
        ${selected("accountEnabled") ? u.accountEnabled : true}, ${projection ? "user" : u.mailboxType}, now(), null)
      on conflict (tenant_id, entra_object_id) do update set
        email = case when ${selected("mail")} then excluded.email else directory_users.email end,
        aliases = case when ${selected("proxyAddresses")} then excluded.aliases else directory_users.aliases end,
        display_name = case when ${selected("displayName")} then excluded.display_name else directory_users.display_name end,
        given_name = case when ${selected("givenName")} then excluded.given_name else directory_users.given_name end,
        surname = case when ${selected("surname")} then excluded.surname else directory_users.surname end,
        job_title = case when ${selected("jobTitle")} then excluded.job_title else directory_users.job_title end,
        department = case when ${selected("department")} then excluded.department else directory_users.department end,
        company_name = case when ${selected("companyName")} then excluded.company_name else directory_users.company_name end,
        office_location = case when ${selected("officeLocation")} then excluded.office_location else directory_users.office_location end,
        business_phone = case when ${selected("businessPhones")} then excluded.business_phone else directory_users.business_phone end,
        mobile_phone = case when ${selected("mobilePhone")} then excluded.mobile_phone else directory_users.mobile_phone end,
        street_address = case when ${selected("streetAddress")} then excluded.street_address else directory_users.street_address end,
        city = case when ${selected("city")} then excluded.city else directory_users.city end,
        state = case when ${selected("state")} then excluded.state else directory_users.state end,
        postal_code = case when ${selected("postalCode")} then excluded.postal_code else directory_users.postal_code end,
        country = case when ${selected("country")} then excluded.country else directory_users.country end,
        fax_number = case when ${selected("faxNumber")} then excluded.fax_number else directory_users.fax_number end,
        usage_location = case when ${selected("usageLocation")} then excluded.usage_location else directory_users.usage_location end,
        preferred_language = case when ${selected("preferredLanguage")} then excluded.preferred_language else directory_users.preferred_language end,
        manager_entra_id = case when ${!projection} then excluded.manager_entra_id else directory_users.manager_entra_id end,
        extension_attrs = case
          when ${!projection} then excluded.extension_attrs
          when ${keysToReplace.length === 0} then directory_users.extension_attrs
          else coalesce((
            select jsonb_object_agg(item.key, item.value)
            from jsonb_each(directory_users.extension_attrs) as item(key, value)
            where lower(item.key collate "C") <> all(${keysToReplace}::text[])
          ), '{}'::jsonb) || excluded.extension_attrs
        end,
        account_enabled = case when ${selected("accountEnabled")} then excluded.account_enabled else directory_users.account_enabled end,
        mailbox_type = case when ${!projection} then excluded.mailbox_type else directory_users.mailbox_type end,
        last_synced_at = now(), deleted_at = null`;
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
      values (${tenantId}, ${g.entraObjectId}, ${g.displayName}, ${g.mail ?? null}, now(), null)
      on conflict (tenant_id, entra_object_id) do update set
        display_name = excluded.display_name,
        mail = case when ${g.mail !== undefined} then excluded.mail else directory_groups.mail end,
        last_synced_at = now(), deleted_at = null`;
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

export async function lastDeltaLinks(tx: Tx, tenantId: string): Promise<{
  users: string | null;
  groups: string | null;
  usersSelection: string | null;
  groupsSelection: string | null;
}> {
  const [r] = await tx<{
    users_delta_link: string | null;
    groups_delta_link: string | null;
    users_selection: string | null;
    groups_selection: string | null;
  }[]>`
    select coalesce(users_projection_delta_link, users_delta_link) as users_delta_link,
           coalesce(groups_projection_delta_link, groups_delta_link) as groups_delta_link,
           users_selection, groups_selection
    from sync_runs
    where tenant_id = ${tenantId} and status = 'succeeded' order by started_at desc limit 1`;
  return {
    users: r?.users_delta_link ?? null,
    groups: r?.groups_delta_link ?? null,
    usersSelection: r?.users_selection ?? null,
    groupsSelection: r?.groups_selection ?? null,
  };
}

export async function startSyncRun(tx: Tx, tenantId: string, kind: "full" | "delta"): Promise<string> {
  const [r] = await tx<{ id: string }[]>`insert into sync_runs (tenant_id, kind) values (${tenantId}, ${kind}) returning id`;
  return r!.id;
}

export async function finishSyncRun(
  tx: Tx,
  runId: string,
  result: {
    ok: true;
    usersDeltaLink: string;
    groupsDeltaLink: string;
    usersSelection?: string | null;
    groupsSelection?: string | null;
    usersChanged: number;
  } | { ok: false; error: string },
): Promise<void> {
  if (result.ok) {
    const usersProjected = result.usersSelection != null;
    const groupsProjected = result.groupsSelection != null;
    await tx`update sync_runs set status = 'succeeded', finished_at = now(),
             users_delta_link = ${usersProjected ? null : result.usersDeltaLink},
             groups_delta_link = ${groupsProjected ? null : result.groupsDeltaLink},
             users_projection_delta_link = ${usersProjected ? result.usersDeltaLink : null},
             groups_projection_delta_link = ${groupsProjected ? result.groupsDeltaLink : null},
             users_selection = ${result.usersSelection ?? null}, groups_selection = ${result.groupsSelection ?? null},
             users_changed = ${result.usersChanged} where id = ${runId}`;
  } else {
    await tx`update sync_runs set status = 'failed', finished_at = now(), error = ${result.error.slice(0, 2000)} where id = ${runId}`;
  }
}
