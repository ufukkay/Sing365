-- State/province and postal code for address lines in signatures (Graph: state, postalCode).
alter table directory_users add column if not exists state text;
alter table directory_users add column if not exists postal_code text;

-- Stored delta links were taken without these fields; drop them so the next sync is a full one.
-- Row-level security is forced on sync_runs, so it is lifted for this one update (inside the migration's transaction).
alter table sync_runs no force row level security;
alter table sync_runs disable row level security;
update sync_runs set users_delta_link = null where users_delta_link is not null;
alter table sync_runs enable row level security;
alter table sync_runs force row level security;
