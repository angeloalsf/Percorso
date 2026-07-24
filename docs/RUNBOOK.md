# Percorso — Runbook

A complete, beginner-friendly guide to running and operating Percorso end to end.
Every command below was verified against this repo's actual configuration
(`package.json`, `supabase/config.toml`, `.env.example`, the migration, and the
seed files) — not from generic Supabase/Docker knowledge.

**What Percorso is:** a mobile-first React single-page app (Vite + React 19 +
TypeScript + Tailwind v4) with one module, **Finances**, backed by **Supabase**
(Postgres + Auth) with per-user Row Level Security. You can run its database two
ways:

- **Locally**, as a stack of Docker containers managed by the Supabase CLI
  (great for development, seeded test data, and offline work), or
- Against a **real hosted Supabase project** (what you deploy for real use).

This guide is **cross-platform** (Windows / macOS / Linux / WSL). Where a command
differs per OS, all variants are shown.

> **Two terminology notes used throughout:**
> - "The **frontend**" / "the app" = the Vite React app on `http://localhost:5173`.
> - "**Supabase**" (local) = the Docker container stack (Postgres, Auth, etc.) on
>   ports `54321`–`54327`.
> These are two separate things you start separately.

---

## Table of contents

1. [Prerequisites](#1-prerequisites)
2. [Running the frontend in dev mode](#2-running-the-frontend-in-dev-mode)
3. [Running Supabase locally via Docker](#3-running-supabase-locally-via-docker)
4. [Logging in with the seeded test user](#4-logging-in-with-the-seeded-test-user)
5. [Switching from local (Docker) to the real Supabase project](#5-switching-from-local-docker-to-the-real-supabase-project)
6. [Exposing the dev server for outside testing](#6-exposing-the-dev-server-for-outside-testing)
7. [Troubleshooting / common commands](#7-troubleshooting--common-commands)

---

## 1. Prerequisites

You need the tools below. Some are required, some optional depending on which
sections you use.

| Tool | Required for | Notes |
| --- | --- | --- |
| **Node.js 20+** | Everything (frontend, Supabase CLI via `npx`) | Ships with `npm`. Node **20.19+** or **22 LTS** recommended (Vite 8 / React 19). |
| **npm** | Installing deps, running scripts | Comes bundled with Node. |
| **Docker Desktop** (or Docker Engine + Compose) | Section 3 (local Supabase) | The Supabase CLI runs the whole local stack as Docker containers. |
| **Supabase CLI** | Section 3 & 5 | This project is **not** pinned to a local copy — the README uses `npx supabase`. You can use `npx supabase …` (no install) or install the standalone CLI. |
| **cloudflared** | Section 6 (public tunnel) | Optional. Only needed to share a temporary public URL. |
| **psql** (PostgreSQL client) | Optional | Only if you want to run seed SQL by hand instead of via the CLI. |

### Install commands

**Node.js** — install the LTS from <https://nodejs.org>, or use a version manager:

```bash
# macOS / Linux / WSL (nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install --lts

# Windows (winget)
winget install OpenJS.NodeJS.LTS

# macOS (Homebrew)
brew install node
```

**Docker Desktop** — <https://www.docker.com/products/docker-desktop/>

```bash
# Windows
winget install Docker.DockerDesktop
# macOS
brew install --cask docker
# Linux: install Docker Engine + the Compose plugin per docs.docker.com
```

> On **Windows + WSL**, install Docker Desktop on Windows and enable its WSL
> integration (Docker Desktop → Settings → Resources → WSL Integration). Then
> `docker` works from inside your WSL shell.

**Supabase CLI** — you do **not** have to install it; `npx supabase <cmd>` will
fetch and run it on demand. If you'd rather install it once:

```bash
# macOS / Linux (Homebrew)
brew install supabase/tap/supabase
# Windows (Scoop)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
# Any platform, as a project dev-dependency instead:
npm install --save-dev supabase
```

If you install it, replace every `npx supabase` below with `supabase`.

**cloudflared** (optional):

```bash
# Windows
winget install Cloudflare.cloudflared
# macOS / Linux
brew install cloudflared
# or grab a binary from https://github.com/cloudflare/cloudflared/releases
```

**psql** (optional): install the PostgreSQL client for your OS
(`brew install libpq`, `sudo apt install postgresql-client`, or
`winget install PostgreSQL.PostgreSQL`).

### Verify everything is installed

Run each and confirm you get a version number, not "command not found":

```bash
node -v            # e.g. v22.14.0  (must be 20+)
npm -v             # e.g. 10.x or 11.x
docker --version   # e.g. Docker version 27.x
docker compose version
npx supabase --version   # downloads the CLI on first run, then prints e.g. 2.x
cloudflared --version    # optional
psql --version           # optional
```

> **WSL gotcha (important):** run all of these from **one** environment
> consistently. If your `npm`/`node` resolve to Windows executables while your
> project lives under `/home/...` in WSL, `npx supabase` can misbehave (it may
> spawn `CMD.EXE` and complain about UNC paths). Pick one: either work entirely
> inside the WSL Ubuntu shell with a Linux Node install, **or** work entirely on
> the Windows side. Whichever you pick, run Docker, the CLI, and `npm` all from
> that same side.

---

## 2. Running the frontend in dev mode

This runs just the React app. On its own it shows the UI, but it needs a Supabase
backend (local from Section 3, or hosted from Section 5) to log in and load data.

### Install dependencies (first time, and after `git pull`)

```bash
npm install
```

This reads `package.json` / `package-lock.json` and populates `node_modules/`.

### Start the dev server

```bash
npm run dev
```

`npm run dev` runs `vite` (see `package.json` → `scripts.dev`). Vite starts a
hot-reloading dev server. Expected output:

```
  VITE v8.x  ready in 400 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

Open **<http://localhost:5173>**. What "working" looks like:

- You land on the **login page** — `.env.development` is committed with local
  Docker values already filled in, so this works out of the box as long as
  `supabase start` is running (Section 3).
- If instead you see a **"Supabase is not configured"** notice, an env file is
  missing or blank — see Section 5 for the full env-file convention
  (`src/lib/supabase.ts` builds a placeholder client so the UI can render the
  setup notice instead of crashing). Fix the relevant `.env*` file, then
  restart the dev server.

> **Vite reads env files only at startup.** Any time you change one, stop the
> dev server (`Ctrl+C`) and run `npm run dev` again.

### Testing from your phone on the same Wi-Fi (`--host`)

```bash
npm run dev:host
```

`npm run dev:host` runs `vite --host` (see `package.json`). `--host` binds the
server to `0.0.0.0` — i.e. all network interfaces — instead of only `localhost`,
so other devices on your network can reach it. Vite now also prints a **Network**
URL:

```
  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.1.23:5173/
```

Open that `Network` URL on a phone connected to the **same Wi-Fi**. For login to
work through it, add that exact origin (e.g. `http://192.168.1.23:5173`) to your
Supabase project's **Redirect URLs** (Section 5, step 4) — or, for local Docker,
it already accepts `localhost` only, so use Section 6's tunnel for phone auth
testing against local.

### The other scripts (for reference)

```bash
npm run typecheck   # strict tsc over app + vite config — ALSO the i18n test suite
npm run build       # typecheck, then production bundle into dist/
npm run preview     # serve the built dist/ locally
```

Run `npm run typecheck` after every change — because translations are typed, a
missing/extra key in any locale is a compile error here.

---

## 3. Running Supabase locally via Docker

This gives you a full Supabase backend on your own machine — no cloud account
needed. **Docker Desktop must be running first.**

All commands are run from the **project root** (`percorso/`), because the CLI
reads `supabase/config.toml` from there.

### Start the local stack

```bash
npx supabase start
```

The first run downloads several Docker images (a few minutes). When ready, it
prints your local credentials. `.env.development` (committed) already has
these values filled in, so there's nothing to paste anywhere — this output is
just useful for cross-checking or for Supabase Studio:

```
         API URL: http://127.0.0.1:54321
     GraphQL URL: http://127.0.0.1:54321/graphql/v1
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323
    Inbucket URL: http://127.0.0.1:54324
```

(Ports come straight from `supabase/config.toml`: API `54321`, DB `54322`,
Studio `54323`, email tester `54324`.)

### What each container actually does

`supabase start` spins up several containers (you'll see them in `docker ps`,
named `supabase_<service>_percorso` — `percorso` is `project_id` in
`config.toml`). In plain terms:

| Container | Role | Port |
| --- | --- | --- |
| **Postgres** (`supabase_db_percorso`) | The actual database — all your tables, rows, RLS policies, functions, and even the auth/user tables live here. | 54322 |
| **Auth / GoTrue** (`supabase_auth_…`) | Handles sign-up, login, passwords, sessions, and JWT tokens. | (behind API) |
| **PostgREST** (`supabase_rest_…`) | Turns your Postgres tables into the REST API the app calls. Enforces RLS. | (behind API) |
| **Realtime** (`supabase_realtime_…`) | Streams live DB changes over websockets (Percorso doesn't rely on it, but it's part of the stack). | (behind API) |
| **Storage** (`supabase_storage_…`) | File/object storage API (unused by Percorso today). | (behind API) |
| **Kong** (`supabase_kong_…`) | API gateway — the single front door (`:54321`) that routes to Auth/REST/Storage/Realtime. This is your `API URL`. | 54321 |
| **Studio** (`supabase_studio_…`) | The web admin UI to browse tables, run SQL, inspect auth users. | 54323 |
| **Inbucket/Mailpit** (`supabase_inbucket_…`) | A fake inbox — locally, "sent" emails aren't delivered; you read them here. | 54324 |
| **Edge Runtime, Analytics, Vector, pg-meta, imgproxy** | Supporting services (Deno functions, logs, metadata). You rarely touch these directly. | — |

> Note: the connection pooler (`db.pooler`) is **disabled** in this project's
> `config.toml`, and email confirmations are **off** locally
> (`auth.email.enable_confirmations = false`) — which is why seeded users can log
> in immediately without confirming an email.

### Apply the migrations (and seed data) — the clean-slate command

The project's schema lives in `supabase/migrations/` — the init migration
creates `profiles`, `accounts`, `categories`, `transactions` and `budgets`, all
with RLS, plus the `public.is_admin()` function and the signup trigger; later
migrations add `goals`, `bills` and `credit_cards`. That directory is the source
of truth and the only thing the CLI applies.

> To read the whole schema as it stands today without replaying migrations one
> by one, see `supabase/schema-full.sql` — a consolidated snapshot of every
> table, policy, function, trigger and index. It is documentation, not a
> migration: never apply it to a database that already has migrations.
>
> ⚠️ It is also a **destructive rebuild script**. It can be run repeatedly, but
> only because it `drop table … cascade`s every table first — so running it
> erases all profiles, accounts, transactions, budgets, goals and bills, for
> every user. Local dev and throwaway databases only; reseed afterwards with
> `supabase/seed/*.sql`. To change a schema whose data you want to keep, write a
> migration.
>
> It also **refuses to run** unless you uncomment the `set
> percorso.allow_destructive = 'yes';` line near the top of the file first —
> a guard against pasting it into the wrong project's SQL editor. See
> "Destructive-script guard" below.

The simplest, most reliable way to (re)build the local DB to a known state:

```bash
npx supabase db reset
```

`db reset` **drops the local database, replays every migration, then runs the
seed files.** Because `config.toml` has:

```toml
[db.seed]
enabled = true
sql_paths = ["./seed/00_allow_destructive.sql", "./seed/admin.sql", "./seed/test-data.sql"]
```

…those seeds run automatically at the end of every reset. `00_allow_destructive.sql`
runs first and pre-authorizes the destructive-script guard (see below) for this
local database only, so `admin.sql`/`test-data.sql` need no manual step here.
You'll see `NOTICE:  Seeded admin user …` and `NOTICE:  Seeded test user …` in
the output.

> If you ever want migrations **without** wiping data or running seeds, use
> `npx supabase migration up`. For everyday local dev, `db reset` is what you
> want.

### What the seed scripts insert

The first two live under `supabase/seed/` and are **local/test only** (they create real
`auth.users` rows with bcrypt passwords, which only works as the Postgres
superuser — i.e. via `db reset`, `psql`, or a throwaway project's SQL editor).

**`supabase/seed/admin.sql`** — one admin user:
- `auth.users` + identity for `admin@percorso.local`, password `admin-percorso-123`.
- Flips its `profiles.is_admin = true` (running as `postgres` bypasses the
  column-grant guard that normally blocks users from setting `is_admin`).
- Admins can **read** every user's finance rows; writes stay owner-only.

**`supabase/seed/test-data.sql`** — one test user + a full demo dataset:
- `auth.users` + identity for `test@percorso.local`, password `test-percorso-123`.
- **4 bank accounts** (Main checking, Savings, Wallet, Car consórcio) — credit
  cards are no longer accounts.
- **1 credit card** (Nubank, closes on the 20th, due the 10th) whose purchases
  carry `card_id` and no `account_id`, so the Cards screen shows an open invoice
  and the app's lazy bill generator turns each closed cycle into a bill on load.
- **10 categories** (8 expense, 2 income).
- **~6 months of transactions**: monthly salary + freelance income, a basket of
  bank expenses plus card purchases each month, a few very recent expenses, and a
  monthly checking→savings transfer. Dates are generated relative to
  `CURRENT_DATE`, so the dashboard's current month, 6-month cash flow, card
  cycles and budget progress are always populated.
- **7 budgets** (groceries is deliberately over its limit, to show an exceeded
  budget).
- **3 goals** (one tracking the Savings account's live balance, one manual with a
  deadline, one already met) and **4 bills** (overdue, due soon, paid, upcoming)
  so the due-date alerts fire.

Both seeds are **idempotent** — re-running them deletes and re-creates their own
rows, so `db reset` is always safe to repeat.

**`supabase/seed/demo-data.sql`** — the same dataset for an **existing** user.
It creates no `auth.users` row (edit the `uid` constant at the top to the target
account's id), which makes it the one seed that is safe to run against a real
project via the Dashboard SQL Editor. It is deliberately absent from
`config.toml`'s `sql_paths`, so `db reset` never runs it.

### Running a seed by hand (optional)

`db reset` already runs both seeds. If you want to run one manually against the
local DB (or a throwaway project), first open `supabase/seed/test-data.sql` and
uncomment the `-- set percorso.allow_destructive = 'yes';` line near the top —
see "Destructive-script guard" below — then run it with `psql` and the local DB
URL from `supabase start`:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/seed/test-data.sql
```

Without uncommenting that line, the script refuses to run (prints "Refusing to
run: this script is destructive…" and does nothing else — it's wrapped in a
transaction specifically so a partial run can't slip through).

### Destructive-script guard

Four scripts can delete or recreate real data — `supabase/schema-full.sql`,
`supabase/seed/admin.sql`, `supabase/seed/test-data.sql`, and
`supabase/seed/demo-data.sql` — so each refuses to run unless the Postgres
setting `percorso.allow_destructive` is `'yes'` in the same session:

```sql
set percorso.allow_destructive = 'yes';
```

Each file has this as a commented-out line right below its header; uncomment it
(or paste the `set` line immediately above the script in the same SQL editor
session) to proceed. This is the last line of defense against pasting one of
these into the wrong project's Dashboard SQL Editor. Each script is wrapped in
an explicit `begin; … commit;` block, because `psql -f` (and some SQL editors)
keep executing statements after an error by default — without the transaction
wrapper, the guard's error would print but the destructive statements after it
would still run. With it, one failed statement poisons the whole transaction,
so nothing partially applies either way.

Local `supabase db reset` is the one exception: `seed/00_allow_destructive.sql`
(first in `config.toml`'s `sql_paths`) sets the flag for that session
automatically, so `admin.sql`/`test-data.sql` need no manual step during a
normal local reset. That bootstrap file is local-only tooling — it's never
part of a migration, so `supabase db push` never sends it to a hosted project.

### Open Supabase Studio (inspect data visually)

```
http://localhost:54323
```

Open that in a browser. Use the **Table Editor** to browse `accounts`,
`transactions`, etc., the **SQL Editor** to run queries, and
**Authentication → Users** to see the seeded `admin@` and `test@` users.

### Reset the local database to a clean state

```bash
npx supabase db reset
```

Same command as above — it's the reset button. Wipes local data, replays
migrations, re-runs seeds.

### Stop the local stack

```bash
npx supabase stop
```

This stops and removes the containers but **preserves** your local database
volume, so `npx supabase start` next time resumes with your data. To stop **and
discard** all local data:

```bash
npx supabase stop --no-backup
```

### Point the frontend at local Supabase

Nothing to do here — `.env.development` is committed with the local Docker
values already filled in (Vite loads it automatically in dev mode; see Section
5 for the full env-file convention), so `npm run dev` after `supabase start`
just works.

The values in that file are the Supabase CLI's well-known local-dev defaults
(same for every project with the default `config.toml` jwt_secret) — never
valid against a real hosted project. You can confirm them anytime with
`npx supabase status` (Section 7) if you want to double-check they still
match.

---

## 4. Logging in with the seeded test user

**Prerequisites:** local Supabase is running (`npx supabase start` +
`npx supabase db reset`) and the dev server is running (`npm run dev` reads
`.env.development` automatically — nothing to configure, see Section 3).

### Credentials (from `test-data.sql`)

```
email:    test@percorso.local
password: test-percorso-123
```

(There is also `admin@percorso.local` / `admin-percorso-123` from `admin.sql`,
which additionally can read all users' data.)

### Steps

1. Open **<http://localhost:5173>**.
2. On the login page, enter `test@percorso.local` and `test-percorso-123`, submit.
3. You should land in **Finances** with a fully populated dashboard: net worth
   across the 4 accounts, a spending donut, 6-month cash flow, a long
   transactions list, and budgets (groceries showing as over-limit). If you see
   empty screens instead, the seed didn't run — re-run `npx supabase db reset`.

> Email confirmation is disabled locally, so the seeded user logs in immediately.

### About session persistence ("staying logged in")

The Supabase client (`src/lib/supabase.ts`) is created with
`persistSession: true` and `autoRefreshToken: true`:

- Your session (access **and** refresh token) is stored in the browser's
  **localStorage**, so it **survives page reloads and even a full browser
  restart** — you are not logged out on refresh.
- The access token is short-lived (~1 hour; `jwt_expiry = 3600` in
  `config.toml`) but is **refreshed silently in the background** before it
  expires, so the session continues seamlessly for many hours with no re-login.
- The real ceiling is the **refresh-token / session lifetime**, a server-side
  setting. Locally, the session time-box and inactivity timeout are **not set**
  (they're commented out under `[auth.sessions]` in `config.toml`), so multi-hour
  sessions "just work."

**How to verify it's working:**

1. Log in as the test user.
2. Reload the page (`F5`) — you stay logged in.
3. Fully close and reopen the browser, return to `http://localhost:5173` — still
   logged in.
4. (Optional) In DevTools → Application → Local Storage → `http://localhost:5173`,
   you'll see a `sb-…-auth-token` entry holding the session. Deleting it and
   reloading logs you out — that's the stored session at work.

---

## 5. Switching from local (Docker) to the real Supabase project

### What controls which backend the app uses

**Three env variables**, read by `src/lib/supabase.ts` (the first two) and
`src/app/EnvBanner.tsx` (the third):

| Variable | Local Docker | Real hosted project |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `http://127.0.0.1:54321` | `https://<your-project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | anon key from `supabase start` | anon / publishable key from the dashboard |
| `VITE_ENV_LABEL` | `local` | `staging` or `production` |

Vite loads env files **by mode**, not from a single `.env`
(see [Vite: Env Variables and Modes](https://vite.dev/guide/env-and-mode.html)):

- **`.env.development`** is committed and already has the local Docker values
  above. `npm run dev` uses **development** mode by default, so it reads this
  file automatically — a fresh clone needs zero manual env editing to run
  against local Supabase.
- **`.env.production`** (or `.env.production.local`) holds the real project's
  values. Both are gitignored — never commit real credentials. `npm run build`
  / `npm run preview` use **production** mode by default, so they read
  whichever of these exists.
- To point the **dev server** (`npm run dev`, hot reload) at the **real**
  project instead of local Docker — e.g. no Docker available, or debugging
  against real data — create `.env.development.local` (gitignored) with the
  hosted values. It overrides `.env.development` in development mode without
  touching the committed file.

`VITE_ENV_LABEL` drives the ribbon at the top of the screen in anything that
isn't `production` — a reminder of which backend you're pointed at, and its
host, so it's obvious at a glance when you're not looking at local data.

### Steps to point the dev server at the hosted project

1. Create `.env.development.local` at the project root with the values from
   **Supabase Dashboard → Project Settings → API**:

   ```
   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon / publishable key>
   VITE_ENV_LABEL=staging
   ```

   Use **only** the `anon` / publishable key — never the `service_role` / secret
   key: everything under `VITE_` is bundled into the browser, so a secret key
   here is a leaked secret key.

2. Restart the dev server so Vite reloads the env files:

   ```bash
   # Ctrl+C to stop, then:
   npm run dev
   ```

   The banner should now read `STAGING · <your-project-ref>.supabase.co` (or
   whatever label you chose) instead of `LOCAL`.

3. In the **Supabase dashboard → Authentication → URL Configuration**, set
   **Site URL** to where the app runs (`http://localhost:5173` in dev, your real
   URL in production) and add every origin you use to **Redirect URLs** (LAN IP,
   any tunnel URL from Section 6).

### Apply migrations to the hosted project (safely)

Link the CLI to your project once, then push migrations:

```bash
npx supabase login                              # opens a browser to authorize the CLI
npx supabase link --project-ref <your-project-ref>
npx supabase db push                            # applies supabase/migrations/*.sql to the remote DB
```

`db push` applies **only migrations** — it does **not** run the seed files
(seeds run on `db reset`, which you never run against a shared/remote DB).
Alternatively you can paste the migration SQL into the dashboard's **SQL Editor**
and run it.

### ⚠️ What NOT to do against the real database

- **Never run the seed scripts against production.** `supabase/seed/admin.sql`
  and `supabase/seed/test-data.sql` are local/test only — they create fake users
  and demo rows and delete/recreate data. Never run `db reset`, and never paste
  those seed files into a production SQL editor.
- **Never** put a `service_role` / `sb_secret_` key in `.env` or any `VITE_`
  variable, or commit it anywhere in this repo.
- Keep migrations **append-only** once applied to a shared DB — new schema
  changes go in **new** files under `supabase/migrations/`, never by editing an
  already-applied migration.

### Making a real user an admin (hosted)

Admin status can only be set by the `postgres` role (not through the app API). In
the dashboard **SQL Editor**:

```sql
update public.profiles set is_admin = true where id = '<the-user-uuid>';
```

---

## 6. Exposing the dev server for outside testing

To let someone **not** on your Wi-Fi test the app, put a temporary public URL in
front of your local dev server with a **Cloudflare quick tunnel** (no account,
no signup).

With the dev server already running on `:5173`, in a **second terminal**:

```bash
cloudflared tunnel --url http://localhost:5173
```

It prints a public URL like:

```
https://random-three-words.trycloudflare.com
```

Send that URL to your tester. For login to work through it, add that exact URL to
your Supabase project's **Authentication → Redirect URLs** (and Site URL if
needed).

**Caveats:**

- The URL is **temporary** and random — it changes every time you restart the
  tunnel.
- The tunnel only works while the `cloudflared` process **stays running** — close
  it and the URL dies.
- Quick tunnels are for **testing/demo only** — never route production traffic
  through one.
- It fronts your **local dev server**, so your local Supabase (or whichever
  backend your active env file points at) must be up and reachable for the app
  to load data.

---

## 7. Troubleshooting / common commands

### Is the local Supabase stack running? What are my local URLs/keys?

```bash
npx supabase status
```

Reprints the API URL, DB URL, Studio URL, anon key, and service_role key. If it
reports the stack isn't running, `npx supabase start`.

### Check Docker container status

```bash
docker ps                              # all running containers
docker ps --filter "name=supabase"     # just the Supabase stack
```

You should see containers named `supabase_db_percorso`, `supabase_kong_percorso`,
`supabase_auth_percorso`, `supabase_studio_percorso`, etc. If none appear, the
stack is stopped (or Docker Desktop isn't running).

### View logs when something's wrong

```bash
# logs for a specific container (get the exact name from `docker ps`)
docker logs supabase_db_percorso        # Postgres
docker logs supabase_auth_percorso      # Auth / login issues
docker logs supabase_kong_percorso      # API gateway / routing

# follow live and show the last 100 lines:
docker logs -f --tail 100 supabase_auth_percorso
```

For the **frontend**, errors show in the terminal running `npm run dev` and in
the browser's DevTools console.

### Common problems

| Symptom | Likely cause & fix |
| --- | --- |
| App shows **"Supabase is not configured"** | An env file is missing/blank for the active mode — see Section 5. Set both `VITE_SUPABASE_*` vars, then **restart** `npm run dev`. |
| Changed an env file but app still uses old backend | Vite only reads env files at startup — stop and re-run `npm run dev`. |
| Login fails / redirect errors on LAN or tunnel URL | Add that exact origin to Supabase **Redirect URLs** (Sections 2, 5, 6). |
| Test user logs in but screens are empty | Seed didn't run — `npx supabase db reset`. |
| `supabase start` fails | Docker Desktop isn't running, or ports `54321–54327` are in use. Start Docker; free the ports or `npx supabase stop` a previous stack. |
| `npx supabase` spawns `CMD.EXE` / UNC-path warning (WSL) | Node/npm are resolving to Windows binaries from a WSL path. Run the CLI from the same OS as Docker — either fully inside WSL (Linux Node) or fully on Windows. |
| Want a totally clean slate | `npx supabase stop --no-backup` then `npx supabase start` + `npx supabase db reset`. |

### Quick command reference

```bash
# Frontend
npm install                 # install deps
npm run dev                 # dev server → http://localhost:5173
npm run dev:host            # dev server exposed on your LAN
npm run typecheck           # strict TS + i18n check
npm run build               # typecheck + production bundle → dist/

# Local Supabase (Docker)
npx supabase start          # boot the local stack
npx supabase status         # show local URLs + keys
npx supabase db reset       # migrations + seeds → clean known state
npx supabase stop           # stop (keep data)
npx supabase stop --no-backup   # stop and discard local data

# Hosted Supabase
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push        # apply migrations to the remote DB (no seeds)

# Share a temporary public URL (second terminal, dev server running)
cloudflared tunnel --url http://localhost:5173
```
