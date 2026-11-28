-- Fax number, usage location (two-letter country, e.g. TR) and preferred language (e.g. tr-TR) for signatures.
alter table directory_users
  add column fax_number text,
  add column usage_location text,
  add column preferred_language text;
