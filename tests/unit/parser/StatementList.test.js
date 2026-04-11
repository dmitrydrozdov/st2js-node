'use strict';

const Lexer = require('../../../src/lexer/Lexer');
const Parser = require('../../../src/parser/Parser');
const ASTBuilder = require('../../../src/parser/ASTBuilder');
const { NodeType } = require('../../../src/types');

function parseAlgo(src) {
  const lexer = new Lexer(src);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, src);
  const cst = parser.parseStatementList();
  const errors = [...lexer.errors, ...parser.errors];
  const ast = new ASTBuilder(src).build(cst);
  return { ast, errors };
}

function parseTopLevel(src) {
  const lexer = new Lexer(src);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, src);
  parser.parse();
  return { errors: [...lexer.errors, ...parser.errors] };
}

describe('Parser.parseStatementList (algorithm mode)', () => {
  test('empty source returns an empty statement list', () => {
    const { ast, errors } = parseAlgo('');
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(ast.type).toBe(NodeType.STATEMENT_LIST);
    expect(ast.statements).toHaveLength(0);
  });

  test('single assignment', () => {
    const { ast, errors } = parseAlgo('Count := 1;');
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(ast.statements).toHaveLength(1);
    expect(ast.statements[0].type).toBe(NodeType.ASSIGNMENT);
  });

  test('multiple assignments', () => {
    const { ast } = parseAlgo('A := 1; B := 2; C := A + B;');
    expect(ast.statements).toHaveLength(3);
  });

  test('IF / ELSIF / ELSE', () => {
    const { ast, errors } = parseAlgo(`
      IF x > 0 THEN y := 1;
      ELSIF x = 0 THEN y := 2;
      ELSE y := 3;
      END_IF;
    `);
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(ast.statements[0].type).toBe(NodeType.IF_STATEMENT);
    expect(ast.statements[0].elsifClauses).toHaveLength(1);
    expect(ast.statements[0].elseClause).not.toBeNull();
  });

  test('CASE', () => {
    const { ast, errors } = parseAlgo(`
      CASE state OF
        1: y := 1;
        2: y := 2;
        ELSE y := 0;
      END_CASE;
    `);
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(ast.statements[0].type).toBe(NodeType.CASE_STATEMENT);
  });

  test('FOR / TO / BY', () => {
    const { ast, errors } = parseAlgo('FOR i := 0 TO 10 BY 2 DO sum := sum + i; END_FOR;');
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(ast.statements[0].type).toBe(NodeType.FOR_STATEMENT);
    expect(ast.statements[0].by).not.toBeNull();
  });

  test('WHILE', () => {
    const { ast, errors } = parseAlgo('WHILE x < 10 DO x := x + 1; END_WHILE;');
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(ast.statements[0].type).toBe(NodeType.WHILE_STATEMENT);
  });

  test('REPEAT / UNTIL', () => {
    const { ast, errors } = parseAlgo('REPEAT x := x + 1; UNTIL x >= 10;');
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(ast.statements[0].type).toBe(NodeType.REPEAT_STATEMENT);
  });

  test('function call statement', () => {
    const { ast, errors } = parseAlgo('ABS(x);');
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(ast.statements[0].type).toBe(NodeType.FUNCTION_CALL_STATEMENT);
  });

  test('mix of control-flow in one body', () => {
    const { ast, errors } = parseAlgo(`
      x := 0;
      IF x = 0 THEN x := 1; END_IF;
      FOR i := 1 TO 3 DO x := x + i; END_FOR;
      WHILE x < 100 DO x := x * 2; END_WHILE;
      CASE x OF 1: y := 1; ELSE y := 0; END_CASE;
    `);
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(ast.statements.length).toBe(5);
  });

  test('existing parse() still rejects a bare statement list', () => {
    const { errors } = parseTopLevel('Count := Count + 1;');
    const parseErrors = errors.filter(e => e.severity === 'error' && e.phase === 'parser');
    expect(parseErrors.length).toBeGreaterThan(0);
  });

  test('ASTBuilder normalises StatementList CST to AST', () => {
    const { ast } = parseAlgo('A := 1;');
    expect(ast.type).toBe(NodeType.STATEMENT_LIST);
    expect(Array.isArray(ast.statements)).toBe(true);
    expect(ast.loc).toBeDefined();
  });
});
