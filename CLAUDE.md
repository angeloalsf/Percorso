# CLAUDE.md — Percorso project context

Percorso is a **mobile-first web app** (React SPA) with a single module — **Finances** — backed by **Supabase** (Postgres + Auth) with per-user Row Level Security. It was migrated from a local-only Electron desktop app; the Electron version's history is preserved on `main` before this branch. (An earlier cut of this migration also shipped a People module; it was removed — scope is Finances only.)

## Commands

- `npm run dev` — Vite dev server (http://localhost:5173)
- `npm run dev:host` — same, bound to `0.0.0.0` so phones on the same Wi-Fi can reach it at `http://<lan-ip>:5173`
- `npm run typecheck` — strict `tsc --noEmit` over app + vite config. **Run after every change**; it is also the i18n test suite (see below).
- `npm run build` — typecheck + production bundle into `dist/`
- `npm run preview` — serve the production build

Environment: copy `.env.example` → `.env` with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. Never introduce the `service_role` key anywhere in this repo — all `VITE_` vars ship to the browser; RLS is the access control.

## Architecture

```
supabase/
├── migrations/          # schema + RLS; apply via dashboard SQL editor or `supabase db push`
└── seed/                # LOCAL-ONLY seed SQL (admin user, test-login + demo finance data)
src/
├── main.tsx             # initTheme() → render <App> (StrictMode)
├── App.tsx              # AuthProvider + router: AuthGate(/login /signup) · AppLayout(/finances /settings)
├── auth/                # AuthProvider (session context), AuthGate, LoginPage, SignupPage,
│                        #   AuthShell (shared layout + "not configured" notice), errors.ts (AuthError → TKey)
├── app/                 # AppLayout: session gate → data gate → shell (bottom tab bar <md:, sidebar md:+)
│                        # SettingsPage: profile name, language, theme, sign-out
├── features/finance/    # store.ts (Supabase-backed Zustand) + FinancePage + sections/ (5 tabs)
├── components/ui/       # shadcn-style primitives; components/charts/ = dependency-free SVG
├── i18n/                # typed engine + locales/{en,pt-br,it}.ts
├── state/               # prefs.ts (language+theme → localStorage), profile.ts (profiles row)
└── lib/                 # supabase.ts (client), dates.ts (local YYYY-MM-DD), format.ts (Intl), utils.ts (cn)
```

### Data flow

- **Stores** (`features/finance/store.ts`, `state/profile.ts`) are plain Zustand stores with `status: idle|loading|ready|error`, a `load()` guarded against re-entry, and `reset()`. `AppLayout`'s Shell loads them when a session exists and resets them on unmount (sign-out); it renders a skeleton until the finance store is `ready` and an error panel with retry if it fails.
- **Mutations** are server-first: exported async functions (`addAccount`, `upsertBudget`, …) write to Supabase, then patch local state; they return `'ok' | 'error'` (deletes also `'in-use'`) and the SCREEN shows the toast (`sonner`). Client generates row ids (`newId()` = UUID) so local state never waits on a returned row.
- **DB is the authority on integrity**: RLS scopes writes to `auth.uid() = user_id`; composite FKs `(id, user_id)` prevent cross-user references; account/category deletes are FK-`restrict`ed (client pre-checks for a friendly `in-use` toast).
- **Naming seam**: DB is snake_case (`to_account_id`, `initial_balance`, `monthly_limit`), app is camelCase (`toAccountId`, `initialBalance`, `monthlyLimit`) — mapping lives ONLY in the `rowTo*` helpers inside the store.
- **Profile** (`profiles` table: `full_name`, `currency`, `is_admin`) is created by a DB trigger on signup (email and Google both). Display currency lives there, not in the finance store.

### Auth & session

- `AuthProvider` wraps the app: `getSession()` + `onAuthStateChange`. `AuthGate` bounces signed-in users off /login·/signup; `AppLayout` bounces signed-out users to /login.
- `supabase.ts` sets `persistSession: true` + `autoRefreshToken: true`: the session (refresh token) survives reloads/restarts in localStorage, and the ~1h access token is refreshed silently in the background. Real session length is governed by the refresh-token lifetime, set in the Supabase dashboard (Auth → Sessions / JWT expiry) — see README.
- Google OAuth: `signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })`; the provider's client ID/secret are configured in the Supabase dashboard, not in this repo.
- Signup with email confirmation ON returns no session → pages show the "check your email" panel (`sentTo` state). Auth errors map to translation keys in `auth/errors.ts` — never show raw Supabase messages.

### Admin

- `profiles.is_admin` marks an admin. `public.is_admin()` (SECURITY DEFINER, reads profiles as owner to avoid RLS recursion) is OR-ed into every table's **SELECT** policy, so admins can READ all users' rows; insert/update/delete stay owner-only.
- **Privilege-escalation guard**: users must not be able to set `is_admin` on their own row. RLS gates rows, not columns, so column grants restrict writable columns instead — `revoke update on profiles from authenticated; grant update (full_name, currency) …`. Admin status is assigned out-of-band by a seed/migration running as `postgres` (`supabase/seed/admin.sql`).

### Seeds (local/test only — never run against production)

- `supabase/seed/admin.sql` — provisions the admin user (auth.users + identity via pgcrypto, `is_admin = true`).
- `supabase/seed/test-data.sql` — provisions `test@percorso.local` + a full realistic finance dataset (accounts, categories, months of transactions, budgets) to populate every Finance screen for visual QA.
- Both create real `auth.users` rows with bcrypt passwords, which only works running as the postgres/superuser role (local `supabase db reset`, or the dashboard SQL editor on a throwaway project). Seed inserts set `user_id` explicitly because `auth.uid()` is NULL outside a request context.

### i18n (unchanged engine from v1)

- `locales/en.ts` is the source of truth: `Dict = typeof en`, `t()` only accepts valid dot-path keys, and pt-br/it are typed `typeof en` — missing or extra keys are compile errors. Every user-visible string is a translation key (the only exception: the dev-facing "Supabase is not configured" notice in AuthShell).
- Language + theme live in `state/prefs.ts` (localStorage, applied pre-auth). `useT()` / `useLang()` re-render on switch.

### CSS / UI conventions

- Tailwind v4 (`@tailwindcss/vite`), tokens as CSS variables in `src/index.css` (`--background`, `--primary`, …, mapped via `@theme inline`), class-based dark mode (`.dark` on `<html>`, `@custom-variant dark`).
- **Mobile-first**: base styles target ~375 px; scale up with `sm:`/`md:`/`lg:`. Bottom tab bar below `md:`, sidebar at `md:+`. Forms are single-column on phones (`FormGrid`), dialogs are bottom sheets on phones and centered modals from `sm:` (`components/ui/dialog.tsx`). Native `<select>` on purpose — best mobile UX.
- Feedback rules (kept from v1): every mutation toasts, every delete goes through `<ConfirmDialog>`, every list has an `<EmptyState>`.
- Dates are local `YYYY-MM-DD` strings via `lib/dates.ts` — never `new Date(isoString)` on a date-only string. Postgres `date` columns round-trip as those strings.

## Gotchas

- TypeScript 7: no `baseUrl` — the `@` alias is `paths: {"@/*": ["./src/*"]}` + the same alias in `vite.config.ts`.
- StrictMode double-mounts effects: store `load()` must stay idempotent (the `status` guard).
- `supabase.ts` builds a placeholder client when env vars are missing so the app renders the setup notice instead of crashing — don't "fix" that into a throw.
- Keep migrations append-only once applied to a shared DB: new schema changes go in NEW files under `supabase/migrations/`. (The init migration was edited in-branch before any shared apply.)
- Source files are UTF-8 with LF; avoid ad-hoc PowerShell text rewriting (encoding corruption) — use proper editor tooling.
