# Percorso

**Percorso** is a mobile-first web app for your **personal finances**. It started life as a local-only Electron desktop app ("personal life operating system"); this version narrows the scope to Finances and moves the data to [Supabase](https://supabase.com) behind per-user Row Level Security.

- **Finances** — accounts, transactions (income / expense / transfers), categories, monthly budgets, and a dashboard with net worth, a spending donut, and 6-month cash flow.

Three languages (English, Brazilian Portuguese, Italian — compile-time-checked dictionaries), dark & light themes, installable on a phone's home screen via the browser's "Add to Home Screen".

## Tech stack

- Vite 8 + React 19 + TypeScript (strict)
- Tailwind CSS v4 + shadcn-style components (Radix primitives, `sonner` toasts, `lucide` icons)
- Zustand stores backed by Supabase (Postgres + Auth) via `@supabase/supabase-js`
- Custom typed i18n engine (no runtime library) — `npm run typecheck` is the i18n test suite

## Getting started

### 1. Requirements

- Node 20+
- A (free) Supabase project — create one at [supabase.com/dashboard](https://supabase.com/dashboard) — **or** the [Supabase CLI](https://supabase.com/docs/guides/cli) + Docker for a fully local stack.

### 2. Environment variables

```bash
cp .env.example .env
```

| Variable | Where to find it |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase Dashboard → Project Settings → API → Project URL (local: `http://localhost:54321`) |
| `VITE_SUPABASE_ANON_KEY` | Same page → Project API keys → `anon` `public` (local: printed by `supabase start`) |

> ⚠️ Only the **anon / publishable** key goes in `.env`. Never put the `service_role` (secret) key anywhere in this project — everything under `VITE_` is shipped to the browser. Row Level Security is what keeps users' data private.

The Google OAuth client ID/secret live **in the Supabase dashboard**, not in this app's env (see below).

### 3. Database schema

Apply [supabase/migrations/20260720120000_init.sql](supabase/migrations/20260720120000_init.sql) to your project. Either:

- **Dashboard**: SQL Editor → paste the file → Run, or
- **CLI**: `npx supabase link --project-ref <your-ref>` then `npx supabase db push`, or
- **Fully local**: `npx supabase start` then `npx supabase db reset` (applies migrations **and** the local seed — see [Local dev with seed data](#6-local-development-with-seed-data)).

This creates `profiles` (incl. `is_admin`), `accounts`, `categories`, `transactions`, `budgets` — all with RLS enabled. Writes are restricted to `auth.uid() = user_id`; reads are the same, **plus** admins may read every user's rows (see [Admin](#admin)). A trigger creates a `profiles` row for each new signup (email or Google).

### 4. Auth configuration (Supabase dashboard)

1. **Authentication → URL Configuration**: set *Site URL* to where the app runs (e.g. `http://localhost:5173` in development, your production URL when deployed). Add every origin you use to *Redirect URLs* (include your LAN IP and any tunnel URL if you test on other devices).
2. **Email/password** works out of the box. With *Confirm email* enabled (the default), the app shows a "confirm your email" screen after signup.
3. **Google login**:
   1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials) create an *OAuth client ID* (type **Web application**).
   2. Authorized JavaScript origins: `https://<your-project-ref>.supabase.co` (plus your app origins).
   3. Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`.
   4. In Supabase: **Authentication → Sign In / Providers → Google** → enable, paste the Client ID and Client Secret.

### 5. Session persistence (staying logged in 6h+)

The Supabase client ([src/lib/supabase.ts](src/lib/supabase.ts)) is created with `persistSession: true` and `autoRefreshToken: true`. This means:

- The **session** (access token **+ refresh token**) is stored in `localStorage`, so it survives page reloads and browser restarts — you are not logged out on refresh.
- The access token is short-lived (~1 hour) but is **refreshed silently in the background** using the refresh token, before it expires. As long as the refresh token is valid, the session continues seamlessly — well beyond 6 continuous hours — with no re-login.

The real ceiling is therefore the **refresh-token / session lifetime**, which is a server-side setting, not something the client controls. To confirm or extend it for a hosted project:

- **Authentication → Sessions**: *Time-box user sessions* (leave empty/off for no hard cap) and *Inactivity timeout* (leave off, or set ≥ 6h). If either is shorter than your target, the user is forced to re-authenticate regardless of the client config.
- **Authentication → Sessions / Tokens**: *Access token (JWT) expiry* defaults to 3600s — fine; the refresh flow above covers longer use. *Refresh token reuse interval* / *rotation* can stay at defaults.

Locally, these live in [supabase/config.toml](supabase/config.toml) under `[auth]` (`jwt_expiry`, and the session-timeout keys). The defaults already allow multi-hour sessions.

### 6. Local development with seed data

> **Local / test only — never run the seeds against a production database.**

With the Supabase CLI + Docker:

```bash
npx supabase start          # boots Postgres + Auth locally, prints anon key + URL
npx supabase db reset       # applies migrations, then runs the seed scripts
```

`db reset` runs the two seed files listed in [supabase/config.toml](supabase/config.toml) (`[db.seed]`):

| File | What it seeds | Login |
| --- | --- | --- |
| [supabase/seed/admin.sql](supabase/seed/admin.sql) | An **admin** user (`is_admin = true`) | `admin@percorso.local` / `admin-percorso-123` |
| [supabase/seed/test-data.sql](supabase/seed/test-data.sql) | A **test** user + full demo finance data (accounts, categories, a credit card, ~6 months of bank *and* card transactions, a monthly transfer, budgets, goals, bills) to populate every Finance screen | `test@percorso.local` / `test-percorso-123` |

You can also run either file by hand against a **throwaway** database:

```bash
psql "$DATABASE_URL" -f supabase/seed/test-data.sql   # local db URL, or a disposable project
```

(The seeds insert real `auth.users` rows with bcrypt passwords, so they must run as the `postgres`/superuser role — `db reset`, `psql`, or the Dashboard SQL Editor of a disposable project. Change the credentials before use.)

**Populating a real account instead:** [supabase/seed/demo-data.sql](supabase/seed/demo-data.sql) loads the same dataset for an **existing** user (edit the `uid` at the top to the account's id, from Dashboard → Authentication → Users). It creates no `auth.users` row and no password, so it is safe to paste into a real project's SQL editor. It is deliberately *not* in `sql_paths`, so `db reset` never runs it.

### 7. Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run dev:host   # same, exposed on your LAN (see below)
npm run typecheck  # strict TS over the app (also validates all translations)
npm run build      # typecheck + production bundle in dist/
npm run preview    # serve the production build locally
```

Deploy `dist/` to any static host (Vercel, Netlify, Cloudflare Pages…). Configure the SPA fallback (all routes → `index.html`) and add the production URL to Supabase's redirect URLs.

## Testing on other devices

### Same Wi-Fi (phone on your network)

```bash
npm run dev:host   # = vite --host — binds 0.0.0.0
```

Vite prints a `Network:` URL like `http://192.168.1.23:5173`. Open that on a phone on the same Wi-Fi. Add that origin to Supabase **Redirect URLs** so auth redirects work.

### Anywhere (share a temporary public link)

A [Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) gives a public `*.trycloudflare.com` URL with **no account or signup**, staying up as long as the process runs:

```bash
# with the dev server already running on :5173, in a second terminal:
cloudflared tunnel --url http://localhost:5173
```

It prints a URL like `https://random-words.trycloudflare.com` you can send to someone testing remotely. Add that URL to Supabase **Redirect URLs** for auth to work through it.

> Quick tunnels are for **testing/demo only** — never route production traffic through one. (Install `cloudflared` via `winget install Cloudflare.cloudflared`, `brew install cloudflared`, or the [downloads page](https://github.com/cloudflare/cloudflared/releases).)

## Admin

"Admin" in Percorso is a `profiles.is_admin` boolean, provisioned by [supabase/seed/admin.sql](supabase/seed/admin.sql). Its meaning is enforced in the database:

- Every table's **SELECT** policy is `own OR public.is_admin()`, so an admin can **read** all users' finance rows (for support / QA / moderation).
- **Writes** (insert / update / delete) stay owner-only — an admin cannot modify another user's data.
- `public.is_admin()` is a `SECURITY DEFINER` function that reads `profiles` as the table owner, which avoids RLS recursion and keeps the check in one place.
- **A user can never make themselves an admin.** RLS controls which *rows* you can write, not which *columns*, so column-level grants restrict the writable columns instead: `authenticated` may update only `full_name` and `currency` on `profiles`. `is_admin` is assignable only by the `postgres` role (i.e. the seed/migration), never through the API.

To make a real user an admin, set the flag as `postgres` (e.g. Dashboard SQL Editor):

```sql
update public.profiles set is_admin = true where id = '<the-user-uuid>';
```

## Security decisions

- **Passwords** are handled entirely by Supabase Auth (bcrypt server-side). The app never sees, stores, or hashes a password itself.
- **Transport** is HTTPS end-to-end (Supabase default; `localhost` in dev).
- **Authorization** is enforced in the database, not the client: every table has RLS with per-operation policies scoped to `auth.uid() = user_id` (reads additionally allow admins), so even a hand-crafted API request with the anon key can only touch permitted rows. Foreign keys are composite (`id, user_id`), so a row can't reference another user's account or category either.
- **Column-level encryption (pgcrypto) — evaluated and deliberately not used.** Encrypting amounts/notes with `pgp_sym_encrypt` would require the key to live either (a) in the database itself — no protection beyond what RLS + disk encryption already give, since anyone who can read the table can call the decrypt function — or (b) in the browser bundle — public by definition. It would also break server-side filtering, aggregation, and numeric types (budgets, cash flow). Supabase already encrypts data at rest at the infrastructure level and in transit via TLS; combined with RLS, that meets this project's threat model (protecting each user's data from other users and from casual DB exposure). If a stronger model is ever needed (protecting data *from the database operator*), the right tool is client-side end-to-end encryption with user-derived keys — a product decision, not a column tweak.

## Project layout

```
supabase/
├── migrations/        # schema + RLS (apply to your project) — the source of truth
├── schema-full.sql    # snapshot of the whole current schema (rebuild script — DESTRUCTIVE)
└── seed/              # admin.sql + test-data.sql (LOCAL-ONLY) · demo-data.sql (production-safe)
src/
├── main.tsx           # boot: theme init → render <App>
├── App.tsx            # router: /login /signup | /finances /settings
├── auth/              # AuthProvider (session), AuthGate, Login/Signup, error mapping
├── app/               # AppLayout (bottom nav ↔ sidebar, data gate), SettingsPage
├── features/finance/  # store (Supabase-backed) + dashboard/transactions/accounts/budgets/categories
├── components/ui/     # shadcn-style primitives (button, dialog, tabs, select…)
├── components/charts/ # dependency-free SVG donut + line charts
├── i18n/              # typed engine + en / pt-BR / it dictionaries
├── state/             # prefs (language+theme, localStorage), profile (Supabase)
└── lib/               # supabase client, dates (local YYYY-MM-DD), format, utils
```

## History

The Electron desktop version (12 modules, local JSON persistence, cross-module event bus) lives intact in this repository's history on the `main` branch prior to the `migration-web-supabase` merge. An earlier cut of this migration also shipped a **People** module (relationships + shared moments); it was removed when the scope narrowed to Finances only — its code likewise remains in git history.

## License

MIT
