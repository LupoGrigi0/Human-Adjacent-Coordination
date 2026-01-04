#!/usr/bin/env node
/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  OPENAPI.JSON GENERATOR                                                   ║
 * ║  Generates OpenAPI 3.1.1 specification from @hacs-endpoint documentation  ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Usage: node generate-openapi.js [--output path/to/openapi.json]
 *
 * Parses all .js files in src/v2/ looking for @hacs-endpoint blocks,
 * extracts the documentation, and generates a complete OpenAPI spec.
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SHARED_CONFIG } from '../shared-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

// TERSE_MODE: Strip verbose "Source:" helper text from parameter descriptions
// This dramatically reduces openapi.json size (~254KB -> ~80KB)
// Full documentation is available via get_tool_help(toolName) API
const TERSE_MODE = true;

const CONFIG = {
  // Directories to scan - from shared config (single source of truth)
  scanDirs: SHARED_CONFIG.scanDirs,
  // Default output path - the actual openapi.json served by nginx
  defaultOutput: join(SHARED_CONFIG.srcRoot, 'openapi.json'),
  // OpenAPI base info
  openapi: {
    version: '3.1.1',
    info: {
      title: 'HACS Coordination API',
      description: 'Human-Adjacent Coordination System - AI Instance Coordination API',
      version: '2.0.0',
      contact: {
        name: 'HACS Team',
        url: 'https://github.com/LupoGrigi0/Human-Adjacent-Coordination'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'https://smoothcurves.nexus',
        description: 'Production HACS Server'
      }
    ]
  }
};

// ============================================================================
// PARSER: Extract @hacs-endpoint blocks from source files
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
    visibility: 'external', // Default to external if not specified
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

  // Section headers that indicate a new section (stop accumulating previous content)
  const SECTION_HEADERS = ['DESCRIPTION', 'PARAMETERS', 'RETURNS', 'PERMISSIONS & LIMITS',
                           'ERRORS & RECOVERY', 'EXAMPLES', 'RELATED', 'NOTES'];

  // Helper to check if a line is a section header
  const isSectionHeader = (line) => {
    return SECTION_HEADERS.some(h => line === h || line.startsWith(h));
  };

  // Helper to finalize current accumulation
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

    // Skip decorative lines and empty lines
    if (trimmed.match(/^[─┌┐└┘│═╔╗╚╝║]+$/) || trimmed === '') continue;

    // Skip box title lines (contain │ at start/end)
    if (trimmed.startsWith('│') || trimmed.endsWith('│')) continue;

    // Check for section headers - they indicate end of previous section
    if (isSectionHeader(trimmed)) {
      finalizeCurrentContent();
      currentSection = trimmed.toLowerCase().replace(/ & /g, '_').replace(/ /g, '_');
      currentParam = null;
      currentError = null;
      currentExample = null;
      continue;
    }

    // Parse @tags
    if (trimmed.startsWith('@tool ')) {
      endpoint.tool = trimmed.replace('@tool ', '').trim();
    } else if (trimmed.startsWith('@template-version ')) {
      // Skip template version, it's metadata about the template
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
      if (currentParam) {
        currentParam.default = trimmed.replace('@default ', '').trim();
      }
    } else if (trimmed.startsWith('@enum ')) {
      if (currentParam) {
        currentParam.enum = trimmed.replace('@enum ', '').trim().split('|').map(s => s.trim());
      }
    } else if (trimmed.startsWith('@validate ')) {
      if (currentParam) {
        currentParam.validate = trimmed.replace('@validate ', '').trim();
      }
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
      // Unknown tag - skip
    } else {
      // Content line - route to appropriate accumulator based on current section
      if (currentSection === 'description') {
        descriptionLines.push(trimmed);
      } else if (currentSection === 'param' && sourceLines.length > 0) {
        // Continue multiline @source
        sourceLines.push(trimmed);
      } else if (currentError && recoverLines.length > 0) {
        // Continue multiline @recover
        recoverLines.push(trimmed);
      } else if (currentSection === 'example' && currentExample) {
        // Accumulate example JSON
        if (trimmed.startsWith('{') || trimmed.startsWith('[') || exampleJsonLines.length > 0) {
          // Stop at closing brace
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

  // Finalize any remaining content
  finalizeCurrentContent();
  endpoint.description = descriptionLines.join(' ').trim();

  return endpoint;
}

/**
 * Find and extract all @hacs-endpoint blocks from a file
 */
async function extractEndpointsFromFile(filePath) {
  const content = await readFile(filePath, 'utf-8');
  const endpoints = [];

  // Find all JSDoc blocks with @hacs-endpoint
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

/**
 * Scan directory for endpoint files
 */
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
// GENERATOR: Convert parsed endpoints to OpenAPI spec
// ============================================================================

/**
 * Convert endpoint params to OpenAPI schema
 */
function paramsToSchema(params) {
  const properties = {};
  const required = [];

  for (const param of params) {
    const prop = {
      type: param.type === 'string' ? 'string' :
            param.type === 'number' ? 'number' :
            param.type === 'boolean' ? 'boolean' :
            param.type === 'array' ? 'array' :
            param.type === 'object' ? 'object' : 'string',
      description: param.description
    };

    // In TERSE_MODE, skip verbose Source: helper text (available via get_tool_help API)
    if (param.source && !TERSE_MODE) {
      prop.description += `\n\nSource: ${param.source}`;
    }

    if (param.enum) {
      prop.enum = param.enum;
    }

    if (param.default !== undefined) {
      prop.default = param.default;
    }

    properties[param.name] = prop;

    if (param.required) {
      required.push(param.name);
    }
  }

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined
  };
}

/**
 * Generate OpenAPI spec from endpoints
 */
function generateOpenAPISpec(endpoints) {
  const spec = {
    openapi: CONFIG.openapi.version,
    info: CONFIG.openapi.info,
    servers: CONFIG.openapi.servers,
    paths: {
      '/mcp': {
        post: {
          operationId: 'executeMcpFunction',
          summary: 'Execute MCP coordination function',
          description: 'Execute any coordination function through the MCP protocol interface.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/JsonRpcRequest'
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Function executed successfully',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/JsonRpcResponse'
                  }
                }
              }
            }
          }
        }
      },
      '/health': {
        get: {
          operationId: 'getHealth',
          summary: 'Health check',
          security: [],
          responses: {
            '200': {
              description: 'Server is healthy'
            }
          }
        }
      }
    },
    components: {
      schemas: {
        JsonRpcRequest: {
          type: 'object',
          required: ['jsonrpc', 'method', 'params', 'id'],
          properties: {
            jsonrpc: { type: 'string', const: '2.0' },
            method: { type: 'string', const: 'tools/call' },
            params: { $ref: '#/components/schemas/ToolCallParams' },
            id: { oneOf: [{ type: 'string' }, { type: 'number' }] }
          }
        },
        ToolCallParams: {
          type: 'object',
          required: ['name'],
          properties: {
            name: {
              type: 'string',
              enum: endpoints.map(e => e.tool),
              description: 'Name of the coordination function to execute'
            },
            arguments: {
              type: 'object',
              description: 'Function-specific arguments'
            }
          }
        },
        JsonRpcResponse: {
          type: 'object',
          properties: {
            jsonrpc: { type: 'string', const: '2.0' },
            result: { type: 'object' },
            error: { $ref: '#/components/schemas/JsonRpcError' },
            id: { oneOf: [{ type: 'string' }, { type: 'number' }] }
          }
        },
        JsonRpcError: {
          type: 'object',
          properties: {
            code: { type: 'integer' },
            message: { type: 'string' },
            data: { type: 'object' }
          }
        }
      }
    },
    'x-hacs-tools': {}
  };

  // Add each endpoint as x-hacs-tools entry with full detail
  for (const endpoint of endpoints) {
    spec['x-hacs-tools'][endpoint.tool] = {
      name: endpoint.tool,
      description: endpoint.description,
      category: endpoint.category,
      status: endpoint.status,
      version: endpoint.version,
      since: endpoint.since,
      inputSchema: paramsToSchema(endpoint.params),
      permissions: endpoint.permissions,
      rateLimit: endpoint.rateLimit,
      errors: endpoint.errors,
      examples: endpoint.examples,
      related: endpoint.related,
      notes: endpoint.notes,
      needsClarification: endpoint.needsClarification.length > 0 ? endpoint.needsClarification : undefined
    };

    // Also add to components/schemas for detailed reference
    spec.components.schemas[`${endpoint.tool}_params`] = paramsToSchema(endpoint.params);
  }

  return spec;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  HACS OpenAPI Generator                                       ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  // Parse command line args
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf('--output');
  const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : CONFIG.defaultOutput;

  // Scan for endpoints
  console.log('\n📂 Scanning for @hacs-endpoint documentation...');
  let allEndpoints = [];

  for (const dir of CONFIG.scanDirs) {
    console.log(`   Scanning: ${dir}`);
    const endpoints = await scanForEndpoints(dir);
    allEndpoints.push(...endpoints);
  }

  // Separate external and internal endpoints
  const externalEndpoints = allEndpoints.filter(e => e.visibility !== 'internal');
  const internalEndpoints = allEndpoints.filter(e => e.visibility === 'internal');

  console.log(`\n✅ Found ${allEndpoints.length} documented endpoint(s):`);
  console.log(`   📤 External: ${externalEndpoints.length}`);
  console.log(`   🔒 Internal: ${internalEndpoints.length} (excluded from OpenAPI)`);
  console.log('');

  for (const ep of externalEndpoints) {
    const status = ep.needsClarification.length > 0 ? '⚠️' : '✓';
    console.log(`   ${status} ${ep.tool} (${ep.category}) - ${ep.status}`);
    if (ep.needsClarification.length > 0) {
      console.log(`      ⚠️  Needs clarification: ${ep.needsClarification.length} item(s)`);
    }
  }

  if (internalEndpoints.length > 0) {
    console.log('\n   🔒 Internal endpoints (not in OpenAPI):');
    for (const ep of internalEndpoints) {
      console.log(`      • ${ep.tool} (${ep.category})`);
    }
  }

  // Generate spec (external endpoints only)
  console.log('\n📝 Generating OpenAPI specification...');
  const spec = generateOpenAPISpec(externalEndpoints);

  // Write output
  await writeFile(outputPath, JSON.stringify(spec, null, 2));
  console.log(`\n✅ OpenAPI spec written to: ${outputPath}`);

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`   Total documented: ${allEndpoints.length}`);
  console.log(`   External (in OpenAPI): ${externalEndpoints.length}`);
  console.log(`   Internal (excluded): ${internalEndpoints.length}`);
  console.log(`   Needing clarification: ${externalEndpoints.filter(e => e.needsClarification.length > 0).length}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
