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

module.exports = { parse, validate, compile, compileSync };
