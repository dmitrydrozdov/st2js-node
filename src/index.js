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
 * Validate an ST AST and return semantic errors. Runs the static typing pass,
 * which annotates the tree in place (see `analyzeAlgorithm`).
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
 * @param {'number'|'bigint'} [options.int64='number'] - Representation of LINT/ULINT/LWORD values
 * @returns {{ code: string, sourceMap: object, warnings: string[], errors: import('./types').STError[] }}
 */
function compile(source, options = {}) {
  const { sourceMaps = true, strict = false, filename = '<input>' } = options;
  const int64 = checkInt64Option(options);

  const { ast, errors: parseErrors } = parse(source);

  if (!ast || parseErrors.some(e => e.severity === 'error')) {
    return { code: '', sourceMap: null, warnings: [], errors: parseErrors };
  }

  const { errors: validateErrors } = validate(ast);
  const allErrors = [...parseErrors, ...validateErrors];

  if (strict && validateErrors.some(e => e.severity === 'error')) {
    return { code: '', sourceMap: null, warnings: [], errors: allErrors };
  }

  const codegen = new Codegen({ sourceMaps, filename, source, int64 });
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
 * Run the static typing pass over an ST algorithm (bare statement list)
 * against a host-supplied variable descriptor list. Accepts either source
 * text or a tree returned by `parseAlgorithm`. The returned `ast` is the
 * parsed tree annotated in place with `resolvedType`, `resolvedSymbol`,
 * `constant`, and `conversion` (or `null` when parsing failed).
 *
 * Type violations are always errors; `options.strict` only promotes the
 * remaining warnings (e.g. undeclared identifiers) to errors.
 *
 * @param {string|import('./types').ASTNode} sourceOrAst
 * @param {import('./types').VariableDescriptor[]} variables
 * @param {object} [options]
 * @param {boolean} [options.strict=false]
 * @returns {{ ast: import('./types').ASTNode|null, errors: import('./types').STError[], warnings: import('./types').STError[] }}
 */
function analyzeAlgorithm(sourceOrAst, variables, options = {}) {
  return analyzeWith(parseAlgorithm, (validator, ast) => validator.validateAlgorithm(ast, variables),
    sourceOrAst, variables, options);
}

/**
 * Run the static typing pass over a single ST expression against a
 * host-supplied variable descriptor list. Accepts either source text or a
 * tree returned by `parseExpression`. See `analyzeAlgorithm`.
 *
 * @param {string|import('./types').ASTNode} sourceOrAst
 * @param {import('./types').VariableDescriptor[]} variables
 * @param {object} [options]
 * @param {boolean} [options.strict=false]
 * @returns {{ ast: import('./types').ASTNode|null, errors: import('./types').STError[], warnings: import('./types').STError[] }}
 */
function analyzeExpression(sourceOrAst, variables, options = {}) {
  return analyzeWith(parseExpression, (validator, ast) => validator.validateExpression(ast, variables),
    sourceOrAst, variables, options);
}

function analyzeWith(parseFn, validateFn, sourceOrAst, variables, options) {
  const { strict = false } = options || {};

  let ast = null;
  let parseErrors = [];
  if (typeof sourceOrAst === 'string') {
    ({ ast, errors: parseErrors } = parseFn(sourceOrAst));
  } else if (sourceOrAst && typeof sourceOrAst === 'object') {
    ast = sourceOrAst;
  } else {
    return {
      ast: null,
      errors: [{ phase: 'parser', severity: 'error', message: 'Expected ST source text or a parsed AST', line: 1, column: 0 }],
      warnings: [],
    };
  }

  const fatal = parseErrors.some(e => e.severity === 'error');
  if (!ast || fatal) {
    return { ast: null, errors: parseErrors, warnings: [] };
  }

  if (!Array.isArray(variables)) {
    return {
      ast,
      errors: [{
        phase: 'validator', severity: 'error',
        message: 'variables must be an array of VariableDescriptor',
        line: 1, column: 0,
      }],
      warnings: [],
    };
  }

  const validator = new Validator();
  const diagnostics = validateFn(validator, ast);

  const errors = [...parseErrors, ...diagnostics.filter(e => e.severity === 'error')];
  const warnings = diagnostics.filter(e => e.severity === 'warning');

  if (strict && warnings.length > 0) {
    // Promote warnings to errors
    for (const w of warnings) {
      errors.push({ ...w, severity: 'error' });
    }
  }

  return { ast, errors, warnings };
}

/** Validate the `int64` code generation option. */
function checkInt64Option(options) {
  const { int64 = 'number' } = options || {};
  if (int64 !== 'number' && int64 !== 'bigint') {
    throw new TypeError(`Invalid int64 option '${int64}': expected 'number' or 'bigint'`);
  }
  return int64;
}

/**
 * Compile an ST algorithm (bare statement list) to a JavaScript body string
 * that reads and writes a host-supplied scope object passed as `__s`.
 *
 * Each `VariableDescriptor` may declare an optional `members` array. When
 * present, the descriptor is *composite*: dotted access in ST (`P.REQ`)
 * resolves the member, codegen emits `__s["<accessKey>"]`
 * (defaulting to `"<parent>.<member>"`), and the parent's own `name` is
 * omitted from the result direction buckets in favour of each member's
 * effective access key bucketed by the member's `direction`.
 *
 * The static typing pass (`analyzeAlgorithm`) runs first; any type violation
 * is an error and yields empty `code`.
 *
 * @param {string} source
 * @param {import('./types').VariableDescriptor[]} variables
 * @param {object} [options]
 * @param {boolean} [options.strict=false] - Promote warnings to errors
 * @param {'number'|'bigint'} [options.int64='number'] - Representation of LINT/ULINT/LWORD values
 * @returns {import('./types').AlgorithmCompileResult}
 */
function compileAlgorithm(source, variables, options = {}) {
  const int64 = checkInt64Option(options);
  const emptyResult = (errors, warnings = []) => ({
    code: '',
    inputNames: [],
    outputNames: [],
    internalNames: [],
    warnings,
    errors,
  });

  const { errors: allErrors, warnings: allWarnings, ast } = analyzeAlgorithm(source, variables, options);

  if (!ast || allErrors.some(e => e.severity === 'error')) {
    return emptyResult(allErrors, allWarnings);
  }

  const codegen = new Codegen({ sourceMaps: false, int64 });
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
 * Each `VariableDescriptor` may declare an optional `members` array. When
 * present, dotted access in ST (`P.REQ`) resolves the member and codegen
 * emits `__s["<accessKey>"]` (defaulting to `"<parent>.<member>"`). A bare
 * reference to a composite descriptor (without `.<member>`) is a
 * validator-phase error.
 *
 * The static typing pass (`analyzeExpression`) runs first; any type
 * violation is an error and yields empty `code`.
 *
 * @param {string} source
 * @param {import('./types').VariableDescriptor[]} variables
 * @param {object} [options]
 * @param {boolean} [options.strict=false] - Promote warnings to errors
 * @param {'number'|'bigint'} [options.int64='number'] - Representation of LINT/ULINT/LWORD values
 * @returns {import('./types').ExpressionCompileResult}
 */
function compileExpression(source, variables, options = {}) {
  const int64 = checkInt64Option(options);
  const emptyResult = (errors, warnings = []) => ({
    code: '',
    inputNames: [],
    outputNames: [],
    internalNames: [],
    warnings,
    errors,
  });

  const { errors: allErrors, warnings: allWarnings, ast } = analyzeExpression(source, variables, options);

  if (!ast || allErrors.some(e => e.severity === 'error')) {
    return emptyResult(allErrors, allWarnings);
  }

  const codegen = new Codegen({ sourceMaps: false, int64 });
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
  parseAlgorithm, compileAlgorithm, analyzeAlgorithm,
  parseExpression, compileExpression, analyzeExpression,
};
