# CLAUDE.md — Percorso project context

Percorso is a **mobile-first web app** (React SPA) with a single module — **Finances** — backed by **Supabase** (Postgres + Auth) with per-user Row Level Security. It was migrated from a local-only Electron desktop app; the Electron version's history is preserved on `main` before this branch. (An earlier cut of this migration also shipped a People module; it was removed — scope is Finances only.)

## Commands

- `npm run dev` — Vite dev server (http://localhost:5173)
- `npm run dev:host` — same, bound to `0.0.0.0` so phones on the same Wi-Fi can reach it at `http://<lan-ip>:5173`
- `npm run typecheck` — strict `tsc --noEmit` over app + vite config. **Run after every change**; it is also the i18n test suite (see below).
- `npm run lint` / `npm run format` — ESLint / Prettier; both run in the pre-commit hook (Husky + lint-staged)
- `npm test` / `npm run test:watch` — Vitest unit tests for the store's derived-value functions and `lib/dates.ts`
- `npm run e2e` — Playwright e2e (`e2e/`) for the money-critical flows (login, add-transaction, create-account, pay a card bill) against a running local Supabase, logged in as the seeded `test@percorso.local` (`supabase/seed/test-data.sql`); needs `supabase start` + `supabase db reset` first — `npm run dev`'s webServer is started automatically. Single worker on purpose (specs share and mutate one seeded user's data).
- `npm run knip` / `npm run deadcode` — unused-export/dead-code sweep (knip, ts-prune); run occasionally, not part of CI
- `npm run madge` — circular-dependency check; a non-blocking CI job, since it always flags the one documented `store.ts`/`cards.ts` cycle described under "Data flow" below
- `npm run build` — typecheck + production bundle into `dist/`
- `npm run build:analyze` — same, plus opens an interactive bundle-composition treemap (`dist/stats.html`); run occasionally, not part of CI
- `npm run preview` — serve the production build
- `supabase test db` — pgTAP RLS isolation tests (`supabase/tests/`) against a running local Supabase; needs only the `db` container (see the test file's header for the minimal `supabase start -x ...`)

Environment: copy `.env.example` → `.env` with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. Never introduce the `service_role` key anywhere in this repo — all `VITE_` vars ship to the browser; RLS is the access control.

## Architecture

```
supabase/
├── migrations/          # schema + RLS; apply via dashboard SQL editor or `supabase db push`
├── schema-full.sql      # consolidated snapshot of the CURRENT schema (never applied; see below)
├── seed/                # admin user, test-login + demo finance data, production-safe demo data
└── tests/               # pgTAP RLS isolation tests, run via `supabase test db`
src/
├── main.tsx             # initTheme() → render <App> (StrictMode)
├── App.tsx              # AuthProvider + router: AuthGate(/login /signup) · AppLayout(/finances
│                        #   /finances/accounts/:accountId[/:kind/:itemId] /settings)
├── auth/                # AuthProvider (session context), AuthGate, LoginPage, SignupPage,
│                        #   AuthShell (shared layout + "not configured" notice), errors.ts (AuthError → TKey)
├── app/                 # AppLayout: session gate → data gate → shell (bottom nav at all breakpoints)
│                        # SettingsPage: profile name, language, theme, sign-out
├── features/finance/    # store/ (Supabase-backed Zustand, split by entity) + FinancePage + sections/ (tabs)
│                        #   + accounts/ = the routed bank-account drill-down (see below)
├── components/ui/       # shadcn-style primitives; components/charts/ = dependency-free SVG
├── i18n/                # typed engine + locales/{en,pt-br,it}.ts
├── state/               # prefs.ts (language+theme → localStorage), profile.ts (profiles row)
└── lib/                 # supabase.ts (client), dates.ts (local YYYY-MM-DD), format.ts (Intl), utils.ts (cn)
```

### Data flow

- **Stores** (`features/finance/store/`, `state/profile.ts`) are plain Zustand stores with `status: idle|loading|ready|error`, a `load()` guarded against re-entry, and `reset()`. `AppLayout`'s Shell loads them when a session exists and resets them on unmount (sign-out); it renders a skeleton until the finance store is `ready` and an error panel with retry if it fails.
- **`features/finance/store/` layout**: `types.ts` (every domain type), `rows.ts` (the `rowTo*` snake_case→camelCase mappers), `store.ts` (the Zustand store itself + `load`/`reset`, plus the `state()`/`patch()` helpers every entity module reads/writes through), one file per entity's mutations + entity-specific derived values (`accounts.ts`, `cards.ts`, `bills.ts`, `plans.ts` — loans & consórcios, `budgets.ts`, `goals.ts`, `transactions.ts`, `categories.ts`), and `derived.ts` for cross-entity dashboard analytics (insights, recurring, health score, net worth). `index.ts` re-exports the lot, so every other file still imports from `'../store'` / `'./store'` unchanged — that path now resolves to the directory. `store.ts`'s `load()` calls `cards.ts`'s `syncCardBills`, which is the one intentional cycle in the graph (function-body-only, not top-level, so it's safe).
- **Mutations** are server-first: exported async functions (`addAccount`, `upsertBudget`, …) write to Supabase, then patch local state; they return `'ok' | 'error'` (deletes also `'in-use'`) and the SCREEN shows the toast (`sonner`). Client generates row ids (`newId()` = UUID) so local state never waits on a returned row.
- **DB is the authority on integrity**: RLS scopes writes to `auth.uid() = user_id`; composite FKs `(id, user_id)` prevent cross-user references; account/category deletes are FK-`restrict`ed (client pre-checks for a friendly `in-use` toast).
- **Naming seam**: DB is snake_case (`to_account_id`, `initial_balance`, `monthly_limit`), app is camelCase (`toAccountId`, `initialBalance`, `monthlyLimit`) — mapping lives ONLY in the `rowTo*` helpers in `store/rows.ts`.
- **Profile** (`profiles` table: `full_name`, `currency`, `is_admin`) is created by a DB trigger on signup (email and Google both). Display currency lives there, not in the finance store.

### Derived values — ALWAYS computed, never cached

**Every number that can be derived from transactions (or from another source-of-truth table) is computed from that source on every read. Never store it as a separately-maintained total that has to be kept in sync.** The failure this prevents: a transaction changes and some other screen keeps showing the old number.

Two kinds of numbers, and the line between them is what matters:

- **Inputs the user owns** — set by them, edited by them, derived from nothing: `accounts.initial_balance` (what you had when you started), `credit_cards.credit_limit`, `loans/consortiums.total_amount` (the contracted principal) and their `(installments_paid, paid_as_of)` baseline, `goals.saved_amount` for manually-tracked goals, `budgets.monthly_limit`, a hand-entered `bills.amount`.
- **Running values derived from those inputs + transactions since** — an account's current balance, a card's invoice, spend-so-far, net worth, installment progress. These are **never** editable to "correct" them. If one looks wrong, the fix is a transaction, not the number.

In practice, everything derived lives as a pure function in `features/finance/store/`, taking the already-loaded rows and returning a fresh result — entity-specific ones colocated with that entity's mutations (`accountBalance` in `accounts.ts`, `cardOpenInvoice`/`nextCardDue` in `cards.ts`, `goalProgress` in `goals.ts`, `installmentsPaidNow`/`planRemaining`/`planNextDue` in `plans.ts`, `billAlerts` in `bills.ts`), cross-entity dashboard analytics in `derived.ts` (`spendingByCategory`, `monthTotals`, `netWorthAsOf`, `netWorthSeries`, `pctChange`, `computeInsights`, `detectRecurring`, `computeHealthScore`). Screens call them inside `useMemo` keyed on the store slices, so a transaction edit re-renders every dependent number at once. New derived values go here too — not into a column, and not into component state.

**The one persisted exception, and why:** a card's invoice becomes a `bills` row, because a bill has to exist to be paid, alerted on and marked off. That is the only stored derived total, so `syncCardBills()` **re-derives it on every load** instead of only filling gaps — inserting a missing cycle, updating the amount when a purchase in a closed cycle was edited/added/deleted, and deleting the bill if the cycle is now empty. A **paid** bill is never restated: it records what was actually paid, which is history. Any future stored total must come with the same kind of reconciliation pass, documented next to it.

When a feature is "done", check it against this: _is every number here computed from source data, or could it go stale?_

### Bank accounts and the products tied to them

- An `accounts` row is money you **hold** — `checking | savings | cash | investment`. Anything you **owe or subscribe to** is a separate table linked by an account id that is **display/grouping only** and never dictates which account pays: `credit_cards.issuing_account_id`, `loans.account_id`, `consortiums.account_id`. Two account types were removed as this became clear: `'card'` (credit-cards migration) and `'consorcio'` (loans/consortiums migration, which also converts any leftover consórcio account into a `consortiums` row).
- The Contas bancárias tab is a **three-level drill-down**, and levels 2 and 3 are real routes so they deep-link and work with browser back: list (`sections/Accounts`) → `/finances/accounts/:accountId` (`accounts/AccountDetailPage`, sub-tabs Cartões · Empréstimos · Consórcios) → `/finances/accounts/:accountId/:kind/:itemId` (`accounts/AccountItemPage`). The other Finance tabs remain local `useState`, not routes. Both pages `<Navigate>` up a level when the id no longer resolves.
- The top-level Cartões tab stays the flat all-cards list and is where cards are **created** (it also holds cards with no issuing account); the account's Cartões sub-tab only lists that account's cards. Loans and consórcios are created from within the account, since that is their only home.
- **`loans` / `consortiums` are an intentionally minimal v1**: list/CRUD only, with none of the credit-card machinery (no bill generation into `bills`, no payment linking). Progress follows the derived-value rule above: `(installments_paid, paid_as_of)` is the user-owned **input** — the count that was true on that date — and `store.installmentsPaidNow()` derives today's count from it by rolling forward one per `due_day` elapsed, exactly as `accountBalance` derives from `initial_balance`. Nothing writes a progress number back. Replace that derivation first if real payment tracking is added.

### Auth & session

- `AuthProvider` wraps the app: `getSession()` + `onAuthStateChange`. `AuthGate` bounces signed-in users off /login·/signup; `AppLayout` bounces signed-out users to /login.
- `supabase.ts` sets `persistSession: true` + `autoRefreshToken: true`: the session (refresh token) survives reloads/restarts in localStorage, and the ~1h access token is refreshed silently in the background. Real session length is governed by the refresh-token lifetime, set in the Supabase dashboard (Auth → Sessions / JWT expiry) — see README.
- Google OAuth: `signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })`; the provider's client ID/secret are configured in the Supabase dashboard, not in this repo.
- Signup with email confirmation ON returns no session → pages show the "check your email" panel (`sentTo` state). Auth errors map to translation keys in `auth/errors.ts` — never show raw Supabase messages.

### Admin

- `profiles.is_admin` marks an admin. `public.is_admin()` (SECURITY DEFINER, reads profiles as owner to avoid RLS recursion) is OR-ed into every table's **SELECT** policy, so admins can READ all users' rows; insert/update/delete stay owner-only.
- **Privilege-escalation guard**: users must not be able to set `is_admin` on their own row. RLS gates rows, not columns, so column grants restrict writable columns instead — `revoke update on profiles from authenticated; grant update (full_name, currency) …`. Admin status is assigned out-of-band by a seed/migration running as `postgres` (`supabase/seed/admin.sql`).

### Schema changes — ALWAYS a three-part change

Every schema change (new table, new column, new constraint …) ships **three things in the same change**, never as an afterthought:

1. **A new migration** under `supabase/migrations/`. Append-only — never edit a file already applied to a shared DB. This stays the source of truth for how the schema evolved and how to apply it incrementally (`supabase db push` / `db reset` read this directory _only_).
2. **Updated seed data** — `supabase/seed/test-data.sql` **and** `supabase/seed/demo-data.sql`. A new feature never ships with empty seed data: after a fresh `supabase db reset` (or running the demo script), its screen must already be populated and testable. If the change alters existing columns, make sure the seeds still satisfy the new constraints — e.g. dropping `accounts.type = 'card'` meant reseeding cards into `credit_cards`.
3. **Updated `supabase/schema-full.sql`** — one file holding the complete current CREATE-everything SQL (every table, RLS policy, function, trigger, grant, index), equivalent to concatenating every migration in order. It is a **convenience snapshot, never applied** to a database that has migrations; it exists so the whole schema can be read or recreated at a glance. It is idempotent — it `drop table … cascade`s everything first — which also makes it **destructive**: running it wipes every table it defines, so it is for local/throwaway databases only. `auth.users` is not dropped, but every `profiles` row and all finance data is.

To verify #3 after editing: apply `migrations/*.sql` in order to one scratch database and `schema-full.sql` to another, then `pg_dump --schema-only --schema=public --no-owner` both and diff — they must be identical, column order included. (New columns therefore go at the **end** of the table in the snapshot, matching where `alter table … add column` put them.)

### Seeds

- `supabase/seed/admin.sql` — **local/test only.** Provisions the admin user (auth.users + identity via pgcrypto, `is_admin = true`).
- `supabase/seed/test-data.sql` — **local/test only.** Provisions `test@percorso.local` + a full realistic finance dataset (accounts, categories, credit card, months of bank _and_ card transactions, budgets, goals, bills) to populate every Finance screen for visual QA.
- `supabase/seed/demo-data.sql` — **production-safe.** Same dataset for an **existing** user id, and creates no `auth.users` row, so it can be pasted into the Dashboard SQL editor of a real project. Not in `config.toml`'s `sql_paths` — it is run by hand.
- The first two create real `auth.users` rows with bcrypt passwords, which only works running as the postgres/superuser role (local `supabase db reset`, or the dashboard SQL editor on a throwaway project). Seed inserts set `user_id` explicitly because `auth.uid()` is NULL outside a request context.
- All three are idempotent: re-running deletes and recreates that user's rows, in FK-`restrict`-safe order (transactions → budgets → goals → bills → credit_cards → accounts → categories).

### i18n (unchanged engine from v1)

- `locales/en.ts` is the source of truth: `Dict = typeof en`, `t()` only accepts valid dot-path keys, and pt-br/it are typed `typeof en` — missing or extra keys are compile errors. Every user-visible string is a translation key (the only exception: the dev-facing "Supabase is not configured" notice in AuthShell).
- Language + theme live in `state/prefs.ts` (localStorage, applied pre-auth). `useT()` / `useLang()` re-render on switch.

### CSS / UI conventions

- Tailwind v4 (`@tailwindcss/vite`), tokens as CSS variables in `src/index.css` (`--background`, `--primary`, …, mapped via `@theme inline`), class-based dark mode (`.dark` on `<html>`, `@custom-variant dark`).
- **`color-scheme` is what themes NATIVE UI**, and it is set alongside the tokens (`light` on `:root`, `dark` on `.dark`). The `.dark` class only restyles our own elements; the browser's own widgets — the `<select>` dropdown list, the date picker calendar, checkboxes, scrollbars, autofill — follow `color-scheme` and nothing else. Since Percorso keeps native `<select>`s on purpose, dropping it makes an open dropdown render as a stark white panel over a dark dialog. Corollary: **don't hand-invert native control internals**; that only compensates for a missing `color-scheme` and double-applies once it's present (this is why `Input` no longer inverts the calendar indicator).
- **Use a semantic token, never a raw palette color.** Every status color exists as a themed pair: `--primary`, `--destructive`, `--success`, `--warning`, `--muted-foreground`. A hardcoded hex can't adapt — `#f59e0b` for "attention" measured 2.15:1 on the light background, below even the 3.0 icon threshold, while looking fine in the dark mode it was picked in.
- **Mobile-first**: base styles target ~375 px; scale up with `sm:`/`md:`/`lg:`. Bottom nav at all breakpoints (no sidebar yet — deferred, see `STD-5`). Forms are single-column on phones (`FormGrid`), dialogs are bottom sheets on phones and centered modals from `sm:` (`components/ui/dialog.tsx`). Native `<select>` on purpose — best mobile UX.
- Feedback rules (kept from v1): every mutation toasts, every delete goes through `<ConfirmDialog>`, every list has an `<EmptyState>`.
- Dates are local `YYYY-MM-DD` strings via `lib/dates.ts` — never `new Date(isoString)` on a date-only string. Postgres `date` columns round-trip as those strings.

## Gotchas

- TypeScript 7: no `baseUrl` — the `@` alias is `paths: {"@/*": ["./src/*"]}` + the same alias in `vite.config.ts`.
- StrictMode double-mounts effects: store `load()` must stay idempotent (the `status` guard).
- `supabase.ts` builds a placeholder client when env vars are missing so the app renders the setup notice instead of crashing — don't "fix" that into a throw.
- Keep migrations append-only once applied to a shared DB: new schema changes go in NEW files under `supabase/migrations/`. (The init migration was edited in-branch before any shared apply.) A migration is only half the change — see "Schema changes" above for the seed + `schema-full.sql` updates that ship with it.
- Source files are UTF-8 with LF; avoid ad-hoc PowerShell text rewriting (encoding corruption) — use proper editor tooling.

```

After completing each task/todo item and confirming npm run typecheck passes, commit the change with a clear, conventional commit message before moving to the next task.
```
