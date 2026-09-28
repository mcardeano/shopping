-- Minimal stand-in for the parts of Supabase that migrations depend on.
-- Applied ONLY to the embedded PGlite database, never to Supabase.
-- Mirrors Supabase semantics: auth.uid() reads the `sub` claim of the
-- per-transaction `request.jwt.claims` setting, and user traffic runs as the
-- `authenticated` role so Row Level Security is enforced.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  encrypted_password text not null,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end
$$;

grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
