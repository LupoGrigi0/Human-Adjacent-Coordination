#!/usr/bin/env node
/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  UI-API-DOCS.JSON GENERATOR                                               ║
 * ║  Generates UI-focused API reference JSON for frontend consumers           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Usage: node generate-ui-api-docs.js [--output path/to/ui-api-docs.json]
 *
 * Produces a structured API reference grouped by category, suitable for
 * rendering in UI components (API explorers, tooltips, docs pages, etc.).
 * Includes ALL endpoints (public and internal), full parameter details,
 * error codes, examples, and permission requirements.
 *
 * Output goes to src/ui-api-docs.json.
 *
 * @author Axiom
 * @created 2026-02-22
 */

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SHARED_CONFIG } from '../shared-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  scanDirs: SHARED_CONFIG.scanDirs,
  defaultOutput: join(SHARED_CONFIG.srcRoot, 'ui-api-docs.json'),
  apiVersion: '2.0.0',
};

// ============================================================================
// PARSER (identical to generate-openapi-verbose.js)
// ============================================================================

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
    } else if (trimmed.startsWith('@template-version ')) {
      // Skip
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
      finalizeCurrentContent();
      currentSection = 'description';
    } else if (trimmed.startsWith('@param ')) {
      finalizeCurrentContent();
      currentSection = 'param';
      const paramMatch = trimmed.match(/@param \{([^}]+)\}\s*(\[?[\w.]+\]?=?[^\s]*)\s*-\s*(.+)/);
      if (paramMatch) {
        const isOptional = paramMatch[2].startsWith('[');
        const paramName = paramMatch[2].replace(/[\[\]]/g, '').split('=')[0];
        const defaultMatch = paramMatch[2].match(/=([^\]]+)/);
        currentParam = {
          name: paramName,
          type: paramMatch[1],
          description: paramMatch[3].replace(/\[(required|optional)\]/i, '').trim(),
          required: !isOptional,
          default: defaultMatch ? defaultMatch[1] : undefined,
          source: null,
          enum: null
        };
        endpoint.params.push(currentParam);
        sourceLines = [];
      }
    } else if (trimmed.startsWith('@source ')) {
      sourceLines = [trimmed.replace('@source ', '').trim()];
    } else if (trimmed.startsWith('@default ')) {
      if (currentParam) currentParam.default = trimmed.replace('@default ', '').trim();
    } else if (trimmed.startsWith('@enum ')) {
      if (currentParam) currentParam.enum = trimmed.replace('@enum ', '').trim().split('|').map(s => s.trim());
    } else if (trimmed.startsWith('@validate ')) {
      if (currentParam) currentParam.validate = trimmed.replace('@validate ', '').trim();
    } else if (trimmed.startsWith('@returns ')) {
      currentSection = 'returns';
      const returnMatch = trimmed.match(/@returns \{([^}]+)\}\s*(\S+)\s*-\s*(.+)/);
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
      const errorMatch = trimmed.match(/@error (\S+)\s*-\s*(.+)/);
      if (errorMatch) {
        currentError = {
          code: errorMatch[1],
          description: errorMatch[2],
          recover: null
        };
        endpoint.errors.push(currentError);
        recoverLines = [];
      }
    } else if (trimmed.startsWith('@recover ')) {
      recoverLines = [trimmed.replace('@recover ', '').trim()];
    } else if (trimmed.startsWith('@example ')) {
      finalizeCurrentContent();
      currentSection = 'example';
      currentExample = {
        title: trimmed.replace('@example ', '').trim(),
        json: ''
      };
      endpoint.examples.push(currentExample);
      exampleJsonLines = [];
    } else if (trimmed.startsWith('@see ')) {
      const seeMatch = trimmed.match(/@see (\S+)\s*-\s*(.+)/);
      if (seeMatch) {
        endpoint.related.push({
          endpoint: seeMatch[1],
          description: seeMatch[2]
        });
      }
    } else if (trimmed.startsWith('@note ')) {
      endpoint.notes.push(trimmed.replace('@note ', '').trim());
    } else if (trimmed.startsWith('@todo ')) {
      endpoint.notes.push('TODO: ' + trimmed.replace('@todo ', '').trim());
    } else if (trimmed.startsWith('@needs-clarification ')) {
      endpoint.needsClarification.push(trimmed.replace('@needs-clarification ', '').trim());
    } else if (trimmed.startsWith('@')) {
      // Unknown tag — skip
    } else {
      if (currentSection === 'description') {
        descriptionLines.push(trimmed);
      } else if (currentSection === 'param' && sourceLines.length > 0) {
        sourceLines.push(trimmed);
      } else if (currentError && recoverLines.length > 0) {
        recoverLines.push(trimmed);
      } else if (currentSection === 'example' && currentExample) {
        if (trimmed.startsWith('{') || trimmed.startsWith('[') || exampleJsonLines.length > 0) {
          if (!trimmed.startsWith('}') || exampleJsonLines.length === 0) {
            exampleJsonLines.push(trimmed);
          }
          if (trimmed === '}' || trimmed === '},' || trimmed.endsWith('}')) {
            exampleJsonLines.push(trimmed);
          }
        }
      }
    }
  }

  finalizeCurrentContent();
  endpoint.description = descriptionLines.join(' ').trim();
  return endpoint;
}

async function extractEndpointsFromFile(filePath) {
  const content = await readFile(filePath, 'utf-8');
  const endpoints = [];
  const jsdocRegex = /\/\*\*[\s\S]*?@hacs-endpoint[\s\S]*?\*\//g;
  const matches = content.match(jsdocRegex);

  if (matches) {
    for (const match of matches) {
      const endpoint = parseEndpointBlock(match);
      if (endpoint.tool) {
        endpoint.sourceFile = filePath;
        endpoints.push(endpoint);
      }
    }
  }
  return endpoints;
}

async function scanForEndpoints(dir) {
  const endpoints = [];
  try {
    const files = await readdir(dir);
    for (const file of files) {
      if (file.endsWith('.js') && !file.startsWith('_')) {
        const filePath = join(dir, file);
        const fileEndpoints = await extractEndpointsFromFile(filePath);
        endpoints.push(...fileEndpoints);
      }
    }
  } catch (error) {
    console.error(`Error scanning ${dir}:`, error.message);
  }
  return endpoints;
}

// ============================================================================
// UI API DOCS GENERATOR
// ============================================================================

/**
 * Converts the raw parsed params array into a UI-friendly structure.
 * Strips undefined fields for a clean JSON output.
 */
function buildParamList(params) {
  return params.map(p => {
    const entry = {
      name: p.name,
      type: p.type,
      required: p.required,
      description: p.description,
    };
    if (p.default !== undefined) entry.default = p.default;
    if (p.enum) entry.enum = p.enum;
    if (p.source) entry.source = p.source;
    if (p.validate) entry.validate = p.validate;
    return entry;
  });
}

/**
 * Groups an array of endpoints by their category field.
 * Endpoints without a category are placed under "uncategorized".
 */
function groupByCategory(endpoints) {
  const groups = {};
  for (const ep of endpoints) {
    const cat = ep.category || 'uncategorized';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(ep);
  }
  return groups;
}

/**
 * Builds the top-level ui-api-docs document from the full endpoint list.
 * All endpoints are included (no visibility filter).
 */
function generateUiApiDocs(allEndpoints) {
  const grouped = groupByCategory(allEndpoints);

  const categories = {};
  for (const [cat, eps] of Object.entries(grouped)) {
    categories[cat] = {
      name: cat,
      endpointCount: eps.length,
      endpoints: eps.map(ep => {
        const entry = {
          name: ep.tool,
          description: ep.description,
          category: ep.category || 'uncategorized',
          status: ep.status || null,
          visibility: ep.visibility,
          version: ep.version || null,
          since: ep.since || null,
          parameters: buildParamList(ep.params),
          returns: ep.returns.length > 0 ? ep.returns : null,
          errors: ep.errors.length > 0 ? ep.errors : null,
          examples: ep.examples.length > 0 ? ep.examples : null,
          permissions: ep.permissions || null,
          rateLimit: ep.rateLimit || null,
          related: ep.related.length > 0 ? ep.related : null,
          notes: ep.notes.length > 0 ? ep.notes : null,
        };
        if (ep.needsClarification && ep.needsClarification.length > 0) {
          entry.needsClarification = ep.needsClarification;
        }
        return entry;
      }),
    };
  }

  return {
    meta: {
      generated: new Date().toISOString(),
      generator: 'generate-ui-api-docs.js',
      version: CONFIG.apiVersion,
      totalEndpoints: allEndpoints.length,
      totalCategories: Object.keys(categories).length,
      includesInternal: true,
    },
    categories,
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  HACS UI API Docs Generator                                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  const args = process.argv.slice(2);
  const outputIndex = args.indexOf('--output');
  const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : CONFIG.defaultOutput;

  // Ensure output directory exists
  const outputDir = dirname(outputPath);
  await mkdir(outputDir, { recursive: true });

  console.log('\n Scanning for @hacs-endpoint documentation...');
  let allEndpoints = [];

  for (const dir of CONFIG.scanDirs) {
    console.log(`   Scanning: ${dir}`);
    const endpoints = await scanForEndpoints(dir);
    allEndpoints.push(...endpoints);
  }

  console.log(`\n Found ${allEndpoints.length} endpoint(s) (all visibilities included)`);

  console.log('\n Generating UI API Docs...');
  const docs = generateUiApiDocs(allEndpoints);

  await writeFile(outputPath, JSON.stringify(docs, null, 2));
  console.log(`\n UI API Docs written to: ${outputPath}`);

  const stats = JSON.stringify(docs).length;
  console.log(`   Size: ${(stats / 1024).toFixed(1)} KB`);
  console.log(`   Categories: ${docs.meta.totalCategories}`);
  console.log(`   Total endpoints: ${docs.meta.totalEndpoints}`);
  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
