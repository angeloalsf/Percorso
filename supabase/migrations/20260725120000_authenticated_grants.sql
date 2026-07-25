-- Percorso — explicit base-privilege grants for the `authenticated` role.
--
-- RLS policies only FILTER rows an operation is already privileged to
-- attempt — Postgres checks the underlying table-level GRANT first. No prior
-- migration ever declared that grant explicitly for the domain tables: the
-- init migration's `revoke update on public.profiles from anon,
-- authenticated` only makes sense assuming authenticated already held a
-- broader grant, because Supabase used to auto-expose newly created
-- public-schema tables to anon/authenticated/service_role by default. That
-- legacy behaviour is retiring (see `auto_expose_new_tables` in
-- config.toml, removed 2026-10-30), and it was already off by default for
-- local dev — surfaced when writing the RLS isolation test suite, where
-- every query as `authenticated` failed with "permission denied for table
-- X" before RLS ever got a chance to run. Without this migration, a
-- from-scratch project (disaster recovery, a new environment, or the
-- existing project once the legacy default is retired) would have working
-- RLS policies but be completely unusable.
--
-- `anon` intentionally gets nothing: every table here holds a single user's
-- financial data gated by auth.uid(), so there is no case where an
-- unauthenticated request should reach it. Append-only — the init migration
-- is never edited.

grant select, insert, update, delete on
  public.accounts,
  public.categories,
  public.transactions,
  public.budgets,
  public.goals,
  public.bills,
  public.credit_cards,
  public.loans,
  public.consortiums
to authenticated;

-- profiles: select + insert only. UPDATE is already narrowed to specific
-- columns by the init migration's column-level grant; there is no delete
-- policy (a profile is only ever removed via the auth.users cascade).
grant select, insert on public.profiles to authenticated;
