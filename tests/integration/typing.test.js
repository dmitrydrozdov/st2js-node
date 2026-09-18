'use strict';

const { compileAlgorithm, compileExpression } = require('../../src/index');

const d = (name, type, direction = 'input', extra = {}) => ({ name, type, direction, ...extra });

function run(src, vars, scope, options) {
  const result = compileAlgorithm(src, vars, options);
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
  new Function('__s', result.code)(scope);
  return scope;
}

function evaluate(src, vars, scope, options) {
  const result = compileExpression(src, vars, options);
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
  return new Function('__s', 'return ' + result.code)(scope);
}

describe('Integration: generated code honours integer width', () => {
  test('SINT wraps 127 + 1 to -128', () => {
    expect(run('s := s + 1;', [d('s', 'SINT', 'internal')], { s: 127 }).s).toBe(-128);
  });

  test('USINT wraps 255 + 1 to 0', () => {
    expect(run('u := u + 1;', [d('u', 'USINT', 'internal')], { u: 255 }).u).toBe(0);
  });

  test('BYTE wraps 255 + 1 to 0 and -1 to 255', () => {
    expect(run('b := b + 1;', [d('b', 'BYTE', 'internal')], { b: 255 }).b).toBe(0);
    expect(run('b := b - 1;', [d('b', 'BYTE', 'internal')], { b: 0 }).b).toBe(255);
  });

  test('INT wraps 32767 + 1 to -32768', () => {
    expect(run('i := i + 1;', [d('i', 'INT', 'internal')], { i: 32767 }).i).toBe(-32768);
  });

  test('UINT and WORD wrap 65535 + 1 to 0', () => {
    expect(run('u := u + 1;', [d('u', 'UINT', 'internal')], { u: 65535 }).u).toBe(0);
    expect(run('w := w + 1;', [d('w', 'WORD', 'internal')], { w: 65535 }).w).toBe(0);
  });

  test('DINT wraps 2147483647 + 1 to -2147483648', () => {
    expect(run('x := x + 1;', [d('x', 'DINT', 'internal')], { x: 2147483647 }).x).toBe(-2147483648);
  });

  test('UDINT keeps 4294967295 and wraps 4294967295 + 1 to 0', () => {
    expect(run('u := 4294967295;', [d('u', 'UDINT', 'output')], { u: 0 }).u).toBe(4294967295);
    expect(run('u := u + 1;', [d('u', 'UDINT', 'internal')], { u: 4294967295 }).u).toBe(0);
    expect(run('dw := dw + 1;', [d('dw', 'DWORD', 'internal')], { dw: 4294967295 }).dw).toBe(0);
  });

  test('FOR loop variable wraps at the declared width and terminates', () => {
    const s = run('n := 0; FOR i := 0 TO 5 DO n := n + 1; END_FOR;', [d('i', 'SINT', 'internal'), d('n', 'INT', 'internal')], { i: 0, n: 0 });
    expect(s.n).toBe(6);
    expect(s.i).toBe(6);
  });
});

describe('Integration: integer division truncates', () => {
  test('(7 / 2) * 2 evaluates to 6 for DINT operands', () => {
    expect(run('r := (a / b) * b;', [d('a', 'DINT'), d('b', 'DINT'), d('r', 'DINT', 'output')], { a: 7, b: 2, r: 0 }).r).toBe(6);
  });

  test('negative integer division truncates toward zero', () => {
    expect(run('r := a / b;', [d('a', 'INT'), d('b', 'INT'), d('r', 'INT', 'output')], { a: -7, b: 2, r: 0 }).r).toBe(-3);
  });

  test('7.0 / 2.0 stays 3.5 for reals', () => {
    expect(run('r := a / b;', [d('a', 'REAL'), d('b', 'REAL'), d('r', 'REAL', 'output')], { a: 7.0, b: 2.0, r: 0 }).r).toBe(3.5);
    expect(evaluate('7.0 / 2.0', [], {})).toBe(3.5);
  });
});

describe('Integration: 64-bit values', () => {
  test('number mode keeps values above 2^32 (L := L + 1 at 4294967296)', () => {
    expect(run('L := L + 1;', [d('L', 'LINT', 'internal')], { L: 4294967296 }).L).toBe(4294967297);
  });

  test('number mode rounds a literal above 2^53 to the nearest double', () => {
    expect(run('L := 9007199254740993;', [d('L', 'LINT', 'output')], { L: 0 }).L).toBe(9007199254740992);
  });

  test('bigint mode keeps the exact literal value', () => {
    const opts = { int64: 'bigint' };
    expect(run('L := 9007199254740993;', [d('L', 'LINT', 'output')], { L: 0n }, opts).L).toBe(9007199254740993n);
    expect(run('L := LINT#9007199254740993;', [d('L', 'LINT', 'output')], { L: 0n }, opts).L).toBe(9007199254740993n);
  });

  test('bigint mode wraps at 64 bits', () => {
    const opts = { int64: 'bigint' };
    expect(run('L := L + 1;', [d('L', 'LINT', 'internal')], { L: 9223372036854775807n }, opts).L).toBe(-9223372036854775808n);
    expect(run('U := U + 1;', [d('U', 'ULINT', 'internal')], { U: 18446744073709551615n }, opts).U).toBe(0n);
    expect(run('W := NOT W;', [d('W', 'LWORD', 'internal')], { W: 0n }, opts).W).toBe(18446744073709551615n);
  });

  test('bigint mode converts narrower operands at the boundary', () => {
    const opts = { int64: 'bigint' };
    expect(run('L := L + i;', [d('L', 'LINT', 'internal'), d('i', 'INT')], { L: 10n, i: 5 }, opts).L).toBe(15n);
    expect(run('L := i;', [d('L', 'LINT', 'output'), d('i', 'DINT')], { L: 0n, i: -3 }, opts).L).toBe(-3n);
    expect(evaluate('L = i', [d('L', 'LINT'), d('i', 'INT')], { L: 5n, i: 5 }, opts)).toBe(true);
    expect(evaluate('L / 2', [d('L', 'LINT')], { L: 7n }, opts)).toBe(3n);
  });

  test('bigint mode FOR and CASE execute', () => {
    const opts = { int64: 'bigint' };
    const s = run('n := 0; FOR L := 0 TO 3 DO n := n + 1; END_FOR; CASE L OF 4: n := n + 10; END_CASE;',
      [d('L', 'LINT', 'internal'), d('n', 'INT', 'internal')], { L: 0n, n: 0 }, opts);
    expect(s.n).toBe(14);
    expect(s.L).toBe(4n);
  });

  test('L := LINT#1 + 1 executes in both modes', () => {
    expect(run('L := LINT#1 + 1;', [d('L', 'LINT', 'output')], { L: 0 }).L).toBe(2);
    expect(run('L := LINT#1 + 1;', [d('L', 'LINT', 'output')], { L: 0n }, { int64: 'bigint' }).L).toBe(2n);
  });
});

describe('Integration: typed literals and arrays execute', () => {
  test('array descriptor access', () => {
    const s = run('x := A[1];', [d('A', 'DINT', 'input', { arraySize: 4 }), d('x', 'DINT', 'output')], { A: [10, 20, 30, 40], x: 0 });
    expect(s.x).toBe(20);
  });

  test('array element write', () => {
    const s = run('A[i] := 7;', [d('A', 'INT', 'internal', { arraySize: 3 }), d('i', 'INT')], { A: [0, 0, 0], i: 2 });
    expect(s.A).toEqual([0, 0, 7]);
  });

  test('CASE with identifier bounds', () => {
    const vars = [d('x', 'INT'), d('lo', 'INT'), d('hi', 'INT'), d('y', 'INT', 'output')];
    const src = 'CASE x OF 0: y := 1; lo..hi: y := 2; ELSE y := 0; END_CASE;';
    expect(run(src, vars, { x: 0, lo: 5, hi: 9, y: -1 }).y).toBe(1);
    expect(run(src, vars, { x: 7, lo: 5, hi: 9, y: -1 }).y).toBe(2);
    expect(run(src, vars, { x: 3, lo: 5, hi: 9, y: -1 }).y).toBe(0);
  });

  test('WORD mask arithmetic', () => {
    const s = run('w := (w AND 16#FF) OR WORD#16#100;', [d('w', 'WORD', 'internal')], { w: 0xABCD });
    expect(s.w).toBe(0x1CD);
  });
});
