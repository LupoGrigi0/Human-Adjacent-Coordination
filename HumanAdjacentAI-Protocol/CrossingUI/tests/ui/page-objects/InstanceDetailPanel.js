/**
 * Instance Detail Panel Page Object
 *
 * Covers the in-page instance detail view that replaces the instances grid
 * when an instance info icon is clicked. The panel is dynamically rendered
 * by instance-detail.js using the project-detail-panel CSS pattern.
 *
 * The static HTML shell lives at #instance-detail-view, but the content is
 * fully replaced by renderInstanceDetail() which generates:
 *   - project-detail-header (name, avatar, role badge, persona badge, online dot, gear)
 *   - project-detail-header-meta (project link, task count, last active, home dir)
 *   - project-detail-body with collapsible sections (tasks, lists)
 *   - project-detail-sidebar (documents)
 *
 * @module page-objects/InstanceDetailPanel
 */

class InstanceDetailPanel {
  constructor(page) {
    this.page = page;
  }

  // ---------------------------------------------------------------------------
  // PANEL CONTAINER
  // ---------------------------------------------------------------------------

  get detailView() {
    return this.page.locator('#instance-detail-view');
  }

  async isVisible() {
    const display = await this.detailView.evaluate(el => getComputedStyle(el).display);
    return display !== 'none';
  }

  async waitForLoaded() {
    await this.page.waitForFunction(
      () => {
        const v = document.getElementById('instance-detail-view');
        return v && v.style.display !== 'none' && !v.querySelector('.loading-placeholder');
      },
      { timeout: 15000 }
    );
  }

  // ---------------------------------------------------------------------------
  // BACK BUTTON (rendered dynamically: <button class="back-btn">)
  // ---------------------------------------------------------------------------

  get backButton() {
    return this.detailView.locator('.back-btn');
  }

  async goBack() {
    await this.backButton.click();
  }

  // ---------------------------------------------------------------------------
  // HEADER (dynamically rendered by renderInstanceDetail)
  // ---------------------------------------------------------------------------

  get instanceName() {
    return this.detailView.locator('.pd-project-name');
  }

  get instanceIdSpan() {
    return this.detailView.locator('.project-detail-header-title span').first();
  }

  get roleBadge() {
    return this.detailView.locator('.status-badge').first();
  }

  get personaBadge() {
    return this.detailView.locator('.status-badge').nth(1);
  }

  get onlineDot() {
    return this.detailView.locator('.online-dot');
  }

  get settingsGearButton() {
    return this.detailView.locator('.pd-settings-btn');
  }

  async getName() {
    return (await this.instanceName.textContent()).trim();
  }

  async getInstanceId() {
    return (await this.instanceIdSpan.textContent()).trim();
  }

  async getRoleBadgeText() {
    return (await this.roleBadge.textContent()).trim();
  }

  async getPersonaBadgeText() {
    return (await this.personaBadge.textContent()).trim();
  }

  async isOnline() {
    return this.onlineDot.evaluate(el => el.classList.contains('online'));
  }

  // ---------------------------------------------------------------------------
  // HEADER META (project link, task count, last active)
  // ---------------------------------------------------------------------------

  get headerMeta() {
    return this.detailView.locator('.project-detail-header-meta');
  }

  async getProjectText() {
    const meta = this.headerMeta;
    const firstSpan = meta.locator('span').first();
    return (await firstSpan.textContent()).trim();
  }

  async getTaskCountText() {
    const spans = this.headerMeta.locator('span');
    const count = await spans.count();
    for (let i = 0; i < count; i++) {
      const text = await spans.nth(i).textContent();
      if (text.includes('/') && text.includes('task')) {
        return text.trim();
      }
    }
    return null;
  }

  async getLastActiveText() {
    const spans = this.headerMeta.locator('span');
    const count = await spans.count();
    for (let i = 0; i < count; i++) {
      const text = await spans.nth(i).textContent();
      if (text.includes('ago') || text.includes('just now') || text.includes('min') || text.includes('sec')) {
        return text.trim();
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // COLLAPSIBLE SECTIONS
  // ---------------------------------------------------------------------------

  getSection(name) {
    return this.detailView.locator(`.section-collapse[data-section="${name}"]`);
  }

  getSectionHeader(name) {
    return this.getSection(name).locator('.section-collapse-header');
  }

  getSectionBody(name) {
    return this.getSection(name).locator('.section-collapse-body');
  }

  async isSectionExpanded(name) {
    const body = this.getSectionBody(name);
    const display = await body.evaluate(el => getComputedStyle(el).display);
    return display !== 'none';
  }

  async toggleSection(name) {
    await this.getSectionHeader(name).click();
  }

  // ---------------------------------------------------------------------------
  // TASKS
  // ---------------------------------------------------------------------------

  get tasksSection() {
    return this.getSection('tasks');
  }

  get taskListHeaders() {
    return this.detailView.locator('.pd-task-list-head');
  }

  get taskRows() {
    return this.detailView.locator('.pd-task-row');
  }

  async getTaskCount() {
    return this.taskRows.count();
  }

  async getTaskRowTexts() {
    return this.detailView.locator('.pd-task-title').allTextContents();
  }

  // ---------------------------------------------------------------------------
  // LISTS (checklists)
  // ---------------------------------------------------------------------------

  get listsSection() {
    return this.getSection('lists');
  }

  get listHeaders() {
    return this.detailView.locator('.pd-list-head');
  }

  get listItems() {
    return this.detailView.locator('.pd-list-item');
  }

  async getListCount() {
    return this.listHeaders.count();
  }

  // ---------------------------------------------------------------------------
  // DOCUMENTS (sidebar)
  // ---------------------------------------------------------------------------

  get documentsSidebar() {
    return this.detailView.locator('.project-detail-sidebar');
  }

  get documentRows() {
    return this.detailView.locator('.pd-doc-row');
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

  // ---------------------------------------------------------------------------
  // PREFERENCES MODAL (gear icon opens entity-details-modal)
  // ---------------------------------------------------------------------------

  async openPreferences() {
    await this.settingsGearButton.click();
  }

  get preferencesModal() {
    return this.page.locator('#entity-details-modal');
  }

  async isPreferencesModalOpen() {
    return this.preferencesModal.evaluate(el => el.classList.contains('active'));
  }

  get preferencesJson() {
    return this.page.locator('#entity-instance-prefs');
  }

  async getPreferencesText() {
    return this.preferencesJson.textContent();
  }

  async closePreferencesModal() {
    await this.preferencesModal.locator('.modal-close').click();
  }

  // ---------------------------------------------------------------------------
  // ASSERTIONS
  // ---------------------------------------------------------------------------

  async expectVisible() {
    const visible = await this.isVisible();
    if (!visible) throw new Error('Expected instance detail panel to be visible');
  }

  async expectHidden() {
    const visible = await this.isVisible();
    if (visible) throw new Error('Expected instance detail panel to be hidden');
  }

  async expectName(name) {
    const actual = await this.getName();
    if (actual !== name) throw new Error(`Expected name "${name}" but got "${actual}"`);
  }
}

module.exports = { InstanceDetailPanel };
