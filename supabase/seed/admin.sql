-- ============================================================================
-- Percorso — ADMIN SEED  ·  LOCAL / TEST ONLY  ·  DO NOT RUN IN PRODUCTION
-- ============================================================================
-- Provisions one admin user. "Admin" = a profiles.is_admin = true flag; RLS
-- lets admins READ every user's finance rows (writes stay owner-only). See
-- supabase/migrations/*_init.sql (public.is_admin()).
--
-- This inserts a real auth.users row with a bcrypt password, so it only works
-- when run as the postgres/superuser role:
--   • local:  it runs automatically on `supabase db reset` (see config.toml
--             db.seed), or `psql "$DATABASE_URL" -f supabase/seed/admin.sql`
--   • hosted: paste into the Dashboard SQL Editor of a THROWAWAY project only
--
-- Credentials (change before use; obviously not for anything real):
--   email:    admin@percorso.local
--   password: admin-percorso-123
--
-- Opt-in guard: uncomment the `set` line below to let this script run — a
-- last line of defense against pasting this into the wrong project (it
-- creates a real login). `supabase db reset` sets this automatically via
-- seed/00_allow_destructive.sql (config.toml db.seed.sql_paths), so local dev
-- needs no extra step. Wrapped in an explicit transaction because psql (and
-- some SQL editors) keep running statements after an error by default: once
-- the guard raises, every later statement in the same transaction fails too,
-- so nothing partially applies.
-- ============================================================================

begin;

-- set percorso.allow_destructive = 'yes';

do $$
begin
  if current_setting('percorso.allow_destructive', true) is distinct from 'yes' then
    raise exception 'Refusing to run: this script is destructive. Uncomment the `set percorso.allow_destructive` line above to proceed.';
  end if;
end $$;

create extension if not exists pgcrypto;

do $$
declare
  admin_id constant uuid := '11111111-1111-1111-1111-111111111111';
  admin_email constant text := 'admin@percorso.local';
  admin_password constant text := 'admin-percorso-123';
begin
  -- Idempotent reseed: removing the auth user cascades to profiles + identities.
  delete from auth.users where id = admin_id;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  values (
    '00000000-0000-0000-0000-000000000000', admin_id, 'authenticated', 'authenticated',
    admin_email, crypt(admin_password, gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', 'Percorso Admin'),
    -- GoTrue's Go client can't scan NULL into these string columns; the table
    -- default is NULL (not ''), so a direct SQL insert must set them explicitly
    -- or every login for this user 500s with "converting NULL to string".
    '', '', '', ''
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  values (
    admin_id::text, admin_id,
    jsonb_build_object('sub', admin_id::text, 'email', admin_email),
    'email', now(), now(), now()
  );

  -- The on_auth_user_created trigger already inserted the profile row; flip the
  -- admin flag (running as postgres bypasses the column-grant guard).
  update public.profiles set is_admin = true, full_name = 'Percorso Admin' where id = admin_id;

  raise notice 'Seeded admin user % (is_admin=true)', admin_email;
end;
$$;

commit;
