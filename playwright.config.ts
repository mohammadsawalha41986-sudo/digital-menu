import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * E2E foundation. Runs against a production build so the smoke journey
 * exercises the same rendering path a visitor gets, and on a mobile viewport
 * because that is the primary design target (master spec §29, §139).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    launchOptions: {
      // Escape hatch for environments that ship a preinstalled Chromium whose
      // build number differs from this Playwright release (CI images, sandboxes).
      // Unset locally, Playwright uses its own managed browser.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    },
  },
  projects: [
    {
      name: 'mobile-chromium',
      testIgnore: /menu-manage\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
    {
      // The menu and dishes manager runs on both sizes. Both projects use the
      // same demo dish, so the desktop run waits for the phone run to finish.
      name: 'manage-mobile',
      testMatch: /menu-manage\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'manage-desktop',
      testMatch: /menu-manage\.spec\.ts/,
      dependencies: ['manage-mobile'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `npx next start --port ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // `next start` runs as NODE_ENV=production, where the environment layer
      // rightly refuses the development placeholder secret. Supply a real
      // ephemeral one rather than weakening that check.
      AUTH_SECRET: process.env.E2E_AUTH_SECRET ?? randomBytes(32).toString('base64'),
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      APP_URL: baseURL,
      PUBLIC_URL: baseURL,
      // The admin journey signs in as the seeded staff account.
      SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD ?? 'devpassword12345',
    },
  },
});
