#!/usr/bin/env node
'use strict';

/**
 * example/app.js
 * Demonstrates st2js usage:
 *  1. Reads sample.st
 *  2. Validates and prints any errors with line numbers
 *  3. Compiles to JS and saves to output.js
 *  4. Requires/imports the output and calls the compiled function block
 *  5. Prints results to stdout
 */

const path = require('path');
const fs = require('fs');
const { parse, validate, compile } = require('../src/index');
const { TON, TOF, TP } = require('../src/runtime/TimerBlocks');

const ST_FILE = path.join(__dirname, 'sample.st');
const OUT_FILE = path.join(__dirname, 'output.js');

// ─── Step 1: Read source ──────────────────────────────────────────────────────

const source = fs.readFileSync(ST_FILE, 'utf8');
console.log('=== st2js Example Application ===');
console.log(`\nSource: ${path.basename(ST_FILE)}`);
console.log(`Lines : ${source.split('\n').length}`);

// ─── Step 2: Parse & Validate ─────────────────────────────────────────────────

console.log('\n--- Parse & Validate ---');
const { ast, errors: parseErrors } = parse(source);

const fatalParseErrors = parseErrors.filter(e => e.severity === 'error');
if (fatalParseErrors.length > 0) {
  console.error('Fatal parse errors:');
  for (const e of fatalParseErrors) {
    console.error(`  [${e.phase}] line ${e.line}:${e.column} - ${e.message}`);
  }
  process.exit(1);
}

const { valid, errors: valErrors } = validate(ast);
const allDiagnostics = [...parseErrors, ...valErrors];

if (allDiagnostics.length > 0) {
  for (const d of allDiagnostics) {
    const prefix = d.severity === 'error' ? 'ERROR' : 'WARN ';
    console.log(`  ${prefix} [${d.phase}] line ${d.line}: ${d.message}`);
  }
} else {
  console.log('  No errors or warnings.');
}

// ─── Step 3: Compile to JS ────────────────────────────────────────────────────

console.log('\n--- Compile ---');
const { code, warnings } = compile(source, {
  sourceMaps: true,
  filename: path.basename(ST_FILE),
});

for (const w of warnings) {
  console.log(`  WARN: ${w}`);
}

// Prepend runtime dependencies
const runtimeCode = [
  "'use strict';",
  `const { TON, TOF, TP, RS, SR, CTU, CTD } = require(${JSON.stringify(path.join(__dirname, '../src/runtime/TimerBlocks'))});`,
  '',
  code.replace(/^'use strict';\n/, ''),
].join('\n');

fs.writeFileSync(OUT_FILE, runtimeCode, 'utf8');
console.log(`  Compiled to: ${path.basename(OUT_FILE)} (${runtimeCode.length} bytes)`);

// ─── Step 4: Execute compiled output ─────────────────────────────────────────

console.log('\n--- Execute ---');

// Load the compiled module (it exports: run, FB1, Cycles, TotalSum)
const compiled = require(OUT_FILE);

console.log('  Exports:', Object.keys(compiled).join(', '));
console.log('  Running 8 PLC cycles...\n');

for (let i = 0; i < 8; i++) {
  compiled.run();
  const fb = compiled.FB1;
  console.log(`  Cycle ${i + 1}: Count=${fb ? fb.Count : '?'}, Done=${fb ? fb.Done : '?'}, Cycles=${compiled.Cycles}, TotalSum=${compiled.TotalSum}`);
}

// ─── Step 5: Summary ──────────────────────────────────────────────────────────

console.log('\n--- Summary ---');
console.log('  Compilation: SUCCESS');
console.log(`  Input:  ${source.split('\n').length} lines of Structured Text`);
console.log(`  Output: ${runtimeCode.split('\n').length} lines of JavaScript`);
