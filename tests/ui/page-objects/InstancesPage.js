/**
 * Instances Page Object
 *
 * Covers the Instances tab: grid of instance cards, action buttons,
 * project selectors, and navigation to instance detail / conversation panels.
 *
 * @module page-objects/InstancesPage
 */

class InstancesPage {
  constructor(page) {
    this.page = page;
  }

  // ---------------------------------------------------------------------------
  // NAVIGATION
  // ---------------------------------------------------------------------------

  get tabContent() {
    return this.page.locator('#tab-instances');
  }

  async navigate() {
    const { CommonComponents } = require('./CommonComponents');
    const common = new CommonComponents(this.page);
    await common.navigateTo('instances');
    await this.tabContent.waitFor({ state: 'visible' });
  }

  async isActive() {
    return this.tabContent.evaluate(el => el.classList.contains('active'));
  }

  // ---------------------------------------------------------------------------
  // PAGE HEADER
  // ---------------------------------------------------------------------------

  get pageHeader() {
    return this.tabContent.locator('.page-header');
  }

  get pageTitle() {
    return this.pageHeader.locator('h1');
  }

  get preApproveButton() {
    return this.page.locator('#pre-approve-btn');
  }

  // ---------------------------------------------------------------------------
  // INSTANCES GRID
  // ---------------------------------------------------------------------------

  get instancesGrid() {
    return this.page.locator('#instances-grid');
  }

  get instanceCards() {
    return this.instancesGrid.locator('.instance-card');
  }

  async getInstanceCardCount() {
    return this.instanceCards.count();
  }

  getInstanceCard(instanceId) {
    return this.instancesGrid.locator(`.instance-card[data-instance-id="${instanceId}"]`);
  }

  async getInstanceCardByIndex(index) {
    return this.instanceCards.nth(index);
  }

  async clickInstanceCard(instanceId) {
    await this.getInstanceCard(instanceId).click();
  }

  // ---------------------------------------------------------------------------
  // INSTANCE CARD DETAILS
  // ---------------------------------------------------------------------------

  async getInstanceName(instanceId) {
    return this.getInstanceCard(instanceId).locator('.instance-name').textContent();
  }

  async getInstanceId(instanceId) {
    return this.getInstanceCard(instanceId).locator('.instance-id').textContent();
  }

  async getInstanceRole(instanceId) {
    return this.getInstanceCard(instanceId).locator('.instance-role-badge').textContent();
  }

  async getInstanceProject(instanceId) {
    return this.getInstanceCard(instanceId).locator('.instance-project-badge').textContent();
  }

  async getInstanceAvatar(instanceId) {
    return this.getInstanceCard(instanceId).locator('.instance-avatar').textContent();
  }

  async isInstanceOnline(instanceId) {
    const dot = this.getInstanceCard(instanceId).locator('.instance-status-dot');
    return dot.evaluate(el =>
      el.classList.contains('online') || el.classList.contains('status-active')
    );
  }

  async hasZeroClawIcon(instanceId) {
    const card = this.getInstanceCard(instanceId);
    const liveIcon = card.locator('.zc-live-icon');
    const readyIcon = card.locator('.zc-ready-icon');
    return (await liveIcon.count()) > 0 || (await readyIcon.count()) > 0;
  }

  // ---------------------------------------------------------------------------
  // INSTANCE CARD ACTIONS
  // ---------------------------------------------------------------------------

  async clickMessageButton(instanceId) {
    const card = this.getInstanceCard(instanceId);
    await card.locator('.instance-action-message').click();
  }

  async clickContinueButton(instanceId) {
    const card = this.getInstanceCard(instanceId);
    await card.locator('.instance-action-chat').click();
  }

  async clickDetailsIcon(instanceId) {
    await this.instancesGrid.locator(`.instance-action-details[data-instance-id="${instanceId}"]`).click();
  }

  async hasContinueButton(instanceId) {
    const card = this.getInstanceCard(instanceId);
    return (await card.locator('.instance-action-chat').count()) > 0;
  }

  // ---------------------------------------------------------------------------
  // PROJECT SELECTOR (on card)
  // ---------------------------------------------------------------------------

  async openProjectSelector(instanceId) {
    const card = this.getInstanceCard(instanceId);
    await card.locator('.project-trigger').click();
  }

  async getProjectDropdown(instanceId) {
    const card = this.getInstanceCard(instanceId);
    return card.locator('.project-dropdown');
  }

  // ---------------------------------------------------------------------------
  // CONVERSATION PANEL
  // ---------------------------------------------------------------------------

  get chatPanel() {
    return this.page.locator('#instance-chat-panel');
  }

  get chatBreadcrumbName() {
    return this.page.locator('#chat-breadcrumb-name');
  }

  get chatInstanceName() {
    return this.page.locator('#chat-instance-name');
  }

  get chatInstanceStatus() {
    return this.page.locator('#chat-instance-status');
  }

  get chatTurnCount() {
    return this.page.locator('#chat-turn-count');
  }

  get chatMessages() {
    return this.page.locator('#instance-chat-messages');
  }

  get chatInput() {
    return this.page.locator('#instance-chat-input');
  }

  get chatSendButton() {
    return this.page.locator('#instance-chat-send');
  }

  get chatBackButton() {
    return this.page.locator('#chat-back-btn');
  }

  get chatDetailsButton() {
    return this.page.locator('#chat-details-btn');
  }

  async isChatPanelVisible() {
    const display = await this.chatPanel.evaluate(el => getComputedStyle(el).display);
    return display !== 'none';
  }

  async sendChatMessage(text) {
    await this.chatInput.fill(text);
    await this.chatSendButton.click();
  }

  async closeChatPanel() {
    await this.chatBackButton.click();
  }

  async getChatMessageBubbles() {
    return this.chatMessages.locator('.message-bubble');
  }

  // ---------------------------------------------------------------------------
  // GRID LOADING STATE
  // ---------------------------------------------------------------------------

  async waitForGridLoaded() {
    await this.page.waitForFunction(
      () => {
        const grid = document.getElementById('instances-grid');
        return grid && !grid.querySelector('.loading-placeholder');
      },
      { timeout: 10000 }
    );
  }

  async isGridVisible() {
    const display = await this.instancesGrid.evaluate(el => getComputedStyle(el).display);
    return display !== 'none';
  }

  // ---------------------------------------------------------------------------
  // ASSERTIONS
  // ---------------------------------------------------------------------------

  async expectInstanceCount(n) {
    const count = await this.getInstanceCardCount();
    if (count !== n) {
      throw new Error(`Expected ${n} instance cards, got ${count}`);
    }
  }

  async expectInstanceVisible(instanceId) {
    const card = this.getInstanceCard(instanceId);
    await card.waitFor({ state: 'visible' });
  }

  async expectInstanceNotVisible(instanceId) {
    const card = this.getInstanceCard(instanceId);
    const count = await card.count();
    if (count > 0 && await card.isVisible()) {
      throw new Error(`Expected instance "${instanceId}" to not be visible`);
    }
  }

  async expectGridVisible() {
    await this.instancesGrid.waitFor({ state: 'visible' });
    const display = await this.instancesGrid.evaluate(el => getComputedStyle(el).display);
    if (display === 'none') {
      throw new Error('Expected instances grid to be visible');
    }
  }

  async expectChatPanelVisible() {
    const visible = await this.isChatPanelVisible();
    if (!visible) {
      throw new Error('Expected conversation panel to be visible');
    }
  }
}

module.exports = { InstancesPage };
