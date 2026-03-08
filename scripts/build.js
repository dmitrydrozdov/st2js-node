#!/usr/bin/env node
'use strict';

/**
 * Build script for st2js.
 * This script validates the project structure and ensures all components are ready.
 * Parser generation via ANTLR4 is optional (requires Java + ANTLR4 jar).
 * The built-in hand-written parser is used by default and requires no build step.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function checkFile(filePath) {
  const full = path.join(ROOT, filePath);
  if (!fs.existsSync(full)) {
    throw new Error(`Required file missing: ${filePath}`);
  }
}

function ensureDir(dirPath) {
  const full = path.join(ROOT, dirPath);
  if (!fs.existsSync(full)) {
    fs.mkdirSync(full, { recursive: true });
  }
}

console.log('Building st2js...\n');

// Ensure required files exist
const requiredFiles = [
  'src/index.js',
  'src/types.js',
  'src/lexer/Lexer.js',
  'src/parser/Parser.js',
  'src/parser/ASTBuilder.js',
  'src/parser/Validator.js',
  'src/codegen/Codegen.js',
  'src/codegen/TypeMapper.js',
  'src/runtime/StandardFunctions.js',
  'src/runtime/TimerBlocks.js',
  'grammar/ST.g4',
];

let hasErrors = false;
for (const file of requiredFiles) {
  try {
    checkFile(file);
    console.log(`  ✓ ${file}`);
  } catch (e) {
    console.error(`  ✗ ${e.message}`);
    hasErrors = true;
  }
}

// Ensure generated dir exists
ensureDir('src/generated');

// Try to quick-load main module to catch syntax errors
try {
  require(path.join(ROOT, 'src/index.js'));
  console.log('\n  ✓ Module loads successfully');
} catch (e) {
  console.error(`\n  ✗ Module load failed: ${e.message}`);
  hasErrors = true;
}

if (hasErrors) {
  console.error('\nBuild FAILED');
  process.exit(1);
} else {
  console.log('\nBuild complete!');
}
