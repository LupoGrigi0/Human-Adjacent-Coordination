/**
 * 02-dashboard-render.spec.js — Dashboard widget rendering
 *
 * Verifies that all 6 dashboard widget areas render correctly:
 *   1. Project heatmap
 *   2. Task heatmap
 *   3. Instance heatmap
 *   4. Activity chart
 *   5. EA (Genevieve) chat widget
 *   6. Executive task lists + personal lists
 *
 * Also checks widget headers, non-empty content, and layout structure.
 */

const { test, expect } = require('@playwright/test');
const { DashboardPage } = require('../page-objects/DashboardPage');
const { DASHBOARD, DASHBOARD_SETTINGS, TABS } = require('../helpers/selectors');
const { LUPO_ROLE, TIMEOUTS } = require('../helpers/test-data');

test.describe('02 — Dashboard Rendering', () => {
  let dashboard;

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page);

    // Load and wait for bootstrap + dashboard render
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.querySelector('#user-instance-id')?.textContent !== 'Not Connected',
      { timeout: TIMEOUTS.PAGE_LOAD }
    );
    // Wait for dashboard async data to populate
    await page.waitForTimeout(3000);
  });

  // --------------------------------------------------------------------------
  // Dashboard Container Structure
  // --------------------------------------------------------------------------

  test('dashboard tab is visible and active', async ({ page }) => {
    const dashTab = page.locator(TABS.DASHBOARD);
    await expect(dashTab).toHaveClass(/active/);
  });

  test('dashboard header shows title "Dashboard"', async () => {
    const title = await dashboard.dashTitle.textContent();
    expect(title).toBe('Dashboard');
  });

  test('dashboard header shows role badge with Executive', async () => {
    const badge = await dashboard.getRoleBadgeText();
    expect(badge).toBe(LUPO_ROLE);
  });

  test('dashboard settings gear button is visible', async () => {
    await expect(dashboard.settingsButton).toBeVisible();
  });

  test('dashboard has two-column layout (main + chat aside)', async () => {
    await expect(dashboard.dashLayout).toBeVisible();
    await expect(dashboard.dashMain).toBeVisible();
    await expect(dashboard.dashChat).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Widget 1: Project Heatmap
  // --------------------------------------------------------------------------

  test('project heatmap section is visible', async () => {
    await expect(dashboard.projectHeatmapSection).toBeVisible();
  });

  test('project heatmap has "Projects" section header', async ({ page }) => {
    const header = page.locator(`${DASHBOARD.HEATMAP_PROJECTS} ${DASHBOARD.SECTION_HEADER}`);
    await expect(header).toHaveText('Projects');
  });

  test('project heatmap grid contains at least one pill', async () => {
    const count = await dashboard.getProjectPillCount();
    expect(count).toBeGreaterThan(0);
  });

  test('project pills have background color (priority encoding)', async ({ page }) => {
    const firstPill = page.locator(`${DASHBOARD.HEATMAP_PROJECTS_GRID} .hm-pill`).first();
    const bg = await firstPill.evaluate((el) => el.style.background || getComputedStyle(el).backgroundColor);
    // Should have a non-default background color
    expect(bg).toBeTruthy();
    expect(bg).not.toBe('');
  });

  test('project pills have border color (status encoding)', async ({ page }) => {
    const firstPill = page.locator(`${DASHBOARD.HEATMAP_PROJECTS_GRID} .hm-pill`).first();
    const border = await firstPill.evaluate((el) => el.style.borderColor);
    expect(border).toBeTruthy();
  });

  test('project pills contain initials text', async ({ page }) => {
    const firstPill = page.locator(`${DASHBOARD.HEATMAP_PROJECTS_GRID} .hm-pill`).first();
    const text = await firstPill.evaluate((el) => {
      // Get direct text content (not tooltip children)
      const clone = el.cloneNode(true);
      const tip = clone.querySelector('.tip');
      if (tip) tip.remove();
      return clone.textContent.trim();
    });
    expect(text.length).toBeGreaterThanOrEqual(1);
    expect(text.length).toBeLessThanOrEqual(3);
  });

  // --------------------------------------------------------------------------
  // Widget 2: Task Heatmap
  // --------------------------------------------------------------------------

  test('task heatmap section is visible', async () => {
    await expect(dashboard.taskHeatmapSection).toBeVisible();
  });

  test('task heatmap has "Tasks" section header', async ({ page }) => {
    const header = page.locator(`${DASHBOARD.HEATMAP_TASKS} ${DASHBOARD.SECTION_HEADER}`);
    await expect(header).toHaveText('Tasks');
  });

  test('task heatmap grid has content (dots or empty message)', async ({ page }) => {
    const grid = page.locator(DASHBOARD.HEATMAP_TASKS_GRID);
    const innerHTML = await grid.innerHTML();
    // Should not be empty — either has .th-dot elements or a "No tasks" message
    expect(innerHTML.length).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // Widget 3: Instance Heatmap
  // --------------------------------------------------------------------------

  test('instance heatmap section is visible', async () => {
    await expect(dashboard.instanceHeatmapSection).toBeVisible();
  });

  test('instance heatmap has "Instances" section header', async ({ page }) => {
    const header = page.locator(`${DASHBOARD.HEATMAP_INSTANCES} ${DASHBOARD.SECTION_HEADER}`);
    await expect(header).toHaveText('Instances');
  });

  test('instance heatmap grid contains at least one pill', async () => {
    const count = await dashboard.getInstancePillCount();
    expect(count).toBeGreaterThan(0);
  });

  test('instance pills have role icon character', async ({ page }) => {
    const firstPill = page.locator(`${DASHBOARD.HEATMAP_INSTANCES_GRID} .hm-pill`).first();
    const icon = firstPill.locator('.inst-icon');
    const iconText = await icon.textContent();
    // Should be a single unicode character (role icon)
    expect(iconText.trim().length).toBeGreaterThanOrEqual(1);
  });

  // --------------------------------------------------------------------------
  // Widget 4: Activity Chart
  // --------------------------------------------------------------------------

  test('activity chart section exists in DOM', async () => {
    await expect(dashboard.chartSection).toBeAttached();
  });

  test('activity chart shows either canvas or placeholder', async ({ page }) => {
    // The chart shows a canvas if an OpenRouter key is set,
    // or a placeholder message if not
    const canvas = await page.$('#dash-chart-canvas');
    const placeholder = await page.$(`${DASHBOARD.CHART_SECTION} .chart-placeholder`);

    const hasCanvas = canvas !== null;
    const hasPlaceholder = placeholder !== null;

    // One or the other should be present
    expect(hasCanvas || hasPlaceholder).toBe(true);
  });

  test('activity chart section has chart-title "Token Activity" when present', async ({ page }) => {
    const chartTitle = page.locator(`${DASHBOARD.CHART_SECTION} .chart-title`);
    const count = await chartTitle.count();
    if (count > 0) {
      await expect(chartTitle).toHaveText('Token Activity');
    }
    // If no chart-title, the chart section might just have a placeholder — still valid
  });

  // --------------------------------------------------------------------------
  // Widget 5: EA Chat Widget
  // --------------------------------------------------------------------------

  test('EA chat widget is visible', async () => {
    await expect(dashboard.dashChat).toBeVisible();
  });

  test('EA chat header shows "Genevieve"', async () => {
    const headerText = await dashboard.paChatHeader.textContent();
    expect(headerText).toContain('Genevieve');
  });

  test('EA chat header shows "EA" label', async () => {
    const headerText = await dashboard.paChatHeader.textContent();
    expect(headerText).toContain('EA');
  });

  test('EA chat has message area', async () => {
    await expect(dashboard.paChatMessages).toBeAttached();
  });

  test('EA chat has message input field', async () => {
    await expect(dashboard.paChatInput).toBeVisible();
  });

  test('EA chat input has correct placeholder text', async () => {
    await expect(dashboard.paChatInput).toHaveAttribute('placeholder', 'Message Genevieve...');
  });

  test('EA chat has send button', async () => {
    await expect(dashboard.paChatSendButton).toBeVisible();
    const text = await dashboard.paChatSendButton.textContent();
    expect(text.trim()).toBe('Send');
  });

  // --------------------------------------------------------------------------
  // Widget 6: Task Lists + Personal Lists
  // --------------------------------------------------------------------------

  test('tasks column is visible', async () => {
    await expect(dashboard.tasksColumn).toBeVisible();
  });

  test('tasks column has "Tasks" header', async ({ page }) => {
    const header = page.locator(`${DASHBOARD.TASKS_COL} .col-header span`).first();
    await expect(header).toHaveText('Tasks');
  });

  test('tasks column has count badge', async () => {
    const countText = await dashboard.getTasksCountText();
    // Count should be a number (possibly "0")
    expect(parseInt(countText, 10)).toBeGreaterThanOrEqual(0);
  });

  test('tasks column has "Add task..." input', async () => {
    await expect(dashboard.newTaskInput).toBeVisible();
    await expect(dashboard.newTaskInput).toHaveAttribute('placeholder', 'Add task...');
  });

  test('personal lists column is visible', async () => {
    await expect(dashboard.personalListsColumn).toBeVisible();
  });

  test('personal lists column has "Lists" header', async ({ page }) => {
    const header = page.locator(`${DASHBOARD.PERSONAL_COL} .col-header span`).first();
    await expect(header).toHaveText('Lists');
  });

  test('personal lists column has count badge', async () => {
    const countText = await dashboard.getListsCountText();
    expect(parseInt(countText, 10)).toBeGreaterThanOrEqual(0);
  });

  // --------------------------------------------------------------------------
  // Heatmap Layout
  // --------------------------------------------------------------------------

  test('heatmaps container has side-by-side class by default', async ({ page }) => {
    const heatmaps = page.locator(DASHBOARD.HEATMAPS);
    await expect(heatmaps).toHaveClass(/hm-sbs/);
  });

  test('all three heatmap sections are rendered inside container', async ({ page }) => {
    const sections = page.locator(`${DASHBOARD.HEATMAPS} .heatmap-section`);
    const count = await sections.count();
    expect(count).toBe(3);
  });

  // --------------------------------------------------------------------------
  // Dashboard Settings Dialog
  // --------------------------------------------------------------------------

  test('settings dialog opens when gear button is clicked', async () => {
    await dashboard.openSettings();
    await expect(dashboard.settingsDialog).toBeVisible();
  });

  test('settings dialog has all expected controls', async ({ page }) => {
    await dashboard.openSettings();

    // Sliders
    await expect(page.locator(DASHBOARD_SETTINGS.PILL_SIZE)).toBeVisible();
    await expect(page.locator(DASHBOARD_SETTINGS.PILL_GAP)).toBeVisible();
    await expect(page.locator(DASHBOARD_SETTINGS.BORDER_WIDTH)).toBeVisible();
    await expect(page.locator(DASHBOARD_SETTINGS.TASK_DOTS)).toBeVisible();

    // Toggle checkboxes
    await expect(page.locator(DASHBOARD_SETTINGS.SHOW_CHART)).toBeAttached();
    await expect(page.locator(DASHBOARD_SETTINGS.SHOW_WORLD)).toBeAttached();
    await expect(page.locator(DASHBOARD_SETTINGS.SHOW_TASKS)).toBeAttached();
    await expect(page.locator(DASHBOARD_SETTINGS.SHOW_INSTANCES)).toBeAttached();
    await expect(page.locator(DASHBOARD_SETTINGS.SHOW_PM)).toBeAttached();
    await expect(page.locator(DASHBOARD_SETTINGS.HM_SIDE_BY_SIDE)).toBeAttached();

    // Action buttons
    await expect(page.locator(DASHBOARD_SETTINGS.SAVE_BTN)).toBeVisible();
    await expect(page.locator(DASHBOARD_SETTINGS.CANCEL_BTN)).toBeVisible();
  });

  test('settings dialog closes on close button', async () => {
    await dashboard.openSettings();
    await expect(dashboard.settingsDialog).toBeVisible();
    await dashboard.closeSettings();
    // Dialog should close (may not be "hidden" in DOM sense, but not open)
    await expect(dashboard.settingsDialog).not.toBeVisible();
  });
});
