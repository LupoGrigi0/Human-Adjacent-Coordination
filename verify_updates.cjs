#!/usr/bin/env node

/**
 * Verification Script for Message Metadata Updates
 *
 * Verifies that all 18 messages from the modern-art-portfolio audit
 * have been properly updated with project metadata.
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = '/mnt/coordinaton_mcp_data/production/data/messages';

// Expected message updates from audit
const EXPECTED_UPDATES = {
  'msg-1759223715912-ab0a1837': 'modern-art-portfolio',
  'msg-1759222235932-0ce71cef': 'modern-art-portfolio',
  'msg-1759221755743-be213e91': 'modern-art-portfolio',
  'msg-1759202215147-6bcfc50f': 'modern-art-portfolio',
  'msg-1759194264525-c3df5516': 'modern-art-portfolio',
  'msg-1759223735304-9dc7085b': 'modern-art-portfolio',
  'msg-1759221550582-65d99175': 'modern-art-portfolio',
  'msg-1759205142589-b420e373': 'modern-art-portfolio',
  'msg-1759182003944-6d23725e': 'modern-art-portfolio',
  'msg-1759181938865-acc2013c': 'modern-art-portfolio',
  'msg-1759174157144-ca9c1f66': 'modern-art-portfolio',
  'msg-1759182880825-96f7474f': 'modern-art-portfolio',
  'msg-1759182225196-04c47995': 'modern-art-portfolio',
  'msg-1759182003575-4fe16a00': 'modern-art-portfolio',
  'msg-1759181271394-35b301f5': 'modern-art-portfolio',
  'msg-1759198286918-06b4036a': 'modern-art-portfolio',
  'msg-1759182912832-3848ea89': 'modern-art-portfolio',
  'msg-1759223754659-252c24d8': 'modern-art-portfolio'
};

// Files to check
const FILES_TO_CHECK = [
  'inbox/inbox.json',
  'instances/phoenix-foundation/inbox.json',
  'instances/zara-frontend/inbox.json',
  'instances/nova-integration/inbox.json'
];

function checkMessageFile(filePath) {
  const absolutePath = path.join(BASE_DIR, filePath);

  if (!fs.existsSync(absolutePath)) {
    console.log(`❌ File not found: ${filePath}`);
    return { found: 0, updated: 0 };
  }

  let data;
  try {
    const fileContent = fs.readFileSync(absolutePath, 'utf8');
    data = JSON.parse(fileContent);
  } catch (error) {
    console.log(`❌ Error reading ${filePath}: ${error.message}`);
    return { found: 0, updated: 0 };
  }

  let found = 0;
  let updated = 0;

  console.log(`\n📁 Checking: ${filePath}`);

  data.messages.forEach(msg => {
    if (EXPECTED_UPDATES[msg.id]) {
      found++;
      const hasProject = msg.metadata && msg.metadata.project === 'modern-art-portfolio';
      const hasTags = msg.metadata && Array.isArray(msg.metadata.tags) && msg.metadata.tags.length > 0;
      const hasCategory = msg.metadata && msg.metadata.category;

      console.log(`   ${hasProject && hasTags && hasCategory ? '✅' : '❌'} ${msg.id}`);
      console.log(`      Subject: ${msg.subject.substring(0, 50)}...`);
      console.log(`      Project: ${msg.metadata?.project || 'MISSING'}`);
      console.log(`      Tags: [${msg.metadata?.tags?.join(', ') || 'MISSING'}]`);
      console.log(`      Category: ${msg.metadata?.category || 'MISSING'}`);

      if (hasProject && hasTags && hasCategory) {
        updated++;
      }
    }
  });

  console.log(`   Found: ${found} messages, Updated: ${updated} messages`);
  return { found, updated };
}

function calculateTokenReduction() {
  // Based on audit analysis:
  // Before: 15k+ tokens (ALL global messages)
  // After: ~3k tokens (16 filtered messages only)

  const beforeTokens = 15000; // Estimated from audit
  const afterTokens = 3000;   // Estimated filtered result
  const reduction = beforeTokens - afterTokens;
  const reductionPercent = Math.round((reduction / beforeTokens) * 100);

  console.log('\n📊 TOKEN REDUCTION IMPACT:');
  console.log('='.repeat(40));
  console.log(`Before fix: ~${beforeTokens.toLocaleString()} tokens (ALL messages)`);
  console.log(`After fix:  ~${afterTokens.toLocaleString()} tokens (filtered by project)`);
  console.log(`Reduction:  ${reduction.toLocaleString()} tokens (${reductionPercent}% improvement)`);
  console.log('\n💡 Benefits:');
  console.log('   - Faster message queries for team members');
  console.log('   - Reduced API costs');
  console.log('   - Improved coordination system performance');
  console.log('   - Better message discovery and relevance');
}

function main() {
  console.log('🔍 VERIFYING MESSAGE METADATA UPDATES');
  console.log('='.repeat(50));

  let totalFound = 0;
  let totalUpdated = 0;

  for (const file of FILES_TO_CHECK) {
    const result = checkMessageFile(file);
    totalFound += result.found;
    totalUpdated += result.updated;
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 VERIFICATION SUMMARY:');
  console.log(`   Expected messages: ${Object.keys(EXPECTED_UPDATES).length}`);
  console.log(`   Messages found: ${totalFound}`);
  console.log(`   Messages properly updated: ${totalUpdated}`);

  if (totalUpdated === Object.keys(EXPECTED_UPDATES).length) {
    console.log('\n✅ ALL MESSAGES SUCCESSFULLY UPDATED!');
    calculateTokenReduction();
    return 0;
  } else {
    console.log('\n⚠️  Some messages were not properly updated.');
    return 1;
  }
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { main };