-- Keep projected cursors separate so older code cannot reuse a narrower Graph result.
alter table sync_runs
  add column users_selection text,
  add column groups_selection text,
  add column users_projection_delta_link text,
  add column groups_projection_delta_link text;
