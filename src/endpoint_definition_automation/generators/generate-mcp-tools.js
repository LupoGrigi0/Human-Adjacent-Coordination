#!/usr/bin/env node
/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  MCP TOOLS GENERATOR                                                       ║
 * ║  Generates MCP tools/list array from @hacs-endpoint documentation          ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Usage: node generate-mcp-tools.js [--output path/to/mcp-tools-generated.js]
 *
 * Parses all .js files in src/v2/ looking for @hacs-endpoint blocks,
 * extracts the documentation, and generates a JavaScript module exporting
 * the MCP tools array for use in streamable-http-server.js
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
  // Directories to scan for endpoint files
  scanDirs: [
    '/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/src/v2',
  ],
  // Default output path
  defaultOutput: '/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/src/mcp-tools-generated.js',
};

// ============================================================================
// PARSER: Extract @hacs-endpoint blocks from source files
// (Shared logic with generate-openapi.js - could be refactored to shared module)
// ============================================================================

/**
 * Parse a single @hacs-endpoint documentation block
 */
function parseEndpointBlock(block) {
  const endpoint = {
    tool: null,
    version: null,
    since: null,
    category: null,
    status: null,
    visibility: 'external',
    description: '',
    params: [],
    returns: [],
    permissions: null,
    rateLimit: null,
    errors: [],
    examples: [],
    related: [],
    notes: [],
    needsClarification: []
  };

  const lines = block.split('\n');
  let currentSection = null;
  let currentParam = null;
  let currentError = null;
  let currentExample = null;
  let descriptionLines = [];
  let sourceLines = [];
  let recoverLines = [];
  let exampleJsonLines = [];

  const SECTION_HEADERS = ['DESCRIPTION', 'PARAMETERS', 'RETURNS', 'PERMISSIONS & LIMITS',
                           'ERRORS & RECOVERY', 'EXAMPLES', 'RELATED', 'NOTES'];

  const isSectionHeader = (line) => {
    return SECTION_HEADERS.some(h => line === h || line.startsWith(h));
  };

  const finalizeCurrentContent = () => {
    if (currentParam && sourceLines.length > 0) {
      currentParam.source = sourceLines.join(' ').trim();
      sourceLines = [];
    }
    if (currentError && recoverLines.length > 0) {
      currentError.recover = recoverLines.join(' ').trim();
      recoverLines = [];
    }
    if (currentExample && exampleJsonLines.length > 0) {
      currentExample.json = exampleJsonLines.join('\n').trim();
      exampleJsonLines = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.replace(/^\s*\*\s?/, '').trim();

    if (trimmed.match(/^[─┌┐└┘│═╔╗╚╝║]+$/) || trimmed === '') continue;
    if (trimmed.startsWith('│') || trimmed.endsWith('│')) continue;

    if (isSectionHeader(trimmed)) {
      finalizeCurrentContent();
      currentSection = trimmed.toLowerCase().replace(/ & /g, '_').replace(/ /g, '_');
      currentParam = null;
      currentError = null;
      currentExample = null;
      continue;
    }

    if (trimmed.startsWith('@tool ')) {
      endpoint.tool = trimmed.replace('@tool ', '').trim();
    } else if (trimmed.startsWith('@version ')) {
      endpoint.version = trimmed.replace('@version ', '').trim();
    } else if (trimmed.startsWith('@since ')) {
      endpoint.since = trimmed.replace('@since ', '').trim();
    } else if (trimmed.startsWith('@category ')) {
      endpoint.category = trimmed.replace('@category ', '').trim();
    } else if (trimmed.startsWith('@status ')) {
      endpoint.status = trimmed.replace('@status ', '').trim();
    } else if (trimmed.startsWith('@visibility ')) {
      endpoint.visibility = trimmed.replace('@visibility ', '').trim();
    } else if (trimmed.startsWith('@description')) {
      currentSection = 'description';
    } else if (trimmed.startsWith('@param ')) {
      finalizeCurrentContent();
      const paramMatch = trimmed.match(/@param\s+\{([^}]+)\}\s+(\S+)\s*-?\s*(.*)/);
      if (paramMatch) {
        const [, type, name, desc] = paramMatch;
        const requiredMatch = desc.match(/\[(required|optional)\]/i);
        currentParam = {
          name: name,
          type: type,
          description: desc.replace(/\[(required|optional)\]/i, '').trim(),
          required: requiredMatch ? requiredMatch[1].toLowerCase() === 'required' : false,
          source: null,
          default: null,
          enum: null,
          validate: null
        };
        endpoint.params.push(currentParam);
      }
    } else if (trimmed.startsWith('@source ') && currentParam) {
      sourceLines = [trimmed.replace('@source ', '').trim()];
    } else if (trimmed.startsWith('@default ') && currentParam) {
      currentParam.default = trimmed.replace('@default ', '').trim();
    } else if (trimmed.startsWith('@enum ') && currentParam) {
      const enumStr = trimmed.replace('@enum ', '').trim();
      currentParam.enum = enumStr.split('|').map(s => s.trim());
    } else if (trimmed.startsWith('@validate ') && currentParam) {
      currentParam.validate = trimmed.replace('@validate ', '').trim();
    } else if (trimmed.startsWith('@permissions ')) {
      endpoint.permissions = trimmed.replace('@permissions ', '').trim();
    } else if (trimmed.startsWith('@rateLimit ')) {
      endpoint.rateLimit = trimmed.replace('@rateLimit ', '').trim();
    } else if (trimmed.startsWith('@error ')) {
      finalizeCurrentContent();
      const errorMatch = trimmed.match(/@error\s+(\S+)\s*-?\s*(.*)/);
      if (errorMatch) {
        currentError = {
          code: errorMatch[1],
          description: errorMatch[2].trim(),
          recover: null
        };
        endpoint.errors.push(currentError);
      }
    } else if (trimmed.startsWith('@recover ') && currentError) {
      recoverLines = [trimmed.replace('@recover ', '').trim()];
    } else if (trimmed.startsWith('@needs-clarification ')) {
      endpoint.needsClarification.push(trimmed.replace('@needs-clarification ', '').trim());
    } else {
      // Continuation lines
      if (currentSection === 'description' && !trimmed.startsWith('@')) {
        descriptionLines.push(trimmed);
      } else if (sourceLines.length > 0 && !trimmed.startsWith('@')) {
        sourceLines.push(trimmed);
      } else if (recoverLines.length > 0 && !trimmed.startsWith('@')) {
        recoverLines.push(trimmed);
      }
    }
  }

  finalizeCurrentContent();

  if (descriptionLines.length > 0) {
    endpoint.description = descriptionLines.join(' ').trim();
  }

  return endpoint;
}

/**
 * Find all @hacs-endpoint blocks in a file
 */
async function findEndpointBlocks(filePath) {
  const content = await readFile(filePath, 'utf8');
  const blocks = [];

  const regex = /\/\*\*[\s\S]*?@hacs-endpoint[\s\S]*?\*\//g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    blocks.push(match[0]);
  }

  return blocks;
}

/**
 * Scan directory for endpoint files
 */
async function scanDirectory(dirPath) {
  const endpoints = [];

  try {
    const files = await readdir(dirPath);

    for (const file of files) {
      if (!file.endsWith('.js')) continue;

      const filePath = join(dirPath, file);
      const blocks = await findEndpointBlocks(filePath);

      for (const block of blocks) {
        const endpoint = parseEndpointBlock(block);
        if (endpoint.tool) {
          endpoint.sourceFile = file;
          endpoints.push(endpoint);
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning ${dirPath}:`, error.message);
  }

  return endpoints;
}

// ============================================================================
// MCP TOOLS GENERATOR
// ============================================================================

/**
 * Convert parsed endpoint to MCP tool format
 */
function endpointToMcpTool(endpoint) {
  const properties = {};
  const required = [];

  for (const param of endpoint.params) {
    const prop = {
      type: mapTypeToJsonSchema(param.type),
      description: param.description
    };

    if (param.enum) {
      prop.enum = param.enum;
    }
    if (param.default !== null && param.default !== 'null') {
      prop.default = param.default;
    }

    properties[param.name] = prop;

    if (param.required) {
      required.push(param.name);
    }
  }

  return {
    name: endpoint.tool,
    description: endpoint.description || `${endpoint.tool} - ${endpoint.category || 'API'} endpoint`,
    inputSchema: {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {})
    }
  };
}

/**
 * Map our type notation to JSON Schema types
 */
function mapTypeToJsonSchema(type) {
  const typeMap = {
    'string': 'string',
    'number': 'number',
    'integer': 'integer',
    'boolean': 'boolean',
    'object': 'object',
    'array': 'array',
    'Object': 'object',
    'Array': 'array',
    'Object<string, string>': 'object',
    'Object<string, any>': 'object'
  };

  return typeMap[type] || 'string';
}

/**
 * Generate MCP tools JavaScript module
 */
function generateMcpToolsModule(tools) {
  const toolsJson = JSON.stringify(tools, null, 2);

  return `/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  AUTO-GENERATED MCP TOOLS                                                  ║
 * ║  DO NOT EDIT MANUALLY - Generated from @hacs-endpoint documentation        ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  Generated: ${new Date().toISOString()}                           ║
 * ║  Tool Count: ${String(tools.length).padEnd(59)}║
 * ║  Source: src/endpoint_definition_automation/generators/generate-mcp-tools.js║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * To regenerate:
 *   cd /mnt/coordinaton_mcp_data/worktrees/foundation/src/endpoint_definition_automation
 *   node generate-all.js --only mcp-tools
 *
 * Or regenerate all documentation:
 *   node generate-all.js
 */

/**
 * MCP tools array for use in handleToolsList()
 * Import this in streamable-http-server.js:
 *   import { mcpTools } from './mcp-tools-generated.js';
 */
export const mcpTools = ${toolsJson};

/**
 * Get tool by name
 */
export function getToolByName(name) {
  return mcpTools.find(t => t.name === name);
}

/**
 * Get tools by category (requires parsing description for category)
 */
export function getToolNames() {
  return mcpTools.map(t => t.name);
}

// Default export for CommonJS compatibility
export default mcpTools;
`;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  MCP TOOLS GENERATOR                                                       ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Parse command line args
  const args = process.argv.slice(2);
  let outputPath = CONFIG.defaultOutput;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[i + 1];
      i++;
    }
  }

  // Scan for endpoints
  console.log('Scanning for @hacs-endpoint blocks...');
  let allEndpoints = [];

  for (const dir of CONFIG.scanDirs) {
    console.log(`  → ${dir}`);
    const endpoints = await scanDirectory(dir);
    allEndpoints = allEndpoints.concat(endpoints);
  }

  // Filter to external endpoints only (same as OpenAPI)
  const externalEndpoints = allEndpoints.filter(e => e.visibility !== 'internal');
  const internalEndpoints = allEndpoints.filter(e => e.visibility === 'internal');

  console.log('');
  console.log(`Found ${allEndpoints.length} documented endpoints:`);
  console.log(`  → ${externalEndpoints.length} external (included in MCP tools)`);
  console.log(`  → ${internalEndpoints.length} internal (excluded)`);
  console.log('');

  // Convert to MCP tools format
  const tools = externalEndpoints.map(endpointToMcpTool);

  // Sort by name for consistent output
  tools.sort((a, b) => a.name.localeCompare(b.name));

  // Generate the module
  const moduleContent = generateMcpToolsModule(tools);

  // Write output
  await writeFile(outputPath, moduleContent, 'utf8');
  console.log(`✅ Generated MCP tools module: ${outputPath}`);
  console.log(`   Contains ${tools.length} tools`);

  // List tools by category
  const categories = {};
  for (const ep of externalEndpoints) {
    const cat = ep.category || 'uncategorized';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(ep.tool);
  }

  console.log('');
  console.log('Tools by category:');
  for (const [cat, toolNames] of Object.entries(categories).sort()) {
    console.log(`  ${cat}: ${toolNames.length} tools`);
  }

  console.log('');
  console.log('Next steps:');
  console.log('  1. Update streamable-http-server.js to import mcpTools');
  console.log('  2. Replace hardcoded tools array with: return { tools: mcpTools };');
  console.log('  3. Restart server and test tools/list');
}

main().catch(console.error);
