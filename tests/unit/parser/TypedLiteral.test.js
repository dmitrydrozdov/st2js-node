'use strict';

const { parseExpression, parseAlgorithm, compileAlgorithm } = require('../../../src/index');
const { parseIntegerText } = require('../../../src/parser/Parser');
const { NodeType } = require('../../../src/types');

function expr(src) {
  const { ast, errors } = parseExpression(src);
  expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
  expect(ast).not.toBeNull();
  return ast;
}

describe('Parser: typed literals (TypedLiteral node)', () => {
  test('DINT#1 yields TypedLiteral DINT with integer 1', () => {
    const ast = expr('DINT#1');
    expect(ast.type).toBe(NodeType.TYPED_LITERAL);
    expect(ast.typeName).toBe('DINT');
    expect(ast.raw).toBe('DINT#1');
    expect(ast.value.type).toBe(NodeType.INTEGER_LITERAL);
    expect(ast.value.value).toBe(1);
    expect(ast.value.bigValue).toBe(1n);
    expect(ast.value.raw).toBe('1');
  });

  test.each([
    ['DINT#-5', 'DINT', -5, -5n],
    ['INT#+42', 'INT', 42, 42n],
    ['WORD#16#FF', 'WORD', 255, 255n],
    ['BYTE#2#1010', 'BYTE', 10, 10n],
    ['DWORD#8#777', 'DWORD', 511, 511n],
    ['UDINT#4_294_967_295', 'UDINT', 4294967295, 4294967295n],
    ['LWORD#16#FFFFFFFFFFFFFFFF', 'LWORD', 18446744073709551615, 18446744073709551615n],
    ['SINT#-128', 'SINT', -128, -128n],
  ])('%s is a typed integer literal', (src, typeName, value, bigValue) => {
    const ast = expr(src);
    expect(ast.type).toBe(NodeType.TYPED_LITERAL);
    expect(ast.typeName).toBe(typeName);
    expect(ast.value.type).toBe(NodeType.INTEGER_LITERAL);
    expect(ast.value.value).toBe(value);
    expect(ast.value.bigValue).toBe(bigValue);
  });

  test.each([
    ['REAL#2.5', 'REAL', 2.5],
    ['LREAL#1.5e3', 'LREAL', 1500],
    ['REAL#-1.5E-3', 'REAL', -0.0015],
    ['REAL#5', 'REAL', 5],
    ['LREAL#1_000.5', 'LREAL', 1000.5],
  ])('%s is a typed real literal', (src, typeName, value) => {
    const ast = expr(src);
    expect(ast.typeName).toBe(typeName);
    expect(ast.value.type).toBe(NodeType.REAL_LITERAL);
    expect(ast.value.value).toBeCloseTo(value, 10);
  });

  test.each([
    ['BOOL#TRUE', true], ['BOOL#FALSE', false], ['BOOL#1', true], ['BOOL#0', false], ['bool#true', true],
  ])('%s is a typed boolean literal', (src, value) => {
    const ast = expr(src);
    expect(ast.typeName).toBe('BOOL');
    expect(ast.value.type).toBe(NodeType.BOOL_LITERAL);
    expect(ast.value.value).toBe(value);
  });

  test("STRING#'a' is a typed string literal", () => {
    const ast = expr("STRING#'a'");
    expect(ast.typeName).toBe('STRING');
    expect(ast.value.type).toBe(NodeType.STRING_LITERAL);
    expect(ast.value.value).toBe('a');
  });

  test('WSTRING#"a$nb" unescapes like an untyped string', () => {
    const ast = expr('WSTRING#"a$nb"');
    expect(ast.typeName).toBe('WSTRING');
    expect(ast.value.value).toBe('a\nb');
  });

  test('TIME#1s is a typed time literal with ms', () => {
    const ast = expr('TIME#1s');
    expect(ast.typeName).toBe('TIME');
    expect(ast.value.type).toBe(NodeType.TIME_LITERAL);
    expect(ast.value.ms).toBe(1000);
  });

  test('TIME#-1h30m is negative', () => {
    const ast = expr('TIME#-1h30m');
    expect(ast.value.ms).toBe(-(90 * 60 * 1000));
  });

  test.each([
    ['DATE#2024-01-01', 'DATE', '2024-01-01'],
    ['TOD#12:30:00.500', 'TIME_OF_DAY', '12:30:00.500'],
    ['TIME_OF_DAY#12:30:00', 'TIME_OF_DAY', '12:30:00'],
    ['DT#2024-01-01-00:00:00', 'DATE_AND_TIME', '2024-01-01-00:00:00'],
    ['DATE_AND_TIME#2024-01-01-12:30:00.5', 'DATE_AND_TIME', '2024-01-01-12:30:00.5'],
  ])('%s is a typed date/time-of-day literal', (src, typeName, text) => {
    const ast = expr(src);
    expect(ast.typeName).toBe(typeName);
    expect(ast.value.type).toBe(NodeType.DATE_LITERAL);
    expect(ast.value.value).toBe(text);
  });

  test('typed literal inside an expression', () => {
    const ast = expr('x + DINT#1');
    expect(ast.type).toBe(NodeType.BINARY_EXPR);
    expect(ast.right.type).toBe(NodeType.TYPED_LITERAL);
    expect(ast.right.typeName).toBe('DINT');
    expect(ast.right.value.value).toBe(1);
  });

  test('MyEnum#Value still parses through the identifier path', () => {
    const ast = expr('MyEnum#Value');
    expect(ast.type).toBe(NodeType.TYPED_LITERAL);
    expect(ast.typeName).toBe('MyEnum');
    expect(ast.value.type).toBe(NodeType.IDENTIFIER_REF);
    expect(ast.value.name).toBe('Value');
  });

  test('untyped T#1s and D#2024-01-01 are unchanged', () => {
    const t = expr('T#1s');
    expect(t.type).toBe(NodeType.TIME_LITERAL);
    expect(t.ms).toBe(1000);
    const d = expr('D#2024-01-01');
    expect(d.type).toBe(NodeType.DATE_LITERAL);
    expect(d.value).toBe('D#2024-01-01');
  });

  test('a typed literal never yields a null or NaN value', () => {
    const forms = ['DINT#1', 'DINT#-5', 'INT#+42', 'WORD#16#FF', 'BYTE#2#1010', 'REAL#2.5',
      'LREAL#1.5e3', 'BOOL#TRUE', "STRING#'a'", 'TIME#1s', 'DT#2024-01-01-00:00:00'];
    for (const src of forms) {
      const ast = expr(src);
      expect(ast.value.value).not.toBeNull();
      expect(Number.isNaN(ast.value.value)).toBe(false);
    }
  });

  test.each([
    ['BYTE#2#1012', /Invalid BYTE literal/],
    ['DINT#1.5', /Unexpected token/],
    ['BOOL#maybe', /Invalid BOOL literal/],
    ['DATE#2024', /Invalid DATE literal/],
    ['TOD#25', /Invalid TIME_OF_DAY literal/],
    ['DINT#;', /Expected a DINT literal value/],
  ])('%s is a parse error', (src, pattern) => {
    const { ast, errors } = parseExpression(src);
    expect(ast).toBeNull();
    expect(errors.some(e => e.severity === 'error' && pattern.test(e.message))).toBe(true);
  });

  test('a type keyword followed by whitespace and # is not a typed literal', () => {
    const { errors } = parseExpression('INT # 42');
    expect(errors.some(e => e.severity === 'error')).toBe(true);
  });
});

describe('Parser: integer literals carry an exact bigValue', () => {
  test('decimal literal above 2^53 is exact', () => {
    const ast = expr('9007199254740993');
    expect(ast.type).toBe(NodeType.INTEGER_LITERAL);
    expect(ast.bigValue).toBe(9007199254740993n);
    expect(ast.value).toBe(9007199254740992); // nearest double
    expect(ast.raw).toBe('9007199254740993');
  });

  test('16#FFFFFFFFFFFFFFFF is exact for all 64 bits', () => {
    const ast = expr('16#FFFFFFFFFFFFFFFF');
    expect(ast.bigValue).toBe(18446744073709551615n);
    expect(ast.raw).toBe('16#FFFFFFFFFFFFFFFF');
  });

  test('LWORD#16#FFFFFFFFFFFFFFFF inner literal is exact', () => {
    const ast = expr('LWORD#16#FFFFFFFFFFFFFFFF');
    expect(ast.value.bigValue).toBe(18446744073709551615n);
  });

  test.each([
    ['42', 42n], ['16#FF', 255n], ['8#77', 63n], ['2#1010', 10n], ['0', 0n],
  ])('%s has bigValue %s and matching value', (src, big) => {
    const ast = expr(src);
    expect(ast.bigValue).toBe(big);
    expect(ast.value).toBe(Number(big));
  });

  test('parseIntegerText handles signs, bases, and rejects malformed text', () => {
    expect(parseIntegerText('-5')).toEqual({ value: -5, bigValue: -5n });
    expect(parseIntegerText('+16#10')).toEqual({ value: 16, bigValue: 16n });
    expect(parseIntegerText('2#102')).toBeNull();
    expect(parseIntegerText('8#78')).toBeNull();
    expect(parseIntegerText('abc')).toBeNull();
    expect(parseIntegerText('')).toBeNull();
    expect(parseIntegerText('16#')).toBeNull();
  });

  test('a malformed base-prefixed literal still yields a numeric node', () => {
    const { ast, errors } = parseAlgorithm('x := 16#;');
    expect(errors.some(e => e.phase === 'lexer')).toBe(true);
    expect(ast).not.toBeNull();
    expect(ast.statements[0].value.bigValue).toBe(0n);
  });

  test('literals in variable initial values carry bigValue', () => {
    const { parse } = require('../../../src/index');
    const { ast } = parse('PROGRAM P VAR x: INT := 42; END_VAR END_PROGRAM');
    expect(ast.declarations[0].varSections[0].declarations[0].initialValue.bigValue).toBe(42n);
  });
});

describe('Parser: CASE range bounds', () => {
  function caseValues(src) {
    const { ast, errors } = parseAlgorithm(src);
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
    return ast.statements[0].clauses.map(c => c.values);
  }

  test('1..3 is a RangeLiteral with integer bounds', () => {
    const [[v]] = caseValues('CASE x OF 1..3: y := 1; END_CASE;');
    expect(v.type).toBe(NodeType.RANGE_LITERAL);
    expect(v.lo.type).toBe(NodeType.INTEGER_LITERAL);
    expect(v.lo.value).toBe(1);
    expect(v.lo.bigValue).toBe(1n);
    expect(v.hi.value).toBe(3);
    expect(v.hi.bigValue).toBe(3n);
    expect(v.loc).toBeDefined();
  });

  test('-5..-1 has negative integer bounds', () => {
    const [[v]] = caseValues('CASE x OF -5..-1: y := 1; END_CASE;');
    expect(v.type).toBe(NodeType.RANGE_LITERAL);
    expect(v.lo.value).toBe(-5);
    expect(v.lo.bigValue).toBe(-5n);
    expect(v.lo.raw).toBe('-5');
    expect(v.hi.value).toBe(-1);
    expect(v.hi.bigValue).toBe(-1n);
  });

  test('LO..HI has identifier bounds, never a null-valued literal', () => {
    const [[v]] = caseValues('CASE x OF LO..HI: y := 1; END_CASE;');
    expect(v.type).toBe(NodeType.RANGE_LITERAL);
    expect(v.lo.type).toBe(NodeType.IDENTIFIER_REF);
    expect(v.lo.name).toBe('LO');
    expect(v.hi.type).toBe(NodeType.IDENTIFIER_REF);
    expect(v.hi.name).toBe('HI');
  });

  test('DINT#1..DINT#9 has typed literal bounds', () => {
    const [[v]] = caseValues('CASE x OF DINT#1..DINT#9: y := 1; END_CASE;');
    expect(v.type).toBe(NodeType.RANGE_LITERAL);
    expect(v.lo.type).toBe(NodeType.TYPED_LITERAL);
    expect(v.lo.typeName).toBe('DINT');
    expect(v.lo.value.value).toBe(1);
    expect(v.hi.type).toBe(NodeType.TYPED_LITERAL);
    expect(v.hi.value.value).toBe(9);
  });

  test('mixed bounds and negative typed literal labels', () => {
    const values = caseValues('CASE x OF -DINT#3: y := 1; 1, 2: y := 2; A..5: y := 3; ELSE y := 0; END_CASE;');
    expect(values[0][0].type).toBe(NodeType.TYPED_LITERAL);
    expect(values[0][0].value.value).toBe(-3);
    expect(values[0][0].value.bigValue).toBe(-3n);
    expect(values[1]).toHaveLength(2);
    expect(values[2][0].lo.type).toBe(NodeType.IDENTIFIER_REF);
    expect(values[2][0].hi.type).toBe(NodeType.INTEGER_LITERAL);
  });

  test('a missing upper bound is a parse error', () => {
    const { errors } = parseAlgorithm('CASE x OF 1..: y := 1; END_CASE;');
    expect(errors.some(e => e.severity === 'error' && /Expected case value/.test(e.message))).toBe(true);
  });

  test('a negated identifier bound is a parse error', () => {
    const { errors } = parseAlgorithm('CASE x OF -LO: y := 1; END_CASE;');
    expect(errors.some(e => e.severity === 'error')).toBe(true);
  });

  test('CASE x OF 1..3: still expands to three case labels', () => {
    const result = compileAlgorithm('CASE x OF 1..3: y := 1; END_CASE;', [
      { name: 'x', type: 'INT', direction: 'input' },
      { name: 'y', type: 'INT', direction: 'output' },
    ]);
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(result.code).toContain('case 1:');
    expect(result.code).toContain('case 2:');
    expect(result.code).toContain('case 3:');
    const fn = new Function('__s', result.code);
    const s = { x: 2, y: 0 };
    fn(s);
    expect(s.y).toBe(1);
  });

  test('CASE x OF -5..-1: expands to five case labels', () => {
    const result = compileAlgorithm('CASE x OF -5..-1: y := 1; END_CASE;', [
      { name: 'x', type: 'INT', direction: 'input' },
      { name: 'y', type: 'INT', direction: 'output' },
    ]);
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
    for (let i = -5; i <= -1; i++) expect(result.code).toContain(`case ${i}:`);
    expect(result.code).not.toContain('case 0:');
  });
});
