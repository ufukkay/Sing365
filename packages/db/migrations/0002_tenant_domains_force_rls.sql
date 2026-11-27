-- Internal domains per tenant (derived from synced mailboxes; used for internal/external rules)
alter table tenants add column if not exists domains citext[] not null default '{}';

-- RLS must also apply to the table owner, otherwise the app role (often the owner) bypasses it.
do $$
declare t text;
begin
  foreach t in array array['admin_users','directory_users','directory_groups','group_members','sync_runs',
    'assets','brand_kits','folders','templates','rules','campaigns','editable_fields','tracked_links',
    'click_events','signature_events','audit_events','subscriptions']
  loop
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

-- folder_editors has no tenant_id; reach it through folders.
alter table folder_editors enable row level security;
alter table folder_editors force row level security;
create policy tenant_isolation on folder_editors
  using (exists (select 1 from folders f where f.id = folder_id
                 and f.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid));
