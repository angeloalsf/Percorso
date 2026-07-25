import { defineConfig, devices } from '@playwright/test'

/**
 * Runs against local Supabase (DP-1: `.env.development`) with the seeded
 * `test@percorso.local` user (`supabase/seed/test-data.sql`). Prerequisite:
 * `supabase start` + `supabase db reset`.
 *
 * Single worker on purpose: every spec logs in as the same seeded user and
 * mutates its data (adds a transaction, pays a bill, …) — running them in
 * parallel would race on shared state. See TOOL-7 in docs/AUDIT-TASKS.md.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
})
