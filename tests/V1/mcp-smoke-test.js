#!/usr/bin/env node

/**
 * Comprehensive MCP Streamable HTTP Smoke Test
 *
 * Exercises health endpoint, bootstrap workflow, instance/message/project/task lifecycle,
 * and validates JSON-RPC result structure.
 *
 * Usage:
 *   node tests/mcp-smoke-test.js
 *   MCP_BASE_URL=https://smoothcurves.nexus/mcp MCP_SMOKE_ALLOW_INSECURE=1 node tests/mcp-smoke-test.js
 */

import { URL } from 'url';

if (process.env.MCP_SMOKE_ALLOW_INSECURE === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const base = process.env.MCP_BASE_URL || 'http://localhost:3445';
const baseUrl = base.endsWith('/mcp') ? base.slice(0, -4) : base;
const healthUrl = new URL('/health', baseUrl).toString();
const mcpUrl = new URL('/mcp', baseUrl).toString();

const now = Date.now();
const instanceId = `smoke-tester-${now}`;
const projectId = `smoke-project-${now}`;
const taskId = `smoke-task-${now}`;
const messageSubject = `Smoke Test Message ${now}`;

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`Invalid JSON from ${url}: ${error.message}\n${text}`);
  }
  return { response, body };
}

async function callTool(name, args = {}) {
  const payload = {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name,
      arguments: args,
    },
    id: Date.now(),
  };

  const { response, body } = await fetchJson(mcpUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`tools/call ${name} returned HTTP ${response.status}`);
  }

  if (body.error) {
    throw new Error(`tools/call ${name} returned JSON-RPC error: ${JSON.stringify(body.error)}`);
  }

  const result = body.result ?? {};
  if (!Array.isArray(result.content)) {
    throw new Error(`tools/call ${name} missing content array in result`);
  }

  const data = extractData(result);
  return { result, data };
}

function extractData(result) {
  if (result.data !== undefined && result.data !== null) {
    return result.data;
  }

  const textItem = result.content.find((item) => item.type === 'text');
  if (textItem && typeof textItem.text === 'string') {
    try {
      return JSON.parse(textItem.text);
    } catch {
      return textItem.text;
    }
  }

  return null;
}

function assertSuccess(name, data) {
  if (!data) {
    throw new Error(`${name} returned empty data`);
  }
  if (typeof data === 'object' && data !== null && 'success' in data && data.success === false) {
    const details = JSON.stringify(data.error || {}, null, 2);
    throw new Error(`${name} reported failure: ${details}`);
  }
}

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  console.log(`🏁 MCP smoke test targeting ${baseUrl}`);

  // 1. Health check
  const { response: healthRes, body: health } = await fetchJson(healthUrl);
  ensure(healthRes.ok, `/health responded with ${healthRes.status}`);
  ensure(health.status === 'healthy', `/health status expected 'healthy', got ${health.status}`);
  console.log('  ✅ Health check passed');

  // 2. Server status
  const statusCall = await callTool('get_server_status');
  assertSuccess('get_server_status', statusCall.data);
  console.log('  ✅ Server status retrieved');

  // 3. Available roles
  let roles = [];
  try {
    const rolesCall = await callTool('get_available_roles');
    assertSuccess('get_available_roles', rolesCall.data);
    const rolePayload = rolesCall.data?.data?.roles ?? rolesCall.data?.roles;
    if (Array.isArray(rolePayload)) {
      roles = rolePayload;
    } else if (rolePayload && typeof rolePayload === 'object') {
      roles = Object.keys(rolePayload);
    } else {
      roles = [];
    }
    console.log('  ✅ Role catalog confirmed');
  } catch (error) {
    console.warn(`  ⚠️ get_available_roles unavailable (${error.message}); skipping role check`);
    roles = [];
  }
  if (roles.length > 0) {
    ensure(roles.includes('Tester'), 'Expected Tester role to be available');
  }

  // 4. Bootstrap tester instance
  const bootstrapCall = await callTool('bootstrap', {
    role: 'Tester',
    instanceId,
  });
  assertSuccess('bootstrap', bootstrapCall.data);
  console.log(`  ✅ Bootstrapped instance ${instanceId}`);

  // 5. List instances and verify presence
  const instancesCall = await callTool('get_instances', { role: 'Tester' });
  assertSuccess('get_instances', instancesCall.data);
  const instances = instancesCall.data.instances || [];
  ensure(instances.some((i) => i.id === instanceId), 'New instance not found in get_instances response');
  console.log('  ✅ Instance registry updated');

  // 6. Fetch messages before sending
  const initialMessagesCall = await callTool('get_messages', { instanceId });
  assertSuccess('get_messages (initial)', initialMessagesCall.data);
  const initialMessages = initialMessagesCall.data.messages || [];

  // 7. Send a message to the new instance
  const sendMessageCall = await callTool('send_message', {
    to: instanceId,
    from: 'smoke-suite',
    subject: messageSubject,
    content: 'Automated smoke test validation message.',
    priority: 'normal',
  });
  assertSuccess('send_message', sendMessageCall.data);
  console.log('  ✅ Message sent to smoke tester instance');

  // 8. Verify message receipt
  const messagesCall = await callTool('get_messages', { instanceId });
  assertSuccess('get_messages', messagesCall.data);
  const messages = messagesCall.data.messages || [];
  ensure(messages.length >= initialMessages.length + 1, 'Expected new message to appear in inbox');
  ensure(
    messages.some((msg) => msg.subject === messageSubject && msg.to === instanceId),
    'Sent message not found in inbox results',
  );
  console.log('  ✅ Message retrieval confirmed');

  // 9. Create a dedicated project for task lifecycle
  const projectCall = await callTool('create_project', {
    id: projectId,
    name: `Smoke Project ${now}`,
    description: 'Temporary project created by MCP smoke test.',
    priority: 'low',
    status: 'active',
    assignee: instanceId,
  });
  assertSuccess('create_project', projectCall.data);
  console.log(`  ✅ Project ${projectId} created`);

  // 10. Verify project listing
  const projectsCall = await callTool('get_projects', { status: 'active' });
  assertSuccess('get_projects', projectsCall.data);
  const projects = projectsCall.data.projects || [];
  ensure(projects.some((project) => project.id === projectId), 'Created project not found in get_projects response');
  console.log('  ✅ Project listing includes smoke project');

  // 11. Create a task inside the project
  const taskCall = await callTool('create_task', {
    id: taskId,
    title: 'Smoke Test Task',
    description: 'Task created by MCP smoke test to validate lifecycle.',
    project_id: projectId,
    priority: 'medium',
    estimated_effort: '4h',
  });
  assertSuccess('create_task', taskCall.data);
  console.log(`  ✅ Task ${taskId} created`);

  // 12. Verify task listing
  const tasksCall = await callTool('get_tasks', { project_id: projectId });
  assertSuccess('get_tasks', tasksCall.data);
  const tasks = tasksCall.data.tasks || [];
  ensure(tasks.some((task) => task.id === taskId), 'Created task not found in get_tasks response');
  console.log('  ✅ Task listing includes smoke task');

  console.log('🎉 Comprehensive MCP smoke test completed successfully');
}

run().catch((error) => {
  console.error('❌ MCP smoke test failed:', error.message);
  process.exit(1);
});
