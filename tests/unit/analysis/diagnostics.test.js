'use strict';

const { analyzeAlgorithm, analyzeExpression, compileAlgorithm, compileExpression, compile } = require('../../../src/index');

const d = (name, type, direction = 'input', extra = {}) => ({ name, type, direction, ...extra });

function expectError(result, pattern) {
  const errs = result.errors.filter(e => e.severity === 'error');
  expect(errs.length).toBeGreaterThan(0);
  expect(errs.every(e => e.phase === 'validator')).toBe(true);
  expect(errs.some(e => pattern.test(e.message))).toBe(true);
  if ('code' in result) expect(result.code).toBe('');
  return errs;
}

describe('Type violations are validator errors that yield empty code', () => {
  test('incompatible comparison operands', () => {
    const errs = expectError(compileExpression('flag < 3', [d('flag', 'BOOL')]), /Cannot compare BOOL with DINT/);
    expect(errs).toHaveLength(1);
    expectError(compileExpression('s = 1', [d('s', 'STRING')]), /Cannot compare/);
    expectError(compileExpression('t > 1', [d('t', 'TIME')]), /Cannot compare/);
  });

  test('mixed signedness', () => {
    expectError(compileAlgorithm('x := a + b;', [d('a', 'INT'), d('b', 'UINT'), d('x', 'DINT', 'output')]), /signed and unsigned/);
    expectError(compileExpression('a < b', [d('a', 'DINT'), d('b', 'UDINT')]), /Cannot compare/);
  });

  test('narrowing assignment names both types at the assignment', () => {
    const errs = expectError(compileAlgorithm('OUT := R;', [d('R', 'LREAL'), d('OUT', 'DINT', 'output')]), /LREAL/);
    expect(errs[0].message).toMatch(/DINT/);
    expect(errs[0].line).toBe(1);
    expectError(compileAlgorithm('i := d;', [d('d', 'DINT'), d('i', 'INT', 'output')]), /narrowing/);
    expectError(compileAlgorithm('r := l;', [d('l', 'LREAL'), d('r', 'REAL', 'output')]), /narrowing/);
    expectError(compileAlgorithm('u := i;', [d('i', 'INT'), d('u', 'UINT', 'output')]), /signedness/);
    expectError(compileAlgorithm('r := d;', [d('d', 'DINT'), d('r', 'REAL', 'output')]), /cannot represent every DINT value/);
  });

  test('real to integer without conversion', () => {
    expectError(compileAlgorithm('i := 2.5;', [d('i', 'INT', 'output')]), /real to integer/);
    expectError(compileAlgorithm('i := r;', [d('r', 'REAL'), d('i', 'INT', 'output')]), /real to integer/);
  });

  test('explicit conversion is accepted and typed', () => {
    const r = analyzeAlgorithm('OUT := REAL_TO_DINT(R);', [d('R', 'REAL'), d('OUT', 'DINT', 'output')]);
    expect(r.errors).toHaveLength(0);
    expect(r.ast.statements[0].value.resolvedType).toBe('DINT');
    const c = compileAlgorithm('OUT := LREAL_TO_DINT(R);', [d('R', 'LREAL'), d('OUT', 'DINT', 'output')]);
    expect(c.errors).toHaveLength(0);
    expect(c.code).toContain('LREAL_TO_DINT(');
  });

  test('implicit widening is accepted with a recorded conversion and no warnings', () => {
    for (const [from, to] of [['INT', 'DINT'], ['USINT', 'INT'], ['REAL', 'LREAL'], ['SINT', 'LINT'], ['UINT', 'UDINT'], ['INT', 'REAL'], ['BYTE', 'WORD']]) {
      const r = analyzeAlgorithm('d := i;', [d('i', from), d('d', to, 'output')]);
      expect(r.errors).toHaveLength(0);
      expect(r.warnings).toHaveLength(0);
      expect(r.ast.statements[0].value.conversion).toEqual({ from, to, implicit: true });
    }
  });

  test('non-integer array index', () => {
    expectError(compileAlgorithm('x := A[1.5];', [d('A', 'DINT', 'input', { arraySize: 4 }), d('x', 'DINT', 'output')]), /index must be an integer/);
    expectError(compileAlgorithm('x := A[b];', [d('A', 'DINT', 'input', { arraySize: 4 }), d('b', 'BOOL'), d('x', 'DINT', 'output')]), /index must be an integer/);
  });

  test('constant index out of range', () => {
    const errs = expectError(compileAlgorithm('x := A[4];', [d('A', 'DINT', 'input', { arraySize: 4 }), d('x', 'DINT', 'output')]), /Array index 4 is outside 0\.\.3/);
    expect(errs[0].column).toBe(7);
    expectError(compileAlgorithm('x := A[-1];', [d('A', 'DINT', 'input', { arraySize: 4 }), d('x', 'DINT', 'output')]), /outside 0\.\.3/);
    const ok = compileAlgorithm('x := A[3] + A[0];', [d('A', 'DINT', 'input', { arraySize: 4 }), d('x', 'DINT', 'output')]);
    expect(ok.errors).toHaveLength(0);
  });

  test('indexing a non-array is an error', () => {
    expectError(compileAlgorithm('x := i[0];', [d('i', 'INT'), d('x', 'INT', 'output')]), /not an array/);
  });

  test('MOD on non-integers', () => {
    expectError(compileAlgorithm('x := r MOD 2;', [d('r', 'REAL'), d('x', 'INT', 'output')]), /MOD/);
  });

  test('bitwise and boolean operators on the wrong operands', () => {
    expectError(compileExpression('i AND 1', [d('i', 'INT')]), /BOOL or bit-string/);
    expectError(compileExpression('NOT i', [d('i', 'INT')]), /NOT/);
    expectError(compileExpression('b AND w', [d('b', 'BOOL'), d('w', 'WORD')]), /BOOL or bit-string/);
    expectError(compileExpression('-b', [d('b', 'BOOL')]), /numeric/);
    expectError(compileExpression('b + 1', [d('b', 'BOOL')]), /numeric/);
  });

  test('non-boolean IF / WHILE / REPEAT / ELSIF conditions', () => {
    const vars = [d('x', 'INT', 'internal')];
    expectError(compileAlgorithm('IF x THEN x := 1; END_IF;', vars), /IF condition must be BOOL, got INT/);
    expectError(compileAlgorithm('WHILE x DO x := 1; END_WHILE;', vars), /WHILE condition must be BOOL/);
    expectError(compileAlgorithm('REPEAT x := 1; UNTIL x END_REPEAT;', vars), /REPEAT UNTIL condition must be BOOL/);
    expectError(compileAlgorithm('IF x > 0 THEN x := 1; ELSIF x THEN x := 2; END_IF;', vars), /ELSIF condition must be BOOL/);
  });

  test('unknown or mis-arity standard functions', () => {
    const errs = expectError(compileExpression('ABS(a, b)', [d('a', 'INT'), d('b', 'INT')]), /ABS expects 1 argument\(s\), got 2/);
    expect(errs).toHaveLength(1);
    expectError(compileExpression('MAX(a)', [d('a', 'INT')]), /MAX expects 2/);
    expectError(compileExpression('MUX(1)', []), /MUX expects at least 2/);
    expectError(compileExpression('ROL(w)', [d('w', 'WORD')]), /ROL expects 2 to 3/);
    expectError(compileExpression('NOPE(a)', [d('a', 'INT')]), /Unknown function 'NOPE'/);
    expectError(compileAlgorithm('x := NOPE(x);', [d('x', 'INT', 'internal')]), /Unknown function/);
  });

  test('argument class violations', () => {
    expectError(compileExpression('SQRT(i)', [d('i', 'INT')]), /Argument 1 of SQRT must be ANY_REAL, got INT/);
    expectError(compileExpression('LEN(i)', [d('i', 'INT')]), /must be ANY_STRING/);
    expectError(compileExpression('SHL(i, 1)', [d('i', 'INT')]), /must be ANY_BIT/);
    expectError(compileExpression('SEL(i, 1, 2)', [d('i', 'INT')]), /must be BOOL/);
    expectError(compileExpression('MAX(s, i)', [d('s', 'STRING'), d('i', 'INT')]), /common type/);
    expectError(compileExpression('REAL_TO_DINT(d)', [d('d', 'DINT')]), /must be REAL/);
  });

  test('typed literal out of range', () => {
    expectError(compileExpression('SINT#200', []), /outside the range of SINT/);
    expectError(compileExpression('BYTE#256', []), /outside the range of BYTE/);
    expectError(compileExpression('UINT#-1', []), /outside the range of UINT/);
  });

  test('untyped literal out of range for its context', () => {
    expectError(compileAlgorithm('s := 128;', [d('s', 'SINT', 'output')]), /Literal 128 is outside the range of SINT/);
    expectError(compileAlgorithm('s := -129;', [d('s', 'SINT', 'output')]), /Literal -129 is outside/);
    expectError(compileAlgorithm('u := -1;', [d('u', 'UINT', 'output')]), /outside the range of UINT/);
    expect(compileAlgorithm('s := -128; s := 127;', [d('s', 'SINT', 'output')]).errors).toHaveLength(0);
    expectError(compileExpression('99999999999999999999', []), /too large/);
  });

  test('FOR and CASE type checks', () => {
    expectError(compileAlgorithm('FOR r := 0.0 TO 1.0 DO x := 1; END_FOR;', [d('r', 'REAL', 'internal'), d('x', 'INT', 'output')]), /FOR loop variable must be an integer/);
    expectError(compileAlgorithm('FOR i := 0 TO d DO x := 1; END_FOR;', [d('i', 'INT', 'internal'), d('d', 'DINT'), d('x', 'INT', 'output')]), /FOR bound of type DINT/);
    expectError(compileAlgorithm('CASE r OF 1: x := 1; END_CASE;', [d('r', 'REAL'), d('x', 'INT', 'output')]), /CASE selector must be an integer/);
    expectError(compileAlgorithm('CASE i OF d: x := 1; END_CASE;', [d('i', 'INT'), d('d', 'DINT'), d('x', 'INT', 'output')]), /CASE label of type DINT/);
  });

  test('strings and arrays', () => {
    expectError(compileAlgorithm('s := 1;', [d('s', 'STRING', 'output')]), /Cannot assign DINT to STRING/);
    expectError(compileAlgorithm('n := ws;', [d('ws', 'WSTRING'), d('n', 'STRING', 'output')]), /Cannot assign WSTRING to STRING/);
    expectError(compileAlgorithm('x := A;', [d('A', 'INT', 'input', { arraySize: 2 }), d('x', 'INT', 'output')]), /Cannot assign ARRAY\[0\.\.1\] OF INT to INT/);
    expectError(compileExpression('A + 1', [d('A', 'INT', 'input', { arraySize: 2 })]), /numeric/);
  });

  test('no option downgrades type errors', () => {
    const r = compileAlgorithm('OUT := R;', [d('R', 'LREAL'), d('OUT', 'DINT', 'output')], { strict: false });
    expect(r.errors.some(e => e.severity === 'error')).toBe(true);
    expect(r.code).toBe('');
  });
});

describe('Unresolved identifiers do not cascade', () => {
  test('exactly one diagnostic for an undeclared identifier in algorithm mode', () => {
    const r = analyzeAlgorithm('x := Missing + 1;', [d('x', 'DINT', 'output')]);
    expect(r.errors).toHaveLength(0);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].message).toMatch(/Undeclared identifier 'Missing'/);
    const v = r.ast.statements[0].value;
    expect(v.resolvedType).toBeNull();
    expect(v.left.resolvedType).toBeNull();
  });

  test('undeclared identifier is an error in expression mode with no extra diagnostics', () => {
    const r = analyzeExpression('Missing < 3 AND flag', [d('flag', 'BOOL')]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/Missing/);
    expect(r.ast.resolvedType).toBeNull();
  });

  test('unknown member and nested access produce only the composite error', () => {
    const P = d('P', 'ADAPTER', 'input', { members: [{ name: 'A', type: 'INT', direction: 'input' }] });
    let r = analyzeAlgorithm('x := P.NOPE + 1;', [P, d('x', 'INT', 'output')]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/no member 'NOPE'/);
    r = analyzeAlgorithm('x := P.A.B;', [P, d('x', 'INT', 'output')]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/Nested members/);
    r = analyzeAlgorithm('x := P;', [P, d('x', 'INT', 'output')]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/without a member/);
  });

  test('member access on a flat descriptor is untyped and not diagnosed', () => {
    const r = analyzeAlgorithm('Y := X.field;', [d('X', 'INT'), d('Y', 'INT', 'output')]);
    expect(r.errors).toHaveLength(0);
    expect(r.ast.statements[0].value.resolvedType).toBeNull();
  });

  test('strict promotes the undeclared warning to an error', () => {
    const r = analyzeAlgorithm('x := Missing;', [d('x', 'DINT', 'output')], { strict: true });
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].severity).toBe('error');
    expect(r.warnings).toHaveLength(1);
  });
});

describe('POU mode keeps existing warning severities', () => {
  test('unknown callee is a warning in POU mode but typed as unknown', () => {
    const r = compile(`
      PROGRAM P
        VAR x: INT; END_VAR
        x := TotallyUnknownFunc(x) + 1;
      END_PROGRAM
    `, { sourceMaps: false });
    expect(r.errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(r.errors.some(e => e.severity === 'warning' && /TotallyUnknownFunc/.test(e.message))).toBe(true);
  });

  test('type violations are errors in POU mode too', () => {
    const r = compile(`
      PROGRAM P
        VAR x: INT; r: REAL; END_VAR
        x := r;
      END_PROGRAM
    `, { sourceMaps: false });
    expect(r.errors.some(e => e.severity === 'error' && /real to integer/.test(e.message))).toBe(true);
  });
});
