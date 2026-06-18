-- Keep AI Content Factory business tables private from browser-side Supabase clients.
-- Server API routes use SUPABASE_SERVICE_ROLE_KEY through the Supabase Data API.

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all tables in schema public from authenticated;
revoke all privileges on all sequences in schema public from anon;
revoke all privileges on all sequences in schema public from authenticated;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on tables from authenticated;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on sequences from authenticated;

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;

-- Ensure the generated-asset bucket remains private; assets are served through /api/assets.
insert into storage.buckets (id, name, public)
values ('assets', 'assets', false)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public;
