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
-- ============================================================================

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
    raw_app_meta_data, raw_user_meta_data
  )
  values (
    '00000000-0000-0000-0000-000000000000', admin_id, 'authenticated', 'authenticated',
    admin_email, crypt(admin_password, gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', 'Percorso Admin')
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
