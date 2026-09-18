'use strict';

const Lexer = require('../../../src/lexer/Lexer');
const Parser = require('../../../src/parser/Parser');
const ASTBuilder = require('../../../src/parser/ASTBuilder');
const Validator = require('../../../src/parser/Validator');
const Codegen = require('../../../src/codegen/Codegen');

// Codegen reads the annotations written by the typing pass, so the validator
// (which runs the analyzer) must precede it.
function compile(src, vars, options = {}) {
  const lexer = new Lexer(src);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, src);
  const cst = parser.parseStatementList();
  const ast = new ASTBuilder(src).build(cst);
  const errors = new Validator().validateAlgorithm(ast, vars);
  expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
  return new Codegen({ sourceMaps: false, ...options }).generateAlgorithm(ast, vars);
}

describe('Codegen.generateAlgorithm', () => {
  test('simple assignment uses __s and wraps INT to 16 bits', () => {
    const { code } = compile('Count := Count + 1;', [
      { name: 'Count', type: 'INT', direction: 'internal' },
    ]);
    expect(code).toContain('__s["Count"]');
    expect(code).toContain('<< 16) >> 16');
  });

  test('mixed arithmetic with input and output', () => {
    const { code, inputNames, outputNames } = compile('CV := CI * 2;', [
      { name: 'CI', type: 'INT', direction: 'input' },
      { name: 'CV', type: 'INT', direction: 'output' },
    ]);
    expect(code).toContain('__s["CI"]');
    expect(code).toContain('__s["CV"]');
    expect(inputNames).toEqual(['CI']);
    expect(outputNames).toEqual(['CV']);
  });

  test('IF statement generates if/else', () => {
    const { code } = compile('IF x > 0 THEN y := 1; ELSE y := 2; END_IF;', [
      { name: 'x', type: 'INT', direction: 'input' },
      { name: 'y', type: 'INT', direction: 'output' },
    ]);
    expect(code).toContain('if (');
    expect(code).toContain('else');
    expect(code).toContain('__s["y"]');
  });

  test('CASE generates switch', () => {
    const { code } = compile('CASE s OF 1: y := 1; 2: y := 2; ELSE y := 0; END_CASE;', [
      { name: 's', type: 'INT', direction: 'input' },
      { name: 'y', type: 'INT', direction: 'output' },
    ]);
    expect(code).toContain('switch');
    expect(code).toContain('case 1');
    expect(code).toContain('default');
  });

  test('FOR loop uses scope access for loop variable', () => {
    const { code } = compile('FOR i := 0 TO 10 DO sum := sum + i; END_FOR;', [
      { name: 'i', type: 'INT', direction: 'internal' },
      { name: 'sum', type: 'INT', direction: 'output' },
    ]);
    expect(code).toContain('for (__s["i"]');
    expect(code).toContain('__s["sum"]');
  });

  test('WHILE loop', () => {
    const { code } = compile('WHILE x < 10 DO x := x + 1; END_WHILE;', [
      { name: 'x', type: 'INT', direction: 'internal' },
    ]);
    expect(code).toContain('while (');
    expect(code).toContain('__s["x"]');
  });

  test('standard-function call passes through', () => {
    const { code } = compile('r := ABS(v);', [
      { name: 'v', type: 'INT', direction: 'input' },
      { name: 'r', type: 'INT', direction: 'output' },
    ]);
    expect(code).toContain('ABS(');
    expect(code).toContain('__s["v"]');
    expect(code).toContain('__s["r"]');
  });

  test('integer wrapping follows the target width', () => {
    const { code } = compile('out := a + b;', [
      { name: 'a', type: 'INT', direction: 'input' },
      { name: 'b', type: 'INT', direction: 'input' },
      { name: 'out', type: 'INT', direction: 'output' },
    ]);
    expect(code).toBe('__s["out"] = ((__s["a"] + __s["b"]) << 16) >> 16;\n');
    const dint = compile('out := a + b;', [
      { name: 'a', type: 'DINT', direction: 'input' },
      { name: 'b', type: 'DINT', direction: 'input' },
      { name: 'out', type: 'DINT', direction: 'output' },
    ]);
    expect(dint.code).toMatch(/\) \| 0/);
  });

  test('an unanalyzed tree is emitted without wrapping (annotations only)', () => {
    const src = 'Count := Count + 1;';
    const lexer = new Lexer(src);
    const parser = new Parser(lexer.tokenize(), src);
    const ast = new ASTBuilder(src).build(parser.parseStatementList());
    const { code } = new Codegen({ sourceMaps: false }).generateAlgorithm(ast, [
      { name: 'Count', type: 'INT', direction: 'internal' },
    ]);
    expect(code).toBe('__s["Count"] = (__s["Count"] + 1);\n');
  });

  test('no bare descriptor identifiers in emitted body', () => {
    const { code } = compile('out := a + 1;', [
      { name: 'a', type: 'INT', direction: 'input' },
      { name: 'out', type: 'INT', direction: 'output' },
    ]);
    // Strip all __s["..."] occurrences and check no bare descriptor identifiers remain
    const stripped = code.replace(/__s\["[^"]+"\]/g, '');
    expect(/\ba\b/.test(stripped)).toBe(false);
    expect(/\bout\b/.test(stripped)).toBe(false);
  });

  test('REAL output skips integer wrapping', () => {
    const { code } = compile('r := a * 1.5;', [
      { name: 'a', type: 'REAL', direction: 'input' },
      { name: 'r', type: 'REAL', direction: 'output' },
    ]);
    expect(code).toBe('__s["r"] = (__s["a"] * 1.5);\n');
  });

  test('executes correctly against a plain scope object', () => {
    const { code } = compile('Count := Count + 1;', [
      { name: 'Count', type: 'INT', direction: 'internal' },
    ]);
    const fn = new Function('__s', code);
    const scope = { Count: 4 };
    fn(scope);
    expect(scope.Count).toBe(5);
  });
});
