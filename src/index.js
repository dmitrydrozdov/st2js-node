'use strict';

/**
 * @fileoverview Public API facade for st2js.
 * Compiles IEC 61131-3 Structured Text to JavaScript.
 */

const Lexer = require('./lexer/Lexer');
const Parser = require('./parser/Parser');
const ASTBuilder = require('./parser/ASTBuilder');
const Validator = require('./parser/Validator');
const Codegen = require('./codegen/Codegen');

/**
 * Parse ST source code and return an AST with any parse errors.
 *
 * @param {string} source - Structured Text source code
 * @returns {{ ast: import('./types').ASTNode|null, errors: import('./types').STError[] }}
 */
function parse(source) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const lexErrors = lexer.errors;

  const parser = new Parser(tokens, source);
  const cst = parser.parse();
  const parseErrors = parser.errors;

  const allErrors = [...lexErrors, ...parseErrors];

  if (parseErrors.some(e => e.severity === 'error')) {
    return { ast: null, errors: allErrors };
  }

  const builder = new ASTBuilder(source);
  const ast = builder.build(cst);

  return { ast, errors: allErrors };
}

/**
 * Validate an ST AST and return semantic errors.
 *
 * @param {import('./types').ASTNode} ast
 * @returns {{ valid: boolean, errors: import('./types').STError[] }}
 */
function validate(ast) {
  const validator = new Validator();
  const errors = validator.validate(ast);
  const valid = !errors.some(e => e.severity === 'error');
  return { valid, errors };
}

/**
 * Compile ST source code to JavaScript.
 *
 * @param {string} source - Structured Text source code
 * @param {object} [options]
 * @param {boolean} [options.sourceMaps=true] - Include source map comments
 * @param {boolean} [options.strict=false] - Fail on warnings
 * @param {string} [options.filename='<input>'] - Source filename for error messages
 * @returns {{ code: string, sourceMap: object, warnings: string[], errors: import('./types').STError[] }}
 */
function compile(source, options = {}) {
  const { sourceMaps = true, strict = false, filename = '<input>' } = options;

  const { ast, errors: parseErrors } = parse(source);

  if (!ast || parseErrors.some(e => e.severity === 'error')) {
    return { code: '', sourceMap: null, warnings: [], errors: parseErrors };
  }

  const { errors: validateErrors } = validate(ast);
  const allErrors = [...parseErrors, ...validateErrors];

  if (strict && validateErrors.some(e => e.severity === 'error')) {
    return { code: '', sourceMap: null, warnings: [], errors: allErrors };
  }

  const codegen = new Codegen({ sourceMaps, filename, source });
  const { code, sourceMap, warnings } = codegen.generate(ast);

  return { code, sourceMap, warnings, errors: allErrors };
}

/**
 * Compile ST source and return only the generated JavaScript string.
 * Throws if there are parse/validation errors.
 *
 * @param {string} source
 * @param {object} [options]
 * @returns {string}
 */
function compileSync(source, options = {}) {
  const result = compile(source, options);
  if (result.errors.some(e => e.severity === 'error')) {
    const msgs = result.errors.filter(e => e.severity === 'error')
      .map(e => `  [${e.phase}] line ${e.line}:${e.column} - ${e.message}`)
      .join('\n');
    throw new Error(`ST compilation failed:\n${msgs}`);
  }
  return result.code;
}

/**
 * Parse an ST algorithm (bare statement list) into an AST.
 *
 * @param {string} source
 * @returns {{ ast: import('./types').ASTNode|null, errors: import('./types').STError[] }}
 */
function parseAlgorithm(source) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const lexErrors = lexer.errors;

  const parser = new Parser(tokens, source);
  const cst = parser.parseStatementList();
  const parseErrors = parser.errors;

  const allErrors = [...lexErrors, ...parseErrors];

  if (parseErrors.some(e => e.severity === 'error')) {
    return { ast: null, errors: allErrors };
  }

  const builder = new ASTBuilder(source);
  const ast = builder.build(cst);
  return { ast, errors: allErrors };
}

/**
 * Compile an ST algorithm (bare statement list) to a JavaScript body string
 * that reads and writes a host-supplied scope object passed as `__s`.
 *
 * @param {string} source
 * @param {import('./types').VariableDescriptor[]} variables
 * @param {object} [options]
 * @param {boolean} [options.strict=false] - Promote warnings to errors
 * @returns {import('./types').AlgorithmCompileResult}
 */
function compileAlgorithm(source, variables, options = {}) {
  const { strict = false } = options;
  const emptyResult = (errors, warnings = []) => ({
    code: '',
    inputNames: [],
    outputNames: [],
    internalNames: [],
    warnings,
    errors,
  });

  if (!Array.isArray(variables)) {
    return emptyResult([{
      phase: 'validator', severity: 'error',
      message: 'variables must be an array of VariableDescriptor',
      line: 1, column: 0,
    }]);
  }

  const { ast, errors: parseErrors } = parseAlgorithm(source);
  const fatal = parseErrors.some(e => e.severity === 'error');
  if (!ast || fatal) {
    return emptyResult(parseErrors);
  }

  const validator = new Validator();
  const validateErrors = validator.validateAlgorithm(ast, variables);

  const allErrors = [...parseErrors, ...validateErrors.filter(e => e.severity === 'error')];
  const allWarnings = validateErrors.filter(e => e.severity === 'warning');

  if (strict && allWarnings.length > 0) {
    // Promote warnings to errors
    for (const w of allWarnings) {
      allErrors.push({ ...w, severity: 'error' });
    }
  }

  if (allErrors.some(e => e.severity === 'error')) {
    return emptyResult(allErrors, allWarnings);
  }

  const codegen = new Codegen({ sourceMaps: false });
  const result = codegen.generateAlgorithm(ast, variables, options);

  return {
    code: result.code,
    inputNames: result.inputNames,
    outputNames: result.outputNames,
    internalNames: result.internalNames,
    warnings: [...allWarnings, ...(result.warnings || []).map(msg => ({
      phase: 'codegen', severity: 'warning', message: String(msg), line: 1, column: 0,
    }))],
    errors: allErrors,
  };
}

/**
 * Parse a single ST expression into an AST.
 * Rejects trailing tokens after the expression.
 *
 * @param {string} source
 * @returns {{ ast: import('./types').ASTNode|null, errors: import('./types').STError[] }}
 */
function parseExpression(source) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const lexErrors = lexer.errors;

  const parser = new Parser(tokens, source);
  let cst = null;
  try {
    cst = parser.parseExpression();
  } catch (e) {
    parser.errors.push({
      phase: 'parser', severity: 'error',
      message: e && e.message ? e.message : String(e),
      line: 1, column: 0,
    });
  }

  if (!parser.isEOF()) {
    const tok = parser.current();
    parser.errors.push({
      phase: 'parser', severity: 'error',
      message: `Unexpected token after expression: '${tok.value}'`,
      line: tok.line, column: tok.column,
    });
  }

  const allErrors = [...lexErrors, ...parser.errors];

  if (parser.errors.some(e => e.severity === 'error')) {
    return { ast: null, errors: allErrors };
  }

  const builder = new ASTBuilder(source);
  const ast = builder.build(cst);
  return { ast, errors: allErrors };
}

/**
 * Compile an ST expression to a bare JavaScript expression string that reads
 * descriptor variables from a host-supplied scope object as `__s["name"]`.
 *
 * @param {string} source
 * @param {import('./types').VariableDescriptor[]} variables
 * @param {object} [options]
 * @returns {import('./types').ExpressionCompileResult}
 */
function compileExpression(source, variables, options = {}) {
  const emptyResult = (errors, warnings = []) => ({
    code: '',
    inputNames: [],
    outputNames: [],
    internalNames: [],
    warnings,
    errors,
  });

  if (!Array.isArray(variables)) {
    return emptyResult([{
      phase: 'validator', severity: 'error',
      message: 'variables must be an array of VariableDescriptor',
      line: 1, column: 0,
    }]);
  }

  const { ast, errors: parseErrors } = parseExpression(source);
  const fatal = parseErrors.some(e => e.severity === 'error');
  if (!ast || fatal) {
    return emptyResult(parseErrors);
  }

  const validator = new Validator();
  const validateErrors = validator.validateExpression(ast, variables);

  const allErrors = [...parseErrors, ...validateErrors.filter(e => e.severity === 'error')];
  const allWarnings = validateErrors.filter(e => e.severity === 'warning');

  if (allErrors.some(e => e.severity === 'error')) {
    return emptyResult(allErrors, allWarnings);
  }

  const codegen = new Codegen({ sourceMaps: false });
  const result = codegen.generateExpression(ast, variables, options);

  return {
    code: result.code,
    inputNames: result.inputNames,
    outputNames: result.outputNames,
    internalNames: result.internalNames,
    warnings: [...allWarnings, ...(result.warnings || []).map(msg => ({
      phase: 'codegen', severity: 'warning', message: String(msg), line: 1, column: 0,
    }))],
    errors: allErrors,
  };
}

module.exports = {
  parse, validate, compile, compileSync,
  parseAlgorithm, compileAlgorithm,
  parseExpression, compileExpression,
};
