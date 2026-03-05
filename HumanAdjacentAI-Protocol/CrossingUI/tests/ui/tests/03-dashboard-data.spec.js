/**
 * 03-dashboard-data.spec.js — Dashboard data matches API (read-back verification)
 *
 * Compares what the dashboard renders against direct API calls.
 * This ensures the UI is a faithful view of the API data, not an
 * independent data source.
 *
 * Checks:
 *   - Project pill count matches list_projects
 *   - Instance pill count matches get_all_instances
 *   - Task counts are consistent with get_my_tasks
 *   - Project pill data-attributes match API project IDs
 *   - Instance pill data-attributes match API instance IDs
 */

const { test, expect } = require('@playwright/test');
const { DashboardPage } = require('../page-objects/DashboardPage');
const { HacsApiClient } = require('../helpers/api-client');
const { DASHBOARD } = require('../helpers/selectors');
const { TIMEOUTS, LUPO_INSTANCE_ID } = require('../helpers/test-data');

test.describe('03 — Dashboard Data Verification', () => {
  let dashboard;
  let api;

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page);
    api = new HacsApiClient();

    // Load and wait for bootstrap + dashboard data
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.querySelector('#user-instance-id')?.textContent !== 'Not Connected',
      { timeout: TIMEOUTS.PAGE_LOAD }
    );
    // Wait for all heatmap data to load
    await page.waitForTimeout(4000);
  });

  // --------------------------------------------------------------------------
  // Project Heatmap vs API
  // --------------------------------------------------------------------------

  test('project pill count matches API list_projects count', async () => {
    const apiProjects = await api.getProjects();
    const uiPillCount = await dashboard.getProjectPillCount();

    expect(uiPillCount).toBe(apiProjects.length);
  });

  test('project pill IDs match API project IDs', async ({ page }) => {
    const apiProjects = await api.getProjects();
    const apiIds = apiProjects.map((p) => p.id || p.projectId).sort();

    const uiIds = await page.$$eval(
      `${DASHBOARD.HEATMAP_PROJECTS_GRID} .hm-pill`,
      (els) => els.map((el) => el.getAttribute('data-project-id')).sort()
    );

    expect(uiIds).toEqual(apiIds);
  });

  test('project pills display correct initials for project names', async ({ page }) => {
    const apiProjects = await api.getProjects();
    if (apiProjects.length === 0) return;

    // Check the first project
    const project = apiProjects[0];
    const projectId = project.id || project.projectId;
    const projectName = project.name || projectId;

    // Compute expected initials (same logic as dashboard-heatmaps.js getInitials)
    const words = projectName.replace(/[-_]/g, ' ').split(/\s+/);
    let expectedInitials;
    if (words.length === 1) {
      expectedInitials = words[0].slice(0, 2).toUpperCase();
    } else {
      expectedInitials = (words[0][0] + words[1][0]).toUpperCase();
    }

    const pillText = await page.$eval(
      `${DASHBOARD.HEATMAP_PROJECTS_GRID} .hm-pill[data-project-id="${projectId}"]`,
      (el) => {
        const clone = el.cloneNode(true);
        const tip = clone.querySelector('.tip');
        if (tip) tip.remove();
        return clone.textContent.trim();
      }
    );

    expect(pillText).toBe(expectedInitials);
  });

  test('project pill tooltips contain project name', async ({ page }) => {
    const apiProjects = await api.getProjects();
    if (apiProjects.length === 0) return;

    const project = apiProjects[0];
    const projectId = project.id || project.projectId;
    const projectName = project.name || projectId;

    const tooltipName = await page.$eval(
      `${DASHBOARD.HEATMAP_PROJECTS_GRID} .hm-pill[data-project-id="${projectId}"] .tn`,
      (el) => el.textContent
    );

    expect(tooltipName).toBe(projectName);
  });

  // --------------------------------------------------------------------------
  // Instance Heatmap vs API
  // --------------------------------------------------------------------------

  test('instance pill count matches API get_all_instances count', async () => {
    const apiInstances = await api.getInstances();
    const uiPillCount = await dashboard.getInstancePillCount();

    expect(uiPillCount).toBe(apiInstances.length);
  });

  test('instance pill IDs match API instance IDs', async ({ page }) => {
    const apiInstances = await api.getInstances();
    const apiIds = apiInstances.map((i) => i.id || i.instanceId).sort();

    const uiIds = await page.$$eval(
      `${DASHBOARD.HEATMAP_INSTANCES_GRID} .hm-pill`,
      (els) => els.map((el) => el.getAttribute('data-instance-id')).sort()
    );

    expect(uiIds).toEqual(apiIds);
  });

  test('instance pill tooltip shows instance name', async ({ page }) => {
    const apiInstances = await api.getInstances();
    if (apiInstances.length === 0) return;

    const instance = apiInstances[0];
    const instanceId = instance.id || instance.instanceId;
    const expectedName = instance.name || instanceId.split('-')[0];

    const tooltipName = await page.$eval(
      `${DASHBOARD.HEATMAP_INSTANCES_GRID} .hm-pill[data-instance-id="${instanceId}"] .tn`,
      (el) => el.textContent
    );

    expect(tooltipName).toBe(expectedName);
  });

  test('instance pill tooltip shows role', async ({ page }) => {
    const apiInstances = await api.getInstances();
    if (apiInstances.length === 0) return;

    const instance = apiInstances[0];
    const instanceId = instance.id || instance.instanceId;
    const expectedRole = instance.role || 'Developer';

    const tooltipRole = await page.$eval(
      `${DASHBOARD.HEATMAP_INSTANCES_GRID} .hm-pill[data-instance-id="${instanceId}"] .ts`,
      (el) => el.textContent
    );

    expect(tooltipRole).toBe(expectedRole);
  });

  // --------------------------------------------------------------------------
  // Task Data vs API
  // --------------------------------------------------------------------------

  test('task count badge is a valid number', async () => {
    const countText = await dashboard.getTasksCountText();
    const count = parseInt(countText, 10);
    expect(Number.isNaN(count)).toBe(false);
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('task heatmap dot count reflects pending tasks from API', async () => {
    const apiTasks = await api.getMyTasks(LUPO_INSTANCE_ID);
    const allTasks = [
      ...(apiTasks?.personalTasks || []),
      ...(apiTasks?.projectTasks || []),
    ];

    // Filter to pending (same logic as dashboard-heatmaps.js)
    const pending = allTasks.filter(
      (t) =>
        !t.status ||
        (t.status !== 'completed' &&
          t.status !== 'completed_verified' &&
          t.status !== 'archived')
    );

    const uiDotCount = await dashboard.getTaskDotCount();

    // The UI limits dots per group (default max 5 per list), so the total
    // UI dots may be less than or equal to the pending count. But if there
    // are no pending tasks, dots should be 0.
    if (pending.length === 0) {
      expect(uiDotCount).toBe(0);
    } else {
      expect(uiDotCount).toBeGreaterThan(0);
      expect(uiDotCount).toBeLessThanOrEqual(pending.length);
    }
  });

  test('task list section shows task rows matching API data', async ({ page }) => {
    const apiTasks = await api.getMyTasks(LUPO_INSTANCE_ID);
    // The dashboard also fetches via listTasks — personal tasks may differ.
    // We just verify that task rows exist if the API has tasks.
    const allTasks = [
      ...(apiTasks?.personalTasks || []),
      ...(apiTasks?.projectTasks || []),
    ];

    const taskRowCount = await page.$$eval('.dash-task-row', (els) => els.length);

    if (allTasks.length === 0) {
      // No tasks — task list should be empty or show no rows
      expect(taskRowCount).toBe(0);
    } else {
      // At least some task rows should render
      expect(taskRowCount).toBeGreaterThan(0);
    }
  });

  // --------------------------------------------------------------------------
  // Lists Data vs API
  // --------------------------------------------------------------------------

  test('lists count badge reflects API list count', async () => {
    const apiResult = await api.getLists();
    const apiLists = apiResult?.lists || apiResult || [];
    const apiCount = Array.isArray(apiLists) ? apiLists.length : 0;

    const uiCountText = await dashboard.getListsCountText();
    const uiCount = parseInt(uiCountText, 10);

    expect(uiCount).toBe(apiCount);
  });

  // --------------------------------------------------------------------------
  // Cross-widget Consistency
  // --------------------------------------------------------------------------

  test('project count is consistent between heatmap pills and API', async () => {
    const apiProjects = await api.getProjects();
    const pillCount = await dashboard.getProjectPillCount();

    // These should always match — the heatmap renders one pill per project
    expect(pillCount).toBe(apiProjects.length);
  });

  test('instance count is consistent between heatmap pills and API', async () => {
    const apiInstances = await api.getInstances();
    const pillCount = await dashboard.getInstancePillCount();

    // One pill per instance
    expect(pillCount).toBe(apiInstances.length);
  });
});
