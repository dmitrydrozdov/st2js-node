'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const { compileExpression } = require('../../src/index');

describe('Integration: compileExpression', () => {
  test('CommonJS export shape', () => {
    const mod = require('../../src/index');
    expect(typeof mod.parseExpression).toBe('function');
    expect(typeof mod.compileExpression).toBe('function');
  });

  test('produces a JS expression usable with new Function("__s", "return " + code)', () => {
    const result = compileExpression('REQ AND count < threshold', [
      { name: 'REQ', type: 'BOOL', direction: 'input' },
      { name: 'count', type: 'INT', direction: 'input' },
      { name: 'threshold', type: 'INT', direction: 'input' },
    ]);
    const fn = new Function('__s', 'return ' + result.code);
    expect(fn({ REQ: true, count: 2, threshold: 5 })).toBe(true);
    expect(fn({ REQ: true, count: 5, threshold: 5 })).toBe(false);
    expect(fn({ REQ: false, count: 2, threshold: 5 })).toBe(false);
  });

  test('composite descriptors compile and round-trip through ESM', () => {
    const script = `
      import('${path.resolve(__dirname, '..', '..', 'src', 'index.mjs').replace(/\\/g, '\\\\')}')
        .then(m => {
          const result = m.compileExpression('P.REQ AND X > 0', [
            { name: 'X', type: 'INT', direction: 'internal' },
            { name: 'P', type: 'ADAPTER', direction: 'input', members: [
              { name: 'REQ', type: 'BOOL', direction: 'input' },
            ]},
          ]);
          process.stdout.write(JSON.stringify({
            errors: result.errors.length,
            hasReq: result.code.includes('__s["P.REQ"]'),
            hasX: result.code.includes('__s["X"]'),
            inputNames: result.inputNames,
          }));
        })
        .catch(err => { process.stderr.write(String(err)); process.exit(1); });
    `;
    const res = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.errors).toBe(0);
    expect(parsed.hasReq).toBe(true);
    expect(parsed.hasX).toBe(true);
    expect(parsed.inputNames).toContain('P.REQ');
  });

  test('ESM named exports include parseExpression and compileExpression', () => {
    const script = `
      import('${path.resolve(__dirname, '..', '..', 'src', 'index.mjs').replace(/\\/g, '\\\\')}')
        .then(m => {
          const out = {
            parseExpression: typeof m.parseExpression,
            compileExpression: typeof m.compileExpression,
            defaultParseExpression: typeof m.default.parseExpression,
            defaultCompileExpression: typeof m.default.compileExpression,
          };
          process.stdout.write(JSON.stringify(out));
        })
        .catch(err => { process.stderr.write(String(err)); process.exit(1); });
    `;
    const res = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.parseExpression).toBe('function');
    expect(parsed.compileExpression).toBe('function');
    expect(parsed.defaultParseExpression).toBe('function');
    expect(parsed.defaultCompileExpression).toBe('function');
  });
});
