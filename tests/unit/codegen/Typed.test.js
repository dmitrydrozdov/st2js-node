'use strict';

const fs = require('fs');
const path = require('path');
const { compileAlgorithm, compileExpression, compile } = require('../../../src/index');
const TypeMapper = require('../../../src/codegen/TypeMapper');

const d = (name, type, direction = 'input', extra = {}) => ({ name, type, direction, ...extra });

function algo(src, vars, options) {
  const r = compileAlgorithm(src, vars, options);
  expect(r.errors.filter(e => e.severity === 'error')).toHaveLength(0);
  return r.code;
}

function expr(src, vars, options) {
  const r = compileExpression(src, vars, options);
  expect(r.errors.filter(e => e.severity === 'error')).toHaveLength(0);
  return r.code;
}

describe('Codegen: literals are emitted from constant annotations', () => {
  test.each([
    ['DINT#1', '1'],
    ['DINT#-5', '-5'],
    ['INT#+42', '42'],
    ['WORD#16#FF', '255'],
    ['BYTE#2#1010', '10'],
    ['REAL#2.5', '2.5'],
    ['LREAL#1.5e3', '1500'],
    ['BOOL#TRUE', 'true'],
    ['BOOL#FALSE', 'false'],
    ["STRING#'a'", '"a"'],
    ['TIME#1s', '1000'],
    ['TIME#-500ms', '-500'],
    ['DT#2024-01-01-00:00:00', '/* DATE_AND_TIME: 2024-01-01-00:00:00 */ 0'],
    ['TOD#12:30:00', '/* TIME_OF_DAY: 12:30:00 */ 0'],
    ['DATE#2024-01-01', '/* DATE: 2024-01-01 */ 0'],
    ['D#2024-01-01', '/* DATE: D#2024-01-01 */ 0'],
    ['T#1s', '1000'],
    ['16#FF', '255'],
    ['1.5', '1.5'],
    ["'x$ny'", '"x\\ny"'],
  ])('%s compiles to %s', (src, expected) => {
    const code = expr(src, []);
    expect(code).toBe(expected);
    expect(code).not.toContain('NaN');
  });

  test('typed literal in an algorithm produces a value, not NaN', () => {
    const code = algo('OUT := IN + DINT#1;', [d('IN', 'DINT'), d('OUT', 'DINT', 'output')]);
    expect(code).not.toContain('NaN');
    expect(code).toBe('__s["OUT"] = (__s["IN"] + 1) | 0;\n');
    const s = { IN: 4, OUT: 0 };
    new Function('__s', code)(s);
    expect(s.OUT).toBe(5);
  });

  test('every typed literal form from the lexer compiles without NaN', () => {
    const forms = [
      ['DINT#1', 'DINT'], ['DINT#-5', 'DINT'], ['INT#+42', 'INT'], ['WORD#16#FF', 'WORD'],
      ['BYTE#2#1010', 'BYTE'], ['REAL#2.5', 'REAL'], ['LREAL#1.5e3', 'LREAL'], ['BOOL#TRUE', 'BOOL'],
      ["STRING#'a'", 'STRING'], ['TIME#1s', 'TIME'], ['DT#2024-01-01-00:00:00', 'DATE_AND_TIME'],
    ];
    for (const [lit, type] of forms) {
      const code = algo(`x := ${lit};`, [d('x', type, 'output')]);
      expect(code).not.toContain('NaN');
      expect(code).not.toContain('null');
    }
  });

  test('negated literal keeps the unary form with the folded operand', () => {
    expect(expr('-5', [])).toBe('(-(5))');
    expect(algo('s := -128;', [d('s', 'SINT', 'output')])).toBe('__s["s"] = (-(128));\n');
  });

  test('enumeration typed literal still emits its inner identifier', () => {
    const r = compile(`
      TYPE Colour: (Red, Green); END_TYPE
      PROGRAM P
        VAR c: Colour; END_VAR
        c := Colour#Green;
      END_PROGRAM
    `, { sourceMaps: false });
    expect(r.errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(r.code).toContain('c = Green;');
  });
});

describe('Codegen: width-correct wrapping keyed by resolvedType', () => {
  test.each([
    ['SINT', '((__s["x"] + 1) << 24) >> 24'],
    ['USINT', '(__s["x"] + 1) & 0xFF'],
    ['BYTE', '(__s["x"] + 1) & 0xFF'],
    ['INT', '((__s["x"] + 1) << 16) >> 16'],
    ['UINT', '(__s["x"] + 1) & 0xFFFF'],
    ['WORD', '(__s["x"] + 1) & 0xFFFF'],
    ['DINT', '(__s["x"] + 1) | 0'],
    ['UDINT', '(__s["x"] + 1) >>> 0'],
    ['DWORD', '(__s["x"] + 1) >>> 0'],
    ['LINT', 'Math.trunc(__s["x"] + 1)'],
    ['ULINT', 'Math.trunc(__s["x"] + 1)'],
    ['LWORD', 'Math.trunc(__s["x"] + 1)'],
  ])('%s assignment emits %s', (type, expected) => {
    expect(algo('x := x + 1;', [d('x', type, 'internal')])).toBe(`__s["x"] = ${expected};\n`);
  });

  test('constants already within the target range are stored without a wrap', () => {
    expect(algo('x := 0;', [d('x', 'INT', 'output')])).toBe('__s["x"] = 0;\n');
    expect(algo('x := INT#42;', [d('x', 'DINT', 'output')])).toBe('__s["x"] = 42;\n');
    expect(algo('x := WORD#16#FF;', [d('x', 'WORD', 'output')])).toBe('__s["x"] = 255;\n');
    expect(algo('x := 0 + 1;', [d('x', 'INT', 'output')])).toBe('__s["x"] = ((0 + 1) << 16) >> 16;\n');
  });

  test('non-integer targets are not wrapped', () => {
    expect(algo('r := r + 1.0;', [d('r', 'REAL', 'internal')])).toBe('__s["r"] = (__s["r"] + 1);\n');
    expect(algo('b := NOT b;', [d('b', 'BOOL', 'internal')])).toBe('__s["b"] = !(__s["b"]);\n');
    expect(algo("s := 'a';", [d('s', 'STRING', 'output')])).toBe('__s["s"] = "a";\n');
  });

  test('FOR loop variables wrap at their width', () => {
    const code = algo('FOR i := 0 TO 10 DO sum := sum + i; END_FOR;', [d('i', 'SINT', 'internal'), d('sum', 'INT', 'output')]);
    expect(code).toContain('for (__s["i"] = 0; __s["i"] <= (10); __s["i"] = ((__s["i"] + 1) << 24) >> 24) {');
    const by = algo('FOR i := 10 TO 0 BY -2 DO sum := sum + i; END_FOR;', [d('i', 'INT', 'internal'), d('sum', 'INT', 'output')]);
    expect(by).toContain('for (__s["i"] = 10; ((-(2))) > 0 ? __s["i"] <= (0) : __s["i"] >= (0); __s["i"] = ((__s["i"] + ((-(2)))) << 16) >> 16) {');
    const fromVar = algo('FOR i := n TO 10 DO sum := sum + i; END_FOR;', [d('i', 'INT', 'internal'), d('n', 'INT'), d('sum', 'INT', 'output')]);
    expect(fromVar).toContain('for (__s["i"] = ((__s["n"]) << 16) >> 16;');
  });

  test('TypeMapper.wrapInteger and helpers', () => {
    expect(TypeMapper.wrapInteger('v', 'REAL')).toBe('v');
    expect(TypeMapper.wrapInteger('v', 'LINT', 'bigint')).toBe('BigInt.asIntN(64, v)');
    expect(TypeMapper.wrapInteger('v', 'LWORD', 'bigint')).toBe('BigInt.asUintN(64, v)');
    expect(TypeMapper.integerLiteral(5n, 'LINT', 'bigint')).toBe('5n');
    expect(TypeMapper.integerLiteral(5n, 'LINT')).toBe('5');
    expect(TypeMapper.integerLiteral(5n, 'INT', 'bigint')).toBe('5');
    expect(TypeMapper.getDefaultValue('LINT', 'bigint')).toBe('0n');
    expect(TypeMapper.getDefaultValue('LINT')).toBe('0');
    expect(TypeMapper.getDefaultValue('INT', 'bigint')).toBe('0');
    expect(TypeMapper.is64Bit('ULINT')).toBe(true);
    expect(TypeMapper.bitwiseNot('v', 'BYTE')).toBe('(~(v)) & 0xFF');
    expect(TypeMapper.bitwiseNot('v', 'WORD')).toBe('(~(v)) & 0xFFFF');
    expect(TypeMapper.bitwiseNot('v', 'DWORD')).toBe('(~(v)) >>> 0');
    expect(TypeMapper.bitwiseNot('v', 'LWORD')).toBe('(~(v))');
    expect(TypeMapper.bitwiseNot('v', 'LWORD', 'bigint')).toBe('BigInt.asUintN(64, ~(v))');
  });
});

describe('Codegen: bitwise and boolean operators by type', () => {
  test('AND/OR/XOR/NOT on BOOL', () => {
    expect(expr('a AND b', [d('a', 'BOOL'), d('b', 'BOOL')])).toBe('(__s["a"] && __s["b"])');
    expect(expr('a OR b', [d('a', 'BOOL'), d('b', 'BOOL')])).toBe('(__s["a"] || __s["b"])');
    expect(expr('a XOR b', [d('a', 'BOOL'), d('b', 'BOOL')])).toBe('(!!(__s["a"]) !== !!(__s["b"]))');
    expect(expr('NOT a', [d('a', 'BOOL')])).toBe('!(__s["a"])');
  });

  test('AND/OR/XOR/NOT on bit strings are bitwise', () => {
    expect(expr('w AND 16#FF', [d('w', 'WORD')])).toBe('(__s["w"] & 255)');
    expect(expr('w OR b', [d('w', 'WORD'), d('b', 'BYTE')])).toBe('(__s["w"] | __s["b"])');
    expect(expr('w XOR w', [d('w', 'WORD')])).toBe('(__s["w"] ^ __s["w"])');
    expect(expr('NOT w', [d('w', 'WORD')])).toBe('(~(__s["w"])) & 0xFFFF');
    expect(expr('dw AND dw', [d('dw', 'DWORD')])).toBe('((__s["dw"] & __s["dw"]) >>> 0)');
    expect(expr('NOT dw', [d('dw', 'DWORD')])).toBe('(~(__s["dw"])) >>> 0');
  });

  test('bitwise semantics execute correctly', () => {
    const run = (src, vars, scope) => new Function('__s', 'return ' + expr(src, vars))(scope);
    expect(run('NOT b', [d('b', 'BYTE')], { b: 0x0F })).toBe(0xF0);
    expect(run('NOT dw', [d('dw', 'DWORD')], { dw: 0 })).toBe(0xFFFFFFFF);
    expect(run('dw OR 16#80000000', [d('dw', 'DWORD')], { dw: 1 })).toBe(0x80000001);
  });
});

describe('Codegen: integer division', () => {
  test('emits Math.trunc for integer operands and plain / for reals', () => {
    expect(expr('a / b', [d('a', 'DINT'), d('b', 'DINT')])).toBe('Math.trunc(__s["a"] / __s["b"])');
    expect(expr('a / b', [d('a', 'REAL'), d('b', 'REAL')])).toBe('(__s["a"] / __s["b"])');
    expect(expr('7 / 2', [])).toBe('Math.trunc(7 / 2)');
    expect(expr('7.0 / 2.0', [])).toBe('(7 / 2)');
  });
});

describe('Codegen: int64 option', () => {
  test('rejects an invalid int64 value', () => {
    expect(() => compileAlgorithm('x := 1;', [d('x', 'LINT', 'output')], { int64: 'wat' })).toThrow(TypeError);
    expect(() => compileExpression('1', [], { int64: 'wat' })).toThrow(TypeError);
    expect(() => compile('PROGRAM P END_PROGRAM', { int64: 'wat' })).toThrow(TypeError);
  });

  test('number mode never truncates 64-bit results to 32 bits', () => {
    const code = algo('L := L + 1;', [d('L', 'LINT', 'internal')]);
    expect(code).toBe('__s["L"] = Math.trunc(__s["L"] + 1);\n');
    expect(code).not.toContain('| 0');
  });

  test('bigint mode emits bigint literals, wrapping, and boundary casts', () => {
    const opts = { int64: 'bigint' };
    expect(algo('L := L + 1;', [d('L', 'LINT', 'internal')], opts)).toBe('__s["L"] = BigInt.asIntN(64, __s["L"] + 1n);\n');
    expect(algo('U := U + 1;', [d('U', 'ULINT', 'internal')], opts)).toBe('__s["U"] = BigInt.asUintN(64, __s["U"] + 1n);\n');
    expect(algo('L := L + i;', [d('L', 'LINT', 'internal'), d('i', 'INT')], opts)).toBe('__s["L"] = BigInt.asIntN(64, __s["L"] + BigInt(__s["i"]));\n');
    expect(algo('L := i;', [d('L', 'LINT', 'output'), d('i', 'INT')], opts)).toBe('__s["L"] = BigInt.asIntN(64, BigInt(__s["i"]));\n');
    expect(algo('L := LINT#9007199254740993;', [d('L', 'LINT', 'output')], opts)).toBe('__s["L"] = 9007199254740993n;\n');
    expect(algo('L := INT#5;', [d('L', 'LINT', 'output')], opts)).toBe('__s["L"] = BigInt(5);\n');
    expect(expr('L < i', [d('L', 'LINT'), d('i', 'DINT')], opts)).toBe('(__s["L"] < BigInt(__s["i"]))');
    expect(expr('L / 2', [d('L', 'LINT')], opts)).toBe('(__s["L"] / 2n)');
    expect(expr('NOT w', [d('w', 'LWORD')], opts)).toBe('BigInt.asUintN(64, ~(__s["w"]))');
    expect(expr('w AND 16#F', [d('w', 'LWORD')], opts)).toBe('(__s["w"] & 15n)');
  });

  test('narrower types are unaffected by bigint mode', () => {
    const opts = { int64: 'bigint' };
    expect(algo('x := x + 1;', [d('x', 'DINT', 'internal')], opts)).toBe('__s["x"] = (__s["x"] + 1) | 0;\n');
    expect(expr('d < i', [d('d', 'DINT'), d('i', 'INT')], opts)).toBe('(__s["d"] < __s["i"])');
  });

  test('L := LINT#1 + 1 compiles in both modes', () => {
    expect(algo('L := LINT#1 + 1;', [d('L', 'LINT', 'output')])).toBe('__s["L"] = Math.trunc(1 + 1);\n');
    expect(algo('L := LINT#1 + 1;', [d('L', 'LINT', 'output')], { int64: 'bigint' })).toBe('__s["L"] = BigInt.asIntN(64, 1n + 1n);\n');
  });

  test('FOR and CASE over 64-bit values in bigint mode', () => {
    const opts = { int64: 'bigint' };
    const forCode = algo('FOR L := 0 TO 3 DO n := n + 1; END_FOR;', [d('L', 'LINT', 'internal'), d('n', 'INT', 'internal')], opts);
    expect(forCode).toContain('for (__s["L"] = 0n; __s["L"] <= (3n); __s["L"] = BigInt.asIntN(64, __s["L"] + 1n)) {');
    const caseCode = algo('CASE L OF 1..2: n := 1; 5: n := 2; END_CASE;', [d('L', 'LINT'), d('n', 'INT', 'output')], opts);
    expect(caseCode).toContain('case 1n:');
    expect(caseCode).toContain('case 2n:');
    expect(caseCode).toContain('case 5n:');
  });

  test('POU declarations default 64-bit variables to 0n in bigint mode', () => {
    const r = compile(`
      PROGRAM P
        VAR L: LINT; M: LINT := 5; d: DINT; END_VAR
        L := L + M;
      END_PROGRAM
    `, { sourceMaps: false, int64: 'bigint' });
    expect(r.errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(r.code).toContain('let L = 0n; // LINT');
    expect(r.code).toContain('let M = 5n; // LINT');
    expect(r.code).toContain('let d = 0; // DINT');
    expect(r.code).toContain('L = BigInt.asIntN(64, L + M);');
  });
});

describe('Codegen: no private type inference remains', () => {
  test('src/codegen contains no inference helper or variable-type map', () => {
    const dir = path.join(__dirname, '..', '..', '..', 'src', 'codegen');
    for (const file of fs.readdirSync(dir)) {
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      expect(text).not.toMatch(/_inferType/);
      expect(text).not.toMatch(/_varTypes/);
      expect(text).not.toMatch(/inferType\s*\(/);
    }
  });
});
