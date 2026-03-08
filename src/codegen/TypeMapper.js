'use strict';

/**
 * @fileoverview Maps IEC 61131-3 ST types to JavaScript equivalents.
 */

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

/**
 * Get the JavaScript default value for a given ST type.
 * @param {string} typeName - ST type name (e.g. 'INT', 'BOOL', 'REAL')
 * @returns {string} JavaScript literal string for the default value
 */
function getDefaultValue(typeName) {
  if (typeName === 'BOOL') return 'false';
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
 * Check if integer operations on this type should use |0 clamping.
 */
function needsIntegerClamp(typeName) {
  return isInteger(typeName) || isBit(typeName);
}

module.exports = {
  isInteger,
  isReal,
  isBit,
  isNumeric,
  isTime,
  isString,
  getDefaultValue,
  getJSType,
  needsIntegerClamp,
  INTEGER_TYPES,
  REAL_TYPES,
  BIT_TYPES,
  TIME_TYPES,
  STRING_TYPES,
};
