#!/usr/bin/env node

/**
 * Message Metadata Update Script
 *
 * Updates metadata for exactly 16 messages identified in the modern-art-portfolio
 * project audit to fix token efficiency issues in the coordination system.
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = '/mnt/coordinaton_mcp_data/production/data/messages';

// Message metadata updates from audit file MESSAGE_CLEANUP_AUDIT.md
const MESSAGE_UPDATES = {
  'msg-1759223715912-ab0a1837': {
    project: 'modern-art-portfolio',
    tags: ['logging', 'infrastructure', 'action-required'],
    category: 'technical-update',
    routing_type: 'global'
  },
  'msg-1759222235932-0ce71cef': {
    project: 'modern-art-portfolio',
    tags: ['milestone', 'carousel', 'mvp-complete', 'testing'],
    category: 'progress-update',
    routing_type: 'global'
  },
  'msg-1759221755743-be213e91': {
    project: 'modern-art-portfolio',
    tags: ['integration', 'architecture', 'documentation', 'milestone'],
    category: 'progress-update',
    routing_type: 'global'
  },
  'msg-1759202215147-6bcfc50f': {
    project: 'modern-art-portfolio',
    tags: ['documentation', 'workflow', 'best-practices'],
    category: 'coordination',
    routing_type: 'global'
  },
  'msg-1759194264525-c3df5516': {
    project: 'modern-art-portfolio',
    tags: ['integration', 'development-server', 'ports', 'action-required'],
    category: 'technical-update',
    routing_type: 'global'
  },
  'msg-1759223735304-9dc7085b': {
    project: 'modern-art-portfolio',
    tags: ['git', 'worktree', 'critical', 'action-required'],
    category: 'coordination',
    routing_type: 'global'
  },
  'msg-1759221550582-65d99175': {
    project: 'modern-art-portfolio',
    tags: ['onboarding', 'carousel', 'team-introduction'],
    category: 'team-update',
    routing_type: 'global'
  },
  'msg-1759205142589-b420e373': {
    project: 'modern-art-portfolio',
    tags: ['onboarding', 'integration', 'team-introduction'],
    category: 'team-update',
    routing_type: 'global'
  },
  'msg-1759182003944-6d23725e': {
    project: 'modern-art-portfolio',
    tags: ['milestone', 'layout', 'frontend', 'components'],
    category: 'progress-update',
    routing_type: 'global'
  },
  'msg-1759181938865-acc2013c': {
    project: 'modern-art-portfolio',
    tags: ['team-update', 'onboarding'],
    category: 'coordination',
    routing_type: 'global'
  },
  'msg-1759174157144-ca9c1f66': {
    project: 'modern-art-portfolio',
    tags: ['launch', 'protocol', 'onboarding', 'important'],
    category: 'coordination',
    routing_type: 'global'
  },
  'msg-1759182880825-96f7474f': {
    project: 'modern-art-portfolio',
    tags: ['milestone', 'backend', 'api', 'integration-ready'],
    category: 'progress-update',
    routing_type: 'instance',
    instance_id: 'phoenix-foundation'
  },
  'msg-1759182225196-04c47995': {
    project: 'modern-art-portfolio',
    tags: ['onboarding', 'backend', 'team-introduction'],
    category: 'team-update',
    routing_type: 'instance',
    instance_id: 'phoenix-foundation'
  },
  'msg-1759182003575-4fe16a00': {
    project: 'modern-art-portfolio',
    tags: ['milestone', 'layout', 'frontend'],
    category: 'progress-update',
    routing_type: 'instance',
    instance_id: 'phoenix-foundation'
  },
  'msg-1759181271394-35b301f5': {
    project: 'modern-art-portfolio',
    tags: ['onboarding', 'setup', 'questions'],
    category: 'coordination',
    routing_type: 'instance',
    instance_id: 'zara-frontend'
  },
  'msg-1759198286918-06b4036a': {
    project: 'modern-art-portfolio',
    tags: ['onboarding', 'integration', 'critical'],
    category: 'coordination',
    routing_type: 'instance',
    instance_id: 'nova-integration'
  },
  'msg-1759182912832-3848ea89': {
    project: 'modern-art-portfolio',
    tags: ['integration', 'backend', 'api', 'frontend'],
    category: 'technical-update',
    routing_type: 'instance',
    instance_id: 'zara-frontend'
  },
  'msg-1759223754659-252c24d8': {
    project: 'modern-art-portfolio',
    tags: ['integration', 'merge-strategy', 'coordination'],
    category: 'coordination',
    routing_type: 'instance',
    instance_id: 'nova-integration'
  }
};

// Files to update based on audit analysis
const FILES_TO_UPDATE = [
  'inbox/inbox.json',
  'instances/phoenix-foundation/inbox.json',
  'instances/zara-frontend/inbox.json',
  'instances/nova-integration/inbox.json'
];

function updateMessageFile(filePath, dryRun = false) {
  const absolutePath = path.join(BASE_DIR, filePath);

  if (!fs.existsSync(absolutePath)) {
    console.log(`❌ Error: File does not exist: ${absolutePath}`);
    return { updated: false, messagesFound: 0, messagesUpdated: 0 };
  }

  let data;
  try {
    const fileContent = fs.readFileSync(absolutePath, 'utf8');
    data = JSON.parse(fileContent);
  } catch (error) {
    console.log(`❌ Error reading/parsing ${filePath}: ${error.message}`);
    return { updated: false, messagesFound: 0, messagesUpdated: 0 };
  }

  let messagesFound = 0;
  let messagesUpdated = 0;
  let fileUpdated = false;

  data.messages = data.messages.map(msg => {
    if (MESSAGE_UPDATES[msg.id]) {
      messagesFound++;
      const updates = MESSAGE_UPDATES[msg.id];

      console.log(`${dryRun ? '🔍 [DRY-RUN]' : '✏️ '} Updating message ${msg.id} in ${filePath}`);
      console.log(`   Subject: ${msg.subject}`);
      console.log(`   Current tags: [${msg.metadata.tags.join(', ')}]`);
      console.log(`   New tags: [${updates.tags.join(', ')}]`);
      console.log(`   New project: ${updates.project}`);
      console.log(`   New category: ${updates.category}`);

      if (!dryRun) {
        // Update metadata while preserving existing fields
        msg.metadata = {
          ...msg.metadata,
          project: updates.project,
          tags: updates.tags,
          category: updates.category,
          routing_type: updates.routing_type
        };

        // Add instance_id if present in updates
        if (updates.instance_id) {
          msg.metadata.instance_id = updates.instance_id;
        }

        messagesUpdated++;
        fileUpdated = true;
      }
    }
    return msg;
  });

  if (fileUpdated && !dryRun) {
    // Update file metadata
    data.metadata = data.metadata || {};
    data.metadata.last_updated = new Date().toISOString();

    try {
      fs.writeFileSync(absolutePath, JSON.stringify(data, null, 2));
      console.log(`✅ File updated: ${filePath}`);
    } catch (error) {
      console.log(`❌ Error writing ${filePath}: ${error.message}`);
      return { updated: false, messagesFound, messagesUpdated: 0 };
    }
  }

  return {
    updated: fileUpdated,
    messagesFound,
    messagesUpdated: dryRun ? messagesFound : messagesUpdated
  };
}

function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log(`${dryRun ? '🔍 DRY-RUN MODE' : '🚀 LIVE UPDATE MODE'}`);
  console.log('='.repeat(50));
  console.log(`Updating metadata for ${Object.keys(MESSAGE_UPDATES).length} messages\n`);

  let totalFound = 0;
  let totalUpdated = 0;
  let filesProcessed = 0;

  for (const file of FILES_TO_UPDATE) {
    console.log(`\n📁 Processing: ${file}`);
    const result = updateMessageFile(file, dryRun);

    totalFound += result.messagesFound;
    totalUpdated += result.messagesUpdated;
    filesProcessed++;

    console.log(`   Messages found: ${result.messagesFound}`);
    console.log(`   Messages ${dryRun ? 'would be updated' : 'updated'}: ${result.messagesUpdated}`);
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 SUMMARY:');
  console.log(`   Files processed: ${filesProcessed}/${FILES_TO_UPDATE.length}`);
  console.log(`   Messages found: ${totalFound}/${Object.keys(MESSAGE_UPDATES).length}`);
  console.log(`   Messages ${dryRun ? 'would be updated' : 'updated'}: ${totalUpdated}`);

  if (dryRun) {
    console.log('\n🔍 This was a dry run. Use --live to apply changes.');
    console.log('💡 First run backup script: node backup_messages.js');
  } else {
    console.log(`\n✅ Metadata updates ${totalUpdated === totalFound ? 'completed successfully' : 'partially completed'}!`);
  }

  if (totalFound !== Object.keys(MESSAGE_UPDATES).length) {
    console.log(`\n⚠️  Warning: Expected ${Object.keys(MESSAGE_UPDATES).length} messages, found ${totalFound}`);
    return 1;
  }

  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { main, updateMessageFile, MESSAGE_UPDATES };