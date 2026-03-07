/**
 * Dashboard Page Object
 *
 * Covers the main dashboard tab: heatmaps (projects, tasks, instances),
 * activity chart, world info strip, PM status scroll, task lists,
 * personal lists, EA chat widget, and dashboard settings dialog.
 *
 * @module page-objects/DashboardPage
 */

class DashboardPage {
  constructor(page) {
    this.page = page;
  }

  // ---------------------------------------------------------------------------
  // NAVIGATION
  // ---------------------------------------------------------------------------

  get tabContent() {
    return this.page.locator('#tab-dashboard');
  }

  async navigate() {
    const { CommonComponents } = require('./CommonComponents');
    const common = new CommonComponents(this.page);
    await common.navigateTo('dashboard');
    await this.tabContent.waitFor({ state: 'visible' });
  }

  async isActive() {
    return this.tabContent.evaluate(el => el.classList.contains('active'));
  }

  // ---------------------------------------------------------------------------
  // DASHBOARD HEADER
  // ---------------------------------------------------------------------------

  get dashHeader() {
    return this.page.locator('.dash-header');
  }

  get dashTitle() {
    return this.page.locator('.dash-header h1');
  }

  get roleBadge() {
    return this.page.locator('#dash-role-badge');
  }

  get settingsButton() {
    return this.page.locator('#dash-settings-btn');
  }

  async getRoleBadgeText() {
    return this.roleBadge.textContent();
  }

  // ---------------------------------------------------------------------------
  // DASHBOARD LAYOUT
  // ---------------------------------------------------------------------------

  get dashLayout() {
    return this.page.locator('#dash-layout');
  }

  get dashMain() {
    return this.page.locator('.dash-main');
  }

  get dashChat() {
    return this.page.locator('#dash-pa-chat');
  }

  // ---------------------------------------------------------------------------
  // ACTIVITY CHART
  // ---------------------------------------------------------------------------

  get chartSection() {
    return this.page.locator('#dash-chart');
  }

  async isChartVisible() {
    const display = await this.chartSection.evaluate(el => getComputedStyle(el).display);
    return display !== 'none';
  }

  // ---------------------------------------------------------------------------
  // WORLD INFO STRIP
  // ---------------------------------------------------------------------------

  get worldStrip() {
    return this.page.locator('#dash-world');
  }

  async isWorldStripVisible() {
    const display = await this.worldStrip.evaluate(el => getComputedStyle(el).display);
    return display !== 'none';
  }

  get worldItems() {
    return this.worldStrip.locator('.world-item');
  }

  get worldClocks() {
    return this.worldStrip.locator('.wi-clock');
  }

  async getWorldClockTexts() {
    return this.worldClocks.allTextContents();
  }

  // ---------------------------------------------------------------------------
  // HEATMAPS
  // ---------------------------------------------------------------------------

  get heatmapsContainer() {
    return this.page.locator('#dash-heatmaps');
  }

  // --- Project heatmap ---

  get projectHeatmapSection() {
    return this.page.locator('#hm-projects');
  }

  get projectHeatmapGrid() {
    return this.page.locator('#hm-projects-grid');
  }

  get projectPills() {
    return this.projectHeatmapGrid.locator('.hm-pill');
  }

  async getProjectPillCount() {
    return this.projectPills.count();
  }

  async clickProjectPill(index) {
    await this.projectPills.nth(index).click();
  }

  async clickProjectPillById(projectId) {
    await this.projectHeatmapGrid.locator(`.hm-pill[data-project-id="${projectId}"]`).click();
  }

  async getProjectPillTooltip(index) {
    const pill = this.projectPills.nth(index);
    const tipName = await pill.locator('.tn').textContent();
    return tipName;
  }

  // --- Task heatmap ---

  get taskHeatmapSection() {
    return this.page.locator('#hm-tasks');
  }

  get taskHeatmapGrid() {
    return this.page.locator('#hm-tasks-grid');
  }

  get taskHeatmapRows() {
    return this.taskHeatmapGrid.locator('.task-heat-row');
  }

  get taskDots() {
    return this.taskHeatmapGrid.locator('.th-dot');
  }

  async getTaskDotCount() {
    return this.taskDots.count();
  }

  async clickTaskDot(index) {
    await this.taskDots.nth(index).click();
  }

  async isTaskHeatmapVisible() {
    const display = await this.taskHeatmapSection.evaluate(el => getComputedStyle(el).display);
    return display !== 'none';
  }

  // --- Instance heatmap ---

  get instanceHeatmapSection() {
    return this.page.locator('#hm-instances');
  }

  get instanceHeatmapGrid() {
    return this.page.locator('#hm-instances-grid');
  }

  get instancePills() {
    return this.instanceHeatmapGrid.locator('.hm-pill');
  }

  async getInstancePillCount() {
    return this.instancePills.count();
  }

  async clickInstancePill(index) {
    await this.instancePills.nth(index).click();
  }

  async clickInstancePillById(instanceId) {
    await this.instanceHeatmapGrid.locator(`.hm-pill[data-instance-id="${instanceId}"]`).click();
  }

  async isInstanceHeatmapVisible() {
    const display = await this.instanceHeatmapSection.evaluate(el => getComputedStyle(el).display);
    return display !== 'none';
  }

  // Pulsing pills (blocked projects or live ZeroClaw instances)
  get pulsingPills() {
    return this.heatmapsContainer.locator('.hm-pill.pulse');
  }

  async getPulsingPillCount() {
    return this.pulsingPills.count();
  }

  // ---------------------------------------------------------------------------
  // PM STATUS SCROLL
  // ---------------------------------------------------------------------------

  get pmStatusScroll() {
    return this.page.locator('#dash-pm-status');
  }

  get pmItems() {
    return this.pmStatusScroll.locator('.pm-item');
  }

  async getPmItemCount() {
    return this.pmItems.count();
  }

  async clickPmItem(index) {
    await this.pmItems.nth(index).click();
  }

  async getPmItemText(index) {
    const item = this.pmItems.nth(index);
    const name = await item.locator('.pm-name').textContent();
    const msg = await item.locator('.pm-msg').textContent();
    return { name, message: msg.trim() };
  }

  async isPmStatusVisible() {
    const display = await this.pmStatusScroll.evaluate(el => getComputedStyle(el).display);
    return display !== 'none';
  }

  // ---------------------------------------------------------------------------
  // TASK LISTS (left column)
  // ---------------------------------------------------------------------------

  get tasksColumn() {
    return this.page.locator('#dash-tasks-col');
  }

  get tasksCount() {
    return this.page.locator('#dash-tasks-count');
  }

  get tasksList() {
    return this.page.locator('#dash-tasks-list');
  }

  get newTaskInput() {
    return this.page.locator('#dash-new-task');
  }

  get taskListSections() {
    return this.tasksList.locator('.dash-task-list-section');
  }

  get taskListHeads() {
    return this.tasksList.locator('.dash-task-list-head');
  }

  get taskRows() {
    return this.tasksList.locator('.dash-task-row');
  }

  async getTasksCountText() {
    return this.tasksCount.textContent();
  }

  async addTask(title) {
    await this.newTaskInput.fill(title);
    await this.newTaskInput.press('Enter');
  }

  async clickTaskRow(index) {
    await this.taskRows.nth(index).click();
  }

  async getTaskRowTexts() {
    return this.tasksList.locator('.dash-task-text').allTextContents();
  }

  async toggleTaskList(listId) {
    await this.tasksList.locator(`.dash-task-list-head[data-list-id="${listId}"]`).click();
  }

  async toggleShowCompleted(listId) {
    await this.tasksList.locator(`.dash-tl-toggle-done[data-list-id="${listId}"]`).click();
  }

  async isTaskListExpanded(listId) {
    const body = this.tasksList.locator(`.dash-task-list-head[data-list-id="${listId}"]`)
      .locator('..').locator('.dash-task-list-body');
    const display = await body.evaluate(el => getComputedStyle(el).display);
    return display !== 'none';
  }

  // ---------------------------------------------------------------------------
  // PERSONAL LISTS (right column)
  // ---------------------------------------------------------------------------

  get personalListsColumn() {
    return this.page.locator('#dash-personal-col');
  }

  get listsCount() {
    return this.page.locator('#dash-lists-count');
  }

  get personalLists() {
    return this.page.locator('#dash-personal-lists');
  }

  get listHeaders() {
    return this.personalLists.locator('.dash-list-header');
  }

  get listItems() {
    return this.personalLists.locator('.dash-list-item');
  }

  async getListsCountText() {
    return this.listsCount.textContent();
  }

  async clickListItem(listId, itemId) {
    await this.personalLists
      .locator(`.dash-list-item[data-list-id="${listId}"][data-item-id="${itemId}"]`)
      .click();
  }

  async isListItemChecked(listId, itemId) {
    const item = this.personalLists
      .locator(`.dash-list-item[data-list-id="${listId}"][data-item-id="${itemId}"]`);
    return item.locator('.li-check').evaluate(el => el.classList.contains('checked'));
  }

  async getListItemTexts() {
    return this.personalLists.locator('.li-text').allTextContents();
  }

  // ---------------------------------------------------------------------------
  // EA (PA) CHAT WIDGET
  // ---------------------------------------------------------------------------

  get paChatHeader() {
    return this.page.locator('.pa-chat-header');
  }

  get paChatMessages() {
    return this.page.locator('#pa-chat-msgs');
  }

  get paChatInput() {
    return this.page.locator('#pa-chat-input');
  }

  get paChatSendButton() {
    return this.page.locator('#pa-chat-send');
  }

  async sendPaChatMessage(text) {
    await this.paChatInput.fill(text);
    await this.paChatSendButton.click();
  }

  async getPaChatMessageTexts() {
    return this.paChatMessages.locator('.pa-chat-msg, .message-bubble').allTextContents();
  }

  // ---------------------------------------------------------------------------
  // DASHBOARD SETTINGS DIALOG
  // ---------------------------------------------------------------------------

  get settingsDialog() {
    return this.page.locator('#dash-settings-dialog');
  }

  async openSettings() {
    await this.settingsButton.click();
    await this.settingsDialog.waitFor({ state: 'visible' });
  }

  async closeSettings() {
    await this.page.locator('#dash-settings-close').click();
  }

  async cancelSettings() {
    await this.page.locator('#dash-settings-cancel').click();
  }

  async saveSettings() {
    await this.page.locator('#dash-settings-save').click();
  }

  // Settings controls
  get pillSizeSlider() {
    return this.page.locator('#ds-pill-size');
  }

  get pillGapSlider() {
    return this.page.locator('#ds-pill-gap');
  }

  get borderWidthSlider() {
    return this.page.locator('#ds-border-width');
  }

  get taskDotsSlider() {
    return this.page.locator('#ds-task-dots');
  }

  get showChartCheckbox() {
    return this.page.locator('#ds-show-chart');
  }

  get showWorldCheckbox() {
    return this.page.locator('#ds-show-world');
  }

  get showTaskHeatmapCheckbox() {
    return this.page.locator('#ds-show-tasks');
  }

  get showInstanceHeatmapCheckbox() {
    return this.page.locator('#ds-show-instances');
  }

  get showPmStatusCheckbox() {
    return this.page.locator('#ds-show-pm');
  }

  get heatmapsSideBySideCheckbox() {
    return this.page.locator('#ds-hm-sbs');
  }

  get openrouterKeyInput() {
    return this.page.locator('#ds-openrouter-key');
  }

  // Live value displays
  get pillSizeValue() {
    return this.page.locator('#ds-pill-val');
  }

  get pillGapValue() {
    return this.page.locator('#ds-gap-val');
  }

  get borderWidthValue() {
    return this.page.locator('#ds-border-val');
  }

  get taskDotsValue() {
    return this.page.locator('#ds-dots-val');
  }

  async setSliderValue(slider, value) {
    await slider.fill(String(value));
    await slider.dispatchEvent('input');
  }

  // ---------------------------------------------------------------------------
  // ASSERTIONS
  // ---------------------------------------------------------------------------

  async expectHeatmapSections(count) {
    const visible = await this.heatmapsContainer.locator('.heatmap-section').count();
    if (visible !== count) {
      throw new Error(`Expected ${count} heatmap sections, got ${visible}`);
    }
  }

  async expectProjectPillCount(n) {
    const count = await this.getProjectPillCount();
    if (count !== n) {
      throw new Error(`Expected ${n} project pills, got ${count}`);
    }
  }

  async expectInstancePillCount(n) {
    const count = await this.getInstancePillCount();
    if (count !== n) {
      throw new Error(`Expected ${n} instance pills, got ${count}`);
    }
  }

  async expectTaskRowCount(n) {
    const count = await this.taskRows.count();
    if (count !== n) {
      throw new Error(`Expected ${n} task rows, got ${count}`);
    }
  }

  async expectDashboardLoaded() {
    await this.dashHeader.waitFor({ state: 'visible' });
    await this.dashLayout.waitFor({ state: 'visible' });
  }
}

module.exports = { DashboardPage };
