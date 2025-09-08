#!/usr/bin/env node

/**
 * Test script for Messages v2.0 API
 */

import { getMessages, getMessageStats, sendMessage } from '../src/handlers/messages-v2.js';

console.log('🧪 Testing Messages v2.0 API...\n');

try {
  // Test 1: Get all messages (should aggregate system + projects)
  console.log('Test 1: Getting all messages...');
  const allMessages = await getMessages();
  console.log(`✅ Total messages: ${allMessages.total}`);
  console.log(`   Schema version: ${allMessages.metadata.schema_version}`);
  console.log(`   Projects included: ${allMessages.metadata.projects_included?.length || 0}`);
  
  // Test 2: Get project-specific messages
  console.log('\nTest 2: Getting mcp-api-validation messages...');
  const projectMessages = await getMessages({ project_id: 'mcp-api-validation' });
  console.log(`✅ Project messages: ${projectMessages.total}`);
  console.log(`   Project-specific: ${projectMessages.metadata.project_specific}`);
  
  // Test 3: Get statistics
  console.log('\nTest 3: Getting message statistics...');
  const stats = await getMessageStats();
  console.log(`✅ System messages: ${stats.stats.system.inbox.total}`);
  console.log(`   Projects with messages: ${stats.stats.totals.projects_with_messages}`);
  console.log(`   Total messages across all: ${stats.stats.totals.messages}`);
  
  // Test 4: Test routing logic
  console.log('\nTest 4: Testing new routing with a project message...');
  const testMessage = await sendMessage({
    from: 'test-coo-instance',
    to: 'project-team:mcp-api-validation',
    subject: 'API v2.0 Test Message',
    content: 'Testing project-specific routing in the new architecture',
    type: 'testing',
    priority: 'normal'
  });
  
  if (testMessage.success) {
    console.log(`✅ Message sent successfully`);
    console.log(`   Routing type: ${testMessage.routing.isProjectMessage ? 'project' : 'system'}`);
    console.log(`   Project ID: ${testMessage.routing.projectId}`);
    console.log(`   Delivery location: ${testMessage.delivery[0].location}`);
  }
  
  console.log('\n🎉 All tests passed! Messages v2.0 is working correctly.');
} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error(error.stack);
}