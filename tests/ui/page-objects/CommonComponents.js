/**
 * Common Components Page Object
 *
 * Shared UI components: header, navigation dropdown, theme toggle,
 * connection status, modals, toasts, and the chat widget.
 *
 * @module page-objects/CommonComponents
 */

class CommonComponents {
  constructor(page) {
    this.page = page;
  }

  // ---------------------------------------------------------------------------
  // HEADER
  // ---------------------------------------------------------------------------

  get header() {
    return this.page.locator('header.header');
  }

  get logo() {
    return this.page.locator('.logo');
  }

  get userInstanceId() {
    return this.page.locator('#user-instance-id');
  }

  get userRole() {
    return this.page.locator('#user-role');
  }

  get connectionStatusDot() {
    return this.page.locator('#status-dot');
  }

  get themeToggle() {
    return this.page.locator('#theme-toggle');
  }

  get themeIcon() {
    return this.page.locator('.theme-icon');
  }

  // ---------------------------------------------------------------------------
  // NAVIGATION DROPDOWN
  // ---------------------------------------------------------------------------

  get navDropdown() {
    return this.page.locator('#nav-dropdown');
  }

  get navDropdownToggle() {
    return this.page.locator('#nav-dropdown-toggle');
  }

  get navDropdownMenu() {
    return this.page.locator('#nav-dropdown-menu');
  }

  getNavItem(tabName) {
    return this.page.locator(`.nav-dropdown-item[data-tab="${tabName}"]`);
  }

  get unreadBadge() {
    return this.page.locator('#unread-count');
  }

  async openNavDropdown() {
    await this.navDropdownToggle.click();
    await this.navDropdownMenu.waitFor({ state: 'visible' });
  }

  async navigateTo(tabName) {
    // On mobile viewports the header dropdown is hidden — use bottom nav instead
    const dropdownVisible = await this.navDropdownToggle.isVisible();
    if (dropdownVisible) {
      await this.openNavDropdown();
      await this.getNavItem(tabName).click();
    } else {
      // Mobile: dashboard, messages, projects are in bottom nav directly.
      // instances and settings are behind the "More" menu.
      const moreMenuTabs = ['instances', 'settings'];
      if (moreMenuTabs.includes(tabName)) {
        await this.page.click('#more-menu-btn');
        await this.page.waitForSelector('#more-menu.open, #more-menu.visible, #more-menu[style*="transform"]', { timeout: 3000 }).catch(() => {});
        await this.page.click(`.more-menu-item[data-tab="${tabName}"]`);
      } else {
        await this.getBottomNavItem(tabName).click();
      }
    }
  }

  async isNavDropdownOpen() {
    return this.navDropdown.evaluate(el => el.classList.contains('open'));
  }

  // ---------------------------------------------------------------------------
  // BOTTOM NAV (mobile)
  // ---------------------------------------------------------------------------

  getBottomNavItem(tabName) {
    return this.page.locator(`.bottom-nav-item[data-tab="${tabName}"]`);
  }

  // ---------------------------------------------------------------------------
  // TAB CONTENT
  // ---------------------------------------------------------------------------

  getTabContent(tabName) {
    return this.page.locator(`#tab-${tabName}`);
  }

  async getActiveTab() {
    return this.page.locator('.tab-content.active').getAttribute('id');
  }

  async expectTabActive(tabName) {
    const tab = this.getTabContent(tabName);
    await tab.waitFor({ state: 'visible' });
    const isActive = await tab.evaluate(el => el.classList.contains('active'));
    if (!isActive) {
      throw new Error(`Expected tab "${tabName}" to be active`);
    }
  }

  // ---------------------------------------------------------------------------
  // THEME
  // ---------------------------------------------------------------------------

  async toggleTheme() {
    await this.themeToggle.click();
  }

  async getCurrentTheme() {
    return this.page.locator('html').getAttribute('data-theme');
  }

  async expectTheme(theme) {
    const current = await this.getCurrentTheme();
    if (current !== theme) {
      throw new Error(`Expected theme "${theme}" but got "${current}"`);
    }
  }

  // ---------------------------------------------------------------------------
  // CONNECTION STATUS
  // ---------------------------------------------------------------------------

  async isConnected() {
    return this.connectionStatusDot.evaluate(el => el.classList.contains('connected'));
  }

  async getUserDisplayName() {
    return this.userInstanceId.textContent();
  }

  async getUserRole() {
    return this.userRole.textContent();
  }

  // ---------------------------------------------------------------------------
  // MODALS (generic)
  // ---------------------------------------------------------------------------

  getModal(modalId) {
    return this.page.locator(`#${modalId}`);
  }

  async isModalOpen(modalId) {
    return this.getModal(modalId).evaluate(el => el.classList.contains('active'));
  }

  async closeModal(modalId) {
    const modal = this.getModal(modalId);
    const closeBtn = modal.locator('.modal-close, [data-close]').first();
    await closeBtn.click();
  }

  async expectModalOpen(modalId) {
    const open = await this.isModalOpen(modalId);
    if (!open) {
      throw new Error(`Expected modal "${modalId}" to be open`);
    }
  }

  async expectModalClosed(modalId) {
    const open = await this.isModalOpen(modalId);
    if (open) {
      throw new Error(`Expected modal "${modalId}" to be closed`);
    }
  }

  // ---------------------------------------------------------------------------
  // CONFIRM MODAL
  // ---------------------------------------------------------------------------

  get confirmModal() {
    return this.page.locator('#confirm-modal');
  }

  get confirmTitle() {
    return this.page.locator('#confirm-title');
  }

  get confirmMessage() {
    return this.page.locator('#confirm-message');
  }

  async acceptConfirm() {
    await this.page.locator('#confirm-ok').click();
  }

  async cancelConfirm() {
    await this.page.locator('#confirm-cancel').click();
  }

  // ---------------------------------------------------------------------------
  // ENTITY DETAILS MODAL
  // ---------------------------------------------------------------------------

  get entityDetailsModal() {
    return this.page.locator('#entity-details-modal');
  }

  get entityDetailsTitle() {
    return this.page.locator('#entity-details-title');
  }

  async isEntityDetailsOpen() {
    return this.entityDetailsModal.evaluate(el => el.classList.contains('active'));
  }

  async closeEntityDetails() {
    await this.entityDetailsModal.locator('.modal-close').click();
  }

  // Entity sub-views
  get instanceDetailsView() {
    return this.page.locator('#instance-details-view');
  }

  get roleDetailsView() {
    return this.page.locator('#role-details-view');
  }

  get personalityDetailsView() {
    return this.page.locator('#personality-details-view');
  }

  get projectDetailsViewModal() {
    return this.page.locator('#project-details-view-modal');
  }

  // ---------------------------------------------------------------------------
  // WAKE INSTANCE MODAL
  // ---------------------------------------------------------------------------

  get wakeModal() {
    return this.page.locator('#wake-instance-modal');
  }

  get wakeNameInput() {
    return this.page.locator('#wake-name');
  }

  get wakeRoleSelect() {
    return this.page.locator('#wake-role');
  }

  get wakePersonalitySelect() {
    return this.page.locator('#wake-personality');
  }

  get wakeProjectSelect() {
    return this.page.locator('#wake-project');
  }

  get wakeInstructionsInput() {
    return this.page.locator('#wake-instructions');
  }

  get wakeSpecificIdCheckbox() {
    return this.page.locator('#wake-specific-id');
  }

  get wakeInstanceIdInput() {
    return this.page.locator('#wake-instance-id');
  }

  get wakeSubmitButton() {
    return this.page.locator('#wake-instance-submit');
  }

  async fillWakeForm({ name, role, personality, project, instructions }) {
    if (name) await this.wakeNameInput.fill(name);
    if (role) await this.wakeRoleSelect.selectOption(role);
    if (personality) await this.wakePersonalitySelect.selectOption(personality);
    if (project) await this.wakeProjectSelect.selectOption(project);
    if (instructions) await this.wakeInstructionsInput.fill(instructions);
  }

  async submitWake() {
    await this.wakeSubmitButton.click();
  }

  // ---------------------------------------------------------------------------
  // API KEY MODAL
  // ---------------------------------------------------------------------------

  get apiKeyModal() {
    return this.page.locator('#api-key-modal');
  }

  get apiKeyInput() {
    return this.page.locator('#api-key-input');
  }

  get apiKeyRemember() {
    return this.page.locator('#api-key-remember');
  }

  get apiKeySubmit() {
    return this.page.locator('#api-key-submit');
  }

  async fillApiKey(key, remember = false) {
    await this.apiKeyInput.fill(key);
    if (remember) {
      await this.apiKeyRemember.check();
    }
    await this.apiKeySubmit.click();
  }

  // ---------------------------------------------------------------------------
  // TOAST NOTIFICATIONS
  // ---------------------------------------------------------------------------

  get toast() {
    return this.page.locator('.toast');
  }

  async waitForToast(text) {
    const toast = this.page.locator('.toast', { hasText: text });
    await toast.waitFor({ state: 'visible', timeout: 5000 });
    return toast;
  }

  async getToastText() {
    return this.toast.textContent();
  }

  // ---------------------------------------------------------------------------
  // SHARED DETAIL PANEL (overlay)
  // ---------------------------------------------------------------------------

  get sharedDetailPanel() {
    return this.page.locator('#shared-detail-panel');
  }

  get detailContent() {
    return this.page.locator('#detail-content');
  }

  get detailBreadcrumbs() {
    return this.page.locator('#detail-breadcrumbs');
  }

  get detailCloseBtn() {
    return this.page.locator('#detail-close-btn');
  }

  async isSharedDetailOpen() {
    return this.sharedDetailPanel.evaluate(el => el.classList.contains('active'));
  }

  async closeSharedDetail() {
    await this.detailCloseBtn.click();
  }

  async getBreadcrumbTexts() {
    const items = this.page.locator('.breadcrumb-item');
    return items.allTextContents();
  }

  // ---------------------------------------------------------------------------
  // LOADING STATE
  // ---------------------------------------------------------------------------

  get loadingPlaceholder() {
    return this.page.locator('.loading-placeholder').first();
  }

  async waitForLoadingToDisappear(timeout = 10000) {
    await this.page.waitForFunction(
      () => document.querySelectorAll('.loading-placeholder').length === 0,
      { timeout }
    );
  }
}

module.exports = { CommonComponents };
