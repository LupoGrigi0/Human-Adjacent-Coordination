#!/usr/bin/env node
/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  API HELP GENERATOR                                                        ║
 * ║  Generates verbose help content for get_tool_help API                      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Usage: node generate-help.js
 *
 * Parses all .js files in src/v2/ looking for @hacs-endpoint blocks,
 * extracts full documentation, and generates api-help.json for the
 * get_tool_help endpoint to serve.
 *
 * This is the "man pages" approach - verbose documentation on demand.
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SHARED_CONFIG } from '../shared-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONFIG = {
  scanDirs: SHARED_CONFIG.scanDirs,
  outputPath: '/mnt/coordinaton_mcp_data/api-help.json'
};

// ============================================================================
// PARSER: Extract @hacs-endpoint blocks from source files
// ============================================================================

function parseEndpointBlock(block) {
  const endpoint = {
    tool: null,
    version: null,
    category: null,
    status: null,
    visibility: 'external',
    description: '',
    oneLiner: '',
    parameters: [],
    returns: [],
    examples: [],
    related: [],
    notes: []
  };

  const lines = block.split('\n');
  let descriptionLines = [];
  let inDescription = false;
  let currentParam = null;

  for (const line of lines) {
    const trimmed = line.replace(/^\s*\*\s?/, '').trim();

    // Skip decorative lines
    if (trimmed.match(/^[─┌┐└┘│═╔╗╚╝║]+$/) || trimmed === '') continue;
    if (trimmed.startsWith('│') || trimmed.endsWith('│')) continue;

    // Parse @tags
    if (trimmed.startsWith('@tool ')) {
      endpoint.tool = trimmed.replace('@tool ', '').trim();
      inDescription = false;
    } else if (trimmed.startsWith('@version ')) {
      endpoint.version = trimmed.replace('@version ', '').trim();
      inDescription = false;
    } else if (trimmed.startsWith('@category ')) {
      endpoint.category = trimmed.replace('@category ', '').trim();
      inDescription = false;
    } else if (trimmed.startsWith('@status ')) {
      endpoint.status = trimmed.replace('@status ', '').trim();
      inDescription = false;
    } else if (trimmed.startsWith('@visibility ')) {
      endpoint.visibility = trimmed.replace('@visibility ', '').trim();
      inDescription = false;
    } else if (trimmed.startsWith('@description')) {
      inDescription = true;
      const desc = trimmed.replace('@description', '').trim();
      if (desc) descriptionLines.push(desc);
    } else if (trimmed.startsWith('@param ')) {
      inDescription = false;
      // Parse: @param {type} name - description [required/optional]
      const paramMatch = trimmed.match(/@param\s+\{([^}]+)\}\s+(\w+)\s*-?\s*(.*)/);
      if (paramMatch) {
        const [, type, name, desc] = paramMatch;
        const required = desc.includes('[required]');
        const optional = desc.includes('[optional]');
        currentParam = {
          name,
          type,
          description: desc.replace(/\[required\]|\[optional\]/g, '').trim(),
          required: required || (!optional && !desc.includes('default'))
        };
        endpoint.parameters.push(currentParam);
      }
    } else if (trimmed.startsWith('@returns ')) {
      inDescription = false;
      const returnMatch = trimmed.match(/@returns\s+\{([^}]+)\}\s*(.*)/);
      if (returnMatch) {
        const [, type, desc] = returnMatch;
        endpoint.returns.push({ type, description: desc });
      }
    } else if (trimmed.startsWith('@example')) {
      inDescription = false;
      // Next lines until another @ tag are the example
    } else if (trimmed.startsWith('@related ')) {
      inDescription = false;
      endpoint.related.push(trimmed.replace('@related ', '').trim());
    } else if (trimmed.startsWith('@note ')) {
      inDescription = false;
      endpoint.notes.push(trimmed.replace('@note ', '').trim());
    } else if (!trimmed.startsWith('@') && inDescription) {
      // Continue description on next lines (until we hit another @tag)
      descriptionLines.push(trimmed);
    }
  }

  endpoint.description = descriptionLines.join(' ').trim();
  // First sentence as one-liner
  endpoint.oneLiner = endpoint.description.split('.')[0] + '.';

  return endpoint;
}

async function scanDirectory(dirPath) {
  const endpoints = [];

  try {
    const files = await readdir(dirPath);

    for (const file of files) {
      if (!file.endsWith('.js')) continue;

      const filePath = join(dirPath, file);
      const content = await readFile(filePath, 'utf8');

      // Find all @hacs-endpoint blocks
      const blockRegex = /\/\*\*[\s\S]*?@hacs-endpoint[\s\S]*?\*\//g;
      const blocks = content.match(blockRegex) || [];

      for (const block of blocks) {
        // Skip module-level docs (no @tool)
        if (!block.includes('@tool ')) continue;

        const parsed = parseEndpointBlock(block);
        if (parsed.tool && parsed.visibility !== 'internal') {
          endpoints.push(parsed);
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning ${dirPath}:`, error.message);
  }

  return endpoints;
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  API HELP GENERATOR                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('📂 Scanning for @hacs-endpoint documentation...');

  let allEndpoints = [];

  for (const scanDir of CONFIG.scanDirs) {
    console.log(`   Scanning: ${scanDir}`);
    const endpoints = await scanDirectory(scanDir);
    allEndpoints = allEndpoints.concat(endpoints);
  }

  console.log(`\n✅ Found ${allEndpoints.length} documented endpoint(s)`);

  // Build the help structure
  const helpData = {
    generated: new Date().toISOString(),
    version: '1.0.0',
    totalTools: allEndpoints.length,
    categories: [...new Set(allEndpoints.map(e => e.category).filter(Boolean))],
    tools: {}
  };

  // Group by category for stats
  const byCategory = {};

  for (const ep of allEndpoints) {
    const toolName = ep.tool.toLowerCase();
    helpData.tools[toolName] = {
      name: ep.tool,
      category: ep.category,
      version: ep.version,
      status: ep.status,
      oneLiner: ep.oneLiner,
      description: ep.description,
      parameters: ep.parameters,
      returns: ep.returns,
      examples: ep.examples,
      related: ep.related,
      notes: ep.notes
    };

    const cat = ep.category || 'uncategorized';
    if (!byCategory[cat]) byCategory[cat] = 0;
    byCategory[cat]++;
  }

  // Add a special "list" entry
  helpData.tools['list'] = {
    name: 'list',
    category: 'meta',
    description: 'Lists all available tools grouped by category',
    oneLiner: 'Lists all available tools.',
    parameters: [],
    returns: [{ type: 'object', description: 'Tools grouped by category' }]
  };

  // Write output
  await writeFile(CONFIG.outputPath, JSON.stringify(helpData, null, 2));

  console.log(`\n📝 Help content written to: ${CONFIG.outputPath}`);
  console.log('');
  console.log('Tools by category:');
  for (const [cat, count] of Object.entries(byCategory).sort()) {
    console.log(`  ${cat}: ${count} tools`);
  }
  console.log('');
  console.log(`Total: ${allEndpoints.length} tools documented`);
}

main().catch(console.error);
