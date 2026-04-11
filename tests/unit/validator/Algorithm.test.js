'use strict';

const Lexer = require('../../../src/lexer/Lexer');
const Parser = require('../../../src/parser/Parser');
const ASTBuilder = require('../../../src/parser/ASTBuilder');
const Validator = require('../../../src/parser/Validator');

function parseAlgo(src) {
  const lexer = new Lexer(src);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, src);
  const cst = parser.parseStatementList();
  return new ASTBuilder(src).build(cst);
}

function runValidator(src, vars) {
  const ast = parseAlgo(src);
  return new Validator().validateAlgorithm(ast, vars);
}

describe('Validator.validateAlgorithm', () => {
  test('writing to an input is an error', () => {
    const errors = runValidator('CI := 0;', [
      { name: 'CI', type: 'INT', direction: 'input' },
    ]);
    const errs = errors.filter(e => e.severity === 'error');
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0].phase).toBe('validator');
    expect(errs[0].message).toMatch(/CI/);
  });

  test('reading an input is allowed', () => {
    const errors = runValidator('CV := CI;', [
      { name: 'CI', type: 'INT', direction: 'input' },
      { name: 'CV', type: 'INT', direction: 'output' },
    ]);
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
  });

  test('unknown identifier is reported', () => {
    const errors = runValidator('Result := Missing + 1;', [
      { name: 'Result', type: 'INT', direction: 'output' },
    ]);
    const warningsOrErrors = errors.filter(e => /Missing/.test(e.message));
    expect(warningsOrErrors.length).toBeGreaterThan(0);
  });

  test('type mismatch produces warning, not error', () => {
    const errors = runValidator('R := S;', [
      { name: 'R', type: 'INT', direction: 'output' },
      { name: 'S', type: 'STRING', direction: 'input' },
    ]);
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
    expect(errors.filter(e => e.severity === 'warning').length).toBeGreaterThan(0);
  });

  test('standard function call is not flagged', () => {
    const errors = runValidator('R := ABS(V);', [
      { name: 'V', type: 'INT', direction: 'input' },
      { name: 'R', type: 'INT', direction: 'output' },
    ]);
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
    const abs = errors.filter(e => /ABS/.test(e.message || ''));
    expect(abs).toHaveLength(0);
  });

  test('duplicate descriptor names rejected', () => {
    const errors = new Validator().validateAlgorithm(
      { type: 'StatementList', statements: [], loc: {} },
      [
        { name: 'Count', type: 'INT', direction: 'input' },
        { name: 'Count', type: 'INT', direction: 'output' },
      ]
    );
    expect(errors.filter(e => e.severity === 'error').length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/Duplicate/);
  });

  test('invalid direction rejected', () => {
    const errors = new Validator().validateAlgorithm(
      { type: 'StatementList', statements: [], loc: {} },
      [{ name: 'X', type: 'INT', direction: 'inout' }]
    );
    expect(errors.filter(e => e.severity === 'error').length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/direction/);
  });
});
