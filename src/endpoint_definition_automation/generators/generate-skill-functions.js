#!/usr/bin/env node
/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  CLAUDE SKILL FUNCTIONS.MD GENERATOR                                       ║
 * ║  Generates skill reference documentation from @hacs-endpoint documentation ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Usage: node generate-skill-functions.js [--output path/to/functions.md]
 *
 * Parses all .js files in src/v2/ looking for @hacs-endpoint blocks,
 * extracts the documentation, and generates the Claude skill functions.md
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { SHARED_CONFIG } from '../shared-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
  // Directories to scan - from shared config (single source of truth)
  scanDirs: SHARED_CONFIG.scanDirs,
  // Default output path - the skill source in the repo (not user's local install)
  // Skill name is "hacs" (not "hacs-coordination" - coordination is in the acronym)
  defaultOutput: join(SHARED_CONFIG.srcRoot, 'HACS', 'hacs', 'references', 'functions.md'),
};

// ============================================================================
// PARSER: Extract @hacs-endpoint blocks from source files
// (Shared logic with other generators)
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
          name: name.replace(/[\[\]]/g, '').split('=')[0],
          type: type,
          description: desc.replace(/\[(required|optional)\]/i, '').trim(),
          required: requiredMatch ? requiredMatch[1].toLowerCase() === 'required' : !name.startsWith('['),
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
    } else if (trimmed.startsWith('@returns ')) {
      const returnMatch = trimmed.match(/@returns\s+\{([^}]+)\}\s+(\S+)\s*-?\s*(.*)/);
      if (returnMatch) {
        endpoint.returns.push({
          type: returnMatch[1],
          path: returnMatch[2],
          description: returnMatch[3]
        });
      }
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
    } else if (trimmed.startsWith('@example ')) {
      finalizeCurrentContent();
      currentExample = {
        title: trimmed.replace('@example ', '').trim(),
        json: ''
      };
      endpoint.examples.push(currentExample);
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
// MARKDOWN GENERATOR
// ============================================================================

/**
 * Group endpoints by category
 */
function groupByCategory(endpoints) {
  const groups = {};
  for (const ep of endpoints) {
    const cat = ep.category || 'Other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(ep);
  }
  return groups;
}

/**
 * Generate markdown for a single endpoint
 */
function endpointToMarkdown(endpoint) {
  let md = `### ${endpoint.tool}\n`;
  md += `${endpoint.description}\n\n`;

  // Parameters
  if (endpoint.params.length > 0) {
    md += `**Parameters:**\n`;
    for (const param of endpoint.params) {
      const reqStr = param.required ? '(required)' : '(optional)';
      md += `- \`${param.name}\` ${reqStr}: ${param.description}`;
      if (param.enum) {
        md += ` [${param.enum.join(', ')}]`;
      }
      if (param.default) {
        md += ` (default: ${param.default})`;
      }
      md += '\n';
    }
    md += '\n';
  } else {
    md += `**Parameters:** None\n\n`;
  }

  // Returns
  if (endpoint.returns.length > 0) {
    md += `**Returns:** `;
    const returnDescs = endpoint.returns.map(r => r.description);
    md += returnDescs.join(', ') + '\n\n';
  }

  // Example
  if (endpoint.examples.length > 0) {
    md += `**Example:**\n`;
    md += '```json\n';
    md += '{\n';
    md += `  "name": "${endpoint.tool}",\n`;
    md += `  "arguments": {\n`;
    // Build example arguments from params
    const exampleArgs = endpoint.params
      .filter(p => p.required || p.default)
      .map(p => {
        let value = p.default || (p.enum ? `"${p.enum[0]}"` : '"example"');
        if (p.type === 'string' && !value.startsWith('"')) value = `"${value}"`;
        return `    "${p.name}": ${value}`;
      });
    md += exampleArgs.join(',\n') + '\n';
    md += `  }\n`;
    md += '}\n';
    md += '```\n\n';
  }

  return md;
}

/**
 * Generate the full functions.md content
 */
function generateFunctionsMd(endpoints) {
  const grouped = groupByCategory(endpoints);
  const timestamp = new Date().toISOString();

  let md = `# HACS Function Reference

Complete reference for all ${endpoints.length} coordination functions available in the HACS system.

> **Auto-generated:** ${timestamp}
> **Source:** @hacs-endpoint documentation in src/v2/

`;

  // Category order for nice presentation
  const categoryOrder = [
    'Identity & Onboarding',
    'Instance Management',
    'Project Management',
    'Task Management',
    'Messaging',
    'Roles & Personalities',
    'Diary & Knowledge',
    'Lists & UI State',
    'Session Management',
    'System'
  ];

  // Output in preferred order, then any remaining
  const outputOrder = [...categoryOrder];
  for (const cat of Object.keys(grouped)) {
    if (!outputOrder.includes(cat)) {
      outputOrder.push(cat);
    }
  }

  for (const category of outputOrder) {
    if (!grouped[category]) continue;

    md += `## ${category} Functions\n\n`;

    // Sort endpoints within category by name
    const sortedEndpoints = grouped[category].sort((a, b) => a.tool.localeCompare(b.tool));

    for (const endpoint of sortedEndpoints) {
      md += endpointToMarkdown(endpoint);
    }
  }

  // Add footer with response format info
  md += `## Response Format

All functions return responses in JSON-RPC 2.0 format:

\`\`\`json
{
  "jsonrpc": "2.0",
  "result": {
    "success": true,
    "content": [
      {
        "type": "text",
        "text": "{JSON response data}"
      }
    ],
    "data": {},
    "metadata": {
      "timestamp": "2025-...",
      "function": "function_name",
      "request_id": "req-001"
    }
  },
  "id": 1
}
\`\`\`

## Error Codes

- \`-32700\`: Parse error
- \`-32600\`: Invalid request
- \`-32601\`: Method not found
- \`-32602\`: Invalid params
- \`-32603\`: Internal error
- \`-32000 to -32099\`: Server-defined errors
`;

  return md;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  CLAUDE SKILL FUNCTIONS.MD GENERATOR                                       ║');
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

  // Filter to external endpoints only
  const externalEndpoints = allEndpoints.filter(e => e.visibility !== 'internal');
  const internalEndpoints = allEndpoints.filter(e => e.visibility === 'internal');

  console.log('');
  console.log(`Found ${allEndpoints.length} documented endpoints:`);
  console.log(`  → ${externalEndpoints.length} external (included in skill docs)`);
  console.log(`  → ${internalEndpoints.length} internal (excluded)`);
  console.log('');

  // Group and count by category
  const grouped = groupByCategory(externalEndpoints);
  console.log('Functions by category:');
  for (const [cat, eps] of Object.entries(grouped).sort()) {
    console.log(`  ${cat}: ${eps.length} functions`);
  }

  // Generate the markdown
  const markdown = generateFunctionsMd(externalEndpoints);

  // Write output
  await writeFile(outputPath, markdown, 'utf8');
  console.log('');
  console.log(`✅ Generated skill functions.md: ${outputPath}`);
  console.log(`   Contains ${externalEndpoints.length} function definitions`);

  // Package the skill as a .skill file (zip archive)
  const hacsDir = join(SHARED_CONFIG.srcRoot, 'HACS');
  const skillDir = join(hacsDir, 'hacs');
  const skillFile = join(hacsDir, 'hacs.skill');

  console.log('');
  console.log('Packaging skill...');

  try {
    // Remove old .skill file if exists, then zip the hacs/ directory
    // The -r flag recurses into directories, we cd into HACS so the zip root is 'hacs/'
    execSync(`rm -f "${skillFile}" && cd "${hacsDir}" && zip -r hacs.skill hacs/`, { stdio: 'pipe' });
    console.log(`✅ Packaged skill: ${skillFile}`);
  } catch (error) {
    console.error(`⚠️  Failed to package skill: ${error.message}`);
  }
}

main().catch(console.error);
