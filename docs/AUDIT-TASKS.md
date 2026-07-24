# Percorso — Deep Audit & Task Backlog

_Analysis pass, 2026-07-24. No code was changed. This is a prioritized, self-contained
backlog for a follow-up implementation session (one task at a time). Each task states
**Why / Where / What to do / Priority / Effort** so it can be executed without re-reading
this analysis._

Legend: Priority **High / Medium / Low**, Effort **S** (<½ day) **M** (½–2 days) **L** (>2 days).
Task IDs are stable (e.g. `DP-1`) and referenced in the implementation order at the end.

---

## 1. Executive summary

**What's genuinely solid (don't regress it):**

- **The security model is well-designed, not copy-pasted-and-hoped.** Every domain table has
  per-operation RLS scoped to `auth.uid() = user_id`; cross-user integrity is enforced with
  composite `(id, user_id)` foreign keys; `public.is_admin()` is `SECURITY DEFINER` with
  `set search_path = ''`; privilege escalation on `is_admin` is blocked with column-level
  grants rather than assumed. The newer tables (`bills`, `goals`, `credit_cards`, `loans`,
  `consortiums`) all follow the same shape (verified table by table in §8).
- **The "derived values, never cached" discipline is real and consistently applied.** Every
  financial figure is a pure function of the source rows (`accountBalance`, `cardOpenInvoice`,
  `installmentsPaidNow`, `monthTotals`, …). The one persisted derived total (card-invoice
  bills) has the documented reconciliation pass. I found **no** stale-total violations.
- **Feature patterns are strikingly consistent.** Section → list + `*Form` dialog, server-first
  mutations returning `'ok' | 'error' | 'in-use'`, screen owns the toast, deletes go through
  `ConfirmDialog`, lists have `EmptyState`. Drift is minimal.
- **i18n cannot silently drift.** `Dict = typeof en` + typed `t()` means missing/extra keys are
  compile errors; all three locales carry the same 270 keys. `npm run typecheck` passes clean.

**The three biggest risks (address first):**

1. **No enforced dev/prod separation, and the app currently points at production.** `.env`
   has the hosted URL uncommented and `localhost` commented out, so `npm run dev` today talks
   to the real Supabase project. There is no staging project, no environment indicator in the
   UI, and the destructive seeds / `schema-full.sql` have no runtime guard. A prod-data
   incident has already happened once. → §5.
2. **A latent money-correctness bug: transactions are never paginated.** The store does
   `supabase.from('transactions').select('*')` and PostgREST caps responses at
   `max_rows = 1000`. Because **every** balance/net-worth/cash-flow number is summed from the
   returned rows, once a user crosses ~1000 lifetime transactions the app silently drops the
   oldest 1000-and-beyond and shows **wrong** numbers. → `ARCH-1`.
3. **No safety net: no error boundary, no tests, no lint/format enforcement, no CI.** A single
   render error white-screens the app; the money logic (the part that must be right to sell
   this) has zero test coverage; there is no ESLint/Prettier/pre-commit/CI despite the code
   already containing `eslint-disable` comments. → §7.

**Fastest wins (low effort, real value):** delete 2 dead files (`DEAD-1`); fix the
`demo-data.sql` header/uid mismatch (`DEAD-3`); refresh the stale RUNBOOK `.env` section
(`STD-4`); add the environment banner (`DP-2`); add ESLint+Prettier+Husky (`STD-1`).

---

## 2. Architecture & code patterns

### ARCH-1 — Paginate the transactions load (row-cap truncation corrupts every total) — **High / M**

- **Why:** `max_rows = 1000` (Supabase/PostgREST default and this repo's `config.toml`) caps
  every response. The store fetches all transactions unpaginated, and all financial figures are
  derived by summing those rows, so past ~1000 lifetime transactions the app shows wrong
  balances, net worth, cash flow, budgets and card invoices — the worst failure mode for a
  finance product (silent, plausible-looking wrong numbers).
- **Where:** `src/features/finance/store.ts` `load()` (lines ~262–313), the
  `supabase.from('transactions').select('*')...` call.
- **What to do:** Fetch transactions in pages until exhausted, e.g. loop `.range(from, from+999)`
  (page size 1000) accumulating rows until a short page is returned; keep the existing
  `.order('date').order('created_at')`. (Accounts/categories/budgets/goals/bills/cards/loans/
  consortiums are naturally bounded and can stay single-shot, but add the same guard to any
  that could realistically exceed 1000.) Add a Vitest test (see `TOOL-6`) that a paginated
  fetch of 1500 mock rows returns all 1500. Optionally document the intended ceiling.
- **Alternative considered:** raising `max_rows` only moves the cliff; pagination is the correct
  fix. Server-side aggregation is a larger project — not needed for v1.

### ARCH-2 — Add a top-level React error boundary — **High / S**

- **Why:** There is no error boundary anywhere; any thrown render error blanks the whole SPA
  with no recovery. Not acceptable for a paid product.
- **Where:** `src/App.tsx` (wrap the router), plus a new `src/app/ErrorBoundary.tsx`.
- **What to do:** Add a class-based `ErrorBoundary` (React 19 still needs a class or
  `react-error-boundary`) rendering a translated "something went wrong" panel with a reload
  button (mirror the existing error panel styling in `AppLayout`). Wrap `<BrowserRouter>` (or
  the protected `<Outlet/>`) with it. Add translation keys `errors.crashTitle` /
  `errors.crashBody` to all three locales. When `TOOL-9` (Sentry) lands, report caught errors.

### ARCH-3 — Reduce cross-section coupling: extract shared bill-pay UI — **Low / S**

- **Why:** `Dashboard.tsx` imports `PayBillDialog` and `BillBadge` from `sections/Bills.tsx`.
  Sections importing each other's internals invites tangles as the app grows; `BillBadge`'s
  `BillDisplayState` also lives in `Bills.tsx`.
- **Where:** `src/features/finance/sections/Dashboard.tsx` (imports), `sections/Bills.tsx`
  (exports `PayBillDialog`, `BillBadge`, `BillDisplayState`).
- **What to do:** Move `PayBillDialog`, `BillBadge` and the `BillDisplayState`/`displayState`
  helper into a shared module (e.g. `src/features/finance/bills/BillUI.tsx` or
  `components/finance/`). Import from there in both screens. Purely structural; no behavior
  change.

### ARCH-4 — Note (no action required): `load()` writes on the read path — **Low / — (document)**

- **Why:** `load()` calls `syncCardBills()`, which issues insert/update/delete against `bills`
  during what reads as a fetch. This is intentional and documented (no background jobs), guarded
  by the `status` re-entry check and a `try/catch`. Flagged only so a future maintainer doesn't
  "fix" it into a pure read. If bill sync ever grows, move it behind an explicit user action or
  an edge function. No change now.

---

## 3. Modularization & file organization

### MOD-1 — Decide the `features/finance/` boundary before it grows further — **Medium / M**

- **Why:** Everything lives under one `features/finance/` folder with a single 1133-line
  `store.ts` holding types, row-mappers, mutations for 9 entities, card-cycle logic, and all
  dashboard analytics. It's still readable, but it's the natural next thing to sag as features
  are added. Per the codebase's own "modularization" commit direction, this is the moment to
  split intentionally rather than reactively.
- **Where:** `src/features/finance/store.ts`; `src/features/finance/sections/*`.
- **What to do (low-risk, incremental — keep public import sites stable via re-exports):**
  1. Split `store.ts` into cohesive modules under `features/finance/store/`: `types.ts`,
     `rows.ts` (the `rowTo*` mappers), one file per entity's mutations
     (`accounts.ts`, `cards.ts`, `bills.ts`, `plans.ts`, `budgets.ts`, `goals.ts`,
     `transactions.ts`, `categories.ts`), `derived.ts` (analytics: insights, recurring, health,
     net worth), and `store.ts` (the Zustand store + `load`/`reset`). Re-export everything from
     an `index.ts` so existing `from '../store'` imports don't churn.
  2. Confirm the `sections/` vs `accounts/` (routed drill-down) split stays as-is — it's a
     sound separation and matches CLAUDE.md.
- **Guardrail:** run `npm run typecheck` after each move; the split must be behavior-neutral.
- **Note vs. CLAUDE.md:** CLAUDE.md documents a single `store.ts`. If this task lands, update
  the "Architecture" and "Derived values" sections of CLAUDE.md to point at the new layout
  (they both name `features/finance/store.ts`).

### MOD-2 — Extract the shared list-row "drill/action" pattern — **Low / S**

- **Why:** The tappable-row-with-side-actions markup is near-duplicated in `sections/Accounts.tsx`
  and `accounts/AccountDetailPage.tsx` (`DrillRow`). Minor duplication, easy to unify.
- **Where:** `sections/Accounts.tsx` (account row), `accounts/AccountDetailPage.tsx` (`DrillRow`).
- **What to do:** Promote a single `DrillRow`/`NavRow` primitive to `components/ui/list.tsx` (or
  a sibling) and use it in both. Optional polish; skip if MOD-1 is deferred.

---

## 4. Dead code / what can be removed

### DEAD-1 — Delete unused UI components `textarea.tsx` and `stat-card.tsx` — **Low / S**

- **Why:** Both are imported by **zero** files (verified by grep across `src`). `StatCard` was
  superseded by the inline `MetricCard` in `Dashboard.tsx`; `Textarea` is unused because notes
  use single-line `Input`.
- **Where:** `src/components/ui/textarea.tsx`, `src/components/ui/stat-card.tsx`.
- **What to do:** Delete both files. Run `npm run typecheck` (must stay green). Do **not** delete
  `label.tsx` — it's used internally by `field.tsx`.

### DEAD-2 — Run a dead-code sweep with knip + ts-prune and clear what they surface — **Medium / S**

- **Why:** The manual scan found the two files above; a tool will catch unused exports inside
  otherwise-used files (e.g. verify `toISODate`, `formatMonthLong` etc. are all still referenced)
  and unused deps. Worth doing once, then keeping in CI.
- **Where:** whole repo.
- **What to do:** `npx knip` and `npx ts-prune` (see `TOOL-1` for config). Review each hit; delete
  genuinely-dead exports; keep intentional public API (mark with knip's `ignore` if needed).
  Land after `DEAD-1` so the two obvious files aren't re-flagged.

### DEAD-3 — Fix `demo-data.sql` header/uid mismatch (production-safe seed points at the wrong id) — **Medium / S**

- **Why:** The header comment says `Target user: Angelo / user_id: 45143c60-1ea8-4168-9dc6-0105c1f8cadf`
  but the actual code uses `uid := '0d9b6f1b-ee9c-4616-a0b7-93fd55269656'`. This is the one seed
  designed to run against a **real** database via the Dashboard SQL editor, so a stale/contradictory
  target id is a real "seed the wrong account" hazard, and it hardcodes real user UUIDs into a
  committed file.
- **Where:** `supabase/seed/demo-data.sql` lines 14–16 (header) vs line 32 (`uid`).
- **What to do:** Make the header and the `uid` agree, and turn the id into an obvious
  fill-in-your-own placeholder (e.g. `uid := '<PASTE-TARGET-USER-ID>'` with a one-line "get this
  from Dashboard → Authentication → Users" note), matching how the README already describes this
  file. Remove the personal-name/id pairing. Confirm it still matches the current schema.

### DEAD-4 — No Electron / People leftovers remain — **Low / — (verified, no action)**

- **Why:** Grepping `src` and `supabase` for `people`, `electron`, `ipcRenderer`, `relationship`
  returns nothing; no `console.*`/`debugger`/`TODO`/`FIXME` either. Migration cleanup is complete.
  Recorded so the follow-up session doesn't re-hunt for it.

---

## 5. Dev vs. production separation (explicit priority)

### DP-1 — Establish an enforced env convention (`.env.local` for dev, never prod-by-default) — **High / M**

- **Why:** There is exactly one `.env`, and it currently has the **hosted/production** URL
  uncommented with `localhost` commented out — so `npm run dev` today runs against the real
  project. Switching backends means editing comments in a gitignored file: error-prone and the
  root cause of the earlier incident. Vite supports mode-specific env files that make the
  intent explicit and hard to get wrong.
- **Where:** `.env`, `.env.example`, `vite.config.ts`, `README.md`/`docs/RUNBOOK.md`, `.gitignore`.
- **What to do:**
  1. Adopt Vite's convention: commit `.env.development` pointing at **local** Supabase
     (`http://localhost:54321`) and keep `.env.production` / `.env.production.local`
     **uncommitted** for the hosted keys. `npm run dev` (mode `development`) then defaults to
     local; `npm run build` (mode `production`) uses prod. Document that plain `.env` is loaded in
     all modes and should stay empty/committed-safe.
  2. Update `.env.example` to describe the split. Ensure `.env*.local` and `.env.production*` are
     gitignored (currently `.env`, `.env.local` are).
  3. Rewrite the RUNBOOK §5 "switching backends" steps around this (and see `STD-4`).
- **Acceptance:** a fresh clone + `supabase start` + `npm run dev` connects to **local** with no
  file editing; pointing at prod is a deliberate, separate step.

### DP-2 — Add a visible non-production environment indicator in the UI — **High / S**

- **Why:** Nothing tells you which backend you're on. A banner when **not** on production
  prevents "I thought this was local" mistakes (the exact class of the prior incident) and helps
  QA.
- **Where:** new `src/app/EnvBanner.tsx`; mount in `src/app/AppLayout.tsx` (and optionally
  `AuthShell`); read `import.meta.env.VITE_SUPABASE_URL` + a new `VITE_ENV_LABEL` (`local` /
  `staging` / `production`).
- **What to do:** Render a small fixed ribbon (e.g. top strip) showing the env label and the
  Supabase host when the label is not `production` (hide entirely in prod). Use the existing
  `--warning` token. Add `VITE_ENV_LABEL` to `.env.example` and the env files from `DP-1`.

### DP-3 — Add a hard runtime guard to the destructive SQL scripts — **High / S**

- **Why:** `schema-full.sql` (`drop table … cascade` on every table) and the seeds
  (`admin.sql`, `test-data.sql`) are documented as local-only but have **no runtime guard** — a
  paste into the wrong SQL editor wipes/recreates data. Documentation already failed once.
- **Where:** `supabase/schema-full.sql`, `supabase/seed/admin.sql`, `supabase/seed/test-data.sql`.
- **What to do:** Prepend a guard that aborts unless the operator explicitly opts in, e.g. a psql
  variable check:
  `\if :{?percorso_allow_destructive} … \else \echo 'Refusing: set -v percorso_allow_destructive=1' \q \endif`
  (or a `do $$ begin if current_setting('percorso.allow_destructive', true) is distinct from 'yes'
then raise exception '…' end if; end $$;` block runnable in the Dashboard editor). Keep it copy-
  pasteable. Document the opt-in flag in the file header and RUNBOOK. This does not replace `DP-4`
  — it's the cheap belt-and-braces.

### DP-4 — Stand up a disposable staging Supabase project — **Medium / M**

- **Why:** Today there are two states: local Docker and production. There is nowhere to rehearse
  a migration/seed against realistic hosted infra before it touches real users. A second free
  Supabase project as staging is the highest-leverage risk reducer before launch.
- **Where:** ops/docs (`README.md`, `docs/RUNBOOK.md`), env files (`DP-1`), CI (`TOOL-2`).
- **What to do:** Create a free "percorso-staging" Supabase project; add `.env.staging`
  (uncommitted) + `VITE_ENV_LABEL=staging`; document a "push migrations to staging, smoke-test,
  then production" flow (`supabase link` per project). Optionally have CI deploy the built app to
  a staging static host. No app code change beyond env plumbing.

### DP-5 — Add a build/deploy story that distinguishes environments — **Medium / M**

- **Why:** Deployment is "drop `dist/` on a static host" with no documented per-environment build,
  SPA-fallback config, or which env file feeds which deploy. Fine for a hobby app, thin for a
  product.
- **Where:** `README.md` "Run"/deploy section; `TOOL-2` (CI); host config (Vercel/Netlify/CF Pages).
- **What to do:** Document (and, in CI, encode) `build` → production env, a staging deploy from
  `DP-4`, the SPA fallback (all routes → `index.html`), and the required Supabase Redirect URLs per
  environment. Keep it one short, accurate section.

---

## 6. What's missing / data-model completeness

### GAP-1 — Add a PWA manifest + icons (README claims installability) — **Medium / S**

- **Why:** README says Percorso is "installable on a phone's home screen," but there is no
  `manifest.webmanifest`, no `public/` dir, and no icons — so "Add to Home Screen" produces a
  nameless, icon-less bookmark, not an installed app.
- **Where:** new `public/manifest.webmanifest` + icons; `index.html` `<link rel="manifest">`.
- **What to do:** Add a minimal manifest (`name`, `short_name`, `start_url: "/"`,
  `display: "standalone"`, `theme_color`/`background_color` matching the tokens, 192/512 icons +
  maskable). Link it in `index.html`. Optionally add `vite-plugin-pwa` later for offline; not
  required for install.

### GAP-2 — Fix `index.html` static `theme-color` and `lang` — **Low / S**

- **Why:** `<meta name="theme-color" content="#0b0d10">` matches neither the runtime dark
  (`#16181d`) nor light (`#fbfbf9`) value in `prefs.ts` `THEME_COLORS` — so the very first paint
  (before JS runs `applyTheme`) flashes a wrong browser-chrome color. `<html lang="en">` is
  static though the app ships pt-BR/it.
- **Where:** `index.html` (lines 2, 6); `src/state/prefs.ts` (`applyTheme`).
- **What to do:** Set the static `theme-color` to the dark value `#16181d` (the default theme) so
  first paint matches; keep `applyTheme` updating it. Have language changes also set
  `document.documentElement.lang` (in `prefs.ts` `setLanguage` / a small effect) for a11y/SEO.

### GAP-3 — Complete form-validation edge cases (amount bounds, day/date sanity) — **Medium / M**

- **Why:** Validation exists but is uneven: amounts are checked `> 0` yet not bounded to the DB's
  `numeric(14,2)` range; transfers block same-account but the UI can still submit a transfer with
  an empty `toAccountId` in some states; bill/goal dates aren't sanity-checked (e.g. past due
  dates are allowed by design, but there's no max). Server constraints will reject bad values, but
  the user just sees a generic "save error" toast.
- **Where:** the `*Form` components: `sections/Transactions.tsx`, `Bills.tsx`, `Goals.tsx`,
  `Cards.tsx`, `Accounts.tsx`, `accounts/PlanForm.tsx`.
- **What to do:** Add explicit client checks with specific messages: reject amounts above a sane
  cap and with >2 decimals; ensure transfer requires a distinct destination before enabling save;
  keep messages as translation keys. Prefer surfacing the specific field error (via `Field`'s
  `error` prop) over the bottom-of-form string so the pattern is uniform (currently mixed between
  `Field error=` and a trailing `<p>`). Standardize on one.

### GAP-4 — Add the missing index on `credit_cards.issuing_account_id` — **Low / S**

- **Why:** `loans.account_id` and `consortiums.account_id` are indexed, but
  `credit_cards.issuing_account_id` is not, though it's the same display-grouping FK and is
  filtered by account in the drill-down. Postgres does not auto-index FK columns. Tiny, but it's
  an inconsistency in an otherwise carefully-indexed schema.
- **Where:** new migration under `supabase/migrations/`; mirror in `supabase/schema-full.sql`;
  no seed change needed.
- **What to do:** `create index credit_cards_account_idx on public.credit_cards (issuing_account_id);`
  Ship it as the standard three-part change (migration + schema-full snapshot; seeds already
  satisfy it). Follow CLAUDE.md "Schema changes."

### GAP-5 — Verify/align password policy across client and Supabase — **Low / S**

- **Why:** `SignupPage` enforces `password.length < 8`, but `config.toml` sets
  `minimum_password_length = 6` and no complexity requirement; the hosted project's setting is
  unknown. Client-stricter is harmless, but the policy should be intentional and consistent.
- **Where:** `src/auth/SignupPage.tsx`, `supabase/config.toml` `[auth] minimum_password_length`,
  hosted dashboard Auth settings.
- **What to do:** Pick one policy (recommend ≥8) and set it in `config.toml` and the hosted
  project so server and client agree; keep the friendly client message.

### GAP-6 — Loading/empty/error states are good; document the one intentional gap — **Low / — (verified)**

- **Why:** Skeleton on load, retry panel on load-error, `EmptyState` on every list, per-mutation
  toasts — all present and consistent. The only absence is offline/connection-loss UX (mutations
  just toast an error), which is acceptable for v1. No action; recorded so it isn't re-audited.

---

## 7. Free tooling recommendations

_Each includes the install command and the minimal config to get signal. Verify current major
versions at install time — pin what `npm i -D` resolves. Land `TOOL-1`/`TOOL-3` before the
cleanup tasks so results are reproducible, and wire everything into CI (`TOOL-2`)._

### TOOL-1 — knip + ts-prune (dead code / unused deps) — **Medium / S**

- **Why:** Catches unused files, exports, and dependencies continuously (found `textarea.tsx`,
  `stat-card.tsx` by hand — automate the rest).
- **Install/run:** `npm i -D knip` then `npx knip`; `npx ts-prune` (no install needed) or
  `npm i -D ts-prune`.
- **Minimal config** (`knip.json`):
  ```json
  { "entry": ["src/main.tsx", "index.html"], "project": ["src/**/*.{ts,tsx}"] }
  ```
  Add scripts: `"knip": "knip"`, `"deadcode": "ts-prune"`. Feeds `DEAD-2`.

### TOOL-2 — GitHub Actions CI (typecheck + lint + build) — **High / S**

- **Why:** Nothing currently enforces that `main` typechecks/builds. i18n correctness is literally
  the typecheck, so CI is also the translation gate.
- **Install/run:** none — add `.github/workflows/ci.yml`.
- **Minimal config:**
  ```yaml
  name: CI
  on: [push, pull_request]
  jobs:
    build:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: 20, cache: npm }
        - run: npm ci
        - run: npm run typecheck
        - run: npm run lint # after STD-1
        - run: npm run build
  ```
  Extend with `npm test` once `TOOL-6` lands.

### TOOL-3 — madge (circular-dependency detection) — **Low / S**

- **Why:** `Dashboard`↔`Bills` cross-imports (`ARCH-3`) and a future `store/` split (`MOD-1`)
  make cycles plausible; madge catches them cheaply.
- **Install/run:** `npx madge --circular --extensions ts,tsx src` (optionally `npm i -D madge`,
  script `"madge": "madge --circular --extensions ts,tsx src"`). Add to CI as non-blocking first.

### TOOL-4 — vite-bundle-visualizer (bundle size) — **Low / S**

- **Why:** No visibility into bundle composition (Supabase JS + Radix + lucide can add up);
  useful before launch to catch accidental bloat.
- **Install/run:** `npx vite-bundle-visualizer` (analyzes the production build), or add
  `rollup-plugin-visualizer` to `vite.config.ts` behind an `ANALYZE` env flag.

### TOOL-5 — Accessibility: @axe-core/react (dev) + Lighthouse CI — **Medium / M**

- **Why:** a11y is decent (Radix dialogs, native selects, SVG `<title>`s, `aria-label`ed icon
  buttons) but unverified. Automated checks catch contrast, label, and landmark regressions.
- **Install/run:** `npm i -D @axe-core/react`; in `src/main.tsx`, dev-only:
  ```ts
  if (import.meta.env.DEV) {
    const [{ default: React }, axe] = await Promise.all([import('react'), import('@axe-core/react')])
    axe.default(React, (await import('react-dom')).default, 1000)
  }
  ```
  Add `@lhci/cli` (`npx lhci autorun`) against a preview build in CI later. Fix the low-hanging
  items it surfaces (tie `Field` errors via `aria-describedby`; `GAP-2` `lang`).

### TOOL-6 — Vitest unit tests, money logic first — **High / M**

- **Why:** The correctness-critical code is pure and trivially testable, and has zero coverage.
  This is the highest-ROI testing investment for a money app.
- **Install/run:** `npm i -D vitest @vitest/coverage-v8`; `vitest.config.ts` reusing the `@`
  alias; script `"test": "vitest run"`, `"test:watch": "vitest"`.
- **What to cover first (all in `store.ts`, pure, no Supabase):** `accountBalance`,
  `cardOpenInvoice` + `syncCardBills` cycle math, `installmentsPaidNow` / `planRemaining` /
  `planNextDue`, `monthTotals` (bank-only) vs `spendingByCategory` (bank+card, no double-count),
  `netWorthAsOf`, `pctChange`, `computeHealthScore`, `detectRecurring`, `billAlerts`. Also add the
  pagination test from `ARCH-1`. Then date helpers in `lib/dates.ts` (month rollover, clamping).

### TOOL-7 — Playwright e2e for the critical flows — **Medium / L**

- **Why:** Signup → login → add-transaction is the money path; regressions there are launch-
  blocking. Run against local Supabase (`DP-1`) so it's deterministic.
- **Install/run:** `npm i -D @playwright/test` + `npx playwright install`; `playwright.config.ts`
  with `webServer` running `npm run dev` and `baseURL` local; script `"e2e": "playwright test"`.
- **First specs:** login as the seeded `test@percorso.local`; add an expense and assert net worth
  changes; create an account; pay a card bill. Wire into CI after it's stable.

### TOOL-8 — Dependabot — **Low / S**

- **Why:** No automated dependency/security update flow; several deps are on fast-moving majors
  (Vite 8, React 19, Supabase JS 2, lucide 1).
- **Install/run:** add `.github/dependabot.yml`:
  ```yaml
  version: 2
  updates:
    - package-ecosystem: npm
      directory: '/'
      schedule: { interval: weekly }
      open-pull-requests-limit: 5
  ```

### TOOL-9 — Sentry (free tier) error tracking — **Medium / S**

- **Why:** Post-launch you'll be blind to client errors without it; pairs with `ARCH-2`.
- **Install/run:** `npm i @sentry/react`; init in `src/main.tsx` guarded by env so it's a no-op
  when the DSN is absent:
  ```ts
  if (import.meta.env.VITE_SENTRY_DSN)
    Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN, environment: import.meta.env.VITE_ENV_LABEL })
  ```
  Add `VITE_SENTRY_DSN` to the env files (`DP-1`); report from the `ARCH-2` boundary.

---

## 8. Standardization

### STD-1 — Add ESLint + Prettier and actually enforce them (Husky + lint-staged) — **High / M**

- **Why:** There is **no** ESLint or Prettier config, yet `store.ts` carries
  `/* eslint-disable @typescript-eslint/no-explicit-any */` — lint was intended but never set up.
  Formatting consistency currently rides on discipline alone. This is the backbone of the
  "standardization" ask.
- **Where:** repo root (new `eslint.config.js`, `.prettierrc`, `.husky/`), `package.json`.
- **What to do:**
  1. `npm i -D eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh globals` +
     a flat `eslint.config.js` (js + typescript-eslint recommended, react-hooks, react-refresh).
     Script `"lint": "eslint ."`.
  2. `npm i -D prettier` + `.prettierrc` **matching the existing style** so it doesn't churn the
     diff: `{ "semi": false, "singleQuote": true, "printWidth": 120, "trailingComma": "none", "arrowParens": "always" }`.
     Script `"format": "prettier --write ."`. Run once to normalize.
  3. `npm i -D husky lint-staged` + `npx husky init`; pre-commit runs `lint-staged`
     (`{ "*.{ts,tsx}": ["eslint --fix", "prettier --write"] }`) and `npm run typecheck` (the i18n
     gate). Add `lint` to CI (`TOOL-2`).
  4. Review the `no-explicit-any` disables in `store.ts` — the `rowTo*` mappers take DB rows;
     consider a typed row interface later, but keeping the scoped disable is acceptable.

### STD-2 — Naming/pattern consistency pass — **Low / S**

- **Why:** Conventions are largely consistent (PascalCase components, camelCase app / snake_case
  DB with mapping isolated to `rowTo*`, kebab-case UI primitive files). Two small drifts: the
  in-form error UX is mixed (`Field error=` prop vs a trailing `<p className="text-destructive">`),
  and `DeleteResult` `'in-use'` is only meaningful for some entities.
- **Where:** all `*Form` components (error display); `store.ts` (`DeleteResult` usage in
  `deleteLoan`/`deleteConsortium`, which can't actually be in-use today).
- **What to do:** Pick one in-form error convention (recommend `Field error=` for field-specific,
  a single trailing line only for form-level) and apply it everywhere (folds into `GAP-3`).
  Optionally document why loans/consórcios return `DeleteResult` (future-proofing) or narrow them
  to `SaveResult`.

### STD-3 — Fix stale in-code/doc comments — **Low / S**

- **Why:** Small drifts erode trust in the (otherwise excellent) docs: `schema-full.sql` references
  `store.ensureCardBills` (actual name is `syncCardBills`); `Dashboard.tsx` line 53 says "Amber has
  no token, so it is inlined" but the code uses `var(--warning)`.
- **Where:** `supabase/schema-full.sql` (~line 366), `src/features/finance/sections/Dashboard.tsx`
  (~line 53).
- **What to do:** Correct both comments. Trivial.

### STD-4 — Reconcile CLAUDE.md / README / RUNBOOK with the actual app — **Medium / S**

- **Why:** Three doc↔code drifts, one of them actively misleading:
  - **RUNBOOK §5** still says the current `.env` is misconfigured with an `sb_secret_` key and an
    invalid URL. The real `.env` now has a valid `sb_publishable_` anon key and a valid hosted URL.
    Following the RUNBOOK's "treat as compromised / fix first" steps is now wrong.
  - **CLAUDE.md and README both describe a `md:+` sidebar** ("bottom tab bar `<md:`, sidebar
    `md:+`"). `AppLayout` renders **only** a fixed bottom nav at every breakpoint — no sidebar.
  - CLAUDE.md/README reference a single `features/finance/store.ts` (fine now; revisit if `MOD-1`
    lands).
- **Where:** `docs/RUNBOOK.md` §5; `CLAUDE.md` (Architecture, CSS/UI conventions); `README.md`
  (Project layout / features).
- **What to do:** Update the RUNBOOK §5 to reflect the corrected `.env` and the `DP-1` env
  convention. Then **decide the sidebar question** and make code and docs agree — either
  implement the `md:+` sidebar (better desktop UX; see `STD-5`) or change both docs to say
  "bottom nav at all breakpoints."

### STD-5 — (Depends on STD-4 decision) Implement the documented `md:+` sidebar — **Low / M**

- **Why:** Only if the team wants the desktop UX the docs already promise. On wide screens the
  two-item bottom bar wastes the layout.
- **Where:** `src/app/AppLayout.tsx` (nav markup), `src/index.css` (layout).
- **What to do:** Render the nav as a fixed bottom bar below `md:` and a left sidebar from `md:`
  up (hide/show with `md:` variants), keeping `NAV` as the single source. Skip if `STD-4` chooses
  "document the bottom bar" instead.

### STD-6 — i18n is structurally in sync; add a translation-completeness check — **Low / S**

- **Why:** The typed engine guarantees the same **keys** across locales (verified: 270 each), but
  not that pt-BR/it strings were actually translated (a copy of an English value still compiles).
- **Where:** `src/i18n/locales/*`; a small script or test.
- **What to do:** Add a lightweight check (a Vitest test once `TOOL-6` exists, or a node script) that
  flags locale values identical to `en` beyond an allowlist (proper nouns, symbols). Low priority —
  the structural guarantee already prevents the common failure.

---

## 9. Security review

**Verdict: the security posture is strong and internally consistent.** Table-by-table RLS,
composite-FK integrity, the admin model, and the privilege-escalation guard all check out. The
items below are hardening and hygiene, not holes.

### SEC-1 — Rotate/verify the anon key committed history & confirm no secret ever landed — **High / S**

- **Why:** The current `.env` correctly uses a **publishable** key (`sb_publishable_…`), but the
  RUNBOOK documents that an `sb_secret_` key was previously present in `.env`. `.env` is
  gitignored (good), but a secret that ever existed on a machine/history should be treated as
  compromised.
- **Where:** hosted Supabase dashboard (API keys); `git log`/history sanity check; `.env`.
- **What to do:** Confirm (via `git log -p` / secret scanning) no `service_role`/`sb_secret_` key
  was ever committed anywhere in history; if it was, rotate it in the dashboard and consider a
  history purge. Confirm the anon/publishable key in use is current. Enable GitHub secret scanning
  / push protection on the repo. (No `service_role` usage exists in `src` — verified.)

### SEC-2 — Add automated RLS tests (prove isolation, don't assume it) — **Medium / M**

- **Why:** The policies are correct by reading, but there's no test that user A cannot read/write
  user B's rows, that `is_admin` can't be self-set via the API, or that composite FKs block
  cross-user references. For a product holding financial data, this deserves a regression harness.
- **Where:** new `supabase/tests/` (pgTAP) or a Vitest suite hitting local Supabase with two
  seeded users and the anon key.
- **What to do:** With the two seeded local users, assert: A's `select`/`update`/`delete` on B's
  `accounts`/`transactions`/`bills`/`goals`/`credit_cards`/`loans`/`consortiums` return nothing/
  fail; `update profiles set is_admin=true` as a normal user is rejected (column grant); admin
  can read but not write B's rows; inserting a transaction referencing B's `account_id` fails.
  Run in CI against a throwaway local stack.

### SEC-3 — Set explicit session/security limits in the hosted project — **Low / S**

- **Why:** Session lifetime, leaked-password protection, and rate limits are dashboard settings
  the repo can't fully assert. Defaults are reasonable but should be deliberate before launch.
- **Where:** hosted Supabase dashboard (Auth → Sessions/Protection/Rate limits); note in README.
- **What to do:** Decide and record: session time-box / inactivity timeout, enable
  leaked-password protection, confirm email-confirmation is **on** in production (it's off locally
  by design), review the redirect-URL allowlist to exactly the prod + staging origins. Document
  the chosen values.

### SEC-4 — Confirm `max_rows` interaction is a correctness issue, not a security one — **Low / — (cross-ref)**

- **Why/Note:** The 1000-row cap (`ARCH-1`) is about correctness, not authorization — it never
  exposes another user's data (RLS still applies). Recorded here only so the security reviewer
  doesn't double-count it; the fix lives in `ARCH-1`.

---

## 10. Suggested implementation order

Foundational safety and dev/prod separation first, then correctness, then the safety net, then
polish. Roughly sequential; items on the same line are independent.

**Phase 0 — Stop-the-bleeding / foundations (do first)**

1. `SEC-1` — verify/rotate keys, enable secret scanning.
2. `DP-1` — env convention (dev defaults to local, prod is deliberate).
3. `DP-2` — non-prod environment banner.
4. `DP-3` — runtime guards on destructive SQL scripts.
5. `STD-4` — fix the misleading RUNBOOK/CLAUDE/README drifts (esp. the `.env` section + sidebar).

**Phase 1 — Correctness (money must be right)** 6. `ARCH-1` — paginate transactions (with a test). 7. `ARCH-2` — top-level error boundary. 8. `DEAD-3` — fix `demo-data.sql` header/uid mismatch.

**Phase 2 — Enforce quality (make regressions hard)** 9. `STD-1` — ESLint + Prettier + Husky/lint-staged. 10. `TOOL-2` — CI (typecheck + lint + build). 11. `TOOL-6` — Vitest, money logic first (absorbs the `ARCH-1` test). 12. `TOOL-1` + `DEAD-1` + `DEAD-2` — dead-code tools, then delete what they + the manual scan found. 13. `SEC-2` — RLS isolation tests in CI.

**Phase 3 — Product-ready polish** 14. `DP-4` / `DP-5` — staging project + deploy story. 15. `GAP-1` / `GAP-2` — PWA manifest + first-paint theme/lang fixes. 16. `GAP-3` / `STD-2` — finish + standardize form validation and error display. 17. `TOOL-9` / `TOOL-5` — Sentry + a11y checks (axe/Lighthouse). 18. `TOOL-7` — Playwright e2e for signup/login/add-transaction.

**Phase 4 — Nice-to-have / opportunistic** 19. `MOD-1` / `MOD-2` / `ARCH-3` — modularize `store.ts`, extract shared list/bill UI. 20. `GAP-4` / `GAP-5` / `SEC-3` — index + password-policy + hosted session settings. 21. `TOOL-3` / `TOOL-4` / `TOOL-8` — madge, bundle visualizer, Dependabot. 22. `STD-3` / `STD-5` / `STD-6` — stale comments, optional sidebar, translation-completeness check.

```

```

_End of audit. Nothing in this pass modified application code; the only new file is this document._
