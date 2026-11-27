-- Sing365 schema, v0 (from replica/recon.md data model)
-- Postgres 15+. All times timestamptz in UTC. Money as integer cents.
-- Access rule: every tenant-owned table has tenant_id; the data layer scopes every
-- query through one helper (db.forTenant(tenantId)). RLS is enabled as a second
-- guard using the session setting app.tenant_id.

create extension if not exists pgcrypto;
create extension if not exists citext;

-- updated_at trigger
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------- tenants
create table tenants (
  id                uuid primary key default gen_random_uuid(),
  entra_tenant_id   uuid not null unique,              -- Microsoft tenant (tid claim)
  name              text not null,
  primary_domain    citext,
  consent_status    text not null default 'pending'
    check (consent_status in ('pending','granted','revoked')),
  consent_granted_at timestamptz,
  deployment_mode   text not null default 'client'
    check (deployment_mode in ('client','server','both')),
  -- server-side relay (phase 2): shared secret header the Exchange connector rule stamps
  relay_token_hash  text,
  data_region       text not null default 'eu' check (data_region in ('eu','us')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger tenants_updated before update on tenants for each row execute function set_updated_at();

-- ---------------------------------------------------------------- admins (people who use the panel)
create table admin_users (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  entra_object_id uuid not null,                       -- oid claim
  email           citext not null,
  display_name    text,
  role            text not null default 'editor'
    check (role in ('owner','admin','editor','viewer')),
  last_sign_in_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, entra_object_id)
);
create index on admin_users (tenant_id);
create trigger admin_users_updated before update on admin_users for each row execute function set_updated_at();

-- ---------------------------------------------------------------- directory (synced from Graph)
create table directory_users (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  entra_object_id   uuid not null,
  email             citext not null,                   -- primary SMTP address
  aliases           citext[] not null default '{}',    -- proxyAddresses (smtp:)
  display_name      text,
  given_name        text,
  surname           text,
  job_title         text,
  department        text,
  company_name      text,
  office_location   text,
  business_phone    text,
  mobile_phone      text,
  street_address    text,
  city              text,
  country           text,
  manager_entra_id  uuid,
  photo_asset_id    uuid,                              -- fk added after assets
  extension_attrs   jsonb not null default '{}',       -- extensionAttribute1..15 + directory extensions
  custom_attrs      jsonb not null default '{}',       -- Sing365-only attributes (CSV upload)
  overrides         jsonb not null default '{}',       -- admin/self-service edits; win over synced values
  mailbox_type      text not null default 'user' check (mailbox_type in ('user','shared','room','other')),
  account_enabled   boolean not null default true,
  is_licensed       boolean not null default true,     -- counts as an active mailbox for billing
  last_synced_at    timestamptz,
  deleted_at        timestamptz,                       -- soft delete when it disappears from Entra
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, entra_object_id)
);
create unique index directory_users_email on directory_users (tenant_id, email) where deleted_at is null;
create index directory_users_aliases on directory_users using gin (aliases);
create index on directory_users (tenant_id, department);
create trigger directory_users_updated before update on directory_users for each row execute function set_updated_at();

create table directory_groups (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  entra_object_id uuid not null,
  display_name    text not null,
  mail            citext,
  last_synced_at  timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, entra_object_id)
);
create trigger directory_groups_updated before update on directory_groups for each row execute function set_updated_at();

create table group_members (
  tenant_id uuid not null references tenants(id) on delete cascade,
  group_id  uuid not null references directory_groups(id) on delete cascade,
  user_id   uuid not null references directory_users(id) on delete cascade,
  primary key (group_id, user_id)
);
create index on group_members (user_id);
create index on group_members (tenant_id);

create table sync_runs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  kind          text not null check (kind in ('full','delta')),
  status        text not null default 'running' check (status in ('running','succeeded','failed')),
  users_delta_link  text,                              -- Graph delta token for the next run
  groups_delta_link text,
  users_changed integer not null default 0,
  error         text,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index on sync_runs (tenant_id, started_at desc);

-- ---------------------------------------------------------------- assets & brand
create table assets (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  kind         text not null check (kind in ('logo','banner','photo','icon','other')),
  storage_key  text not null unique,                   -- object storage key; served from an unguessable public URL
  content_type text not null check (content_type in ('image/png','image/jpeg','image/gif')),
  bytes        integer not null check (bytes > 0 and bytes <= 2000000),
  width        integer,
  height       integer,
  sha256       text not null,
  created_at   timestamptz not null default now()
);
create index on assets (tenant_id);
alter table directory_users
  add constraint directory_users_photo_fk foreign key (photo_asset_id) references assets(id) on delete set null;

create table brand_kits (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  name          text not null,
  logo_asset_id uuid references assets(id) on delete set null,
  colors        jsonb not null default '{}',           -- {"primary":"#...", "text":"#...", ...}
  font_stack    text not null default 'Arial, Helvetica, sans-serif',  -- email-safe
  social_links  jsonb not null default '[]',           -- [{"network":"linkedin","url":"..."}]
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on brand_kits (tenant_id);
create unique index brand_kits_one_default on brand_kits (tenant_id) where is_default;
create trigger brand_kits_updated before update on brand_kits for each row execute function set_updated_at();

-- ---------------------------------------------------------------- templates & rules
create table folders (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table folder_editors (
  folder_id     uuid not null references folders(id) on delete cascade,
  admin_user_id uuid not null references admin_users(id) on delete cascade,
  primary key (folder_id, admin_user_id)
);

create table templates (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  folder_id    uuid references folders(id) on delete set null,
  kind         text not null check (kind in ('signature','disclaimer','banner')),
  name         text not null,
  layout       jsonb not null,                         -- designer document (blocks); the source of truth
  brand_kit_id uuid references brand_kits(id) on delete set null,
  version      integer not null default 1,             -- bumped on publish; add-in caches by it
  status       text not null default 'draft' check (status in ('draft','published','archived')),
  sort_order   integer not null default 0,             -- lower wins when rules tie
  created_by   uuid references admin_users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on templates (tenant_id, kind, status, sort_order);
create index on templates (folder_id);
create trigger templates_updated before update on templates for each row execute function set_updated_at();

-- A rule says when a template applies. Conditions are JSON so the shared rule engine
-- (packages/rules) evaluates them identically in the add-in API, the tester and the relay.
create table rules (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  template_id  uuid not null references templates(id) on delete cascade,
  senders      jsonb not null default '{"all":true}',  -- {"all":bool,"users":[uuid],"groups":[uuid],"departments":[text],"attr":[{key,op,value}]}
  recipients   jsonb not null default '{"scope":"any"}', -- {"scope":"any|internal|external","domains":[text]}
  exceptions   jsonb not null default '{}',             -- same shape as senders
  applies_to   text not null default 'both' check (applies_to in ('new','reply','both')),
  active_from  timestamptz,
  active_until timestamptz,
  enabled      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint rules_window check (active_until is null or active_from is null or active_until > active_from)
);
create index on rules (tenant_id, enabled);
create index on rules (template_id);
create trigger rules_updated before update on rules for each row execute function set_updated_at();

create table campaigns (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  name               text not null,
  banner_template_id uuid not null references templates(id) on delete restrict,
  rule_id            uuid references rules(id) on delete set null,  -- who sees it
  starts_at          timestamptz not null,
  ends_at            timestamptz,
  recurrence         jsonb,                               -- RRULE-like, should-have
  rotation_group     text,                                -- banners in one group rotate
  timezone           text not null default 'Europe/Istanbul',
  status             text not null default 'scheduled' check (status in ('draft','scheduled','live','ended')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint campaigns_window check (ends_at is null or ends_at > starts_at)
);
create index on campaigns (tenant_id, starts_at);
create trigger campaigns_updated before update on campaigns for each row execute function set_updated_at();

create table editable_fields (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  attribute_key text not null,                         -- e.g. "mobile_phone" or "custom.pronouns"
  editable_by   text not null default 'user' check (editable_by in ('user','admin')),
  unique (tenant_id, attribute_key)
);

-- ---------------------------------------------------------------- analytics, audit, logs
create table tracked_links (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete cascade,
  template_id uuid references templates(id) on delete cascade,
  target_url  text not null check (target_url ~* '^https?://'),
  slug        text not null unique,                    -- short code in the redirect URL
  created_at  timestamptz not null default now()
);
create index on tracked_links (tenant_id);

create table click_events (
  id            bigint generated always as identity primary key,
  tenant_id     uuid not null references tenants(id) on delete cascade,
  link_id       uuid not null references tracked_links(id) on delete cascade,
  sender_user_id uuid references directory_users(id) on delete set null,
  variant       text,
  clicked_at    timestamptz not null default now()
  -- no IP or user agent stored (privacy by default)
);
create index on click_events (tenant_id, clicked_at);
create index on click_events (link_id);

create table signature_events (                        -- usage analytics: one row per applied signature
  id            bigint generated always as identity primary key,
  tenant_id     uuid not null references tenants(id) on delete cascade,
  user_id       uuid references directory_users(id) on delete set null,
  template_id   uuid references templates(id) on delete set null,
  channel       text not null check (channel in ('addin','relay')),
  mode          text check (mode in ('new','reply')),
  outcome       text not null check (outcome in ('applied','skipped_already_signed','no_match','error')),
  reason        text,
  occurred_at   timestamptz not null default now()
);
create index on signature_events (tenant_id, occurred_at);

create table audit_events (
  id         bigint generated always as identity primary key,
  tenant_id  uuid not null references tenants(id) on delete cascade,
  actor_id   uuid references admin_users(id) on delete set null,
  actor_kind text not null default 'admin' check (actor_kind in ('admin','user','system')),
  action     text not null,                            -- e.g. template.publish, rule.update
  entity     text not null,
  entity_id  uuid,
  before     jsonb,
  after      jsonb,
  at         timestamptz not null default now()
);
create index on audit_events (tenant_id, at desc);

-- ---------------------------------------------------------------- billing
create table subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null unique references tenants(id) on delete cascade,
  plan                   text not null default 'trial' check (plan in ('trial','starter','team','business')),
  status                 text not null default 'trialing'
    check (status in ('trialing','active','past_due','canceled')),
  seats                  integer not null default 0 check (seats >= 0), -- active mailboxes last counted
  trial_ends_at          timestamptz,
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create trigger subscriptions_updated before update on subscriptions for each row execute function set_updated_at();

create table webhook_events (                          -- idempotency for Stripe and Graph notifications
  provider    text not null,
  event_id    text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

-- ---------------------------------------------------------------- row level security (second guard)
do $$
declare t text;
begin
  foreach t in array array['admin_users','directory_users','directory_groups','group_members','sync_runs',
    'assets','brand_kits','folders','templates','rules','campaigns','editable_fields','tracked_links',
    'click_events','signature_events','audit_events','subscriptions']
  loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy tenant_isolation on %I
      using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
      with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)$p$, t);
  end loop;
end $$;
