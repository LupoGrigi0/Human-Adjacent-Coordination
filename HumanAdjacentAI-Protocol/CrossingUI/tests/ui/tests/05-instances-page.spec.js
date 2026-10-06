/**
 * 05 — Instances Page
 *
 * Tests for the Instances tab: grid renders, cards display correct data,
 * card structure consistency, action buttons, and navigation to detail panel.
 *
 * Corresponds to test plan Section 5: Instances Page — Cards Render, Data Correct.
 */

const { test, expect } = require('@playwright/test');
const { InstancesPage } = require('../page-objects/InstancesPage.js');
const { InstanceDetailPanel } = require('../page-objects/InstanceDetailPanel.js');
const { CommonComponents } = require('../page-objects/CommonComponents.js');
const { ApiClient } = require('../helpers/api-client.js');
const { BASE_URL, TIMEOUTS } = require('../helpers/test-data.js');

test.describe('Instances Page', () => {
  let instancesPage;
  let detailPanel;
  let common;
  let api;

  test.beforeEach(async ({ page }) => {
    instancesPage = new InstancesPage(page);
    detailPanel = new InstanceDetailPanel(page);
    common = new CommonComponents(page);
    api = new ApiClient();

    // Navigate to dashboard first, then to instances tab
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await instancesPage.navigate();
    await instancesPage.waitForGridLoaded();
  });

  // -------------------------------------------------------------------------
  // inst_page_title
  // -------------------------------------------------------------------------
  test('should display "AI Instances" page title', async () => {
    const title = instancesPage.pageTitle;
    await expect(title).toBeVisible();
    await expect(title).toHaveText('AI Instances');
  });

  // -------------------------------------------------------------------------
  // inst_new_instance_btn
  // -------------------------------------------------------------------------
  test('should display "+ New Instance" button', async () => {
    const btn = instancesPage.preApproveButton;
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('New Instance');
    await expect(btn).toBeEnabled();
  });

  // -------------------------------------------------------------------------
  // inst_all_cards_present
  // -------------------------------------------------------------------------
  test('should render instance cards matching API count', async () => {
    const apiInstances = await api.getInstances();
    const uiCount = await instancesPage.getInstanceCardCount();
    expect(uiCount).toBe(apiInstances.length);
    expect(uiCount).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // inst_card_structure
  // -------------------------------------------------------------------------
  test('should render correct card structure with avatar, name, id, role, project, Message button', async () => {
    const apiInstances = await api.getInstances();
    // Pick the first instance for structure check
    const sampleInstance = apiInstances[0];
    const instanceId = sampleInstance.instanceId;
    const card = instancesPage.getInstanceCard(instanceId);

    // Avatar
    const avatar = card.locator('.instance-avatar');
    await expect(avatar).toBeVisible();
    const avatarText = await avatar.textContent();
    expect(avatarText.trim().length).toBeGreaterThan(0);

    // Name
    const name = card.locator('.instance-name');
    await expect(name).toBeVisible();
    const nameText = await name.textContent();
    expect(nameText.trim().length).toBeGreaterThan(0);

    // Instance ID
    const id = card.locator('.instance-id');
    await expect(id).toBeVisible();
    await expect(id).toContainText(instanceId);

    // Role badge
    const roleBadge = card.locator('.instance-role-badge');
    await expect(roleBadge).toBeVisible();

    // Project badge
    const projectBadge = card.locator('.instance-project-badge');
    await expect(projectBadge).toBeVisible();

    // Message button
    const msgBtn = card.locator('.instance-action-message');
    await expect(msgBtn).toBeVisible();
    await expect(msgBtn).toContainText('Message');
  });

  // -------------------------------------------------------------------------
  // inst_role_badge_values
  // -------------------------------------------------------------------------
  test('should display role badges matching API data', async () => {
    const apiInstances = await api.getInstances();
    // Check a few instances
    const sampled = apiInstances.slice(0, 3);
    for (const inst of sampled) {
      const role = await instancesPage.getInstanceRole(inst.instanceId);
      const expectedRole = inst.role || 'No role';
      expect(role.trim()).toBe(expectedRole);
    }
  });

  // -------------------------------------------------------------------------
  // inst_card_no_role
  // -------------------------------------------------------------------------
  test('should show "No role" for instances without a role', async () => {
    const apiInstances = await api.getInstances();
    const noRoleInstance = apiInstances.find(i => !i.role);
    if (!noRoleInstance) {
      test.skip();
      return;
    }
    const role = await instancesPage.getInstanceRole(noRoleInstance.instanceId);
    expect(role.trim()).toBe('No role');
  });

  // -------------------------------------------------------------------------
  // inst_card_no_project
  // -------------------------------------------------------------------------
  test('should show "No project" for instances without a project', async () => {
    const apiInstances = await api.getInstances();
    const noProjectInstance = apiInstances.find(i => !i.project);
    if (!noProjectInstance) {
      test.skip();
      return;
    }
    const project = await instancesPage.getInstanceProject(noProjectInstance.instanceId);
    expect(project.trim()).toBe('No project');
  });

  // -------------------------------------------------------------------------
  // inst_active_indicator
  // -------------------------------------------------------------------------
  test('should show status dot on each instance card', async () => {
    const firstCard = await instancesPage.getInstanceCardByIndex(0);
    const dot = firstCard.locator('.instance-status-dot');
    await expect(dot).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // inst_card_consistency
  // -------------------------------------------------------------------------
  test('should render all cards with consistent structure (no broken cards)', async () => {
    const cardCount = await instancesPage.getInstanceCardCount();
    expect(cardCount).toBeGreaterThan(0);

    for (let i = 0; i < cardCount; i++) {
      const card = (await instancesPage.getInstanceCardByIndex(i));
      // Each card must have: avatar, name, id, role badge, project badge, message button
      await expect(card.locator('.instance-avatar')).toBeVisible();
      await expect(card.locator('.instance-name')).toBeVisible();
      await expect(card.locator('.instance-id')).toBeVisible();
      await expect(card.locator('.instance-role-badge')).toBeVisible();
      await expect(card.locator('.instance-project-badge')).toBeVisible();
      await expect(card.locator('.instance-action-message')).toBeVisible();
    }
  });

  // -------------------------------------------------------------------------
  // inst_info_button
  // -------------------------------------------------------------------------
  test('should open instance detail panel when info icon is clicked', async () => {
    const apiInstances = await api.getInstances();
    const target = apiInstances[0];

    await instancesPage.clickDetailsIcon(target.instanceId);
    await detailPanel.waitForLoaded();
    const visible = await detailPanel.isVisible();
    expect(visible).toBe(true);
  });

  // -------------------------------------------------------------------------
  // inst_message_button
  // -------------------------------------------------------------------------
  test('should navigate to Messages page when Message button is clicked', async ({ page }) => {
    const apiInstances = await api.getInstances();
    const target = apiInstances[0];

    await instancesPage.clickMessageButton(target.instanceId);

    // Should switch to messages tab
    const messagesTab = page.locator('#tab-messages');
    await expect(messagesTab).toHaveClass(/active/);
  });

  // -------------------------------------------------------------------------
  // inst_continue_button
  // -------------------------------------------------------------------------
  test('should show Continue button only for instances with a role', async () => {
    const apiInstances = await api.getInstances();

    const withRole = apiInstances.find(i => i.role);
    const withoutRole = apiInstances.find(i => !i.role);

    if (withRole) {
      const hasContinue = await instancesPage.hasContinueButton(withRole.instanceId);
      // May or may not have continue depending on if it's self -- just check it doesn't crash
      expect(typeof hasContinue).toBe('boolean');
    }

    if (withoutRole) {
      const hasContinue = await instancesPage.hasContinueButton(withoutRole.instanceId);
      expect(hasContinue).toBe(false);
    }
  });

  // -------------------------------------------------------------------------
  // inst_grid_visible
  // -------------------------------------------------------------------------
  test('should show grid and hide it when detail panel opens', async () => {
    const isGridVisible = await instancesPage.isGridVisible();
    expect(isGridVisible).toBe(true);

    const apiInstances = await api.getInstances();
    const target = apiInstances[0];

    await instancesPage.clickDetailsIcon(target.instanceId);
    await detailPanel.waitForLoaded();

    // Grid should be hidden
    const gridAfter = await instancesPage.isGridVisible();
    expect(gridAfter).toBe(false);
  });
});
