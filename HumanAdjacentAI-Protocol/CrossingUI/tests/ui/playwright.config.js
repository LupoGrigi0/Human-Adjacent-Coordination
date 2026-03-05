// @ts-check
const { defineConfig } = require('@playwright/test');

/**
 * Playwright configuration for HACS Dashboard UI regression tests.
 *
 * Base URL: https://smoothcurves.nexus:8443 (HACS Dashboard)
 * API Endpoint: https://smoothcurves.nexus/mcp (JSON-RPC 2.0)
 *
 * Run from: HumanAdjacentAI-Protocol/CrossingUI/tests/ui/
 *   npx playwright test
 *   npx playwright test --project=chromium
 *   npx playwright test tests/01-navigation.spec.js
 */
module.exports = defineConfig({
  testDir: './tests',

  /* Maximum time one test can run */
  timeout: 30_000,

  /* Expect assertions timeout */
  expect: {
    timeout: 10_000,
  },

  /* Retry failed tests once to handle transient network issues */
  retries: 1,

  /* Run tests sequentially — many tests depend on live API state */
  fullyParallel: false,
  workers: 1,

  /* Reporter configuration */
  reporter: [
    ['list'],
    ['json', { outputFile: 'results.json' }],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],

  /* Shared settings for all projects */
  use: {
    baseURL: 'https://smoothcurves.nexus:8443',
    ignoreHTTPSErrors: true,
    headless: true,

    /* Capture evidence on failure */
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',

    /* Viewport — desktop-first, the primary target */
    viewport: { width: 1440, height: 900 },

    /* Navigation timeout */
    navigationTimeout: 15_000,
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
    {
      name: 'mobile-chrome',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
      },
    },
  ],

  /* Output directory for test artifacts */
  outputDir: './test-results',
});
