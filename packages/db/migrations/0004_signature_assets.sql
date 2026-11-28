-- Keep uploaded signature images in the same database as their asset metadata.
alter table assets add column signature_content bytea;

alter table assets add constraint assets_signature_content_size
  check (signature_content is null or (octet_length(signature_content) = bytes and bytes <= 524288));

create unique index assets_signature_content_hash
  on assets (tenant_id, sha256) where signature_content is not null;

-- Only the image endpoint sets this transaction-local ID. The existing policy still
-- scopes all writes to the current tenant. Other asset records stay private.
create policy signature_asset_public_read on assets for select
  using (signature_content is not null and id = nullif(current_setting('app.signature_asset_id', true), '')::uuid);
