/**
 * Projects Page Object
 *
 * Covers the Projects tab: project cards grid, create project modal,
 * and navigation to the project detail panel.
 *
 * The project detail panel itself is covered by ProjectDetailPanel.js,
 * but this page object includes the grid-level view and the create modal.
 *
 * @module page-objects/ProjectsPage
 */

class ProjectsPage {
  constructor(page) {
    this.page = page;
  }

  // ---------------------------------------------------------------------------
  // NAVIGATION
  // ---------------------------------------------------------------------------

  get tabContent() {
    return this.page.locator('#tab-projects');
  }

  async navigate() {
    const { CommonComponents } = require('./CommonComponents');
    const common = new CommonComponents(this.page);
    await common.navigateTo('projects');
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

  get newProjectButton() {
    return this.page.locator('#new-project-btn');
  }

  // ---------------------------------------------------------------------------
  // PROJECT GRID
  // ---------------------------------------------------------------------------

  get projectGrid() {
    return this.page.locator('#project-grid');
  }

  get projectCards() {
    return this.projectGrid.locator('.project-card');
  }

  async getProjectCardCount() {
    return this.projectCards.count();
  }

  getProjectCard(projectId) {
    return this.projectGrid.locator(`.project-card[data-project-id="${projectId}"]`);
  }

  async clickProjectCard(projectId) {
    await this.getProjectCard(projectId).click();
  }

  // ---------------------------------------------------------------------------
  // PROJECT CARD DETAILS
  // ---------------------------------------------------------------------------

  async getProjectName(projectId) {
    return this.getProjectCard(projectId).locator('.project-name').textContent();
  }

  async getProjectDescription(projectId) {
    return this.getProjectCard(projectId).locator('.project-description').textContent();
  }

  async getProjectStatus(projectId) {
    return this.getProjectCard(projectId).locator('.project-status').textContent();
  }

  async getProjectPriority(projectId) {
    const card = this.getProjectCard(projectId);
    const priorityEl = card.locator('.project-card-priority');
    if ((await priorityEl.count()) === 0) return null;
    return priorityEl.textContent();
  }

  async getProjectPM(projectId) {
    return this.getProjectCard(projectId).locator('.project-card-pm').textContent();
  }

  async getProjectTeamCount(projectId) {
    return this.getProjectCard(projectId).locator('.project-card-team').textContent();
  }

  async hasProjectPmStatusIcon(projectId) {
    const card = this.getProjectCard(projectId);
    return (await card.locator('.project-card-pm-status').count()) > 0;
  }

  // ---------------------------------------------------------------------------
  // FIRST CARD HELPERS (for generic tests)
  // ---------------------------------------------------------------------------

  async getFirstCardId() {
    const firstCard = this.projectCards.first();
    return firstCard.getAttribute('data-project-id');
  }

  async getFirstCardName() {
    return this.projectCards.first().locator('.project-name').textContent();
  }

  async getFirstCardStatus() {
    return this.projectCards.first().locator('.project-status').textContent();
  }

  // ---------------------------------------------------------------------------
  // PROJECT DETAIL VIEW (container only; see ProjectDetailPanel for content)
  // ---------------------------------------------------------------------------

  get detailView() {
    return this.page.locator('#project-detail-view');
  }

  async isDetailViewVisible() {
    const display = await this.detailView.evaluate(el => getComputedStyle(el).display);
    return display !== 'none';
  }

  async waitForDetailLoaded() {
    await this.page.waitForFunction(
      () => {
        const dv = document.getElementById('project-detail-view');
        return dv && dv.style.display !== 'none' && !dv.querySelector('.loading-placeholder');
      },
      { timeout: 15000 }
    );
  }

  // ---------------------------------------------------------------------------
  // CREATE PROJECT MODAL
  // ---------------------------------------------------------------------------

  get createProjectModal() {
    return this.page.locator('#create-project-modal');
  }

  get projectNameInput() {
    return this.page.locator('#project-name');
  }

  get projectDescriptionInput() {
    return this.page.locator('#project-description');
  }

  get projectGhRepoInput() {
    return this.page.locator('#project-gh-repo');
  }

  get pmPersonalitySelect() {
    return this.page.locator('#pm-personality');
  }

  get createProjectSubmit() {
    return this.page.locator('#create-project-submit');
  }

  get launchProjectButton() {
    return this.page.locator('#launch-project-btn');
  }

  async isCreateModalOpen() {
    return this.createProjectModal.evaluate(el => el.classList.contains('active'));
  }

  async openCreateProjectModal() {
    await this.newProjectButton.click();
    await this.page.waitForFunction(
      () => document.getElementById('create-project-modal')?.classList.contains('active'),
      { timeout: 5000 }
    );
  }

  async closeCreateProjectModal() {
    const closeBtn = this.createProjectModal.locator('[data-close]').first();
    await closeBtn.click();
  }

  async fillCreateProjectForm({ name, description, ghRepo, pmPersonality }) {
    if (name) await this.projectNameInput.fill(name);
    if (description) await this.projectDescriptionInput.fill(description);
    if (ghRepo) await this.projectGhRepoInput.fill(ghRepo);
    if (pmPersonality) await this.pmPersonalitySelect.selectOption(pmPersonality);
  }

  async submitCreateProject() {
    await this.createProjectSubmit.click();
  }

  // ---------------------------------------------------------------------------
  // GRID LOADING STATE
  // ---------------------------------------------------------------------------

  async waitForGridLoaded() {
    await this.page.waitForFunction(
      () => {
        const grid = document.getElementById('project-grid');
        return grid && !grid.querySelector('.loading-placeholder');
      },
      { timeout: 10000 }
    );
  }

  async isGridVisible() {
    const display = await this.projectGrid.evaluate(el => getComputedStyle(el).display);
    return display !== 'none';
  }

  // ---------------------------------------------------------------------------
  // ASSERTIONS
  // ---------------------------------------------------------------------------

  async expectProjectCount(n) {
    const count = await this.getProjectCardCount();
    if (count !== n) {
      throw new Error(`Expected ${n} project cards, got ${count}`);
    }
  }

  async expectProjectVisible(projectId) {
    const card = this.getProjectCard(projectId);
    await card.waitFor({ state: 'visible' });
  }

  async expectGridVisible() {
    await this.projectGrid.waitFor({ state: 'visible' });
    const display = await this.projectGrid.evaluate(el => getComputedStyle(el).display);
    if (display === 'none') {
      throw new Error('Expected project grid to be visible');
    }
  }

  async expectDetailVisible() {
    const visible = await this.isDetailViewVisible();
    if (!visible) {
      throw new Error('Expected project detail view to be visible');
    }
  }

  async expectDetailHidden() {
    const visible = await this.isDetailViewVisible();
    if (visible) {
      throw new Error('Expected project detail view to be hidden');
    }
  }
}

module.exports = { ProjectsPage };
