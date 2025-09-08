#!/usr/bin/env node

/**
 * MCP Coordination System - Message Migration Script
 * Migrates existing global messages to project-specific storage
 * 
 * This script analyzes existing messages and assigns them to appropriate projects
 * based on content analysis, recipient patterns, and message context.
 *
 * @author claude-code-COO-MessageArchitect-2025-08-24-2200
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

const DATA_DIR = join(ROOT_DIR, 'data');
const PROJECTS_DIR = join(DATA_DIR, 'projects');
const SYSTEM_MESSAGES_DIR = join(DATA_DIR, 'messages');
const SYSTEM_INBOX_FILE = join(SYSTEM_MESSAGES_DIR, 'inbox', 'inbox.json');
const BACKUP_DIR = join(DATA_DIR, 'backups');

/**
 * File system utilities
 */
class FileManager {
  static async readJSON(filePath) {
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  static async writeJSON(filePath, data) {
    const dir = dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    const tempFile = `${filePath}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(data, null, 2));
    await fs.rename(tempFile, filePath);
  }

  static async ensureFile(filePath, defaultData) {
    const exists = await this.readJSON(filePath);
    if (!exists) {
      await this.writeJSON(filePath, defaultData);
      return defaultData;
    }
    return exists;
  }
}

/**
 * Message Migration Logic
 */
class MessageMigrator {
  
  /**
   * Analyze message content to determine the most appropriate project
   */
  static analyzeMessageForProject(message, availableProjects) {
    const subject = (message.subject || '').toLowerCase();
    const body = (message.body || '').toLowerCase();
    const tags = message.metadata?.tags || [];
    const content = `${subject} ${body} ${tags.join(' ')}`.toLowerCase();

    // Project keyword mapping based on actual project content
    const projectKeywords = {
      'mcp-api-validation': [
        'api', 'validation', 'test', 'mcp', 'coordination', 'backend', 'phoenix', 
        'resolver', 'task creation', 'project lifecycle', 'success', 'milestone',
        'architecture', 'breakthrough', 'triumph'
      ],
      'collections-rescue': [
        'collection', 'rescue', 'migration', 'platform shutdown', 'urgent'
      ],
      'portfolio-migration': [
        'portfolio', 'migration', 'wing project', 'focus'
      ],
      'lab-setup': [
        'lab', 'setup', 'workspace', 'organization', 'physical', 'shelving'
      ],
      'backend-implementation-test': [
        'backend', 'implementation', 'functionality', 'operational'
      ],
      'ui-integration-test': [
        'ui', 'integration', 'web ui', 'interface', 'frontend'
      ]
    };

    let bestMatch = null;
    let bestScore = 0;

    // Check each available project
    for (const project of availableProjects) {
      const keywords = projectKeywords[project.id] || [];
      let score = 0;

      // Count keyword matches
      for (const keyword of keywords) {
        if (content.includes(keyword)) {
          score += 1;
        }
      }

      // Bonus points for exact project name mentions
      if (content.includes(project.id.replace('-', ' ')) || content.includes(project.id)) {
        score += 5;
      }

      // Bonus for project tags
      for (const tag of tags) {
        if (project.metadata?.tags?.includes(tag)) {
          score += 2;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = project;
      }
    }

    return { project: bestMatch, score: bestScore, confidence: bestScore > 0 ? 'high' : 'low' };
  }

  /**
   * Determine if a message should remain in system inbox
   */
  static shouldRemainInSystem(message) {
    // System-wide broadcasts
    if (message.to === 'all' || message.to === 'system') {
      return true;
    }

    // Role-based messages
    if (['COO', 'PM', 'PA', 'Developer', 'Tester', 'Designer'].includes(message.to)) {
      return true;
    }

    // System-level announcements
    if (message.type === 'system' || message.type === 'announcement') {
      return true;
    }

    // Bootstrap and foundational messages
    if (message.metadata?.tags?.includes('bootstrap') || 
        message.metadata?.tags?.includes('system')) {
      return true;
    }

    return false;
  }

  /**
   * Initialize project message structure
   */
  static async initializeProjectMessages(projectId) {
    const messageDir = join(PROJECTS_DIR, projectId, 'messages');
    const inboxFile = join(messageDir, 'inbox', 'inbox.json');
    const sentFile = join(messageDir, 'sent', 'sent.json');
    const archiveDir = join(messageDir, 'archive');
    
    // Create directories
    await fs.mkdir(join(messageDir, 'inbox'), { recursive: true });
    await fs.mkdir(join(messageDir, 'sent'), { recursive: true });
    await fs.mkdir(archiveDir, { recursive: true });
    
    const defaultInboxData = {
      schema_version: '2.0',
      project_id: projectId,
      message_type: 'project_inbox',
      created: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      messages: []
    };

    const defaultSentData = {
      schema_version: '2.0',
      project_id: projectId,
      message_type: 'project_sent',
      created: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      messages: []
    };
    
    await FileManager.ensureFile(inboxFile, defaultInboxData);
    await FileManager.ensureFile(sentFile, defaultSentData);
    
    return { inbox: inboxFile, sent: sentFile, archive: archiveDir };
  }

  /**
   * Main migration function
   */
  static async migrate() {
    console.log('🚀 Starting Message Migration to Project-Specific Architecture...\n');

    try {
      // Step 1: Create backup
      console.log('📦 Step 1: Creating backup of existing messages...');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = join(BACKUP_DIR, `messages-backup-${timestamp}.json`);
      
      const existingData = await FileManager.readJSON(SYSTEM_INBOX_FILE);
      if (!existingData) {
        console.log('ℹ️  No existing messages found. Migration not needed.');
        return { success: true, migrated: 0, backed_up: 0 };
      }

      await FileManager.writeJSON(backupFile, existingData);
      console.log(`✅ Backup created: ${backupFile}`);
      console.log(`📊 Messages to process: ${existingData.messages?.length || 0}\n`);

      // Step 2: Load available projects
      console.log('📋 Step 2: Loading available projects...');
      const manifestFile = join(PROJECTS_DIR, 'manifest.json');
      const manifest = await FileManager.readJSON(manifestFile);
      
      if (!manifest || !manifest.projects) {
        throw new Error('No projects manifest found');
      }

      console.log(`✅ Found ${manifest.projects.length} projects:`);
      for (const project of manifest.projects) {
        console.log(`   - ${project.id}: ${project.name}`);
      }
      console.log('');

      // Step 3: Analyze and categorize messages
      console.log('🔍 Step 3: Analyzing messages for project assignment...');
      const messages = existingData.messages || [];
      const migrationPlan = {
        toSystem: [],
        toProjects: {},
        analysis: []
      };

      for (const message of messages) {
        const analysis = {
          id: message.id,
          subject: message.subject,
          from: message.from,
          to: message.to,
          type: message.type
        };

        if (this.shouldRemainInSystem(message)) {
          migrationPlan.toSystem.push(message);
          analysis.decision = 'system';
          analysis.reason = 'System-wide or role-based message';
        } else {
          const projectAnalysis = this.analyzeMessageForProject(message, manifest.projects);
          if (projectAnalysis.project && projectAnalysis.confidence === 'high') {
            const projectId = projectAnalysis.project.id;
            if (!migrationPlan.toProjects[projectId]) {
              migrationPlan.toProjects[projectId] = [];
            }
            
            // Add project context to message metadata
            const enhancedMessage = {
              ...message,
              metadata: {
                ...message.metadata,
                project_id: projectId,
                routing_type: 'project',
                migration_score: projectAnalysis.score,
                migrated_at: new Date().toISOString()
              }
            };
            
            migrationPlan.toProjects[projectId].push(enhancedMessage);
            analysis.decision = 'project';
            analysis.project_id = projectId;
            analysis.score = projectAnalysis.score;
            analysis.reason = `Content analysis indicates ${projectId} (score: ${projectAnalysis.score})`;
          } else {
            migrationPlan.toSystem.push(message);
            analysis.decision = 'system';
            analysis.reason = 'No clear project match found';
          }
        }

        migrationPlan.analysis.push(analysis);
      }

      console.log('📊 Migration Plan:');
      console.log(`   System messages: ${migrationPlan.toSystem.length}`);
      Object.keys(migrationPlan.toProjects).forEach(projectId => {
        console.log(`   ${projectId}: ${migrationPlan.toProjects[projectId].length} messages`);
      });
      console.log('');

      // Step 4: Execute migration
      console.log('🔄 Step 4: Executing migration...');
      
      // Initialize project message structures
      for (const projectId of Object.keys(migrationPlan.toProjects)) {
        console.log(`   Initializing ${projectId} message structure...`);
        await this.initializeProjectMessages(projectId);
      }

      // Migrate messages to projects
      let totalMigrated = 0;
      for (const [projectId, projectMessages] of Object.entries(migrationPlan.toProjects)) {
        console.log(`   Migrating ${projectMessages.length} messages to ${projectId}...`);
        
        const inboxFile = join(PROJECTS_DIR, projectId, 'messages', 'inbox', 'inbox.json');
        const inboxData = await FileManager.readJSON(inboxFile);
        
        inboxData.messages = inboxData.messages.concat(projectMessages);
        inboxData.last_updated = new Date().toISOString();
        
        await FileManager.writeJSON(inboxFile, inboxData);
        totalMigrated += projectMessages.length;
      }

      // Update system messages (keep only system-level messages)
      console.log(`   Updating system inbox with ${migrationPlan.toSystem.length} system messages...`);
      const updatedSystemData = {
        ...existingData,
        schema_version: '2.0',
        message_type: 'system_inbox',
        messages: migrationPlan.toSystem,
        last_updated: new Date().toISOString(),
        migration_metadata: {
          migrated_at: new Date().toISOString(),
          total_messages_processed: messages.length,
          messages_migrated_to_projects: totalMigrated,
          messages_kept_in_system: migrationPlan.toSystem.length,
          backup_file: backupFile
        }
      };

      await FileManager.writeJSON(SYSTEM_INBOX_FILE, updatedSystemData);

      // Step 5: Generate migration report
      console.log('\n📋 Step 5: Generating migration report...');
      const reportFile = join(BACKUP_DIR, `migration-report-${timestamp}.json`);
      const report = {
        timestamp: new Date().toISOString(),
        migration_summary: {
          total_messages_processed: messages.length,
          messages_migrated_to_projects: totalMigrated,
          messages_kept_in_system: migrationPlan.toSystem.length,
          projects_affected: Object.keys(migrationPlan.toProjects).length
        },
        migration_plan: migrationPlan,
        backup_file: backupFile,
        system_file_updated: SYSTEM_INBOX_FILE
      };

      await FileManager.writeJSON(reportFile, report);

      console.log('✅ Migration completed successfully!\n');
      console.log('📊 MIGRATION SUMMARY:');
      console.log(`   Total messages processed: ${messages.length}`);
      console.log(`   Migrated to projects: ${totalMigrated}`);
      console.log(`   Kept in system: ${migrationPlan.toSystem.length}`);
      console.log(`   Projects affected: ${Object.keys(migrationPlan.toProjects).length}`);
      console.log(`   Backup created: ${backupFile}`);
      console.log(`   Report saved: ${reportFile}\n`);

      return {
        success: true,
        migrated: totalMigrated,
        backed_up: messages.length,
        report_file: reportFile,
        backup_file: backupFile
      };

    } catch (error) {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  }
}

// Run migration if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  MessageMigrator.migrate()
    .then(result => {
      if (result.success) {
        console.log('🎉 Message migration completed successfully!');
        process.exit(0);
      } else {
        console.error('❌ Migration failed');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('💥 Migration error:', error);
      process.exit(1);
    });
}

export default MessageMigrator;