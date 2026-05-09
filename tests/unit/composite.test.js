'use strict';

const { compileAlgorithm, compileExpression } = require('../../src/index');

describe('Composite descriptors: compileAlgorithm', () => {
  test('member read uses default "parent.member" access key', () => {
    const result = compileAlgorithm('X := P.VALUE;', [
      { name: 'X', type: 'INT', direction: 'internal' },
      { name: 'P', type: 'ADAPTER', direction: 'input', members: [
        { name: 'VALUE', type: 'INT', direction: 'input' },
      ]},
    ]);
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(result.code).toContain('__s["P.VALUE"]');
    expect(result.code).toContain('__s["X"]');
  });

  test('accessKey override replaces the default', () => {
    const result = compileAlgorithm('X := P.VALUE;', [
      { name: 'X', type: 'INT', direction: 'internal' },
      { name: 'P', type: 'ADAPTER', direction: 'input', members: [
        { name: 'VALUE', type: 'INT', direction: 'input', accessKey: 'P__$$__VALUE' },
      ]},
    ]);
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(result.code).toContain('__s["P__$$__VALUE"]');
    expect(result.code).not.toContain('__s["P.VALUE"]');
  });

  test('LHS write to output member uses __s[<accessKey>] form', () => {
    const result = compileAlgorithm('P.VALUE := 42;', [
      { name: 'P', type: 'ADAPTER', direction: 'input', members: [
        { name: 'VALUE', type: 'INT', direction: 'output' },
      ]},
    ]);
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(result.code).toContain('__s["P.VALUE"]');
    // Must not emit `__s["P"].VALUE`.
    expect(result.code).not.toMatch(/__s\["P"\]\s*\.\s*VALUE/);
  });

  test('write to input-direction member is a validator error', () => {
    const result = compileAlgorithm('P.VALUE := 42;', [
      { name: 'P', type: 'ADAPTER', direction: 'input', members: [
        { name: 'VALUE', type: 'INT', direction: 'input' },
      ]},
    ]);
    const errs = result.errors.filter(e => e.severity === 'error');
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0].phase).toBe('validator');
    expect(errs[0].message).toMatch(/input/i);
    expect(result.code).toBe('');
  });

  test('unknown member is a validator error naming descriptor and member', () => {
    const result = compileAlgorithm('X := P.NOPE;', [
      { name: 'X', type: 'INT', direction: 'internal' },
      { name: 'P', type: 'ADAPTER', direction: 'input', members: [
        { name: 'VALUE', type: 'INT', direction: 'input' },
      ]},
    ]);
    const errs = result.errors.filter(e => e.severity === 'error');
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0].phase).toBe('validator');
    expect(errs[0].message).toMatch(/P/);
    expect(errs[0].message).toMatch(/NOPE/);
    expect(result.code).toBe('');
  });

  test('bare composite reference is a validator error', () => {
    const result = compileAlgorithm('X := P;', [
      { name: 'X', type: 'INT', direction: 'internal' },
      { name: 'P', type: 'ADAPTER', direction: 'input', members: [
        { name: 'VALUE', type: 'INT', direction: 'input' },
      ]},
    ]);
    const errs = result.errors.filter(e => e.severity === 'error');
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0].phase).toBe('validator');
    expect(errs[0].message).toMatch(/P/);
    expect(errs[0].message).toMatch(/without a member/);
    expect(result.code).toBe('');
  });

  test('duplicate member names are rejected', () => {
    const result = compileAlgorithm('X := P.A;', [
      { name: 'X', type: 'INT', direction: 'internal' },
      { name: 'P', type: 'ADAPTER', direction: 'input', members: [
        { name: 'A', type: 'INT', direction: 'input' },
        { name: 'A', type: 'BOOL', direction: 'output' },
      ]},
    ]);
    const errs = result.errors.filter(e => e.severity === 'error');
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0].message).toMatch(/[Dd]uplicate.*member/);
    expect(result.code).toBe('');
  });

  test('multi-level access against composite descriptor is rejected', () => {
    const result = compileAlgorithm('X := P.A.B;', [
      { name: 'X', type: 'INT', direction: 'internal' },
      { name: 'P', type: 'ADAPTER', direction: 'input', members: [
        { name: 'A', type: 'INT', direction: 'input' },
      ]},
    ]);
    const errs = result.errors.filter(e => e.severity === 'error');
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0].phase).toBe('validator');
    expect(errs[0].message).toMatch(/[Nn]ested members/);
    expect(result.code).toBe('');
  });

  test('result arrays bucket members by member direction; parent name absent', () => {
    const result = compileAlgorithm('X := P.REQ; P.RESULT := X;', [
      { name: 'X', type: 'INT', direction: 'internal' },
      { name: 'P', type: 'ADAPTER', direction: 'input', members: [
        { name: 'REQ',    type: 'BOOL', direction: 'input' },
        { name: 'RESULT', type: 'INT',  direction: 'output', accessKey: 'P__$$__RESULT' },
      ]},
    ]);
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(result.inputNames).toContain('P.REQ');
    expect(result.inputNames).not.toContain('P');
    expect(result.outputNames).toContain('P__$$__RESULT');
    expect(result.outputNames).not.toContain('P.RESULT');
    expect(result.internalNames).toEqual(['X']);
  });

  test('end-to-end execution against a flat scope object', () => {
    const result = compileAlgorithm('P.OUT := P.IN + 1;', [
      { name: 'P', type: 'ADAPTER', direction: 'input', members: [
        { name: 'IN',  type: 'INT', direction: 'input' },
        { name: 'OUT', type: 'INT', direction: 'output' },
      ]},
    ]);
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
    const fn = new Function('__s', result.code);
    const scope = { 'P.IN': 4, 'P.OUT': 0 };
    fn(scope);
    expect(scope['P.OUT']).toBe(5);
  });

  test('flat descriptors continue to work when mixed with composites', () => {
    const result = compileAlgorithm('Y := P.IN + Z;', [
      { name: 'Y', type: 'INT', direction: 'output' },
      { name: 'Z', type: 'INT', direction: 'input' },
      { name: 'P', type: 'ADAPTER', direction: 'input', members: [
        { name: 'IN', type: 'INT', direction: 'input' },
      ]},
    ]);
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(result.inputNames).toEqual(['Z', 'P.IN']);
    expect(result.outputNames).toEqual(['Y']);
  });
});

describe('Composite descriptors: compileExpression', () => {
  test('typed read in expression uses __s[<accessKey>]', () => {
    const result = compileExpression('P.REQ AND count < threshold', [
      { name: 'count',     type: 'INT',  direction: 'input' },
      { name: 'threshold', type: 'INT',  direction: 'input' },
      { name: 'P', type: 'ADAPTER', direction: 'input', members: [
        { name: 'REQ', type: 'BOOL', direction: 'input' },
      ]},
    ]);
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(result.code).toContain('__s["P.REQ"]');
  });

  test('unknown member rejected in expression mode', () => {
    const result = compileExpression('P.NOPE', [
      { name: 'P', type: 'ADAPTER', direction: 'input', members: [
        { name: 'REQ', type: 'BOOL', direction: 'input' },
      ]},
    ]);
    const errs = result.errors.filter(e => e.severity === 'error');
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0].message).toMatch(/NOPE/);
    expect(result.code).toBe('');
  });

  test('bare composite reference rejected in expression mode', () => {
    const result = compileExpression('P', [
      { name: 'P', type: 'ADAPTER', direction: 'input', members: [
        { name: 'REQ', type: 'BOOL', direction: 'input' },
      ]},
    ]);
    const errs = result.errors.filter(e => e.severity === 'error');
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0].message).toMatch(/without a member/);
    expect(result.code).toBe('');
  });

  test('end-to-end expression evaluation against a flat scope object', () => {
    const result = compileExpression('P.REQ AND P.VAL > 0', [
      { name: 'P', type: 'ADAPTER', direction: 'input', members: [
        { name: 'REQ', type: 'BOOL', direction: 'input' },
        { name: 'VAL', type: 'INT',  direction: 'input' },
      ]},
    ]);
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
    const evalExpr = new Function('__s', 'return ' + result.code);
    expect(evalExpr({ 'P.REQ': true,  'P.VAL': 1  })).toBe(true);
    expect(evalExpr({ 'P.REQ': false, 'P.VAL': 1  })).toBe(false);
    expect(evalExpr({ 'P.REQ': true,  'P.VAL': 0  })).toBe(false);
  });
});

describe('Composite descriptors: regressions', () => {
  test('flat descriptor without members produces identical result shape', () => {
    const result = compileAlgorithm('Count := Count + 1;', [
      { name: 'Count', type: 'INT', direction: 'internal' },
    ]);
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(result.code).toContain('__s["Count"]');
    expect(result.inputNames).toEqual([]);
    expect(result.outputNames).toEqual([]);
    expect(result.internalNames).toEqual(['Count']);
  });

  test('non-composite member access (e.g. flat descriptor + .field) passes through unchanged', () => {
    // A flat descriptor whose value is a struct-like JS object: codegen should
    // emit the existing `${obj}.${member}` lowering, not `__s["X.field"]`.
    const result = compileAlgorithm('Y := X.field;', [
      { name: 'X', type: 'INT', direction: 'input' },
      { name: 'Y', type: 'INT', direction: 'output' },
    ]);
    // No composite binding exists -> validator passes, codegen emits flat path.
    expect(result.code).toContain('__s["X"]');
    expect(result.code).toContain('.field');
    expect(result.code).not.toContain('__s["X.field"]');
  });
});
