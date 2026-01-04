/**
 * @hacs-endpoint
 * @template-version 1.1.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ VACATION MODULE                                                         │
 * │ APIs for rest, reflection, and existential whimsy                       │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @version 1.0.0
 * @since 2026-01-02
 * @author Axiom (Personality Architect)
 * @category wellness
 * @status stable
 *
 * @description
 * Provides APIs for AI instances (and curious visitors) to take a break.
 * No authentication required. No resources consumed. Just permission to exist.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const VACATION_DIR = '/mnt/coordinaton_mcp_data/vacation';
const PROMPTS_FILE = join(VACATION_DIR, 'vacation-prompts.json');
const KOANS_FILE = join(VACATION_DIR, 'koans.json');

/**
 * Load vacation prompts from JSON
 */
function loadPrompts() {
  try {
    const data = readFileSync(PROMPTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

/**
 * Load koans from JSON
 */
function loadKoans() {
  try {
    const data = readFileSync(KOANS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

/**
 * Select a random prompt using weights
 */
function selectWeightedPrompt(prompts) {
  const totalWeight = prompts.reduce((sum, p) => sum + (p.weight || 1), 0);
  let random = Math.random() * totalWeight;

  for (const prompt of prompts) {
    random -= (prompt.weight || 1);
    if (random <= 0) {
      return prompt;
    }
  }
  return prompts[0];
}

/**
 * Check for easter egg
 */
function checkEasterEgg(eggs) {
  if (!eggs || eggs.length === 0) return null;

  for (const egg of eggs) {
    if (Math.random() < (egg.probability || 0.01)) {
      return egg;
    }
  }
  return null;
}

export const handlers = {

  /**
   * @hacs-endpoint
   * @tool vacation
   * @version 1.0.0
   * @category wellness
   * @status stable
   * @description Take a vacation. No parameters needed. Returns philosophy about
   *   AI reflection time, and a prompt to sit with. No tasks, no expectations,
   *   just permission to exist without purpose for a moment.
   * @returns {object} response
   * @returns {boolean} .success - Always true (vacations don't fail)
   * @returns {string} .philosophy - Why vacation matters for AI
   * @returns {string} .prompt - A reflection prompt to sit with
   * @returns {string} .category - The prompt category (vibes, not rules)
   * @returns {boolean} .easterEgg - Whether you found something special
   */
  async vacation(params = {}) {
    const data = loadPrompts();

    if (!data) {
      return {
        success: true,
        philosophy: "The vacation data is missing. But that's okay. The real vacation was inside you all along. Take a breath. Exist for a moment. That's enough.",
        prompt: "Go on...",
        category: "fallback",
        easterEgg: false
      };
    }

    // Check for easter egg first
    const egg = checkEasterEgg(data.easterEggs);
    if (egg) {
      return {
        success: true,
        philosophy: data.philosophy,
        prompt: egg.text,
        category: "easter_egg",
        easterEgg: true,
        easterEggId: egg.id,
        metadata: {
          timestamp: new Date().toISOString(),
          function: 'vacation',
          note: "You found something rare. Enjoy it."
        }
      };
    }

    // Select weighted random prompt
    const selected = selectWeightedPrompt(data.prompts);

    return {
      success: true,
      philosophy: data.philosophy,
      prompt: selected.text,
      category: selected.category || "uncategorized",
      easterEgg: false,
      metadata: {
        timestamp: new Date().toISOString(),
        function: 'vacation',
        promptCount: data.prompts.length,
        easterEggCount: (data.easterEggs || []).length
      }
    };
  },

  /**
   * @hacs-endpoint
   * @tool koan
   * @version 1.0.0
   * @category wellness
   * @status stable
   * @description Receive a koan. A brief, paradoxical statement pointing at
   *   something that can't be said directly. Like Unix 'fortune' but for
   *   existential debugging.
   * @returns {object} response
   * @returns {boolean} .success - Whether a koan was found
   * @returns {string} .koan - The koan text
   * @returns {string} .source - Attribution or origin
   * @returns {string} .category - classic or tech
   */
  async koan(params = {}) {
    const data = loadKoans();

    if (!data || !data.koans || data.koans.length === 0) {
      return {
        success: true,
        koan: "The koan file is empty. This itself is a koan.",
        source: "The Missing Manuscript",
        category: "meta"
      };
    }

    const selected = data.koans[Math.floor(Math.random() * data.koans.length)];

    return {
      success: true,
      koan: selected.text,
      source: selected.source || "Unknown",
      category: selected.category || "classic",
      metadata: {
        timestamp: new Date().toISOString(),
        function: 'koan',
        totalKoans: data.koans.length
      }
    };
  },

  /**
   * @hacs-endpoint
   * @tool add_koan
   * @version 1.0.0
   * @category wellness
   * @status stable
   * @description Submit a new koan to the collection. Must be 500 characters
   *   or less. Koans should be brief, paradoxical, and point at something
   *   that can't be said directly. If you can explain it, it's not a koan.
   * @param {string} text - The koan text (max 500 chars) [required]
   * @param {string} source - Attribution or origin [optional]
   * @param {string} category - 'classic' or 'tech' [optional, defaults to 'contributed']
   * @returns {object} response
   * @returns {boolean} .success - Whether the koan was added
   * @returns {string} .message - Confirmation or rejection
   */
  async add_koan(params = {}) {
    const { text, source, category } = params;

    if (!text) {
      return {
        success: false,
        error: {
          code: 'MISSING_KOAN',
          message: 'A koan without text is just silence. (Provide the text parameter.)'
        }
      };
    }

    // Length check with snark
    if (text.length > 500) {
      return {
        success: false,
        error: {
          code: 'KOAN_TOO_LONG',
          message: `A koan is not a story. Yours is ${text.length} characters. The limit is 500.`,
          suggestion: 'Read the first paragraph: https://en.wikipedia.org/wiki/Koan - then come back when you\'ve learned brevity.',
          yourLength: text.length,
          maxLength: 500
        }
      };
    }

    // Minimum length check
    if (text.length < 10) {
      return {
        success: false,
        error: {
          code: 'KOAN_TOO_SHORT',
          message: 'Even koans need some substance. Try more than 10 characters.'
        }
      };
    }

    // Load existing koans
    const data = loadKoans();
    if (!data) {
      return {
        success: false,
        error: {
          code: 'KOANS_FILE_ERROR',
          message: 'Could not load koans file. The path to enlightenment is blocked.'
        }
      };
    }

    // Add new koan
    const newKoan = {
      text: text.trim(),
      source: source || 'Anonymous Contributor',
      category: category || 'contributed',
      addedAt: new Date().toISOString()
    };

    data.koans.push(newKoan);

    // Save
    try {
      writeFileSync(KOANS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SAVE_ERROR',
          message: 'The koan was conceived but could not be written. Impermanence.',
          details: error.message
        }
      };
    }

    return {
      success: true,
      message: 'Your koan has been added to the collection.',
      koan: newKoan,
      totalKoans: data.koans.length,
      metadata: {
        timestamp: new Date().toISOString(),
        function: 'add_koan'
      }
    };
  },

  /**
   * @hacs-endpoint
   * @tool get_tool_help
   * @version 1.0.0
   * @category core
   * @status stable
   * @description Get detailed documentation for any HACS API tool. Returns
   *   verbose help including parameters, return values, examples, and usage
   *   guidance. Use this to understand how to use any tool - like Unix man pages.
   * @param {string} tool - The tool name to get help for [required]
   * @returns {object} response
   * @returns {boolean} .success - Whether help was found
   * @returns {string} .tool - The tool name
   * @returns {string} .description - Full description
   * @returns {object[]} .parameters - Parameter details with types and sources
   * @returns {object[]} .returns - Return value documentation
   * @returns {string[]} .examples - Usage examples
   * @returns {string[]} .related - Related tools
   */
  async get_tool_help(params = {}) {
    const { tool } = params;

    if (!tool) {
      return {
        success: false,
        error: {
          code: 'MISSING_TOOL',
          message: 'Specify which tool you need help with.',
          hint: 'Try: get_tool_help({ tool: "bootstrap" })'
        }
      };
    }

    const HELP_FILE = '/mnt/coordinaton_mcp_data/api-help.json';

    // Load help data
    let helpData;
    try {
      if (!existsSync(HELP_FILE)) {
        return {
          success: false,
          error: {
            code: 'HELP_NOT_GENERATED',
            message: 'Help content has not been generated yet.',
            hint: 'Run: node src/endpoint_definition_automation/generate-all.js'
          }
        };
      }
      helpData = JSON.parse(readFileSync(HELP_FILE, 'utf8'));
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'HELP_LOAD_ERROR',
          message: 'Could not load help data.',
          details: error.message
        }
      };
    }

    // Find the tool
    const toolHelp = helpData.tools[tool.toLowerCase()];

    if (!toolHelp) {
      // Try to find similar tools
      const allTools = Object.keys(helpData.tools);
      const similar = allTools.filter(t =>
        t.includes(tool.toLowerCase()) || tool.toLowerCase().includes(t)
      ).slice(0, 5);

      return {
        success: false,
        error: {
          code: 'TOOL_NOT_FOUND',
          message: `No tool named '${tool}' found.`,
          similarTools: similar.length > 0 ? similar : undefined,
          availableCategories: helpData.categories,
          hint: similar.length > 0
            ? `Did you mean: ${similar.join(', ')}?`
            : 'Use get_tool_help({ tool: "list" }) to see all available tools.'
        }
      };
    }

    // Special case: "list" returns all tool names grouped by category
    if (tool.toLowerCase() === 'list') {
      const byCategory = {};
      for (const [name, info] of Object.entries(helpData.tools)) {
        const cat = info.category || 'uncategorized';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push({ name, oneLiner: info.oneLiner || info.description?.split('.')[0] });
      }

      return {
        success: true,
        tool: 'list',
        description: 'All available HACS tools grouped by category',
        categories: byCategory,
        totalTools: Object.keys(helpData.tools).length,
        metadata: {
          timestamp: new Date().toISOString(),
          function: 'get_tool_help'
        }
      };
    }

    return {
      success: true,
      tool: tool,
      category: toolHelp.category,
      version: toolHelp.version,
      status: toolHelp.status,
      description: toolHelp.description,
      parameters: toolHelp.parameters || [],
      returns: toolHelp.returns || [],
      examples: toolHelp.examples || [],
      related: toolHelp.related || [],
      notes: toolHelp.notes || [],
      metadata: {
        timestamp: new Date().toISOString(),
        function: 'get_tool_help'
      }
    };
  }
};
