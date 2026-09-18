'use strict';

/**
 * @fileoverview Maps IEC 61131-3 ST types to JavaScript equivalents: default
 * values, JS type names, and the width-correct integer wrapping forms used by
 * the code generator. The type classification itself comes from the shared
 * type model in src/analysis/types.js.
 */

const Types = require('../analysis/types');

const INTEGER_TYPES = new Set([
  'SINT', 'INT', 'DINT', 'LINT',
  'USINT', 'UINT', 'UDINT', 'ULINT',
]);

const REAL_TYPES = new Set(['REAL', 'LREAL']);

const BIT_TYPES = new Set(['BYTE', 'WORD', 'DWORD', 'LWORD']);

const TIME_TYPES = new Set(['TIME', 'DATE', 'DATE_AND_TIME', 'TIME_OF_DAY', 'DT', 'TOD']);

const STRING_TYPES = new Set(['STRING', 'WSTRING']);

const defaultValues = {
  BOOL: false,
  SINT: 0, INT: 0, DINT: 0, LINT: 0,
  USINT: 0, UINT: 0, UDINT: 0, ULINT: 0,
  REAL: 0.0, LREAL: 0.0,
  BYTE: 0, WORD: 0, DWORD: 0, LWORD: 0,
  STRING: "''", WSTRING: "''",
  TIME: 0, DATE: 0, DATE_AND_TIME: 0, TIME_OF_DAY: 0,
  DT: 0, TOD: 0,
};

/**
 * Determine if a type name represents an integer type.
 */
function isInteger(typeName) {
  return INTEGER_TYPES.has(typeName);
}

/**
 * Determine if a type name represents a real (float) type.
 */
function isReal(typeName) {
  return REAL_TYPES.has(typeName);
}

/**
 * Determine if a type name represents a bit type.
 */
function isBit(typeName) {
  return BIT_TYPES.has(typeName);
}

/**
 * Determine if a type name represents a numeric type (integer, real, or bit).
 */
function isNumeric(typeName) {
  return isInteger(typeName) || isReal(typeName) || isBit(typeName);
}

/**
 * Determine if a type name represents a time-related type.
 */
function isTime(typeName) {
  return TIME_TYPES.has(typeName);
}

/**
 * Determine if a type name represents a string type.
 */
function isString(typeName) {
  return STRING_TYPES.has(typeName);
}

/** Whether a type is a 64-bit integer or bit-string type (LINT, ULINT, LWORD). */
function is64Bit(typeName) {
  return Types.is64Bit(typeName);
}

/**
 * Get the JavaScript default value for a given ST type.
 * @param {string} typeName - ST type name (e.g. 'INT', 'BOOL', 'REAL')
 * @param {'number'|'bigint'} [int64='number'] - representation of 64-bit integer types
 * @returns {string} JavaScript literal string for the default value
 */
function getDefaultValue(typeName, int64 = 'number') {
  if (typeName === 'BOOL') return 'false';
  if (int64 === 'bigint' && is64Bit(typeName)) return '0n';
  if (defaultValues[typeName] !== undefined) return String(defaultValues[typeName]);
  // Unknown / user-defined type: default to null
  return 'null';
}

/**
 * Get the JavaScript type description for a given ST type.
 * @param {string} typeName
 * @returns {string}
 */
function getJSType(typeName) {
  if (typeName === 'BOOL') return 'boolean';
  if (isInteger(typeName) || isReal(typeName) || isBit(typeName) || isTime(typeName)) return 'number';
  if (isString(typeName)) return 'string';
  if (typeName === 'ARRAY') return 'Array';
  if (typeName === 'STRUCT') return 'Object';
  return typeName; // user-defined type
}

/**
 * Check if integer operations on this type should be wrapped at the type's width.
 */
function needsIntegerClamp(typeName) {
  return isInteger(typeName) || isBit(typeName);
}

/**
 * Whether `expr` is enclosed in one matching pair of outer parentheses.
 * Conservative: may answer false for a parenthesized expression containing
 * string literals with unbalanced parentheses, never true for an
 * unparenthesized one.
 */
function isParenthesized(expr) {
  if (expr.length < 2 || expr[0] !== '(' || expr[expr.length - 1] !== ')') return false;
  let depth = 0;
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === '(') depth++;
    else if (expr[i] === ')') depth--;
    if (depth === 0 && i < expr.length - 1) return false;
  }
  return depth === 0;
}

/** `expr` wrapped in parentheses unless it already is. */
function parenthesize(expr) {
  return isParenthesized(expr) ? expr : `(${expr})`;
}

/** `expr` with one redundant outer pair of parentheses removed. */
function unparenthesize(expr) {
  return isParenthesized(expr) ? expr.slice(1, -1) : expr;
}

/**
 * Wrap a JavaScript expression so that its value is reduced to the declared
 * width and signedness of an integer or bit-string type:
 *
 *   SINT  ((x) << 24) >> 24     USINT/BYTE  (x) & 0xFF
 *   INT   ((x) << 16) >> 16     UINT/WORD   (x) & 0xFFFF
 *   DINT  (x) | 0               UDINT/DWORD (x) >>> 0
 *   LINT/ULINT/LWORD  Math.trunc(x) in number mode (no width wrap);
 *                     BigInt.asIntN(64, x) / BigInt.asUintN(64, x) in bigint mode
 *
 * Non-integer types are returned unchanged.
 * @param {string} expr
 * @param {string} typeName
 * @param {'number'|'bigint'} [int64='number']
 * @returns {string}
 */
function wrapInteger(expr, typeName, int64 = 'number') {
  const p = parenthesize(expr);
  const bare = unparenthesize(expr);
  switch (typeName) {
    case 'SINT': return `(${p} << 24) >> 24`;
    case 'USINT': case 'BYTE': return `${p} & 0xFF`;
    case 'INT': return `(${p} << 16) >> 16`;
    case 'UINT': case 'WORD': return `${p} & 0xFFFF`;
    case 'DINT': return `${p} | 0`;
    case 'UDINT': case 'DWORD': return `${p} >>> 0`;
    case 'LINT':
      return int64 === 'bigint' ? `BigInt.asIntN(64, ${bare})` : `Math.trunc(${bare})`;
    case 'ULINT': case 'LWORD':
      return int64 === 'bigint' ? `BigInt.asUintN(64, ${bare})` : `Math.trunc(${bare})`;
    default:
      return expr;
  }
}

/**
 * Bitwise complement of a bit-string value, masked to the type's width.
 * @param {string} expr
 * @param {string} typeName
 * @param {'number'|'bigint'} [int64='number']
 */
function bitwiseNot(expr, typeName, int64 = 'number') {
  const bare = unparenthesize(expr);
  switch (typeName) {
    case 'BYTE': return `(~(${bare})) & 0xFF`;
    case 'WORD': return `(~(${bare})) & 0xFFFF`;
    case 'DWORD': return `(~(${bare})) >>> 0`;
    case 'LWORD': return int64 === 'bigint' ? `BigInt.asUintN(64, ~(${bare}))` : `(~(${bare}))`;
    default: return `(~(${bare}))`;
  }
}

/**
 * JavaScript literal for an exact integer value of the given type.
 * @param {bigint} value
 * @param {string} typeName
 * @param {'number'|'bigint'} [int64='number']
 * @returns {string}
 */
function integerLiteral(value, typeName, int64 = 'number') {
  if (int64 === 'bigint' && is64Bit(typeName)) return `${value}n`;
  return String(Number(value));
}

module.exports = {
  isInteger,
  isReal,
  isBit,
  isNumeric,
  isTime,
  isString,
  is64Bit,
  getDefaultValue,
  getJSType,
  needsIntegerClamp,
  wrapInteger,
  bitwiseNot,
  integerLiteral,
  parenthesize,
  unparenthesize,
  INTEGER_TYPES,
  REAL_TYPES,
  BIT_TYPES,
  TIME_TYPES,
  STRING_TYPES,
};
