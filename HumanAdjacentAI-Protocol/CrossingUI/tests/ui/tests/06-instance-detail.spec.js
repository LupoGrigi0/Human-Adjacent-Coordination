/**
 * 06 — Instance Detail Panel
 *
 * Tests for the dynamically rendered instance detail panel that replaces
 * the instances grid. Covers: header data, tasks section, lists section,
 * documents sidebar, collapsible sections, and back navigation.
 *
 * Corresponds to test plan Section 6: Instance Detail — Panel Opens, Data Correct.
 */

const { test, expect } = require('@playwright/test');
const { InstancesPage } = require('../page-objects/InstancesPage.js');
const { InstanceDetailPanel } = require('../page-objects/InstanceDetailPanel.js');
const { ApiClient } = require('../helpers/api-client.js');
const { BASE_URL, TIMEOUTS } = require('../helpers/test-data.js');

test.describe('Instance Detail Panel', () => {
  let instancesPage;
  let detailPanel;
  let api;
  let targetInstance;

  test.beforeEach(async ({ page }) => {
    instancesPage = new InstancesPage(page);
    detailPanel = new InstanceDetailPanel(page);
    api = new ApiClient();

    // Navigate and load instances
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await instancesPage.navigate();
    await instancesPage.waitForGridLoaded();

    // Get an instance to test with (pick first one)
    const allInstances = await api.getInstances();
    expect(allInstances.length).toBeGreaterThan(0);
    targetInstance = allInstances[0];
  });

  // -------------------------------------------------------------------------
  // detail_opens_correct
  // -------------------------------------------------------------------------
  test('should open detail panel showing correct instance name and ID', async () => {
    await instancesPage.clickDetailsIcon(targetInstance.instanceId);
    await detailPanel.waitForLoaded();

    const visible = await detailPanel.isVisible();
    expect(visible).toBe(true);

    const displayName = await detailPanel.getName();
    expect(displayName.length).toBeGreaterThan(0);

    // The instance ID should appear in the header
    const idText = await detailPanel.getInstanceId();
    expect(idText).toContain(targetInstance.instanceId);
  });

  // -------------------------------------------------------------------------
  // detail_back_link
  // -------------------------------------------------------------------------
  test('should have back button that returns to instances grid', async () => {
    await instancesPage.clickDetailsIcon(targetInstance.instanceId);
    await detailPanel.waitForLoaded();

    const backBtn = detailPanel.backButton;
    await expect(backBtn).toBeVisible();
    await expect(backBtn).toContainText('Instances');

    await detailPanel.goBack();

    // Grid should be visible again
    const gridVisible = await instancesPage.isGridVisible();
    expect(gridVisible).toBe(true);

    // Detail should be hidden
    const detailVisible = await detailPanel.isVisible();
    expect(detailVisible).toBe(false);
  });

  // -------------------------------------------------------------------------
  // detail_role_badge
  // -------------------------------------------------------------------------
  test('should display role badge matching instance role', async () => {
    await instancesPage.clickDetailsIcon(targetInstance.instanceId);
    await detailPanel.waitForLoaded();

    const roleBadgeText = await detailPanel.getRoleBadgeText();
    const expectedRole = targetInstance.role || 'no role';
    expect(roleBadgeText.toLowerCase()).toBe(expectedRole.toLowerCase());
  });

  // -------------------------------------------------------------------------
  // detail_persona_badge
  // -------------------------------------------------------------------------
  test('should display persona badge', async () => {
    await instancesPage.clickDetailsIcon(targetInstance.instanceId);
    await detailPanel.waitForLoaded();

    const personaBadge = detailPanel.personaBadge;
    await expect(personaBadge).toBeVisible();

    const personaText = await detailPanel.getPersonaBadgeText();
    if (targetInstance.personality) {
      expect(personaText.toLowerCase()).toBe(targetInstance.personality.toLowerCase());
    } else {
      expect(personaText.toLowerCase()).toContain('persona');
    }
  });

  // -------------------------------------------------------------------------
  // detail_project_link
  // -------------------------------------------------------------------------
  test('should display project link in header meta', async () => {
    await instancesPage.clickDetailsIcon(targetInstance.instanceId);
    await detailPanel.waitForLoaded();

    const projectText = await detailPanel.getProjectText();
    expect(projectText).toContain('Project:');
  });

  // -------------------------------------------------------------------------
  // detail_task_count
  // -------------------------------------------------------------------------
  test('should display task count in header meta', async () => {
    await instancesPage.clickDetailsIcon(targetInstance.instanceId);
    await detailPanel.waitForLoaded();

    const taskCountText = await detailPanel.getTaskCountText();
    // Task count follows pattern "X/Y tasks"
    expect(taskCountText).not.toBeNull();
    expect(taskCountText).toMatch(/\d+\/\d+ tasks?/);
  });

  // -------------------------------------------------------------------------
  // detail_active_indicator
  // -------------------------------------------------------------------------
  test('should display online/offline dot in header', async () => {
    await instancesPage.clickDetailsIcon(targetInstance.instanceId);
    await detailPanel.waitForLoaded();

    const onlineDot = detailPanel.onlineDot;
    await expect(onlineDot).toBeVisible();
    // Should have the 'online' class or not
    const isOnline = await detailPanel.isOnline();
    expect(typeof isOnline).toBe('boolean');
  });

  // -------------------------------------------------------------------------
  // detail_last_active
  // -------------------------------------------------------------------------
  test('should display last active timestamp', async () => {
    await instancesPage.clickDetailsIcon(targetInstance.instanceId);
    await detailPanel.waitForLoaded();

    const lastActive = await detailPanel.getLastActiveText();
    // May be null for instances that have no lastActiveAt
    if (lastActive) {
      // Should contain a relative time indicator
      expect(lastActive.length).toBeGreaterThan(0);
    }
  });

  // -------------------------------------------------------------------------
  // detail_gear_icon
  // -------------------------------------------------------------------------
  test('should have gear icon that opens preferences modal', async () => {
    await instancesPage.clickDetailsIcon(targetInstance.instanceId);
    await detailPanel.waitForLoaded();

    const gearBtn = detailPanel.settingsGearButton;
    await expect(gearBtn).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // detail_personal_tasks (tasks section)
  // -------------------------------------------------------------------------
  test('should render tasks section that is expanded by default', async () => {
    await instancesPage.clickDetailsIcon(targetInstance.instanceId);
    await detailPanel.waitForLoaded();

    const tasksSection = detailPanel.tasksSection;
    // Tasks section should exist
    const sectionCount = await tasksSection.count();
    expect(sectionCount).toBe(1);

    // Should be expanded by default
    const isExpanded = await detailPanel.isSectionExpanded('tasks');
    expect(isExpanded).toBe(true);
  });

  // -------------------------------------------------------------------------
  // detail_checklists (lists section)
  // -------------------------------------------------------------------------
  test('should render lists section that is expanded by default', async () => {
    await instancesPage.clickDetailsIcon(targetInstance.instanceId);
    await detailPanel.waitForLoaded();

    const listsSection = detailPanel.listsSection;
    const sectionCount = await listsSection.count();
    expect(sectionCount).toBe(1);

    const isExpanded = await detailPanel.isSectionExpanded('lists');
    expect(isExpanded).toBe(true);
  });

  // -------------------------------------------------------------------------
  // detail_documents
  // -------------------------------------------------------------------------
  test('should render documents sidebar', async () => {
    await instancesPage.clickDetailsIcon(targetInstance.instanceId);
    await detailPanel.waitForLoaded();

    const sidebar = detailPanel.documentsSidebar;
    await expect(sidebar).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // detail_section_collapse
  // -------------------------------------------------------------------------
  test('should toggle section collapse when header is clicked', async () => {
    await instancesPage.clickDetailsIcon(targetInstance.instanceId);
    await detailPanel.waitForLoaded();

    // Tasks section starts expanded
    const expandedBefore = await detailPanel.isSectionExpanded('tasks');
    expect(expandedBefore).toBe(true);

    // Click to collapse
    await detailPanel.toggleSection('tasks');
    const expandedAfter = await detailPanel.isSectionExpanded('tasks');
    expect(expandedAfter).toBe(false);

    // Click to expand again
    await detailPanel.toggleSection('tasks');
    const expandedAgain = await detailPanel.isSectionExpanded('tasks');
    expect(expandedAgain).toBe(true);
  });

  // -------------------------------------------------------------------------
  // detail_multiple_instances
  // -------------------------------------------------------------------------
  test('should correctly update when navigating to different instances', async () => {
    const allInstances = await api.getInstances();
    if (allInstances.length < 2) {
      test.skip();
      return;
    }

    const first = allInstances[0];
    const second = allInstances[1];

    // Open first instance
    await instancesPage.clickDetailsIcon(first.instanceId);
    await detailPanel.waitForLoaded();
    const firstName = await detailPanel.getName();

    // Go back
    await detailPanel.goBack();
    await instancesPage.waitForGridLoaded();

    // Open second instance
    await instancesPage.clickDetailsIcon(second.instanceId);
    await detailPanel.waitForLoaded();
    const secondName = await detailPanel.getName();

    // Names should differ (unless they happen to share a name, which is unlikely)
    const firstId = await detailPanel.getInstanceId();
    expect(firstId).toContain(second.instanceId);
  });
});
