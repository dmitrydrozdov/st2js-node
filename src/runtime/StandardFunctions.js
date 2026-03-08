'use strict';

/**
 * @fileoverview IEC 61131-3 standard function implementations in JavaScript.
 */

// ─── Math Functions ──────────────────────────────────────────────────────────

const ABS = Math.abs;
const SQRT = Math.sqrt;
const LN = Math.log;
const LOG = Math.log10;
const EXP = Math.exp;
const SIN = Math.sin;
const COS = Math.cos;
const TAN = Math.tan;
const ASIN = Math.asin;
const ACOS = Math.acos;
const ATAN = Math.atan;
const ATAN2 = Math.atan2;
const EXPT = Math.pow;

// ─── Numeric Functions ───────────────────────────────────────────────────────

function MAX(a, b) { return a > b ? a : b; }
function MIN(a, b) { return a < b ? a : b; }
function LIMIT(mn, val, mx) { return val < mn ? mn : val > mx ? mx : val; }
function MOD_FUNC(a, b) { return a % b; }
function TRUNC(x) { return Math.trunc(x); }

// ─── Type Conversion Functions ───────────────────────────────────────────────

function INT_TO_REAL(v) { return v; }
function REAL_TO_INT(v) { return Math.trunc(v) | 0; }
function BOOL_TO_INT(v) { return v ? 1 : 0; }
function INT_TO_BOOL(v) { return v !== 0; }
function DINT_TO_REAL(v) { return v; }
function REAL_TO_DINT(v) { return Math.trunc(v) | 0; }
function INT_TO_DINT(v) { return v | 0; }
function DINT_TO_INT(v) { return (v << 16) >> 16; }
function BOOL_TO_REAL(v) { return v ? 1.0 : 0.0; }
function REAL_TO_BOOL(v) { return v !== 0.0; }
function INT_TO_STRING(v) { return String(v); }
function STRING_TO_INT(v) { return parseInt(v, 10) | 0; }
function REAL_TO_STRING(v) { return String(v); }
function STRING_TO_REAL(v) { return parseFloat(v); }
function BOOL_TO_STRING(v) { return v ? 'TRUE' : 'FALSE'; }

// ─── String Functions ────────────────────────────────────────────────────────

function LEN(s) { return s.length; }
function LEFT(s, l) { return s.substring(0, l); }
function RIGHT(s, l) { return s.substring(s.length - l); }
function MID(s, l, p) { return s.substring(p - 1, p - 1 + l); }
function CONCAT(a, b) { return a + b; }
function INSERT(s1, s2, p) {
  return s1.substring(0, p) + s2 + s1.substring(p);
}
function DELETE(s, l, p) {
  return s.substring(0, p - 1) + s.substring(p - 1 + l);
}
function REPLACE(s1, s2, l, p) {
  return s1.substring(0, p - 1) + s2 + s1.substring(p - 1 + l);
}
function FIND(s1, s2) {
  const idx = s1.indexOf(s2);
  return idx === -1 ? 0 : idx + 1; // ST uses 1-based indexing, 0 means not found
}

// ─── Bit Shift Functions ─────────────────────────────────────────────────────

function SHL(value, n) { return (value << n) | 0; }
function SHR(value, n) { return (value >>> n) | 0; }
function ROL(value, n, bits) {
  bits = bits || 32;
  n = n % bits;
  return ((value << n) | (value >>> (bits - n))) | 0;
}
function ROR(value, n, bits) {
  bits = bits || 32;
  n = n % bits;
  return ((value >>> n) | (value << (bits - n))) | 0;
}

// ─── Selection Functions ─────────────────────────────────────────────────────

function SEL(g, in0, in1) { return g ? in1 : in0; }
function MUX(k, ...values) { return values[k] !== undefined ? values[k] : values[0]; }

module.exports = {
  // Math
  ABS, SQRT, LN, LOG, EXP, SIN, COS, TAN, ASIN, ACOS, ATAN, ATAN2, EXPT,
  // Numeric
  MAX, MIN, LIMIT, MOD_FUNC, TRUNC,
  // Type conversions
  INT_TO_REAL, REAL_TO_INT, BOOL_TO_INT, INT_TO_BOOL,
  DINT_TO_REAL, REAL_TO_DINT, INT_TO_DINT, DINT_TO_INT,
  BOOL_TO_REAL, REAL_TO_BOOL,
  INT_TO_STRING, STRING_TO_INT, REAL_TO_STRING, STRING_TO_REAL,
  BOOL_TO_STRING,
  // String
  LEN, LEFT, RIGHT, MID, CONCAT, INSERT, DELETE, REPLACE, FIND,
  // Bit
  SHL, SHR, ROL, ROR,
  // Selection
  SEL, MUX,
};
