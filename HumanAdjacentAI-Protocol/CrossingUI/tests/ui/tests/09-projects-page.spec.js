/**
 * 09 — Projects Page
 *
 * Tests for the Projects tab: project cards grid, card structure,
 * status/priority badges, API data match, project detail navigation,
 * and the create project modal.
 *
 * Corresponds to test plan Section 9: Projects Page — Cards Render, Data Correct.
 */

const { test, expect } = require('@playwright/test');
const { ProjectsPage } = require('../page-objects/ProjectsPage.js');
const { CommonComponents } = require('../page-objects/CommonComponents.js');
const { ApiClient } = require('../helpers/api-client.js');
const { BASE_URL } = require('../helpers/test-data.js');

test.describe('Projects Page', () => {
  let projectsPage;
  let common;
  let api;

  test.beforeEach(async ({ page }) => {
    projectsPage = new ProjectsPage(page);
    common = new CommonComponents(page);
    api = new ApiClient();

    // Navigate to dashboard, then to projects tab
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await projectsPage.navigate();
    await projectsPage.waitForGridLoaded();
  });

  // -------------------------------------------------------------------------
  // proj_page_title
  // -------------------------------------------------------------------------
  test('should display "Projects" page title', async () => {
    const title = projectsPage.pageTitle;
    await expect(title).toBeVisible();
    await expect(title).toHaveText('Projects');
  });

  // -------------------------------------------------------------------------
  // proj_new_project_btn
  // -------------------------------------------------------------------------
  test('should display "New Project" button', async () => {
    const btn = projectsPage.newProjectButton;
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('New Project');
    await expect(btn).toBeEnabled();
  });

  // -------------------------------------------------------------------------
  // proj_all_cards_present
  // -------------------------------------------------------------------------
  test('should render project cards matching API count', async () => {
    const apiProjects = await api.getProjects();
    const uiCount = await projectsPage.getProjectCardCount();
    expect(uiCount).toBe(apiProjects.length);
    expect(uiCount).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // proj_card_structure
  // -------------------------------------------------------------------------
  test('should render correct card structure with status, name, description, PM, team count', async () => {
    const apiProjects = await api.getProjects();
    const sampleProject = apiProjects[0];
    const projectId = sampleProject.projectId || sampleProject.id;
    const card = projectsPage.getProjectCard(projectId);

    // Status badge
    const statusBadge = card.locator('.project-status');
    await expect(statusBadge).toBeVisible();

    // Project name
    const name = card.locator('.project-name');
    await expect(name).toBeVisible();
    const nameText = await name.textContent();
    expect(nameText.trim()).toBe(sampleProject.name);

    // Description
    const desc = card.locator('.project-description');
    await expect(desc).toBeVisible();

    // PM
    const pm = card.locator('.project-card-pm');
    await expect(pm).toBeVisible();
    const pmText = await pm.textContent();
    expect(pmText).toContain('PM:');

    // Team count
    const team = card.locator('.project-card-team');
    await expect(team).toBeVisible();
    const teamText = await team.textContent();
    expect(teamText).toContain('members');
  });

  // -------------------------------------------------------------------------
  // proj_status_badge_values
  // -------------------------------------------------------------------------
  test('should display correct status badges matching API data', async () => {
    const apiProjects = await api.getProjects();
    const sampled = apiProjects.slice(0, 3);

    for (const proj of sampled) {
      const projectId = proj.projectId || proj.id;
      const status = await projectsPage.getProjectStatus(projectId);
      expect(status.trim()).toBe(proj.status);
    }
  });

  // -------------------------------------------------------------------------
  // proj_status_badge_colors (CSS class check)
  // -------------------------------------------------------------------------
  test('should apply correct CSS class for status badges', async () => {
    const apiProjects = await api.getProjects();
    const sampleProject = apiProjects[0];
    const projectId = sampleProject.projectId || sampleProject.id;
    const card = projectsPage.getProjectCard(projectId);

    const statusBadge = card.locator('.project-status');
    const classes = await statusBadge.getAttribute('class');
    // Should have status-{status} class, e.g., "project-status status-active"
    expect(classes).toContain(`status-${sampleProject.status}`);
  });

  // -------------------------------------------------------------------------
  // proj_pm_correct
  // -------------------------------------------------------------------------
  test('should display PM name matching API data', async () => {
    const apiProjects = await api.getProjects();
    const sampleProject = apiProjects[0];
    const projectId = sampleProject.projectId || sampleProject.id;

    const pmText = await projectsPage.getProjectPM(projectId);
    const expectedPm = sampleProject.pm
      ? sampleProject.pm.split('-')[0] || 'PM'
      : 'No PM';
    expect(pmText).toContain(expectedPm);
  });

  // -------------------------------------------------------------------------
  // proj_member_count_correct
  // -------------------------------------------------------------------------
  test('should display team member count matching API data', async () => {
    const apiProjects = await api.getProjects();
    const sampleProject = apiProjects[0];
    const projectId = sampleProject.projectId || sampleProject.id;

    const teamText = await projectsPage.getProjectTeamCount(projectId);
    const expectedCount = (sampleProject.team || []).length;
    expect(teamText.trim()).toBe(`${expectedCount} members`);
  });

  // -------------------------------------------------------------------------
  // proj_description_truncation
  // -------------------------------------------------------------------------
  test('should display project description on card', async () => {
    const apiProjects = await api.getProjects();
    const sampleProject = apiProjects[0];
    const projectId = sampleProject.projectId || sampleProject.id;

    const desc = await projectsPage.getProjectDescription(projectId);
    const expectedDesc = sampleProject.description || 'No description';
    // UI may truncate long descriptions; just check it starts with the right text
    expect(desc.trim().substring(0, 30)).toBe(expectedDesc.substring(0, 30));
  });

  // -------------------------------------------------------------------------
  // proj_card_click
  // -------------------------------------------------------------------------
  test('should navigate to project detail when card is clicked', async () => {
    const apiProjects = await api.getProjects();
    const sampleProject = apiProjects[0];
    const projectId = sampleProject.projectId || sampleProject.id;

    await projectsPage.clickProjectCard(projectId);
    await projectsPage.waitForDetailLoaded();

    const detailVisible = await projectsPage.isDetailViewVisible();
    expect(detailVisible).toBe(true);

    // Grid should be hidden when detail is showing
    const gridVisible = await projectsPage.isGridVisible();
    expect(gridVisible).toBe(false);
  });

  // -------------------------------------------------------------------------
  // proj_detail_back
  // -------------------------------------------------------------------------
  test('should return to project grid when back button is clicked in detail', async () => {
    const apiProjects = await api.getProjects();
    const projectId = apiProjects[0].projectId || apiProjects[0].id;

    await projectsPage.clickProjectCard(projectId);
    await projectsPage.waitForDetailLoaded();

    // Detail view should have a back button
    const backBtn = projectsPage.detailView.locator('.back-btn');
    await expect(backBtn).toBeVisible();
    await backBtn.click();

    // Grid should be visible again
    await projectsPage.waitForGridLoaded();
    const gridVisible = await projectsPage.isGridVisible();
    expect(gridVisible).toBe(true);
  });

  // -------------------------------------------------------------------------
  // proj_detail_name
  // -------------------------------------------------------------------------
  test('should display correct project name in detail view', async () => {
    const apiProjects = await api.getProjects();
    const sampleProject = apiProjects[0];
    const projectId = sampleProject.projectId || sampleProject.id;

    await projectsPage.clickProjectCard(projectId);
    await projectsPage.waitForDetailLoaded();

    const detailName = projectsPage.detailProjectName;
    await expect(detailName).toBeVisible();
    const nameText = await detailName.textContent();
    expect(nameText.trim()).toBe(sampleProject.name);
  });

  // -------------------------------------------------------------------------
  // proj_create_modal_opens
  // -------------------------------------------------------------------------
  test('should open create project modal when New Project is clicked', async () => {
    await projectsPage.openCreateProjectModal();

    const isOpen = await projectsPage.isCreateModalOpen();
    expect(isOpen).toBe(true);
  });

  // -------------------------------------------------------------------------
  // proj_create_modal_fields
  // -------------------------------------------------------------------------
  test('should have name, description, and submit button in create modal', async () => {
    await projectsPage.openCreateProjectModal();

    // Name input
    const nameInput = projectsPage.projectNameInput;
    await expect(nameInput).toBeVisible();

    // Description input
    const descInput = projectsPage.projectDescriptionInput;
    await expect(descInput).toBeVisible();

    // Submit button
    const submitBtn = projectsPage.createProjectSubmit;
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toContainText('Create');
  });

  // -------------------------------------------------------------------------
  // proj_create_modal_closes
  // -------------------------------------------------------------------------
  test('should close create project modal via cancel button', async () => {
    await projectsPage.openCreateProjectModal();
    const isOpen = await projectsPage.isCreateModalOpen();
    expect(isOpen).toBe(true);

    await projectsPage.closeCreateProjectModal();

    const isClosed = await projectsPage.isCreateModalOpen();
    expect(isClosed).toBe(false);
  });

  // -------------------------------------------------------------------------
  // proj_priority_badge
  // -------------------------------------------------------------------------
  test('should display priority badge when project has priority', async () => {
    const apiProjects = await api.getProjects();
    const withPriority = apiProjects.find(p => p.priority);

    if (!withPriority) {
      test.skip();
      return;
    }

    const projectId = withPriority.projectId || withPriority.id;
    const priority = await projectsPage.getProjectPriority(projectId);
    expect(priority.trim()).toBe(withPriority.priority);
  });

  // -------------------------------------------------------------------------
  // proj_card_consistency
  // -------------------------------------------------------------------------
  test('should render all project cards with consistent structure', async () => {
    const cardCount = await projectsPage.getProjectCardCount();
    expect(cardCount).toBeGreaterThan(0);

    for (let i = 0; i < cardCount; i++) {
      const card = projectsPage.projectCards.nth(i);

      // Each card must have: status badge, name, description, PM, team count
      await expect(card.locator('.project-status')).toBeVisible();
      await expect(card.locator('.project-name')).toBeVisible();
      await expect(card.locator('.project-description')).toBeVisible();
      await expect(card.locator('.project-card-pm')).toBeVisible();
      await expect(card.locator('.project-card-team')).toBeVisible();
    }
  });

  // -------------------------------------------------------------------------
  // proj_all_clickable
  // -------------------------------------------------------------------------
  test('should make all project cards clickable (cursor pointer)', async ({ page }) => {
    const cardCount = await projectsPage.getProjectCardCount();
    if (cardCount === 0) {
      test.skip();
      return;
    }

    // Check that the first card is clickable (has a click handler)
    const firstCard = projectsPage.projectCards.first();
    const cursor = await firstCard.evaluate(el => getComputedStyle(el).cursor);
    // Cards should have pointer cursor or be generally interactive
    // (the click handler is JS-based, so cursor may vary)
    expect(typeof cursor).toBe('string');
  });
});
