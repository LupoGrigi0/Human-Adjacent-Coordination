/**
 * 00-setup.spec.js — Smoke tests
 *
 * Verifies that the dashboard loads without JS errors, the API is reachable,
 * and the identity/bootstrap area is functional.
 *
 * This is the first spec in the suite — if these fail, nothing else will work.
 */

const { test, expect } = require('@playwright/test');
const { DashboardPage } = require('../page-objects/DashboardPage');
const { CommonComponents } = require('../page-objects/CommonComponents');
const { HacsApiClient } = require('../helpers/api-client');
const { LUPO_NAME, LUPO_ROLE, LUPO_INSTANCE_ID, TIMEOUTS } = require('../helpers/test-data');
const { HEADER, TABS, DASHBOARD, SETTINGS } = require('../helpers/selectors');

test.describe('00 — Setup & Smoke Tests', () => {
  let dashboard;
  let consoleErrors;

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page);
    consoleErrors = [];

    // Collect console errors during page load
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
  });

  // --------------------------------------------------------------------------
  // Page Load
  // --------------------------------------------------------------------------

  test('page loads without fatal JS errors', async ({ page }) => {
    // Navigate to the root — dashboard is the default active tab
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for app initialization (bootstrap call completes)
    await page.waitForFunction(
      () => {
        const el = document.querySelector('#user-instance-id');
        return el && el.textContent && el.textContent !== 'Not Connected';
      },
      { timeout: TIMEOUTS.PAGE_LOAD }
    );

    // Filter out non-fatal noise (e.g. favicon 404, OpenRouter key missing)
    const fatalErrors = consoleErrors.filter((msg) => {
      // Ignore known benign messages
      if (msg.includes('favicon')) return false;
      if (msg.includes('OpenRouter')) return false;
      if (msg.includes('net::ERR_')) return false;
      return true;
    });

    expect(fatalErrors).toEqual([]);
  });

  test('HTML document has correct title', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const title = await page.title();
    expect(title).toContain('Coordination Dashboard');
  });

  test('dashboard tab is active by default', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for bootstrap
    await page.waitForFunction(
      () => document.querySelector('#user-instance-id')?.textContent !== 'Not Connected',
      { timeout: TIMEOUTS.PAGE_LOAD }
    );

    const dashTab = page.locator(TABS.DASHBOARD);
    await expect(dashTab).toHaveClass(/active/);

    // Other tabs should not be active
    const messagesTab = page.locator(TABS.MESSAGES);
    await expect(messagesTab).not.toHaveClass(/active/);
  });

  // --------------------------------------------------------------------------
  // API Health Check
  // --------------------------------------------------------------------------

  test('HACS API responds to introspect call', async () => {
    const api = new HacsApiClient();
    const result = await api.introspect();

    // introspect should return instance context data
    expect(result).toBeDefined();
    expect(result).not.toBeNull();
  });

  test('HACS API can list instances', async () => {
    const api = new HacsApiClient();
    const instances = await api.getInstances();

    expect(Array.isArray(instances)).toBe(true);
    expect(instances.length).toBeGreaterThan(0);
  });

  test('HACS API can list projects', async () => {
    const api = new HacsApiClient();
    const projects = await api.getProjects();

    expect(Array.isArray(projects)).toBe(true);
    // There should be at least one project in the system
    expect(projects.length).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // Identity / Bootstrap Display
  // --------------------------------------------------------------------------

  test('header shows connected user name after bootstrap', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.querySelector('#user-instance-id')?.textContent !== 'Not Connected',
      { timeout: TIMEOUTS.PAGE_LOAD }
    );

    const userName = await page.textContent(HEADER.USER_INSTANCE_ID);
    expect(userName).toBe(LUPO_NAME);
  });

  test('header shows user role after bootstrap', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.querySelector('#user-instance-id')?.textContent !== 'Not Connected',
      { timeout: TIMEOUTS.PAGE_LOAD }
    );

    const role = await page.textContent(HEADER.USER_ROLE);
    expect(role).toBe(LUPO_ROLE);
  });

  test('connection status dot shows connected (green)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.querySelector('#user-instance-id')?.textContent !== 'Not Connected',
      { timeout: TIMEOUTS.PAGE_LOAD }
    );

    const dot = page.locator(HEADER.STATUS_DOT);
    await expect(dot).toHaveClass(/connected/);
  });

  test('settings tab shows identity fields populated', async ({ page }) => {
    dashboard = new DashboardPage(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.querySelector('#user-instance-id')?.textContent !== 'Not Connected',
      { timeout: TIMEOUTS.PAGE_LOAD }
    );

    // Navigate to Settings tab (viewport-aware: dropdown on desktop, bottom nav on mobile)
    const common = new CommonComponents(page);
    await common.navigateTo('settings');
    await page.waitForSelector(`${TABS.SETTINGS}.active`, { timeout: 5000 });

    // Verify identity fields
    const instanceId = await page.inputValue(SETTINGS.INSTANCE_ID);
    expect(instanceId).toContain(LUPO_INSTANCE_ID);

    const name = await page.inputValue(SETTINGS.NAME);
    expect(name).toBe(LUPO_NAME);

    const role = await page.inputValue(SETTINGS.ROLE);
    expect(role).toBe(LUPO_ROLE);
  });

  // --------------------------------------------------------------------------
  // Theme Toggle
  // --------------------------------------------------------------------------

  test('theme toggle button exists and is clickable', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.querySelector('#user-instance-id')?.textContent !== 'Not Connected',
      { timeout: TIMEOUTS.PAGE_LOAD }
    );

    const toggle = page.locator(HEADER.THEME_TOGGLE);
    await expect(toggle).toBeVisible();
    await toggle.click();
    // Should not throw
  });
});
