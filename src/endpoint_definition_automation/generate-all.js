#!/usr/bin/env node
/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  HACS DOCUMENTATION MASTER GENERATOR                                      ║
 * ║  Runs all generators in the generators/ subdirectory                      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Usage: node generate-all.js [--only generator-name] [--list]
 *
 * This script automatically discovers and runs all generator scripts in the
 * generators/ subdirectory. Each generator produces a different "consumer"
 * output from the same @hacs-endpoint documentation source.
 *
 * Options:
 *   --list          List available generators without running them
 *   --only <name>   Run only the specified generator (e.g., --only openapi)
 *
 * Adding new generators:
 *   1. Create a new file in generators/ named generate-<consumer>.js
 *   2. The file should be executable with: node generate-<consumer>.js
 *   3. It will automatically be discovered and run by this script
 */

import { readdir, stat } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GENERATORS_DIR = join(__dirname, 'generators');

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Discover all generator scripts in the generators/ directory
 */
async function discoverGenerators() {
  const generators = [];

  try {
    const files = await readdir(GENERATORS_DIR);

    for (const file of files) {
      if (file.startsWith('generate-') && file.endsWith('.js')) {
        const name = file.replace('generate-', '').replace('.js', '');
        generators.push({
          name,
          file,
          path: join(GENERATORS_DIR, file)
        });
      }
    }
  } catch (error) {
    console.error('Error discovering generators:', error.message);
  }

  return generators;
}

/**
 * Run a single generator script
 */
function runGenerator(generator) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`🔄 Running: ${generator.name}`);
    console.log(`   Script: ${generator.file}`);
    console.log('─'.repeat(70));

    const child = spawn('node', [generator.path], {
      stdio: 'inherit',
      cwd: __dirname
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ generator: generator.name, success: true });
      } else {
        resolve({ generator: generator.name, success: false, code });
      }
    });

    child.on('error', (error) => {
      resolve({ generator: generator.name, success: false, error: error.message });
    });
  });
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║  HACS Documentation Master Generator                                  ║');
  console.log('║  Generates all documentation from @hacs-endpoint source              ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝');

  // Parse command line args
  const args = process.argv.slice(2);
  const listOnly = args.includes('--list');
  const onlyIndex = args.indexOf('--only');
  const onlyGenerator = onlyIndex >= 0 ? args[onlyIndex + 1] : null;

  // Discover generators
  console.log('\n📂 Discovering generators...');
  const generators = await discoverGenerators();

  if (generators.length === 0) {
    console.log('   ⚠️  No generators found in generators/ directory');
    console.log('   Add files named generate-<consumer>.js to the generators/ directory');
    process.exit(1);
  }

  console.log(`   Found ${generators.length} generator(s):`);
  for (const gen of generators) {
    console.log(`   • ${gen.name} (${gen.file})`);
  }

  // List only mode
  if (listOnly) {
    console.log('\n📋 Available generators:');
    for (const gen of generators) {
      console.log(`   generate-${gen.name}.js`);
    }
    console.log('\nRun with --only <name> to run a specific generator');
    console.log('Run without arguments to run all generators');
    return;
  }

  // Filter if --only specified
  let toRun = generators;
  if (onlyGenerator) {
    toRun = generators.filter(g => g.name === onlyGenerator);
    if (toRun.length === 0) {
      console.error(`\n❌ Generator not found: ${onlyGenerator}`);
      console.log('   Available generators:', generators.map(g => g.name).join(', '));
      process.exit(1);
    }
  }

  // Run generators
  console.log(`\n🚀 Running ${toRun.length} generator(s)...`);
  const startTime = Date.now();
  const results = [];

  for (const generator of toRun) {
    const result = await runGenerator(generator);
    results.push(result);
  }

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log('\n');
  console.log('═'.repeat(70));
  console.log('  GENERATION COMPLETE');
  console.log('═'.repeat(70));
  console.log(`  ✅ Succeeded: ${succeeded}`);
  if (failed > 0) {
    console.log(`  ❌ Failed: ${failed}`);
    for (const r of results.filter(r => !r.success)) {
      console.log(`     • ${r.generator}: ${r.error || `exit code ${r.code}`}`);
    }
  }
  console.log(`  ⏱️  Time: ${elapsed}s`);
  console.log('═'.repeat(70));
  console.log('');

  // Exit with error if any failed
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
