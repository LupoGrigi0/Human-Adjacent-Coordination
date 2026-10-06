/**
 * Messages Page Object
 *
 * Covers the Messages tab: conversation sidebar (inbox, DMs, projects,
 * roles, system), chat panel with message bubbles, compose area,
 * message detail view, and reply quoting.
 *
 * @module page-objects/MessagesPage
 */

class MessagesPage {
  constructor(page) {
    this.page = page;
  }

  // ---------------------------------------------------------------------------
  // NAVIGATION
  // ---------------------------------------------------------------------------

  get tabContent() {
    return this.page.locator('#tab-messages');
  }

  async navigate() {
    const { CommonComponents } = require('./CommonComponents');
    const common = new CommonComponents(this.page);
    await common.navigateTo('messages');
    await this.tabContent.waitFor({ state: 'visible' });
  }

  async isActive() {
    return this.tabContent.evaluate(el => el.classList.contains('active'));
  }

  // ---------------------------------------------------------------------------
  // CONVERSATIONS SIDEBAR
  // ---------------------------------------------------------------------------

  get conversationsPanel() {
    return this.tabContent.locator('.conversations-panel');
  }

  get panelTitle() {
    return this.conversationsPanel.locator('.panel-header h2');
  }

  get refreshButton() {
    return this.page.locator('#refresh-messages-btn');
  }

  get conversationList() {
    return this.page.locator('#conversation-list');
  }

  get conversationItems() {
    return this.conversationList.locator('.conversation-item');
  }

  get activeConversationItem() {
    return this.conversationList.locator('.conversation-item.active');
  }

  // --- Sections ---

  get inboxSection() {
    return this.conversationList.locator('#inbox-section');
  }

  get dmSection() {
    return this.conversationList.locator('#dm-section');
  }

  get projectSection() {
    return this.conversationList.locator('#project-section');
  }

  get roleSection() {
    return this.conversationList.locator('#role-section');
  }

  get systemSection() {
    return this.conversationList.locator('#system-section');
  }

  // --- Section headers ---

  getSectionHeader(sectionId) {
    return this.conversationList.locator(`#${sectionId} .section-header`);
  }

  // --- Specific items ---

  get inboxItem() {
    return this.conversationList.locator('.conversation-item[data-type="inbox"]');
  }

  getDmItem(name) {
    return this.conversationList.locator(`.conversation-item[data-type="dm"][data-id="${name}"]`);
  }

  getProjectItem(projectId) {
    return this.conversationList.locator(`.conversation-item[data-type="project"][data-id="${projectId}"]`);
  }

  getRoleItem(role) {
    return this.conversationList.locator(`.conversation-item[data-type="role"][data-id="${role}"]`);
  }

  get announcementsItem() {
    return this.conversationList.locator('.conversation-item[data-type="announcements"]');
  }

  get dmItems() {
    return this.conversationList.locator('.conversation-item[data-type="dm"]');
  }

  get projectItems() {
    return this.conversationList.locator('.conversation-item[data-type="project"]');
  }

  get roleItems() {
    return this.conversationList.locator('.conversation-item[data-type="role"]');
  }

  async getDmNames() {
    const items = this.dmItems;
    const count = await items.count();
    const names = [];
    for (let i = 0; i < count; i++) {
      const name = await items.nth(i).locator('.conversation-name').textContent();
      names.push(name.trim());
    }
    return names;
  }

  async getProjectRoomNames() {
    return this.projectItems.locator('.conversation-name').allTextContents();
  }

  async getRoleChannelNames() {
    return this.roleItems.locator('.conversation-name').allTextContents();
  }

  async selectConversation(type, id) {
    const item = this.conversationList.locator(`.conversation-item[data-type="${type}"][data-id="${id}"]`);
    await item.click();
  }

  async selectInbox() {
    await this.inboxItem.click();
  }

  async selectDM(name) {
    await this.getDmItem(name).click();
  }

  async selectProjectRoom(projectId) {
    await this.getProjectItem(projectId).click();
  }

  async selectRoleChannel(roleName) {
    await this.getRoleItem(roleName.toLowerCase()).click();
  }

  async selectAnnouncements() {
    await this.announcementsItem.click();
  }

  async getActiveConversation() {
    const active = this.activeConversationItem;
    if ((await active.count()) === 0) return null;
    return {
      type: await active.getAttribute('data-type'),
      id: await active.getAttribute('data-id'),
    };
  }

  async isConversationActive(type, id) {
    const item = this.conversationList.locator(
      `.conversation-item[data-type="${type}"][data-id="${id}"]`
    );
    return item.evaluate(el => el.classList.contains('active'));
  }

  // ---------------------------------------------------------------------------
  // CHAT HEADER
  // ---------------------------------------------------------------------------

  get chatPanel() {
    return this.tabContent.locator('.chat-panel');
  }

  get chatHeader() {
    return this.page.locator('#chat-header');
  }

  get recipientName() {
    return this.chatPanel.locator('.recipient-name');
  }

  get recipientStatus() {
    return this.chatPanel.locator('.recipient-status');
  }

  get recipientIcon() {
    return this.chatPanel.locator('.recipient-icon');
  }

  get chatInfoButton() {
    return this.page.locator('#chat-info-btn');
  }

  async getRecipientName() {
    return this.recipientName.textContent();
  }

  async getRecipientStatus() {
    return this.recipientStatus.textContent();
  }

  // ---------------------------------------------------------------------------
  // CHAT MESSAGES
  // ---------------------------------------------------------------------------

  get chatMessages() {
    return this.page.locator('#chat-messages');
  }

  get messageBubbles() {
    return this.chatMessages.locator('.message-bubble');
  }

  get sentMessages() {
    return this.chatMessages.locator('.message-bubble.sent');
  }

  get receivedMessages() {
    return this.chatMessages.locator('.message-bubble.received');
  }

  get inboxMessages() {
    return this.chatMessages.locator('.message-bubble.inbox-message');
  }

  get emptyState() {
    return this.chatMessages.locator('.empty-state');
  }

  async getMessageCount() {
    return this.messageBubbles.count();
  }

  async getSentMessageCount() {
    return this.sentMessages.count();
  }

  async getReceivedMessageCount() {
    return this.receivedMessages.count();
  }

  async getMessageTexts() {
    const bubbles = this.messageBubbles;
    const count = await bubbles.count();
    const texts = [];
    for (let i = 0; i < count; i++) {
      texts.push(await bubbles.nth(i).textContent());
    }
    return texts;
  }

  async getLastMessageText() {
    const count = await this.messageBubbles.count();
    if (count === 0) return null;
    return this.messageBubbles.nth(count - 1).textContent();
  }

  async isEmptyState() {
    return (await this.emptyState.count()) > 0;
  }

  // ---------------------------------------------------------------------------
  // MESSAGE DETAIL VIEW (inbox click-through)
  // ---------------------------------------------------------------------------

  get messageDetailView() {
    return this.chatMessages.locator('.message-detail-view');
  }

  get messageDetailFrom() {
    return this.chatMessages.locator('.message-detail-from .detail-value');
  }

  get messageDetailSubject() {
    return this.chatMessages.locator('.message-detail-subject .detail-value');
  }

  get messageDetailBody() {
    return this.chatMessages.locator('.message-detail-body');
  }

  get messageDetailReplyButton() {
    return this.chatMessages.locator('.message-detail-actions .btn-primary');
  }

  get backToInboxButton() {
    return this.chatMessages.locator('.btn-back');
  }

  async isMessageDetailVisible() {
    return (await this.messageDetailView.count()) > 0;
  }

  async clickInboxMessage(index) {
    await this.inboxMessages.nth(index).click();
  }

  async clickReplyFromDetail() {
    await this.messageDetailReplyButton.click();
  }

  async goBackToInbox() {
    await this.backToInboxButton.click();
  }

  async getMessageDetailFromText() {
    return this.messageDetailFrom.textContent();
  }

  async getMessageDetailSubjectText() {
    return this.messageDetailSubject.textContent();
  }

  async getMessageDetailBodyText() {
    return this.messageDetailBody.textContent();
  }

  // ---------------------------------------------------------------------------
  // REPLY QUOTE
  // ---------------------------------------------------------------------------

  get replyQuote() {
    return this.chatMessages.locator('.reply-quote');
  }

  get replyQuoteText() {
    return this.chatMessages.locator('.reply-quote-text');
  }

  get dismissQuoteButton() {
    return this.chatMessages.locator('.btn-dismiss-quote');
  }

  async isReplyQuoteVisible() {
    return (await this.replyQuote.count()) > 0;
  }

  async getReplyQuoteText() {
    return this.replyQuoteText.textContent();
  }

  async dismissReplyQuote() {
    await this.dismissQuoteButton.click();
  }

  // ---------------------------------------------------------------------------
  // COMPOSE AREA
  // ---------------------------------------------------------------------------

  get chatInputArea() {
    return this.page.locator('#chat-input-area');
  }

  get subjectInput() {
    return this.page.locator('#message-subject');
  }

  get messageInput() {
    return this.page.locator('#message-input');
  }

  get sendButton() {
    return this.page.locator('#send-btn');
  }

  async isInputAreaVisible() {
    const display = await this.chatInputArea.evaluate(el => getComputedStyle(el).display);
    return display !== 'none';
  }

  async isSendButtonDisabled() {
    return this.sendButton.isDisabled();
  }

  async isSendButtonEnabled() {
    return !(await this.sendButton.isDisabled());
  }

  async composeMessage(body, subject = '') {
    if (subject) {
      await this.subjectInput.fill(subject);
    }
    await this.messageInput.fill(body);
  }

  async sendMessage(body, subject = '') {
    await this.composeMessage(body, subject);
    await this.sendButton.click();
  }

  async clearMessageInput() {
    await this.messageInput.fill('');
  }

  async clearSubjectInput() {
    await this.subjectInput.fill('');
  }

  async refreshMessages() {
    await this.refreshButton.click();
  }

  // ---------------------------------------------------------------------------
  // UNREAD BADGE
  // ---------------------------------------------------------------------------

  get unreadBadge() {
    return this.page.locator('#unread-count');
  }

  async getUnreadCount() {
    const visible = await this.unreadBadge.evaluate(
      el => getComputedStyle(el).display !== 'none'
    );
    if (!visible) return 0;
    const text = await this.unreadBadge.textContent();
    return parseInt(text, 10) || 0;
  }

  async isUnreadBadgeVisible() {
    return this.unreadBadge.evaluate(el => getComputedStyle(el).display !== 'none');
  }

  // ---------------------------------------------------------------------------
  // LOADING STATE
  // ---------------------------------------------------------------------------

  async waitForConversationsLoaded() {
    await this.page.waitForFunction(
      () => {
        const list = document.getElementById('conversation-list');
        return list && !list.querySelector('.loading-placeholder');
      },
      { timeout: 10000 }
    );
  }

  async waitForMessagesLoaded() {
    await this.page.waitForFunction(
      () => {
        const msgs = document.getElementById('chat-messages');
        return msgs && !msgs.querySelector('.loading-placeholder');
      },
      { timeout: 10000 }
    );
  }

  // ---------------------------------------------------------------------------
  // ASSERTIONS
  // ---------------------------------------------------------------------------

  async expectConversationSelected(type, id) {
    const active = await this.isConversationActive(type, id);
    if (!active) {
      throw new Error(`Expected conversation ${type}:${id} to be active`);
    }
  }

  async expectRecipientName(name) {
    const actual = await this.getRecipientName();
    if (actual.trim() !== name) {
      throw new Error(`Expected recipient "${name}" but got "${actual.trim()}"`);
    }
  }

  async expectMessageCount(n) {
    const count = await this.getMessageCount();
    if (count !== n) {
      throw new Error(`Expected ${n} messages, got ${count}`);
    }
  }

  async expectInputAreaVisible() {
    const visible = await this.isInputAreaVisible();
    if (!visible) {
      throw new Error('Expected compose area to be visible');
    }
  }

  async expectInputAreaHidden() {
    const visible = await this.isInputAreaVisible();
    if (visible) {
      throw new Error('Expected compose area to be hidden (inbox mode)');
    }
  }

  async expectEmptyState() {
    const empty = await this.isEmptyState();
    if (!empty) {
      throw new Error('Expected empty state in chat messages');
    }
  }
}

module.exports = { MessagesPage };
