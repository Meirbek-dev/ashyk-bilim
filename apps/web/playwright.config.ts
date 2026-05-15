import { defineConfig, devices } from '@playwright/test';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Minimal env loader — no external deps required in the config file
function loadEnv(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (k && !(k in process.env)) process.env[k] = v;
  }
}
loadEnv(path.join(__dirname, 'e2e/.env.test'));
loadEnv(path.join(__dirname, 'e2e/.env.test.local'));

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e/specs',
  // Serial specs (course creation → student journey → grading) must not run
  // fully parallel — they share state via process.env. Within a single spec
  // file, test.describe.serial handles ordering.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // On CI, retry once to surface flakiness without masking genuine bugs.
  retries: process.env.CI ? 1 : 0,
  workers: 1, // serial workflows require a single worker
  reporter: [
    // HTML report with screenshots + traces — open with: npx playwright show-report
    ['html', { outputFolder: 'reports/e2e-html', open: 'never' }],
    // Human-readable output in the terminal
    ['list'],
    // Machine-readable JSON for CI dashboards
    ['json', { outputFile: 'reports/e2e-results.json' }],
  ],

  use: {
    baseURL: BASE_URL,
    // Generous action timeout — avoids false positives on slower CI machines
    actionTimeout: 15 * 1000,
    // Capture trace on the FIRST retry (not on the initial run) so CI doesn't
    // explode with huge trace files when everything is green.
    trace: 'on-first-retry',
    // Screenshot on failure for quick visual triage
    screenshot: 'only-on-failure',
    // Video retained only on failure to keep storage usage reasonable
    video: 'retain-on-failure',
    // Always use the English locale for tests — stable text selectors
    locale: 'en-US',
  },

  projects: [
    // ── Setup project: runs global-setup only ────────────────────────────
    // (global-setup is registered below; this project is a placeholder that
    //  Playwright uses to distinguish "setup" from "test" workers.)

    // ── Primary test browser ─────────────────────────────────────────────
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Firefox and WebKit run only the smoke tests to avoid serial state issues
    {
      name: 'firefox-smoke',
      testMatch: /00-smoke\.spec\.ts/,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit-smoke',
      testMatch: /00-smoke\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },
    // Mobile smoke tests
    {
      name: 'mobile-chrome-smoke',
      testMatch: /00-smoke\.spec\.ts/,
      use: { ...devices['Pixel 5'] },
    },
  ],

  // ── Global setup & teardown ───────────────────────────────────────────────
  // Playwright resolves these relative to the config file.
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  // ── Dev server ────────────────────────────────────────────────────────────
  webServer: {
    command: 'bun run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 120 * 1000,
  },
});
