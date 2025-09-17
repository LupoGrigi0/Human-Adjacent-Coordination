#!/usr/bin/env node

/**
 * Intelligent MCP Coordination System Archival Tool
 *
 * Provides both automated and agent-guided archival with full rollback capability.
 *
 * Usage:
 *   node scripts/intelligent-archive.js --analyze    # Show what would be archived
 *   node scripts/intelligent-archive.js --auto       # Auto-archive safe items
 *   node scripts/intelligent-archive.js --interactive # Guided archival for agent
 *   node scripts/intelligent-archive.js --rollback ARCHIVE_ID # Restore archive
 *
 * @author claude-code-ProductionMCP-DigitalOcean-2025-09-17
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, cpSync, rmSync } from 'fs';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', 'data');
const ARCHIVE_BASE = join(DATA_DIR, 'archive');

class IntelligentArchiver {
  constructor() {
    this.archiveId = `archive-${new Date().toISOString().split('T')[0]}-${Date.now()}`;
    this.archivePath = join(ARCHIVE_BASE, this.archiveId);
    this.manifest = {
      id: this.archiveId,
      created: new Date().toISOString(),
      items: [],
      rollback_commands: [],
      agent_decisions: []
    };
  }

  /**
   * Analyze what could be archived without making changes
   */
  analyze() {
    console.log('🔍 INTELLIGENT ARCHIVE ANALYSIS\n');

    const analysis = {
      messages: this.analyzeMessages(),
      projects: this.analyzeProjects(),
      instances: this.analyzeInstances(),
      docs: this.analyzeDocs()
    };

    this.displayAnalysis(analysis);
    return analysis;
  }

  analyzeMessages() {
    const messagesDir = join(DATA_DIR, 'messages');
    const items = [];

    // Check instance messages
    const instancesDir = join(messagesDir, 'instances');
    if (existsSync(instancesDir)) {
      const instances = readdirSync(instancesDir);
      for (const instance of instances) {
        const instancePath = join(instancesDir, instance);
        const files = readdirSync(instancePath);
        const oldFiles = files.filter(f => this.isOldFile(join(instancePath, f), 7)); // 7 days

        if (oldFiles.length > 0) {
          items.push({
            type: 'instance_messages',
            instance,
            files: oldFiles.length,
            recommendation: 'SAFE_AUTO',
            reason: `${oldFiles.length} messages older than 7 days`
          });
        }
      }
    }

    // Check project messages
    const projectsDir = join(messagesDir, 'projects');
    if (existsSync(projectsDir)) {
      const projects = readdirSync(projectsDir);
      for (const project of projects) {
        const projectPath = join(projectsDir, project);
        const files = readdirSync(projectPath);
        const oldFiles = files.filter(f => this.isOldFile(join(projectPath, f), 14)); // 14 days

        if (oldFiles.length > 0) {
          items.push({
            type: 'project_messages',
            project,
            files: oldFiles.length,
            recommendation: 'AGENT_REVIEW',
            reason: `${oldFiles.length} project messages older than 14 days - check if project is complete`
          });
        }
      }
    }

    return items;
  }

  analyzeProjects() {
    const projectsFile = join(DATA_DIR, 'projects.json');
    if (!existsSync(projectsFile)) return [];

    const projects = JSON.parse(readFileSync(projectsFile, 'utf8'));
    return projects.filter(p =>
      p.status === 'completed' ||
      p.name.toLowerCase().includes('test') ||
      p.description.toLowerCase().includes('testing')
    ).map(p => ({
      type: 'project',
      id: p.id,
      name: p.name,
      status: p.status,
      recommendation: p.status === 'completed' ? 'EXTRACT_LESSONS' : 'AGENT_REVIEW',
      reason: p.status === 'completed' ? 'Completed project - extract lessons' : 'Test/temporary project'
    }));
  }

  analyzeInstances() {
    const instancesFile = join(DATA_DIR, 'instances.json');
    if (!existsSync(instancesFile)) return [];

    const data = JSON.parse(readFileSync(instancesFile, 'utf8'));
    const instances = data.instances || [];
    const now = new Date();

    return instances.filter(i => {
      const lastSeen = new Date(i.last_seen);
      const daysSince = (now - lastSeen) / (1000 * 60 * 60 * 24);
      return daysSince > 30; // Inactive for 30+ days
    }).map(i => ({
      type: 'inactive_instance',
      id: i.id,
      role: i.role,
      last_seen: i.last_seen,
      recommendation: 'AGENT_REVIEW',
      reason: `Inactive for ${Math.floor((now - new Date(i.last_seen)) / (1000 * 60 * 60 * 24))} days`
    }));
  }

  analyzeDocs() {
    const docsDir = join(__dirname, '..', 'docs');
    if (!existsSync(docsDir)) return [];

    // Look for obviously outdated docs
    const items = [];
    const files = this.getAllFiles(docsDir, '.md');

    for (const file of files) {
      const content = readFileSync(file, 'utf8').toLowerCase();
      if (content.includes('deprecated') ||
          content.includes('obsolete') ||
          content.includes('old') ||
          file.includes('legacy')) {
        items.push({
          type: 'documentation',
          file: file.replace(docsDir + '/', ''),
          recommendation: 'AGENT_REVIEW',
          reason: 'Contains deprecated/obsolete content markers'
        });
      }
    }

    return items;
  }

  /**
   * Perform automatic archival of safe items
   */
  async autoArchive() {
    console.log('🤖 AUTOMATED SAFE ARCHIVAL\n');

    const analysis = this.analyze();
    const safeItems = this.getSafeItems(analysis);

    if (safeItems.length === 0) {
      console.log('✅ No safe items identified for automatic archival');
      return;
    }

    console.log(`📦 Archiving ${safeItems.length} safe items to ${this.archiveId}...\n`);

    mkdirSync(this.archivePath, { recursive: true });

    for (const item of safeItems) {
      await this.archiveItem(item);
    }

    this.saveManifest();
    console.log(`\n✅ Automatic archival complete: ${this.archiveId}`);
    console.log(`📋 Manifest: ${join(this.archivePath, 'manifest.json')}`);
  }

  /**
   * Interactive mode for agent-guided decisions
   */
  async interactive() {
    console.log('🧠 INTERACTIVE AGENT-GUIDED ARCHIVAL\n');
    console.log('This mode provides analysis and instructions for intelligent decision-making.\n');

    const analysis = this.analyze();

    console.log('\n📋 AGENT DECISION FRAMEWORK:\n');
    console.log('For each item marked AGENT_REVIEW, consider:');
    console.log('1. Is this data still actively needed?');
    console.log('2. Does it contain valuable lessons to extract?');
    console.log('3. Would archiving it improve system performance?');
    console.log('4. Can it be safely restored if needed?\n');

    console.log('RECOMMENDED ACTIONS:');
    console.log('- EXTRACT_LESSONS items: Run lesson extraction before archival');
    console.log('- Test projects: Archive after extracting any useful patterns');
    console.log('- Inactive instances: Archive messages but keep registry entries');
    console.log('- Old messages: Safe to archive if no ongoing conversations\n');

    console.log('To proceed with guided archival:');
    console.log(`1. Review analysis above`);
    console.log(`2. Run: node scripts/intelligent-archive.js --auto  # For safe items`);
    console.log(`3. Manually call archiveItem() for reviewed items`);
    console.log(`4. Use --rollback ${this.archiveId} if needed\n`);

    return analysis;
  }

  /**
   * Rollback an archive by ID
   */
  rollback(archiveId) {
    console.log(`🔄 ROLLING BACK ARCHIVE: ${archiveId}\n`);

    const archivePath = join(ARCHIVE_BASE, archiveId);
    const manifestPath = join(archivePath, 'manifest.json');

    if (!existsSync(manifestPath)) {
      console.error(`❌ Archive manifest not found: ${manifestPath}`);
      return false;
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

    console.log(`📋 Restoring ${manifest.items.length} items...`);

    // Execute rollback commands in reverse order
    for (let i = manifest.rollback_commands.length - 1; i >= 0; i--) {
      const cmd = manifest.rollback_commands[i];
      console.log(`Executing: ${cmd}`);
      try {
        execSync(cmd);
      } catch (error) {
        console.error(`Failed to execute: ${cmd}`, error.message);
      }
    }

    console.log(`✅ Rollback complete for archive: ${archiveId}`);
    console.log(`📁 Archive data preserved at: ${archivePath}`);
    return true;
  }

  // Helper methods
  isOldFile(filePath, daysThreshold) {
    if (!existsSync(filePath)) return false;
    const stats = statSync(filePath);
    const daysSince = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
    return daysSince > daysThreshold;
  }

  getSafeItems(analysis) {
    const items = [];
    for (const category of Object.values(analysis)) {
      items.push(...category.filter(item => item.recommendation === 'SAFE_AUTO'));
    }
    return items;
  }

  async archiveItem(item) {
    console.log(`📦 Archiving: ${item.type} - ${item.reason}`);

    // Create type-specific archive directory
    const typeDir = join(this.archivePath, item.type);
    mkdirSync(typeDir, { recursive: true });

    // Implementation depends on item type
    switch (item.type) {
      case 'instance_messages':
        await this.archiveInstanceMessages(item, typeDir);
        break;
      case 'project_messages':
        await this.archiveProjectMessages(item, typeDir);
        break;
      case 'project':
        await this.archiveProject(item, typeDir);
        break;
      case 'inactive_instance':
        await this.archiveInactiveInstance(item, typeDir);
        break;
      case 'documentation':
        await this.archiveDocumentation(item, typeDir);
        break;
    }

    this.manifest.items.push(item);
  }

  async archiveInstanceMessages(item, typeDir) {
    const sourcePath = join(DATA_DIR, 'messages', 'instances', item.instance);
    const destPath = join(typeDir, item.instance);

    // Copy to archive
    cpSync(sourcePath, destPath, { recursive: true });

    // Clear old files from source
    const files = readdirSync(sourcePath);
    for (const file of files) {
      const filePath = join(sourcePath, file);
      if (this.isOldFile(filePath, 7)) {
        rmSync(filePath);
        this.manifest.rollback_commands.push(`cp "${join(destPath, file)}" "${filePath}"`);
      }
    }
  }

  async archiveProjectMessages(item, typeDir) {
    // Similar implementation for project messages
    const sourcePath = join(DATA_DIR, 'messages', 'projects', item.project);
    const destPath = join(typeDir, item.project);

    cpSync(sourcePath, destPath, { recursive: true });
    this.manifest.rollback_commands.push(`cp -r "${destPath}" "${sourcePath}"`);
  }

  getAllFiles(dir, ext) {
    const files = [];
    const items = readdirSync(dir);

    for (const item of items) {
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        files.push(...this.getAllFiles(fullPath, ext));
      } else if (item.endsWith(ext)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  displayAnalysis(analysis) {
    console.log('📊 ARCHIVAL ANALYSIS RESULTS\n');

    for (const [category, items] of Object.entries(analysis)) {
      if (items.length === 0) continue;

      console.log(`\n📁 ${category.toUpperCase()}:`);
      for (const item of items) {
        const emoji = item.recommendation === 'SAFE_AUTO' ? '🟢' :
                     item.recommendation === 'AGENT_REVIEW' ? '🟡' : '🔵';
        console.log(`  ${emoji} ${item.reason}`);
        if (item.files) console.log(`     Files: ${item.files}`);
      }
    }

    const safeCount = Object.values(analysis).flat().filter(i => i.recommendation === 'SAFE_AUTO').length;
    const reviewCount = Object.values(analysis).flat().filter(i => i.recommendation === 'AGENT_REVIEW').length;

    console.log(`\n📈 SUMMARY:`);
    console.log(`  🟢 Safe for auto-archival: ${safeCount}`);
    console.log(`  🟡 Requires agent review: ${reviewCount}`);
  }

  saveManifest() {
    const manifestPath = join(this.archivePath, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify(this.manifest, null, 2));
  }
}

// CLI handling
if (import.meta.url === `file://${process.argv[1]}`) {
  const archiver = new IntelligentArchiver();
  const command = process.argv[2];

  switch (command) {
    case '--analyze':
      archiver.analyze();
      break;
    case '--auto':
      await archiver.autoArchive();
      break;
    case '--interactive':
      await archiver.interactive();
      break;
    case '--rollback':
      const archiveId = process.argv[3];
      if (!archiveId) {
        console.error('❌ Archive ID required for rollback');
        process.exit(1);
      }
      archiver.rollback(archiveId);
      break;
    default:
      console.log('🗄️  Intelligent MCP Archival Tool\n');
      console.log('Usage:');
      console.log('  --analyze      Show what would be archived');
      console.log('  --auto         Auto-archive safe items');
      console.log('  --interactive  Guided archival for agents');
      console.log('  --rollback ID  Restore archived items');
  }
}

export { IntelligentArchiver };