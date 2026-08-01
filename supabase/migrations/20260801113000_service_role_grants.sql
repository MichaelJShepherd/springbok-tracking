-- #80: the initial schema granted anon read access but never granted
-- service_role any table privileges. service_role has rolbypassrls, but
-- bypassing RLS does not bypass missing GRANTs, so every ingest:* write
-- failed with "permission denied". Grant full DML to service_role on all
-- current and future public tables (ingestion scripts are the only
-- service-role clients; the anon surface is unchanged).

grant usage on schema public to service_role;

grant select, insert, update, delete
  on all tables in schema public
  to service_role;

grant usage, select
  on all sequences in schema public
  to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges in schema public
  grant usage, select on sequences to service_role;
