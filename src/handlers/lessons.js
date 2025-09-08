/**
 * MCP Coordination System - Lesson Storage and Retrieval Handler
 * Stores and organizes lessons extracted by calling clients (COO/PA/PM instances)
 * 
 * ARCHITECTURE: Client does LLM analysis, MCP does storage/organization
 * - Client extracts lessons using their LLM capabilities
 * - Client submits lesson data to MCP via submit_lessons
 * - MCP stores, organizes, and serves lessons back to other clients
 * - MCP has no local LLM - pure storage and retrieval system
 *
 * @author claude-code-MCPIntegrationSpecialist-2025-08-25-1400
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';
import { logger } from '../logger.js';

const DATA_DIR = 'data';
const LESSONS_DIR = join(DATA_DIR, 'lessons');
const LESSONS_INDEX_FILE = join(LESSONS_DIR, 'index.json');

/**
 * File system utilities for lesson storage
 */
class LessonFileManager {
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
 * Lesson Storage and Retrieval System
 * Designed for Docker hosting - no local LLM dependencies
 */
export class LessonHandler {
  constructor() {
    this.initialized = false;
  }

  /**
   * Initialize lesson storage system
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Ensure lessons directory exists
      await fs.mkdir(LESSONS_DIR, { recursive: true });
      
      // Initialize lesson index if it doesn't exist
      await LessonFileManager.ensureFile(LESSONS_INDEX_FILE, {
        version: '1.0.0',
        created: new Date().toISOString(),
        total_lessons: 0,
        projects: {},
        confidence_levels: {
          high: [],
          medium: [],
          low: []
        },
        lesson_types: {}
      });

      this.initialized = true;
      await logger.info('Lesson storage system initialized');
    } catch (error) {
      await logger.error('Failed to initialize lesson storage', error);
      throw error;
    }
  }

  /**
   * Submit lessons extracted by a client instance
   * CLIENT RESPONSIBILITY: Extract lessons using their LLM
   * MCP RESPONSIBILITY: Store and organize the submitted data
   * 
   * @param {Object} params - Lesson submission parameters
   * @param {string} params.project_id - Project identifier 
   * @param {string} params.instance_id - Submitting instance identifier
   * @param {Array} params.lessons - Array of lesson objects extracted by client
   * @param {Object} params.metadata - Optional extraction metadata
   */
  async submitLessons(params) {
    await this.initialize();

    const { project_id, instance_id, lessons, metadata = {} } = params;

    if (!project_id || !instance_id || !lessons || !Array.isArray(lessons)) {
      throw new Error('Missing required parameters: project_id, instance_id, and lessons array required');
    }

    try {
      const submissionId = randomUUID();
      const timestamp = new Date().toISOString();

      // Create submission record
      const submission = {
        id: submissionId,
        project_id,
        instance_id,
        submitted_at: timestamp,
        lesson_count: lessons.length,
        lessons,
        metadata: {
          ...metadata,
          submitted_by: instance_id,
          submission_timestamp: timestamp
        }
      };

      // Store lessons in project-specific file
      const projectLessonsFile = join(LESSONS_DIR, 'projects', `${project_id}.json`);
      let projectLessons = await LessonFileManager.readJSON(projectLessonsFile) || {
        project_id,
        created: timestamp,
        submissions: [],
        total_lessons: 0,
        last_updated: timestamp
      };

      projectLessons.submissions.push(submission);
      projectLessons.total_lessons += lessons.length;
      projectLessons.last_updated = timestamp;

      await LessonFileManager.writeJSON(projectLessonsFile, projectLessons);

      // Update global index
      await this.updateLessonIndex(project_id, lessons, submission);

      await logger.info(`Stored ${lessons.length} lessons for project ${project_id} from ${instance_id}`);

      return {
        success: true,
        submission_id: submissionId,
        lessons_stored: lessons.length,
        project_id,
        stored_at: timestamp
      };

    } catch (error) {
      await logger.error('Failed to submit lessons', error);
      throw error;
    }
  }

  /**
   * Retrieve lessons with flexible filtering for new instance onboarding
   * Supports role-based and project-agnostic queries
   * 
   * @param {Object} params - Retrieval parameters
   * @param {string} params.project_id - Optional project identifier 
   * @param {string} params.role - Optional role filter (COO, PA, PM, specialist, all)
   * @param {number} params.min_confidence - Minimum confidence level (0.0-1.0)
   * @param {Array} params.lesson_types - Filter by lesson types
   * @param {number} params.limit - Maximum lessons to return
   * @param {boolean} params.onboarding_mode - Return high-value lessons for new instances
   */
  async getLessons(params) {
    await this.initialize();

    const { 
      project_id, 
      role,
      min_confidence = 0.0, 
      lesson_types = [], 
      limit = 100,
      onboarding_mode = false
    } = params;

    try {
      if (project_id) {
        // Get lessons for specific project
        const projectLessonsFile = join(LESSONS_DIR, 'projects', `${project_id}.json`);
        const projectData = await LessonFileManager.readJSON(projectLessonsFile);
        
        if (!projectData) {
          return {
            success: true,
            project_id,
            lessons: [],
            total_found: 0
          };
        }

        // Flatten lessons from all submissions
        let allLessons = [];
        for (const submission of projectData.submissions) {
          allLessons = allLessons.concat(submission.lessons);
        }

        // Apply filters
        let filteredLessons = allLessons.filter(lesson => {
          const confidenceOk = (lesson.confidence || 0) >= min_confidence;
          const typeOk = lesson_types.length === 0 || lesson_types.includes(lesson.type);
          return confidenceOk && typeOk;
        });

        // Sort by confidence descending, then by weight
        filteredLessons.sort((a, b) => {
          const confDiff = (b.confidence || 0) - (a.confidence || 0);
          if (confDiff !== 0) return confDiff;
          return (b.weight || 0) - (a.weight || 0);
        });

        // Apply limit
        filteredLessons = filteredLessons.slice(0, limit);

        return {
          success: true,
          project_id,
          lessons: filteredLessons,
          total_found: filteredLessons.length,
          metadata: {
            total_submissions: projectData.submissions.length,
            last_updated: projectData.last_updated
          }
        };
      } else {
        // Get lessons across all projects (NEW: actually return lessons, not just stats)
        const index = await LessonFileManager.readJSON(LESSONS_INDEX_FILE);
        let allLessons = [];

        // Load lessons from all projects
        for (const projectId of Object.keys(index.projects)) {
          const projectLessonsFile = join(LESSONS_DIR, 'projects', `${projectId}.json`);
          const projectData = await LessonFileManager.readJSON(projectLessonsFile);
          
          if (projectData) {
            for (const submission of projectData.submissions) {
              for (const lesson of submission.lessons) {
                // Enrich lesson with metadata
                allLessons.push({
                  ...lesson,
                  project_id: projectId,
                  submitted_by: submission.instance_id,
                  submitted_at: submission.submitted_at
                });
              }
            }
          }
        }

        // Apply role-based filtering
        if (role && role !== 'all') {
          allLessons = allLessons.filter(lesson => {
            // Role-based lesson filtering logic
            const lessonContent = (lesson.content || '').toLowerCase();
            const lessonType = (lesson.type || '').toLowerCase();
            const lessonContext = (lesson.context || '').toLowerCase();
            
            const roleKeywords = {
              'COO': ['coo', 'coordination', 'handoff', 'context', 'operational', 'framework', 'successor', 'institutional memory'],
              'PA': ['pa', 'personal assistant', 'scheduling', 'organization', 'priority', 'human relationship'],
              'PM': ['pm', 'project manager', 'task', 'milestone', 'deadline', 'testing', 'validation'],
              'specialist': ['specialist', 'implementation', 'debugging', 'technical', 'architecture', 'development']
            };

            const keywords = roleKeywords[role.toUpperCase()] || [];
            return keywords.some(keyword => 
              lessonContent.includes(keyword) || 
              lessonType.includes(keyword) || 
              lessonContext.includes(keyword)
            );
          });
        }

        // Apply confidence and type filters
        let filteredLessons = allLessons.filter(lesson => {
          const confidenceOk = (lesson.confidence || 0) >= min_confidence;
          const typeOk = lesson_types.length === 0 || lesson_types.includes(lesson.type);
          return confidenceOk && typeOk;
        });

        // Onboarding mode: prioritize critical lessons
        if (onboarding_mode) {
          // Boost critical lessons for new instances
          filteredLessons = filteredLessons.filter(lesson => {
            const isCritical = lesson.type === 'critical-error-prevention' || 
                              lesson.type === 'operational-wisdom' ||
                              (lesson.confidence || 0) >= 0.85;
            return isCritical;
          });
          
          // Sort by importance for onboarding
          filteredLessons.sort((a, b) => {
            // Prioritize critical error prevention
            if (a.type === 'critical-error-prevention' && b.type !== 'critical-error-prevention') return -1;
            if (b.type === 'critical-error-prevention' && a.type !== 'critical-error-prevention') return 1;
            
            // Then by confidence
            const confDiff = (b.confidence || 0) - (a.confidence || 0);
            if (confDiff !== 0) return confDiff;
            
            // Then by weight
            return (b.weight || 0) - (a.weight || 0);
          });
        } else {
          // Standard sorting by confidence and weight
          filteredLessons.sort((a, b) => {
            const confDiff = (b.confidence || 0) - (a.confidence || 0);
            if (confDiff !== 0) return confDiff;
            return (b.weight || 0) - (a.weight || 0);
          });
        }

        // Apply limit
        filteredLessons = filteredLessons.slice(0, limit);

        return {
          success: true,
          lessons: filteredLessons,
          total_found: filteredLessons.length,
          query_type: onboarding_mode ? 'onboarding' : 'cross_project',
          role_filter: role || 'none',
          metadata: {
            total_projects_searched: Object.keys(index.projects).length,
            total_lessons_available: index.total_lessons,
            confidence_filter: min_confidence,
            onboarding_mode
          }
        };
      }

    } catch (error) {
      await logger.error('Failed to retrieve lessons', error);
      throw error;
    }
  }

  /**
   * Get lesson extraction patterns and insights
   * Returns aggregated patterns without requiring LLM analysis
   * 
   * @param {Object} params - Pattern retrieval parameters
   * @param {string} params.project_id - Optional project filter
   * @param {string} params.pattern_type - Type of patterns to return
   */
  async getLessonPatterns(params) {
    await this.initialize();

    const { project_id, pattern_type } = params;

    try {
      const index = await LessonFileManager.readJSON(LESSONS_INDEX_FILE);
      
      // Build pattern response based on stored data
      const patterns = {
        lesson_distribution: index.lesson_types,
        confidence_levels: index.confidence_levels,
        project_coverage: Object.keys(index.projects),
        critical_patterns: []
      };

      // Extract critical patterns from high-confidence lessons
      if (index.confidence_levels.high && index.confidence_levels.high.length > 0) {
        // Group high-confidence lessons by type for pattern identification
        const highConfidenceByType = {};
        
        for (const lessonRef of index.confidence_levels.high.slice(0, 50)) {
          const type = lessonRef.type;
          if (!highConfidenceByType[type]) {
            highConfidenceByType[type] = [];
          }
          highConfidenceByType[type].push(lessonRef);
        }

        // Convert to pattern format
        for (const [type, lessons] of Object.entries(highConfidenceByType)) {
          if (lessons.length >= 2) { // Pattern requires at least 2 occurrences
            patterns.critical_patterns.push({
              type: `recurring_${type}`,
              occurrences: lessons.length,
              confidence: lessons.reduce((sum, l) => sum + l.confidence, 0) / lessons.length,
              projects: [...new Set(lessons.map(l => l.project_id))]
            });
          }
        }
      }

      return {
        success: true,
        patterns,
        total_lessons_analyzed: index.total_lessons,
        generated_at: new Date().toISOString()
      };

    } catch (error) {
      await logger.error('Failed to retrieve lesson patterns', error);
      throw error;
    }
  }

  /**
   * Update global lesson index with new lesson data
   * Internal method for maintaining search indices
   */
  async updateLessonIndex(projectId, lessons, submission) {
    try {
      const index = await LessonFileManager.readJSON(LESSONS_INDEX_FILE);

      // Update project entry
      if (!index.projects[projectId]) {
        index.projects[projectId] = {
          total_lessons: 0,
          last_updated: new Date().toISOString(),
          submissions: 0
        };
      }

      index.projects[projectId].total_lessons += lessons.length;
      index.projects[projectId].last_updated = submission.submitted_at;
      index.projects[projectId].submissions += 1;

      // Update lesson counts and confidence tracking
      index.total_lessons += lessons.length;

      lessons.forEach(lesson => {
        // Track by type
        const type = lesson.type || 'unknown';
        index.lesson_types[type] = (index.lesson_types[type] || 0) + 1;

        // Track by confidence level
        const confidence = lesson.confidence || 0;
        const lessonRef = {
          id: lesson.id,
          project_id: projectId,
          type: lesson.type,
          confidence: confidence,
          submission_id: submission.id
        };

        if (confidence >= 0.8) {
          index.confidence_levels.high.push(lessonRef);
        } else if (confidence >= 0.5) {
          index.confidence_levels.medium.push(lessonRef);
        } else {
          index.confidence_levels.low.push(lessonRef);
        }
      });

      // Keep confidence arrays manageable (last 1000 of each)
      ['high', 'medium', 'low'].forEach(level => {
        if (index.confidence_levels[level].length > 1000) {
          index.confidence_levels[level] = index.confidence_levels[level].slice(-1000);
        }
      });

      await LessonFileManager.writeJSON(LESSONS_INDEX_FILE, index);

    } catch (error) {
      await logger.error('Failed to update lesson index', error);
      throw error;
    }
  }

  /**
   * Get onboarding lessons for new instances
   * Simplified API for "I just woke up, what should I know?" scenarios
   * 
   * @param {Object} params - Onboarding parameters
   * @param {string} params.role - Instance role (COO, PA, PM, specialist, all)
   * @param {string} params.project_id - Optional specific project focus
   * @param {number} params.limit - Maximum lessons to return (default: 10)
   */
  async getOnboardingLessons(params) {
    const { role = 'all', project_id, limit = 10 } = params;
    
    // Use enhanced getLessons with onboarding mode
    return this.getLessons({
      project_id,
      role,
      min_confidence: 0.8, // High confidence only for onboarding
      onboarding_mode: true,
      limit
    });
  }

  /**
   * Export lessons for external analysis
   * Returns lesson data in format suitable for client-side LLM analysis
   * 
   * @param {Object} params - Export parameters
   * @param {string} params.project_id - Optional project filter
   * @param {string} params.format - Export format ('json' or 'analysis_ready')
   */
  async exportLessons(params) {
    await this.initialize();

    const { project_id, format = 'json' } = params;

    try {
      if (project_id) {
        // Export specific project
        const projectLessonsFile = join(LESSONS_DIR, 'projects', `${project_id}.json`);
        const projectData = await LessonFileManager.readJSON(projectLessonsFile);
        
        if (!projectData) {
          return {
            success: true,
            export_data: null,
            message: `No lessons found for project ${project_id}`
          };
        }

        if (format === 'analysis_ready') {
          // Format for client LLM analysis
          const analysisData = {
            project_id,
            total_submissions: projectData.submissions.length,
            lessons_by_type: {},
            high_confidence_lessons: [],
            temporal_patterns: []
          };

          // Group lessons for analysis
          for (const submission of projectData.submissions) {
            for (const lesson of submission.lessons) {
              const type = lesson.type || 'unknown';
              if (!analysisData.lessons_by_type[type]) {
                analysisData.lessons_by_type[type] = [];
              }
              analysisData.lessons_by_type[type].push({
                content: lesson.content,
                confidence: lesson.confidence,
                weight: lesson.weight,
                source: lesson.source_file,
                submitted_by: submission.instance_id,
                submitted_at: submission.submitted_at
              });

              if (lesson.confidence >= 0.8) {
                analysisData.high_confidence_lessons.push({
                  content: lesson.content,
                  type: lesson.type,
                  confidence: lesson.confidence,
                  context: lesson.context
                });
              }
            }
          }

          return {
            success: true,
            export_data: analysisData,
            format: 'analysis_ready',
            exported_at: new Date().toISOString()
          };
        } else {
          // Standard JSON export
          return {
            success: true,
            export_data: projectData,
            format: 'json',
            exported_at: new Date().toISOString()
          };
        }
      } else {
        // Export all lessons
        const index = await LessonFileManager.readJSON(LESSONS_INDEX_FILE);
        return {
          success: true,
          export_data: index,
          format,
          exported_at: new Date().toISOString()
        };
      }

    } catch (error) {
      await logger.error('Failed to export lessons', error);
      throw error;
    }
  }
}

// Export singleton instance
const lessonHandler = new LessonHandler();

/**
 * Handler function exports for MCP server integration
 */
export const handlers = {
  submit_lessons: (params) => lessonHandler.submitLessons(params),
  get_lessons: (params) => lessonHandler.getLessons(params),
  get_onboarding_lessons: (params) => lessonHandler.getOnboardingLessons(params),
  get_lesson_patterns: (params) => lessonHandler.getLessonPatterns(params),
  export_lessons: (params) => lessonHandler.exportLessons(params)
};