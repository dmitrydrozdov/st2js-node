'use strict';

const { parseExpression, compileExpression } = require('../../src/index');

describe('parseExpression()', () => {
  test('parses a boolean expression with no errors', () => {
    const result = parseExpression('REQ AND count < threshold');
    expect(result.ast).not.toBeNull();
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
  });

  test('parses a single identifier', () => {
    const result = parseExpression('REQ');
    expect(result.ast).not.toBeNull();
    expect(result.ast.type).toBe('IdentifierRef');
    expect(result.ast.name).toBe('REQ');
  });

  test('parses a literal', () => {
    const result = parseExpression('TRUE');
    expect(result.ast).not.toBeNull();
    expect(result.ast.type).toBe('BoolLiteral');
  });

  test('rejects trailing tokens after the expression', () => {
    const result = parseExpression('REQ count');
    const errs = result.errors.filter(e => e.severity === 'error');
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.some(e => e.phase === 'parser')).toBe(true);
  });

  test('rejects JavaScript-only equality syntax', () => {
    const result = parseExpression('count === threshold');
    const errs = result.errors.filter(e => e.severity === 'error');
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.some(e => e.phase === 'parser')).toBe(true);
  });
});

describe('compileExpression()', () => {
  function evalCode(code, scope) {
    return new Function('__s', 'return ' + code)(scope);
  }

  test('compiles an event-only expression', () => {
    const result = compileExpression('REQ', [
      { name: 'REQ', type: 'BOOL', direction: 'input' },
    ]);
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(result.code).toBe('__s["REQ"]');
    expect(evalCode(result.code, { REQ: true })).toBe(true);
    expect(evalCode(result.code, { REQ: false })).toBe(false);
  });

  test('compiles a mixed event and data expression', () => {
    const result = compileExpression('REQ AND count < threshold', [
      { name: 'REQ', type: 'BOOL', direction: 'input' },
      { name: 'count', type: 'INT', direction: 'input' },
      { name: 'threshold', type: 'INT', direction: 'input' },
    ]);
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(result.code).toMatch(/__s\["REQ"\]/);
    expect(result.code).toMatch(/__s\["count"\]/);
    expect(result.code).toMatch(/__s\["threshold"\]/);
    expect(evalCode(result.code, { REQ: true, count: 2, threshold: 5 })).toBe(true);
    expect(evalCode(result.code, { REQ: false, count: 2, threshold: 5 })).toBe(false);
    expect(evalCode(result.code, { REQ: true, count: 7, threshold: 5 })).toBe(false);
  });

  test('compiles a < 5 OR READY', () => {
    const result = compileExpression('a < 5 OR READY', [
      { name: 'a', type: 'INT', direction: 'input' },
      { name: 'READY', type: 'BOOL', direction: 'input' },
    ]);
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(evalCode(result.code, { a: 1, READY: false })).toBe(true);
    expect(evalCode(result.code, { a: 10, READY: false })).toBe(false);
    expect(evalCode(result.code, { a: 10, READY: true })).toBe(true);
  });

  test('compiles boolean literal TRUE', () => {
    const result = compileExpression('TRUE', []);
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(evalCode(result.code, {})).toBe(true);
  });

  test('compiles integer literal 1', () => {
    const result = compileExpression('1', []);
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(evalCode(result.code, {})).toBe(1);
  });

  test('returns bare expression string without trailing semicolons', () => {
    const result = compileExpression('count + 1', [
      { name: 'count', type: 'INT', direction: 'input' },
    ]);
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(result.code).not.toMatch(/;\s*$/);
    expect(result.code).not.toMatch(/^return\b/);
  });

  test('partitions descriptor names by direction', () => {
    const result = compileExpression('a + b + c', [
      { name: 'a', type: 'INT', direction: 'input' },
      { name: 'b', type: 'INT', direction: 'output' },
      { name: 'c', type: 'INT', direction: 'internal' },
    ]);
    expect(result.inputNames).toEqual(['a']);
    expect(result.outputNames).toEqual(['b']);
    expect(result.internalNames).toEqual(['c']);
  });

  test('rejects JavaScript-only === syntax', () => {
    const result = compileExpression('count === threshold', [
      { name: 'count', type: 'INT', direction: 'input' },
      { name: 'threshold', type: 'INT', direction: 'input' },
    ]);
    const errs = result.errors.filter(e => e.severity === 'error');
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.some(e => e.phase === 'parser')).toBe(true);
    expect(result.code).toBe('');
  });

  test('rejects duplicate descriptor names case-insensitively', () => {
    const result = compileExpression('Count > 0', [
      { name: 'Count', type: 'INT', direction: 'input' },
      { name: 'count', type: 'INT', direction: 'internal' },
    ]);
    const errs = result.errors.filter(e => e.severity === 'error');
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.some(e => e.phase === 'validator' && /Duplicate/i.test(e.message))).toBe(true);
    expect(result.code).toBe('');
  });

  test('rejects invalid descriptor direction', () => {
    const result = compileExpression('x > 0', [
      { name: 'x', type: 'INT', direction: 'inout' },
    ]);
    const errs = result.errors.filter(e => e.severity === 'error');
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.some(e => /direction/.test(e.message))).toBe(true);
    expect(result.code).toBe('');
  });

  test('rejects undeclared identifiers as validator errors', () => {
    const result = compileExpression('Missing > 0', []);
    const errs = result.errors.filter(e => e.severity === 'error');
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.some(e => e.phase === 'validator' && /Missing/.test(e.message))).toBe(true);
    expect(result.code).toBe('');
  });

  test('rejects non-array variables argument', () => {
    const result = compileExpression('1', null);
    const errs = result.errors.filter(e => e.severity === 'error');
    expect(errs.length).toBeGreaterThan(0);
    expect(result.code).toBe('');
  });

  test('allows standard functions like ABS', () => {
    const result = compileExpression('ABS(V) > 10', [
      { name: 'V', type: 'INT', direction: 'input' },
    ]);
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
  });

  test('parser-error syntax produces empty code', () => {
    const result = compileExpression('1 +', []);
    const errs = result.errors.filter(e => e.severity === 'error');
    expect(errs.length).toBeGreaterThan(0);
    expect(result.code).toBe('');
  });
});
