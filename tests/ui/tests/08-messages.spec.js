/**
 * 08 — Messages Page
 *
 * Tests for the Messages tab: sidebar structure, conversation selection,
 * compose area, send message, message display, and polling.
 *
 * Corresponds to test plan Section 8: Messages — Send, Receive, Thread Display.
 */

const { test, expect } = require('@playwright/test');
const { MessagesPage } = require('../page-objects/MessagesPage.js');
const { CommonComponents } = require('../page-objects/CommonComponents.js');
const { ApiClient } = require('../helpers/api-client.js');
const { BASE_URL, LUPO_INSTANCE_ID } = require('../helpers/test-data.js');

test.describe('Messages Page', () => {
  let messagesPage;
  let common;
  let api;

  test.beforeEach(async ({ page }) => {
    messagesPage = new MessagesPage(page);
    common = new CommonComponents(page);
    api = new ApiClient();

    // Navigate to dashboard, then to messages tab
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await messagesPage.navigate();
    await messagesPage.waitForConversationsLoaded();
  });

  // -------------------------------------------------------------------------
  // msg_page_loads
  // -------------------------------------------------------------------------
  test('should load Messages page with sidebar and chat panel', async () => {
    const active = await messagesPage.isActive();
    expect(active).toBe(true);

    // Left panel (conversations sidebar)
    const sidebar = messagesPage.conversationsPanel;
    await expect(sidebar).toBeVisible();

    // Right panel (chat area)
    const chatPanel = messagesPage.chatPanel;
    await expect(chatPanel).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // msg_page_title
  // -------------------------------------------------------------------------
  test('should display "Messages" title in sidebar header', async () => {
    const title = messagesPage.panelTitle;
    await expect(title).toBeVisible();
    await expect(title).toHaveText('Messages');
  });

  // -------------------------------------------------------------------------
  // msg_refresh_button
  // -------------------------------------------------------------------------
  test('should display refresh button in sidebar header', async () => {
    const refreshBtn = messagesPage.refreshButton;
    await expect(refreshBtn).toBeVisible();
    await expect(refreshBtn).toBeEnabled();
  });

  // -------------------------------------------------------------------------
  // msg_inbox_present
  // -------------------------------------------------------------------------
  test('should display MY INBOX section with "Messages to Me" item', async () => {
    const inboxSection = messagesPage.inboxSection;
    await expect(inboxSection).toBeVisible();

    // Section header
    const header = messagesPage.getSectionHeader('inbox-section');
    await expect(header).toContainText('MY INBOX');

    // Inbox item
    const inboxItem = messagesPage.inboxItem;
    await expect(inboxItem).toBeVisible();

    // Should contain "Messages to Me"
    const itemName = inboxItem.locator('.conversation-name');
    await expect(itemName).toHaveText('Messages to Me');
  });

  // -------------------------------------------------------------------------
  // msg_contacts_list
  // -------------------------------------------------------------------------
  test('should display DIRECT MESSAGES section with contact list', async () => {
    const dmSection = messagesPage.dmSection;
    await expect(dmSection).toBeVisible();

    const header = messagesPage.getSectionHeader('dm-section');
    await expect(header).toContainText('DIRECT MESSAGES');

    // Should have at least one DM contact
    const dmCount = await messagesPage.dmItems.count();
    expect(dmCount).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // msg_contacts_alphabetical
  // -------------------------------------------------------------------------
  test('should display DM contacts in alphabetical order', async () => {
    const names = await messagesPage.getDmNames();
    if (names.length < 2) {
      test.skip();
      return;
    }

    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  // -------------------------------------------------------------------------
  // msg_project_rooms
  // -------------------------------------------------------------------------
  test('should display PROJECTS section with project rooms', async () => {
    const projectSection = messagesPage.projectSection;
    await expect(projectSection).toBeVisible();

    const header = messagesPage.getSectionHeader('project-section');
    await expect(header).toContainText('PROJECTS');
  });

  // -------------------------------------------------------------------------
  // msg_system_section
  // -------------------------------------------------------------------------
  test('should display SYSTEM section with Announcements', async () => {
    const systemSection = messagesPage.systemSection;
    await expect(systemSection).toBeVisible();

    const announcementsItem = messagesPage.announcementsItem;
    await expect(announcementsItem).toBeVisible();

    const name = announcementsItem.locator('.conversation-name');
    await expect(name).toHaveText('Announcements');
  });

  // -------------------------------------------------------------------------
  // msg_select_placeholder
  // -------------------------------------------------------------------------
  test('should show placeholder text when no conversation is selected', async () => {
    const recipientName = messagesPage.recipientName;
    const text = await recipientName.textContent();
    expect(text.trim()).toContain('Select a conversation');
  });

  // -------------------------------------------------------------------------
  // msg_select_contact
  // -------------------------------------------------------------------------
  test('should load conversation when DM contact is clicked', async () => {
    const dmNames = await messagesPage.getDmNames();
    if (dmNames.length === 0) {
      test.skip();
      return;
    }

    const targetName = dmNames[0];
    await messagesPage.selectDM(targetName);

    // Recipient header should update
    const recipientText = await messagesPage.getRecipientName();
    expect(recipientText.trim()).toBe(targetName);

    // Chat area should have loaded (no more loading placeholder)
    await messagesPage.waitForMessagesLoaded();
  });

  // -------------------------------------------------------------------------
  // msg_compose_area_visible
  // -------------------------------------------------------------------------
  test('should show compose area when DM is selected', async () => {
    const dmNames = await messagesPage.getDmNames();
    if (dmNames.length === 0) {
      test.skip();
      return;
    }

    await messagesPage.selectDM(dmNames[0]);
    await messagesPage.waitForMessagesLoaded();

    // Input area should be visible for DMs
    const visible = await messagesPage.isInputAreaVisible();
    expect(visible).toBe(true);
  });

  // -------------------------------------------------------------------------
  // msg_compose_fields
  // -------------------------------------------------------------------------
  test('should have subject, body, and send button in compose area', async () => {
    const dmNames = await messagesPage.getDmNames();
    if (dmNames.length === 0) {
      test.skip();
      return;
    }

    await messagesPage.selectDM(dmNames[0]);
    await messagesPage.waitForMessagesLoaded();

    // Subject input
    const subject = messagesPage.subjectInput;
    await expect(subject).toBeVisible();

    // Message body textarea
    const body = messagesPage.messageInput;
    await expect(body).toBeVisible();

    // Send button
    const sendBtn = messagesPage.sendButton;
    await expect(sendBtn).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // msg_send_button_disabled_empty
  // -------------------------------------------------------------------------
  test('should have send button disabled when input is empty', async () => {
    const dmNames = await messagesPage.getDmNames();
    if (dmNames.length === 0) {
      test.skip();
      return;
    }

    await messagesPage.selectDM(dmNames[0]);
    await messagesPage.waitForMessagesLoaded();

    // Send button should be disabled with empty input
    const isDisabled = await messagesPage.isSendButtonDisabled();
    expect(isDisabled).toBe(true);
  });

  // -------------------------------------------------------------------------
  // msg_send_message
  // -------------------------------------------------------------------------
  test('should send a message and display it in the conversation', async ({ page }) => {
    const dmNames = await messagesPage.getDmNames();
    if (dmNames.length === 0) {
      test.skip();
      return;
    }

    await messagesPage.selectDM(dmNames[0]);
    await messagesPage.waitForMessagesLoaded();

    const testMessage = `[REGTEST] Test message ${Date.now()}`;
    await messagesPage.sendMessage(testMessage);

    // Message should appear in the chat area
    const sentMessages = messagesPage.sentMessages;
    await expect(sentMessages.last()).toContainText(testMessage, { timeout: 5000 });
  });

  // -------------------------------------------------------------------------
  // msg_input_clears
  // -------------------------------------------------------------------------
  test('should clear input after sending a message', async () => {
    const dmNames = await messagesPage.getDmNames();
    if (dmNames.length === 0) {
      test.skip();
      return;
    }

    await messagesPage.selectDM(dmNames[0]);
    await messagesPage.waitForMessagesLoaded();

    const testMessage = `[REGTEST] Clear test ${Date.now()}`;
    await messagesPage.sendMessage(testMessage);

    // Input should be cleared
    const inputValue = await messagesPage.messageInput.inputValue();
    expect(inputValue).toBe('');
  });

  // -------------------------------------------------------------------------
  // msg_timestamp
  // -------------------------------------------------------------------------
  test('should display timestamps on messages', async () => {
    const dmNames = await messagesPage.getDmNames();
    if (dmNames.length === 0) {
      test.skip();
      return;
    }

    // Send a message first to ensure there's at least one
    await messagesPage.selectDM(dmNames[0]);
    await messagesPage.waitForMessagesLoaded();

    const testMessage = `[REGTEST] Timestamp test ${Date.now()}`;
    await messagesPage.sendMessage(testMessage);

    // Check that message meta (timestamp) exists
    const lastBubble = messagesPage.sentMessages.last();
    const meta = lastBubble.locator('.message-meta');
    await expect(meta).toBeVisible();
    const metaText = await meta.textContent();
    // Should contain a time pattern (e.g., "3:45:12 PM")
    expect(metaText.trim().length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // msg_inbox_hides_compose
  // -------------------------------------------------------------------------
  test('should hide compose area when viewing inbox', async () => {
    await messagesPage.selectInbox();
    await messagesPage.waitForMessagesLoaded();

    // Compose area should be hidden for inbox view
    const visible = await messagesPage.isInputAreaVisible();
    expect(visible).toBe(false);
  });

  // -------------------------------------------------------------------------
  // msg_long_message
  // -------------------------------------------------------------------------
  test('should render a long message without breaking layout', async ({ page }) => {
    const dmNames = await messagesPage.getDmNames();
    if (dmNames.length === 0) {
      test.skip();
      return;
    }

    await messagesPage.selectDM(dmNames[0]);
    await messagesPage.waitForMessagesLoaded();

    // Send a 500+ character message
    const longText = `[REGTEST] ${'A'.repeat(500)} end`;
    await messagesPage.sendMessage(longText);

    // The sent bubble should be visible and contained
    const lastBubble = messagesPage.sentMessages.last();
    await expect(lastBubble).toBeVisible();

    // Check layout integrity: the chat panel should not overflow its container
    const chatPanel = messagesPage.chatPanel;
    const panelBox = await chatPanel.boundingBox();
    const bubbleBox = await lastBubble.boundingBox();

    // Bubble should be within or close to the panel bounds (allow small margin)
    expect(bubbleBox.x).toBeGreaterThanOrEqual(panelBox.x - 5);
    expect(bubbleBox.x + bubbleBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 5);
  });

  // -------------------------------------------------------------------------
  // msg_active_highlight
  // -------------------------------------------------------------------------
  test('should highlight selected conversation in sidebar', async () => {
    const dmNames = await messagesPage.getDmNames();
    if (dmNames.length === 0) {
      test.skip();
      return;
    }

    await messagesPage.selectDM(dmNames[0]);

    const isActive = await messagesPage.isConversationActive('dm', dmNames[0]);
    expect(isActive).toBe(true);
  });
});
