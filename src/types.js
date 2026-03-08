'use strict';

/**
 * @fileoverview Shared type definitions and AST node schemas for st2js.
 * All AST nodes follow the pattern: { type: string, loc: Location, ...fields }
 */

// ─── Token Types ──────────────────────────────────────────────────────────────

const TokenType = {
  // Literals
  INTEGER_LITERAL: 'INTEGER_LITERAL',
  REAL_LITERAL: 'REAL_LITERAL',
  BOOL_LITERAL: 'BOOL_LITERAL',
  STRING_LITERAL: 'STRING_LITERAL',
  TIME_LITERAL: 'TIME_LITERAL',
  DATE_LITERAL: 'DATE_LITERAL',

  // Identifiers
  IDENTIFIER: 'IDENTIFIER',

  // Keywords - Program Organization Units
  FUNCTION: 'FUNCTION',
  END_FUNCTION: 'END_FUNCTION',
  FUNCTION_BLOCK: 'FUNCTION_BLOCK',
  END_FUNCTION_BLOCK: 'END_FUNCTION_BLOCK',
  PROGRAM: 'PROGRAM',
  END_PROGRAM: 'END_PROGRAM',

  // Keywords - Variable Declarations
  VAR: 'VAR',
  VAR_INPUT: 'VAR_INPUT',
  VAR_OUTPUT: 'VAR_OUTPUT',
  VAR_IN_OUT: 'VAR_IN_OUT',
  VAR_GLOBAL: 'VAR_GLOBAL',
  VAR_TEMP: 'VAR_TEMP',
  VAR_EXTERNAL: 'VAR_EXTERNAL',
  END_VAR: 'END_VAR',
  CONSTANT: 'CONSTANT',
  RETAIN: 'RETAIN',
  PERSISTENT: 'PERSISTENT',
  AT: 'AT',

  // Keywords - Data Types
  TYPE: 'TYPE',
  END_TYPE: 'END_TYPE',
  STRUCT: 'STRUCT',
  END_STRUCT: 'END_STRUCT',
  ARRAY: 'ARRAY',
  OF: 'OF',
  STRING_TYPE: 'STRING_TYPE',
  WSTRING_TYPE: 'WSTRING_TYPE',

  // Primitive Types
  BOOL: 'BOOL',
  BYTE: 'BYTE',
  WORD: 'WORD',
  DWORD: 'DWORD',
  LWORD: 'LWORD',
  SINT: 'SINT',
  INT: 'INT',
  DINT: 'DINT',
  LINT: 'LINT',
  USINT: 'USINT',
  UINT: 'UINT',
  UDINT: 'UDINT',
  ULINT: 'ULINT',
  REAL: 'REAL',
  LREAL: 'LREAL',
  TIME: 'TIME',
  DATE: 'DATE',
  TIME_OF_DAY: 'TIME_OF_DAY',
  DATE_AND_TIME: 'DATE_AND_TIME',
  ANY: 'ANY',
  ANY_NUM: 'ANY_NUM',
  ANY_INT: 'ANY_INT',
  ANY_REAL: 'ANY_REAL',
  ANY_BIT: 'ANY_BIT',
  ANY_STRING: 'ANY_STRING',
  ANY_DATE: 'ANY_DATE',

  // Keywords - Control Flow
  IF: 'IF',
  THEN: 'THEN',
  ELSIF: 'ELSIF',
  ELSE: 'ELSE',
  END_IF: 'END_IF',
  CASE: 'CASE',
  END_CASE: 'END_CASE',
  FOR: 'FOR',
  TO: 'TO',
  BY: 'BY',
  DO: 'DO',
  END_FOR: 'END_FOR',
  WHILE: 'WHILE',
  END_WHILE: 'END_WHILE',
  REPEAT: 'REPEAT',
  UNTIL: 'UNTIL',
  END_REPEAT: 'END_REPEAT',
  RETURN: 'RETURN',
  EXIT: 'EXIT',
  CONTINUE: 'CONTINUE',

  // Operators
  ASSIGN: 'ASSIGN',         // :=
  PLUS: 'PLUS',             // +
  MINUS: 'MINUS',           // -
  STAR: 'STAR',             // *
  SLASH: 'SLASH',           // /
  MOD: 'MOD',               // MOD
  POWER: 'POWER',           // **
  EQ: 'EQ',                 // =
  NE: 'NE',                 // <>
  LT: 'LT',                 // <
  LE: 'LE',                 // <=
  GT: 'GT',                 // >
  GE: 'GE',                 // >=
  AND: 'AND',               // AND / &
  OR: 'OR',                 // OR
  XOR: 'XOR',               // XOR
  NOT: 'NOT',               // NOT
  AMP: 'AMP',               // &

  // Punctuation
  LPAREN: 'LPAREN',         // (
  RPAREN: 'RPAREN',         // )
  LBRACKET: 'LBRACKET',     // [
  RBRACKET: 'RBRACKET',     // ]
  COMMA: 'COMMA',           // ,
  SEMICOLON: 'SEMICOLON',   // ;
  COLON: 'COLON',           // :
  DOT: 'DOT',               // .
  RANGE: 'RANGE',           // ..
  HASH: 'HASH',             // #

  // Special
  EOF: 'EOF',
  NEWLINE: 'NEWLINE',
};

// ─── AST Node Types ───────────────────────────────────────────────────────────

const NodeType = {
  // Top-level
  PROGRAM_FILE: 'ProgramFile',
  FUNCTION_DECLARATION: 'FunctionDeclaration',
  FUNCTION_BLOCK_DECLARATION: 'FunctionBlockDeclaration',
  PROGRAM_DECLARATION: 'ProgramDeclaration',
  TYPE_DECLARATION: 'TypeDeclaration',

  // Variable sections
  VAR_SECTION: 'VarSection',
  VAR_DECLARATION: 'VarDeclaration',

  // Types
  PRIMITIVE_TYPE: 'PrimitiveType',
  ARRAY_TYPE: 'ArrayType',
  STRUCT_TYPE: 'StructType',
  ENUM_TYPE: 'EnumType',
  USER_DEFINED_TYPE: 'UserDefinedType',
  STRING_TYPE: 'StringType',
  SUBRANGE_TYPE: 'SubrangeType',

  // Statements
  ASSIGNMENT: 'Assignment',
  IF_STATEMENT: 'IfStatement',
  ELSIF_CLAUSE: 'ElsifClause',
  ELSE_CLAUSE: 'ElseClause',
  CASE_STATEMENT: 'CaseStatement',
  CASE_CLAUSE: 'CaseClause',
  FOR_STATEMENT: 'ForStatement',
  WHILE_STATEMENT: 'WhileStatement',
  REPEAT_STATEMENT: 'RepeatStatement',
  RETURN_STATEMENT: 'ReturnStatement',
  EXIT_STATEMENT: 'ExitStatement',
  CONTINUE_STATEMENT: 'ContinueStatement',
  FUNCTION_CALL_STATEMENT: 'FunctionCallStatement',
  EMPTY_STATEMENT: 'EmptyStatement',

  // Expressions
  BINARY_EXPR: 'BinaryExpr',
  UNARY_EXPR: 'UnaryExpr',
  MEMBER_ACCESS: 'MemberAccess',
  ARRAY_ACCESS: 'ArrayAccess',
  FUNCTION_CALL: 'FunctionCall',
  IDENTIFIER_REF: 'IdentifierRef',
  INTEGER_LITERAL: 'IntegerLiteral',
  REAL_LITERAL: 'RealLiteral',
  BOOL_LITERAL: 'BoolLiteral',
  STRING_LITERAL: 'StringLiteral',
  TIME_LITERAL: 'TimeLiteral',
  DATE_LITERAL: 'DateLiteral',
  TYPED_LITERAL: 'TypedLiteral',

  // Misc
  NAMED_ARGUMENT: 'NamedArgument',
  STRUCT_INIT: 'StructInit',
  ARRAY_INIT: 'ArrayInit',
};

// ─── Variable Section Kinds ───────────────────────────────────────────────────

const VarKind = {
  LOCAL: 'VAR',
  INPUT: 'VAR_INPUT',
  OUTPUT: 'VAR_OUTPUT',
  IN_OUT: 'VAR_IN_OUT',
  GLOBAL: 'VAR_GLOBAL',
  TEMP: 'VAR_TEMP',
  EXTERNAL: 'VAR_EXTERNAL',
};

// ─── Error Object ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} STError
 * @property {'lexer'|'parser'|'validator'} phase - Where the error occurred
 * @property {'error'|'warning'} severity
 * @property {string} message
 * @property {number} line - 1-based line number
 * @property {number} column - 0-based column number
 * @property {string} [code] - Optional error code
 */

/**
 * Create a structured error object.
 * @param {string} phase
 * @param {string} message
 * @param {number} line
 * @param {number} column
 * @param {string} [severity='error']
 * @param {string} [code]
 * @returns {STError}
 */
function makeError(phase, message, line, column, severity = 'error', code = undefined) {
  return { phase, severity, message, line, column, code };
}

// ─── Source Location ──────────────────────────────────────────────────────────

/**
 * @typedef {Object} Location
 * @property {number} start - Offset in source string
 * @property {number} end - Offset in source string
 * @property {number} line - 1-based
 * @property {number} column - 0-based
 * @property {number} endLine - 1-based
 * @property {number} endColumn - 0-based
 */

/**
 * @typedef {Object} Token
 * @property {string} type - TokenType value
 * @property {string} value - Raw text
 * @property {number} line - 1-based
 * @property {number} column - 0-based
 * @property {number} start - Byte offset
 * @property {number} end - Byte offset
 */

/**
 * @typedef {Object} ASTNode
 * @property {string} type - NodeType value
 * @property {Location} loc
 */

/**
 * @typedef {Object} CompileResult
 * @property {string} code - Generated JavaScript source
 * @property {object} sourceMap - Source map object
 * @property {string[]} warnings - Non-fatal warnings
 */

/**
 * @typedef {Object} ParseResult
 * @property {ASTNode|null} ast - Root AST node, null if fatal errors
 * @property {STError[]} errors - All errors encountered
 */

/**
 * @typedef {Object} ValidateResult
 * @property {boolean} valid
 * @property {STError[]} errors
 */

module.exports = {
  TokenType,
  NodeType,
  VarKind,
  makeError,
};
