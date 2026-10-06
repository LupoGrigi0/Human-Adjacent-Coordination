/**
 * Project Detail Panel Page Object
 *
 * Covers the project detail view that replaces the project grid when a
 * project card is clicked. Rendered dynamically by projects.js into
 * #project-detail-view with class project-detail-panel.
 *
 * Includes: header (name, status, priority, settings gear), team section,
 * PM chat, collapsible task sections with inline editing, documents sidebar,
 * and assign-instance modal.
 *
 * @module page-objects/ProjectDetailPanel
 */

class ProjectDetailPanel {
  constructor(page) {
    this.page = page;
  }

  // ---------------------------------------------------------------------------
  // PANEL CONTAINER
  // ---------------------------------------------------------------------------

  get detailView() {
    return this.page.locator('#project-detail-view');
  }

  async isVisible() {
    const display = await this.detailView.evaluate(el => getComputedStyle(el).display);
    return display !== 'none';
  }

  async waitForLoaded() {
    await this.page.waitForFunction(
      () => {
        const dv = document.getElementById('project-detail-view');
        return dv && dv.style.display !== 'none' && !dv.querySelector('.loading-placeholder');
      },
      { timeout: 15000 }
    );
  }

  // ---------------------------------------------------------------------------
  // BACK BUTTON
  // ---------------------------------------------------------------------------

  get backButton() {
    return this.detailView.locator('.back-btn');
  }

  async goBack() {
    await this.backButton.click();
  }

  // ---------------------------------------------------------------------------
  // HEADER
  // ---------------------------------------------------------------------------

  get projectName() {
    return this.detailView.locator('.pd-project-name');
  }

  get statusBadge() {
    return this.detailView.locator('.project-detail-header-title .status-badge').first();
  }

  get priorityBadge() {
    return this.detailView.locator('.project-detail-header-title .status-badge').nth(1);
  }

  get settingsButton() {
    return this.detailView.locator('.pd-settings-btn');
  }

  async getName() {
    return (await this.projectName.textContent()).trim();
  }

  async getStatus() {
    return (await this.statusBadge.textContent()).trim();
  }

  async getPriority() {
    return (await this.priorityBadge.textContent()).trim();
  }

  async clickProjectName() {
    await this.projectName.click();
  }

  async clickStatusBadge() {
    await this.statusBadge.click();
  }

  async clickPriorityBadge() {
    await this.priorityBadge.click();
  }

  // ---------------------------------------------------------------------------
  // DROPDOWNS (status, priority)
  // ---------------------------------------------------------------------------

  get dropdown() {
    return this.page.locator('.pd-dropdown');
  }

  get dropdownItems() {
    return this.page.locator('.pd-dropdown .pd-dropdown-item');
  }

  async selectDropdownItem(value) {
    await this.page.locator(`.pd-dropdown .pd-dropdown-item[data-value="${value}"]`).click();
  }

  async isDropdownVisible() {
    return (await this.dropdown.count()) > 0;
  }

  // ---------------------------------------------------------------------------
  // PM SECTION (header meta area)
  // ---------------------------------------------------------------------------

  get headerMeta() {
    return this.detailView.locator('.project-detail-header-meta');
  }

  get pmBadge() {
    return this.detailView.locator('.pd-pm-badge');
  }

  get pmOnlineDot() {
    return this.detailView.locator('.pd-pm-online-dot, .online-dot');
  }

  async getPMName() {
    const badge = this.pmBadge;
    if ((await badge.count()) === 0) return null;
    return (await badge.textContent()).trim();
  }

  // ---------------------------------------------------------------------------
  // TEAM SECTION
  // ---------------------------------------------------------------------------

  get teamAvatars() {
    return this.detailView.locator('.pd-team-avatar');
  }

  get addTeamMemberButton() {
    return this.detailView.locator('.pd-add-member');
  }

  async getTeamMemberCount() {
    return this.teamAvatars.count();
  }

  async clickAddTeamMember() {
    await this.addTeamMemberButton.click();
  }

  async clickTeamMember(index) {
    await this.teamAvatars.nth(index).click();
  }

  // ---------------------------------------------------------------------------
  // ASSIGN INSTANCE MODAL
  // ---------------------------------------------------------------------------

  get assignModal() {
    return this.page.locator('#assign-instance-modal');
  }

  get assignInstanceList() {
    return this.page.locator('#instance-select-list');
  }

  async isAssignModalOpen() {
    return this.assignModal.evaluate(el => el.classList.contains('active'));
  }

  async closeAssignModal() {
    await this.assignModal.locator('[data-close]').first().click();
  }

  async selectAssignInstance(instanceId) {
    await this.assignInstanceList
      .locator(`.instance-select-item[data-instance-id="${instanceId}"]`)
      .click();
  }

  // ---------------------------------------------------------------------------
  // COLLAPSIBLE SECTIONS (tasks, vision, etc.)
  // ---------------------------------------------------------------------------

  getSectionHeader(sectionName) {
    return this.detailView.locator(`.pd-section-head[data-section="${sectionName}"]`);
  }

  getSectionBody(sectionName) {
    return this.detailView.locator(`.pd-section-body[data-section="${sectionName}"]`);
  }

  async toggleSection(sectionName) {
    await this.getSectionHeader(sectionName).click();
  }

  async isSectionExpanded(sectionName) {
    const body = this.getSectionBody(sectionName);
    const display = await body.evaluate(el => getComputedStyle(el).display);
    return display !== 'none';
  }

  // ---------------------------------------------------------------------------
  // TASKS
  // ---------------------------------------------------------------------------

  get taskListHeaders() {
    return this.detailView.locator('.pd-task-list-head');
  }

  get taskRows() {
    return this.detailView.locator('.pd-task-row');
  }

  get addTaskButton() {
    return this.detailView.locator('.pd-add-task-btn');
  }

  async getTaskCount() {
    return this.taskRows.count();
  }

  async getTaskRowTexts() {
    return this.detailView.locator('.pd-task-title').allTextContents();
  }

  async clickTaskRow(taskId) {
    await this.detailView.locator(`.pd-task-row[data-task-id="${taskId}"]`).click();
  }

  async toggleTaskList(listId) {
    await this.detailView.locator(`.pd-task-list-head[data-list-id="${listId}"]`).click();
  }

  async toggleShowCompleted(listId) {
    await this.detailView.locator(`.pd-toggle-completed[data-list-id="${listId}"]`).click();
  }

  // Expanded task inline detail
  get expandedTaskDetail() {
    return this.detailView.locator('.pd-task-expanded');
  }

  async isTaskExpanded(taskId) {
    return (await this.detailView.locator(`.pd-task-expanded[data-task-id="${taskId}"]`).count()) > 0;
  }

  // Task status/priority click (triggers dropdown)
  async clickTaskStatusBadge(taskId) {
    await this.detailView
      .locator(`.pd-task-row[data-task-id="${taskId}"] .pd-task-status`)
      .click();
  }

  async clickTaskPriorityBadge(taskId) {
    await this.detailView
      .locator(`.pd-task-row[data-task-id="${taskId}"] .pd-task-priority`)
      .click();
  }

  // Task assignee click (triggers instance selector)
  async clickTaskAssignee(taskId) {
    await this.detailView
      .locator(`.pd-task-row[data-task-id="${taskId}"] .pd-task-assignee`)
      .click();
  }

  // ---------------------------------------------------------------------------
  // DOCUMENTS SIDEBAR
  // ---------------------------------------------------------------------------

  get documentsSidebar() {
    return this.detailView.locator('.project-detail-sidebar');
  }

  get documentRows() {
    return this.detailView.locator('.pd-doc-row');
  }

  get vitalDocRows() {
    return this.detailView.locator('.pd-doc-row.vital');
  }

  async getDocumentCount() {
    return this.documentRows.count();
  }

  async getDocumentNames() {
    return this.detailView.locator('.pd-doc-name').allTextContents();
  }

  async clickDocument(docName) {
    await this.detailView.locator('.pd-doc-row', { hasText: docName }).click();
  }

  async getVitalDocumentNames() {
    return this.vitalDocRows.locator('.pd-doc-name').allTextContents();
  }

  // ---------------------------------------------------------------------------
  // PM CHAT (bottom of project detail)
  // ---------------------------------------------------------------------------

  get pmChatContainer() {
    return this.detailView.locator('.pd-chat-container');
  }

  get pmChatMessages() {
    return this.detailView.locator('.pd-chat-msgs');
  }

  get pmChatInput() {
    return this.detailView.locator('.pd-chat-input input, .pd-chat-input textarea');
  }

  get pmChatSendButton() {
    return this.detailView.locator('.pd-chat-send');
  }

  async sendPmChatMessage(text) {
    await this.pmChatInput.fill(text);
    await this.pmChatSendButton.click();
  }

  // ---------------------------------------------------------------------------
  // VISION DOCUMENT
  // ---------------------------------------------------------------------------

  get visionContent() {
    return this.detailView.locator('.pd-vision-content');
  }

  async getVisionText() {
    const content = this.visionContent;
    if ((await content.count()) === 0) return null;
    return content.textContent();
  }

  // ---------------------------------------------------------------------------
  // SETTINGS (gear opens project settings dialog)
  // ---------------------------------------------------------------------------

  async openSettings() {
    await this.settingsButton.click();
  }

  // ---------------------------------------------------------------------------
  // ASSERTIONS
  // ---------------------------------------------------------------------------

  async expectVisible() {
    const visible = await this.isVisible();
    if (!visible) {
      throw new Error('Expected project detail panel to be visible');
    }
  }

  async expectHidden() {
    const visible = await this.isVisible();
    if (visible) {
      throw new Error('Expected project detail panel to be hidden');
    }
  }

  async expectName(name) {
    const actual = await this.getName();
    if (actual !== name) {
      throw new Error(`Expected project name "${name}" but got "${actual}"`);
    }
  }

  async expectStatus(status) {
    const actual = await this.getStatus();
    if (actual !== status) {
      throw new Error(`Expected status "${status}" but got "${actual}"`);
    }
  }

  async expectTaskCount(n) {
    const count = await this.getTaskCount();
    if (count !== n) {
      throw new Error(`Expected ${n} tasks, got ${count}`);
    }
  }

  async expectDocumentCount(n) {
    const count = await this.getDocumentCount();
    if (count !== n) {
      throw new Error(`Expected ${n} documents, got ${count}`);
    }
  }
}

module.exports = { ProjectDetailPanel };
