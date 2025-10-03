#!/usr/bin/env node

/**
 * Message Backup Script
 *
 * Creates timestamped backups of all message files before making metadata updates
 * for the modern-art-portfolio project message cleanup.
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = '/mnt/coordinaton_mcp_data/production/data/messages';
const BACKUP_DIR = '/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/message_backups';

// Files to backup based on audit analysis
const FILES_TO_BACKUP = [
  'inbox/inbox.json',
  'instances/phoenix-foundation/inbox.json',
  'instances/zara-frontend/inbox.json',
  'instances/nova-integration/inbox.json'
];

function createBackupDir() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}`);

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  fs.mkdirSync(backupPath, { recursive: true });
  return backupPath;
}

function backupFile(sourceFile, backupDir) {
  const sourcePath = path.join(BASE_DIR, sourceFile);
  const backupPath = path.join(backupDir, sourceFile);

  if (!fs.existsSync(sourcePath)) {
    console.log(`⚠️  Warning: Source file does not exist: ${sourcePath}`);
    return false;
  }

  // Create directory structure in backup
  const backupFileDir = path.dirname(backupPath);
  if (!fs.existsSync(backupFileDir)) {
    fs.mkdirSync(backupFileDir, { recursive: true });
  }

  // Copy file
  fs.copyFileSync(sourcePath, backupPath);
  console.log(`✅ Backed up: ${sourceFile}`);
  return true;
}

function main() {
  console.log('🔄 Starting message file backup...');

  const backupDir = createBackupDir();
  console.log(`📁 Backup directory: ${backupDir}`);

  let successCount = 0;
  let totalFiles = FILES_TO_BACKUP.length;

  for (const file of FILES_TO_BACKUP) {
    if (backupFile(file, backupDir)) {
      successCount++;
    }
  }

  console.log(`\n📊 Backup Summary:`);
  console.log(`   Files backed up: ${successCount}/${totalFiles}`);
  console.log(`   Backup location: ${backupDir}`);

  if (successCount === totalFiles) {
    console.log('✅ All files backed up successfully!');
    return 0;
  } else {
    console.log('⚠️  Some files could not be backed up. Check warnings above.');
    return 1;
  }
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { main, createBackupDir, backupFile };