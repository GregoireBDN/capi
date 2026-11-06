import { defineConfig, devices } from '@playwright/test'

/**
 * Mobile layout audit (e2e/mobile-layout.spec.ts), kept out of the default
 * e2e run. Starts no server: point WEB_URL at a running web app backed by a
 * throwaway database with data, and set MOBILE_AUDIT_EMAIL /
 * MOBILE_AUDIT_PASSWORD (the spec skips itself otherwise).
 *
 *   pnpm exec playwright test -c playwright.mobile.config.ts
 *
 * Chromium only (mobile emulation of the WebKit devices too), so it says
 * nothing about real iOS Safari quirks. The API's global rate limit (60
 * requests/min per IP) throttles a full run: run a page or a project at a time
 * (`-g dashboard`, `--project=w320`) or use a throwaway API instance whose
 * limit is raised. See "Mobile layout conventions" in CLAUDE.md.
 */
const WEB_URL = process.env['WEB_URL'] ?? 'http://localhost:3000'

const chromium = <T extends object>(d: T) => ({
  ...d,
  browserName: 'chromium' as const,
})

export default defineConfig({
  testDir: './e2e',
  testMatch: 'mobile-layout.spec.ts',
  globalSetup: './e2e/mobile-layout.setup.ts',
  fullyParallel: true,
  workers: 6,
  reporter: 'list',
  use: { baseURL: WEB_URL },
  projects: [
    {
      name: 'w320',
      use: chromium({
        ...devices['iPhone SE'],
        viewport: { width: 320, height: 568 },
      }),
    },
    {
      // iPhone SE 2nd/3rd gen (the descriptor is the 320px 1st gen).
      name: 'iphone-se',
      use: chromium({
        ...devices['iPhone SE'],
        viewport: { width: 375, height: 667 },
      }),
    },
    { name: 'iphone-13', use: chromium(devices['iPhone 13']) },
    {
      name: 'w414',
      use: chromium({
        ...devices['iPhone 13'],
        viewport: { width: 414, height: 896 },
      }),
    },
    { name: 'pixel-7', use: chromium(devices['Pixel 7']) },
    {
      // Real iPhone 13 landscape viewport (≥ md: fixed sidebar), not the
      // descriptor's 750×342.
      name: 'landscape-844',
      use: chromium({
        ...devices['iPhone 13 landscape'],
        viewport: { width: 844, height: 390 },
      }),
    },
  ],
})
