/**
 * 01-navigation.spec.js — Menu navigation between all tabs/pages
 *
 * Verifies the desktop nav dropdown exposes all tabs, clicking each tab
 * shows the correct page content, the active tab is visually indicated,
 * and that the nav dropdown opens/closes properly.
 */

const { test, expect } = require('@playwright/test');
const { DashboardPage } = require('../page-objects/DashboardPage');
const { HEADER, TABS, DASHBOARD, INSTANCES, PROJECTS, MESSAGES, SETTINGS } = require('../helpers/selectors');
const { LUPO_NAME, TIMEOUTS, NAV_MENU_ITEMS } = require('../helpers/test-data');

test.describe('01 — Navigation', () => {
  let dashboard;

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page);

    // Load the page and wait for bootstrap
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.querySelector('#user-instance-id')?.textContent !== 'Not Connected',
      { timeout: TIMEOUTS.PAGE_LOAD }
    );
    // Allow dashboard widgets to settle
    await page.waitForTimeout(1500);
  });

  // --------------------------------------------------------------------------
  // Nav Dropdown Behavior
  // --------------------------------------------------------------------------

  test('nav dropdown toggle is visible', async ({ page }) => {
    const toggle = page.locator(HEADER.NAV_DROPDOWN_TOGGLE);
    await expect(toggle).toBeVisible();
  });

  test('nav dropdown opens on click', async ({ page }) => {
    const dropdown = page.locator(HEADER.NAV_DROPDOWN);
    await expect(dropdown).not.toHaveClass(/open/);

    await page.click(HEADER.NAV_DROPDOWN_TOGGLE);
    await expect(dropdown).toHaveClass(/open/);
  });

  test('nav dropdown closes when clicking outside', async ({ page }) => {
    // Open the dropdown
    await page.click(HEADER.NAV_DROPDOWN_TOGGLE);
    const dropdown = page.locator(HEADER.NAV_DROPDOWN);
    await expect(dropdown).toHaveClass(/open/);

    // Click outside (on the main content area)
    await page.click('main.main-content', { position: { x: 10, y: 10 }, force: true });
    await expect(dropdown).not.toHaveClass(/open/);
  });

  test('nav dropdown shows all expected menu items', async ({ page }) => {
    await page.click(HEADER.NAV_DROPDOWN_TOGGLE);
    await page.waitForSelector(`${HEADER.NAV_DROPDOWN}.open`, { timeout: 3000 });

    const items = await page.$$eval(HEADER.NAV_DROPDOWN_ITEM, (els) =>
      els.map((el) => el.getAttribute('data-tab')).filter(Boolean)
    );

    // Expected tabs: dashboard, messages, projects, instances, settings
    for (const expectedTab of NAV_MENU_ITEMS) {
      expect(items).toContain(expectedTab);
    }
  });

  test('nav dropdown contains a divider before Settings', async ({ page }) => {
    await page.click(HEADER.NAV_DROPDOWN_TOGGLE);
    await page.waitForSelector(`${HEADER.NAV_DROPDOWN}.open`, { timeout: 3000 });

    const divider = page.locator(`${HEADER.NAV_DROPDOWN_MENU} ${HEADER.NAV_DROPDOWN_DIVIDER}`);
    await expect(divider).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Tab Switching — Each Tab Shows Correct Content
  // --------------------------------------------------------------------------

  test('clicking Dashboard tab shows dashboard content', async ({ page }) => {
    // Start on dashboard (default), navigate away first
    await page.click(HEADER.NAV_DROPDOWN_TOGGLE);
    await page.click(HEADER.navItemByTab('instances'));
    await page.waitForSelector(`${TABS.INSTANCES}.active`, { timeout: 5000 });

    // Now navigate back to dashboard
    await page.click(HEADER.NAV_DROPDOWN_TOGGLE);
    await page.click(HEADER.navItemByTab('dashboard'));
    await page.waitForSelector(`${TABS.DASHBOARD}.active`, { timeout: 5000 });

    const dashContent = page.locator(TABS.DASHBOARD);
    await expect(dashContent).toHaveClass(/active/);
    await expect(page.locator(DASHBOARD.TITLE)).toBeVisible();
  });

  test('clicking Messages tab shows messages content', async ({ page }) => {
    await page.click(HEADER.NAV_DROPDOWN_TOGGLE);
    await page.click(HEADER.navItemByTab('messages'));
    await page.waitForSelector(`${TABS.MESSAGES}.active`, { timeout: 5000 });

    const msgContent = page.locator(TABS.MESSAGES);
    await expect(msgContent).toHaveClass(/active/);

    // Messages tab should have conversations panel and chat panel
    await expect(page.locator(MESSAGES.CONVERSATIONS_PANEL)).toBeVisible();
    await expect(page.locator(MESSAGES.CHAT_PANEL)).toBeVisible();
  });

  test('clicking Projects tab shows projects content', async ({ page }) => {
    await page.click(HEADER.NAV_DROPDOWN_TOGGLE);
    await page.click(HEADER.navItemByTab('projects'));
    await page.waitForSelector(`${TABS.PROJECTS}.active`, { timeout: 5000 });

    const projContent = page.locator(TABS.PROJECTS);
    await expect(projContent).toHaveClass(/active/);

    // Projects tab should have title and grid
    await expect(page.locator(PROJECTS.TITLE)).toHaveText('Projects');
    await expect(page.locator(PROJECTS.NEW_PROJECT_BTN)).toBeVisible();
  });

  test('clicking Instances tab shows instances content', async ({ page }) => {
    await page.click(HEADER.NAV_DROPDOWN_TOGGLE);
    await page.click(HEADER.navItemByTab('instances'));
    await page.waitForSelector(`${TABS.INSTANCES}.active`, { timeout: 5000 });

    const instContent = page.locator(TABS.INSTANCES);
    await expect(instContent).toHaveClass(/active/);

    // Instances tab should have title and pre-approve button
    await expect(page.locator(INSTANCES.TITLE)).toHaveText('AI Instances');
    await expect(page.locator(INSTANCES.PRE_APPROVE_BTN)).toBeVisible();
  });

  test('clicking Settings tab shows settings content', async ({ page }) => {
    await page.click(HEADER.NAV_DROPDOWN_TOGGLE);
    await page.click(HEADER.navItemByTab('settings'));
    await page.waitForSelector(`${TABS.SETTINGS}.active`, { timeout: 5000 });

    const settContent = page.locator(TABS.SETTINGS);
    await expect(settContent).toHaveClass(/active/);

    // Settings tab should have identity card with instance ID
    await expect(page.locator(SETTINGS.TITLE)).toHaveText('Settings');
    await expect(page.locator(SETTINGS.INSTANCE_ID)).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Active Tab Indication
  // --------------------------------------------------------------------------

  test('active nav item has .active class matching current tab', async ({ page }) => {
    // Navigate to each tab and verify the active class
    const tabsToTest = ['messages', 'projects', 'instances', 'settings', 'dashboard'];

    for (const tabName of tabsToTest) {
      await page.click(HEADER.NAV_DROPDOWN_TOGGLE);
      await page.waitForSelector(`${HEADER.NAV_DROPDOWN}.open`, { timeout: 3000 });
      await page.click(HEADER.navItemByTab(tabName));
      await page.waitForSelector(`#tab-${tabName}.active`, { timeout: 5000 });

      // The nav dropdown item for the current tab should have .active class
      const navItem = page.locator(HEADER.navItemByTab(tabName));
      await expect(navItem).toHaveClass(/active/);

      // Other tabs' nav items should not have .active
      for (const otherTab of NAV_MENU_ITEMS) {
        if (otherTab !== tabName) {
          const otherNavItem = page.locator(HEADER.navItemByTab(otherTab));
          await expect(otherNavItem).not.toHaveClass(/active/);
        }
      }
    }
  });

  // --------------------------------------------------------------------------
  // Only One Tab Visible at a Time
  // --------------------------------------------------------------------------

  test('only one tab-content is active at any time', async ({ page }) => {
    const tabsToTest = ['messages', 'projects', 'instances', 'settings', 'dashboard'];

    for (const tabName of tabsToTest) {
      await page.click(HEADER.NAV_DROPDOWN_TOGGLE);
      await page.waitForSelector(`${HEADER.NAV_DROPDOWN}.open`, { timeout: 3000 });
      await page.click(HEADER.navItemByTab(tabName));
      await page.waitForSelector(`#tab-${tabName}.active`, { timeout: 5000 });

      const activeCount = await page.$$eval('.tab-content.active', (els) => els.length);
      expect(activeCount).toBe(1);
    }
  });

  // --------------------------------------------------------------------------
  // Nav Dropdown Closes After Selection
  // --------------------------------------------------------------------------

  test('nav dropdown closes after selecting a menu item', async ({ page }) => {
    const dropdown = page.locator(HEADER.NAV_DROPDOWN);

    await page.click(HEADER.NAV_DROPDOWN_TOGGLE);
    await expect(dropdown).toHaveClass(/open/);

    await page.click(HEADER.navItemByTab('instances'));
    await expect(dropdown).not.toHaveClass(/open/);
  });

  // --------------------------------------------------------------------------
  // Logo Navigation
  // --------------------------------------------------------------------------

  test('clicking logo area is present in header', async ({ page }) => {
    const logo = page.locator(HEADER.LOGO);
    await expect(logo).toBeVisible();
    await expect(logo).toContainText('HACS');
  });
});
