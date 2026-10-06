/**
 * Settings Page Object
 *
 * Covers the Settings tab: identity card, environment card, appearance card,
 * diary section (view/add entries), and administration actions.
 *
 * @module page-objects/SettingsPage
 */

class SettingsPage {
  constructor(page) {
    this.page = page;
  }

  // ---------------------------------------------------------------------------
  // NAVIGATION
  // ---------------------------------------------------------------------------

  get tabContent() {
    return this.page.locator('#tab-settings');
  }

  async navigate() {
    const { CommonComponents } = require('./CommonComponents');
    const common = new CommonComponents(this.page);
    await common.navigateTo('settings');
    await this.tabContent.waitFor({ state: 'visible' });
  }

  async isActive() {
    return this.tabContent.evaluate(el => el.classList.contains('active'));
  }

  // ---------------------------------------------------------------------------
  // IDENTITY CARD
  // ---------------------------------------------------------------------------

  get instanceIdInput() {
    return this.page.locator('#settings-instance-id');
  }

  get nameInput() {
    return this.page.locator('#settings-name');
  }

  get roleInput() {
    return this.page.locator('#settings-role');
  }

  async getInstanceId() {
    return this.instanceIdInput.inputValue();
  }

  async getName() {
    return this.nameInput.inputValue();
  }

  async getRole() {
    return this.roleInput.inputValue();
  }

  // ---------------------------------------------------------------------------
  // ENVIRONMENT CARD
  // ---------------------------------------------------------------------------

  get environmentSelect() {
    return this.page.locator('#settings-environment');
  }

  get endpointInput() {
    return this.page.locator('#settings-endpoint');
  }

  async getEnvironment() {
    return this.environmentSelect.inputValue();
  }

  async setEnvironment(value) {
    await this.environmentSelect.selectOption(value);
  }

  async getEndpoint() {
    return this.endpointInput.inputValue();
  }

  // ---------------------------------------------------------------------------
  // APPEARANCE CARD
  // ---------------------------------------------------------------------------

  get themeSelect() {
    return this.page.locator('#settings-theme');
  }

  async getTheme() {
    return this.themeSelect.inputValue();
  }

  async setTheme(value) {
    await this.themeSelect.selectOption(value);
  }

  // ---------------------------------------------------------------------------
  // DIARY SECTION
  // ---------------------------------------------------------------------------

  get diaryContent() {
    return this.page.locator('#diary-content');
  }

  get diaryEntryTextarea() {
    return this.page.locator('#diary-entry');
  }

  get diaryAudienceSelect() {
    return this.page.locator('#diary-audience');
  }

  get addDiaryEntryButton() {
    return this.page.locator('#add-diary-entry-btn');
  }

  get refreshDiaryButton() {
    return this.page.locator('#refresh-diary-btn');
  }

  async getDiaryText() {
    return this.diaryContent.textContent();
  }

  async isDiaryLoaded() {
    const text = await this.diaryContent.textContent();
    return !text.includes('Loading diary...');
  }

  async addDiaryEntry(text, audience = 'self') {
    await this.diaryEntryTextarea.fill(text);
    await this.diaryAudienceSelect.selectOption(audience);
    await this.addDiaryEntryButton.click();
  }

  async refreshDiary() {
    await this.refreshDiaryButton.click();
  }

  async getDiaryEntries() {
    return this.diaryContent.locator('.diary-entry').allTextContents();
  }

  async waitForDiaryLoaded() {
    await this.page.waitForFunction(
      () => {
        const content = document.getElementById('diary-content');
        return content && !content.querySelector('.loading-placeholder');
      },
      { timeout: 10000 }
    );
  }

  // ---------------------------------------------------------------------------
  // ADMINISTRATION SECTION
  // ---------------------------------------------------------------------------

  get adminActions() {
    return this.tabContent.locator('.admin-actions');
  }

  async getAdminButtons() {
    return this.adminActions.locator('button');
  }

  // ---------------------------------------------------------------------------
  // CARDS
  // ---------------------------------------------------------------------------

  get cards() {
    return this.tabContent.locator('.card');
  }

  getCardByTitle(title) {
    return this.tabContent.locator('.card', { hasText: title });
  }

  async getCardTitles() {
    return this.tabContent.locator('.card-title').allTextContents();
  }

  // ---------------------------------------------------------------------------
  // LOADING STATE
  // ---------------------------------------------------------------------------

  async waitForSettingsLoaded() {
    await this.page.waitForFunction(
      () => {
        const tab = document.getElementById('tab-settings');
        if (!tab) return false;
        const instanceId = document.getElementById('settings-instance-id');
        return instanceId && instanceId.value !== '';
      },
      { timeout: 10000 }
    );
  }

  // ---------------------------------------------------------------------------
  // ASSERTIONS
  // ---------------------------------------------------------------------------

  async expectInstanceId(id) {
    const actual = await this.getInstanceId();
    if (actual !== id) {
      throw new Error(`Expected instance ID "${id}" but got "${actual}"`);
    }
  }

  async expectName(name) {
    const actual = await this.getName();
    if (actual !== name) {
      throw new Error(`Expected name "${name}" but got "${actual}"`);
    }
  }

  async expectRole(role) {
    const actual = await this.getRole();
    if (actual !== role) {
      throw new Error(`Expected role "${role}" but got "${actual}"`);
    }
  }

  async expectEnvironment(env) {
    const actual = await this.getEnvironment();
    if (actual !== env) {
      throw new Error(`Expected environment "${env}" but got "${actual}"`);
    }
  }

  async expectTheme(theme) {
    const actual = await this.getTheme();
    if (actual !== theme) {
      throw new Error(`Expected theme "${theme}" but got "${actual}"`);
    }
  }

  async expectCardCount(n) {
    const count = await this.cards.count();
    if (count !== n) {
      throw new Error(`Expected ${n} cards, got ${count}`);
    }
  }
}

module.exports = { SettingsPage };
