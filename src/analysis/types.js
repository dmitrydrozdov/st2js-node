'use strict';

/**
 * @fileoverview The IEC 61131-3 elementary type model shared by the static
 * typing pass, the validator, and the code generator:
 *
 *  - the elementary type table (width, signedness, value range, class);
 *  - the generic classes ANY_INT, ANY_REAL, ANY_BIT, ANY_NUM, ANY_STRING,
 *    ANY_DATE and the predicates that test membership;
 *  - the implicit-conversion rules (only conversions that cannot lose
 *    information are implicit);
 *  - the result-type rules for every operator;
 *  - the standard-function signature table.
 *
 * A *resolved type* is either an elementary type name (`'DINT'`), a user
 * type name (`'Colour'`), or an array descriptor
 * `{ kind: 'array', element, size?, lo? }`. `null` means "unknown"
 * (an unresolved identifier); no rule reports a diagnostic for `null`.
 */

// ─── Elementary type table ───────────────────────────────────────────────────

/** @typedef {'BOOL'|'INT'|'BIT'|'REAL'|'STRING'|'TIME'|'DATE'} TypeClass */

const ELEMENTARY = Object.freeze({
  BOOL:  { class: 'BOOL', width: 1 },

  SINT:  { class: 'INT', width: 8,  signed: true,  min: -128n, max: 127n },
  INT:   { class: 'INT', width: 16, signed: true,  min: -32768n, max: 32767n },
  DINT:  { class: 'INT', width: 32, signed: true,  min: -2147483648n, max: 2147483647n },
  LINT:  { class: 'INT', width: 64, signed: true,  min: -9223372036854775808n, max: 9223372036854775807n },
  USINT: { class: 'INT', width: 8,  signed: false, min: 0n, max: 255n },
  UINT:  { class: 'INT', width: 16, signed: false, min: 0n, max: 65535n },
  UDINT: { class: 'INT', width: 32, signed: false, min: 0n, max: 4294967295n },
  ULINT: { class: 'INT', width: 64, signed: false, min: 0n, max: 18446744073709551615n },

  BYTE:  { class: 'BIT', width: 8,  signed: false, min: 0n, max: 255n },
  WORD:  { class: 'BIT', width: 16, signed: false, min: 0n, max: 65535n },
  DWORD: { class: 'BIT', width: 32, signed: false, min: 0n, max: 4294967295n },
  LWORD: { class: 'BIT', width: 64, signed: false, min: 0n, max: 18446744073709551615n },

  REAL:  { class: 'REAL', width: 32, mantissa: 24 },
  LREAL: { class: 'REAL', width: 64, mantissa: 53 },

  STRING:  { class: 'STRING', wide: false },
  WSTRING: { class: 'STRING', wide: true },

  TIME: { class: 'TIME' },

  DATE:          { class: 'DATE' },
  TIME_OF_DAY:   { class: 'DATE' },
  DATE_AND_TIME: { class: 'DATE' },
});

const ALIASES = Object.freeze({ TOD: 'TIME_OF_DAY', DT: 'DATE_AND_TIME' });

const ELEMENTARY_NAMES = Object.freeze(Object.keys(ELEMENTARY));

/**
 * Canonical elementary type name for `name` (case-insensitive, aliases
 * resolved), or null when `name` is not an elementary type.
 * @param {string} name
 * @returns {string|null}
 */
function canonicalTypeName(name) {
  if (typeof name !== 'string') return null;
  const upper = name.toUpperCase();
  if (ELEMENTARY[upper]) return upper;
  if (ALIASES[upper]) return ALIASES[upper];
  return null;
}

function isElementary(t) { return typeof t === 'string' && ELEMENTARY[t] !== undefined; }
function typeClass(t) { return isElementary(t) ? ELEMENTARY[t].class : null; }

/** Human-readable name of a resolved type for diagnostics. */
function formatType(t) {
  if (t === null || t === undefined) return 'unknown';
  if (typeof t === 'string') return t;
  if (t.kind === 'array') {
    const lo = t.lo === undefined ? 0 : t.lo;
    const range = t.size === undefined ? '' : `[${lo}..${lo + t.size - 1}]`;
    return `ARRAY${range} OF ${formatType(t.element)}`;
  }
  return String(t);
}

// ─── Generic classes ─────────────────────────────────────────────────────────

function isAnyInt(t) { return typeClass(t) === 'INT'; }
function isAnyReal(t) { return typeClass(t) === 'REAL'; }
/** BOOL and the bit-string types. */
function isAnyBit(t) { return typeClass(t) === 'BIT' || t === 'BOOL'; }
/** BYTE, WORD, DWORD, LWORD (excludes BOOL). */
function isBitString(t) { return typeClass(t) === 'BIT'; }
function isAnyNum(t) { return isAnyInt(t) || isAnyReal(t); }
function isAnyString(t) { return typeClass(t) === 'STRING'; }
function isAnyDate(t) { return typeClass(t) === 'DATE'; }
/** Integer-valued types: ANY_INT plus the bit strings (treated as unsigned). */
function isIntegerLike(t) { return isAnyInt(t) || isBitString(t); }
/** Types that take part in arithmetic. */
function isNumericLike(t) { return isAnyNum(t) || isBitString(t); }
function isArrayType(t) { return t !== null && typeof t === 'object' && t.kind === 'array'; }

/** Width/signedness/range information for an integer-like type. */
function integerInfo(t) {
  if (!isIntegerLike(t)) return null;
  const e = ELEMENTARY[t];
  return { width: e.width, signed: e.signed, min: e.min, max: e.max };
}

function is64Bit(t) { return isIntegerLike(t) && ELEMENTARY[t].width === 64; }

/**
 * Whether the exact integer `value` (bigint) is representable in `t`.
 * @param {bigint} value
 * @param {string} t
 */
function fitsInType(value, t) {
  const info = integerInfo(t);
  if (!info) return false;
  return value >= info.min && value <= info.max;
}

/** Smallest signed type of the default chain (DINT, LINT, ULINT) that holds `value`. */
function defaultIntegerTypeFor(value) {
  for (const t of ['DINT', 'LINT', 'ULINT']) {
    if (fitsInType(value, t)) return t;
  }
  return null;
}

// ─── Implicit conversions ────────────────────────────────────────────────────

/**
 * Whether a value of type `from` may be used where `to` is required without
 * an explicit conversion. Only conversions that cannot lose information are
 * implicit:
 *
 *  - integer → wider (or equal) integer of the same signedness;
 *  - unsigned integer → strictly wider signed integer;
 *  - bit string → wider (or equal) bit string, BOOL → any bit string;
 *  - bit string ↔ unsigned integer of the same or wider width, and bit string
 *    → strictly wider signed integer (bit strings behave as unsigned values);
 *  - REAL → LREAL;
 *  - integer → a real type that represents every value of it
 *    (8/16-bit → REAL or LREAL, 32-bit → LREAL);
 *  - STRING → WSTRING.
 *
 * Identical types are trivially convertible. Unknown (null), user, and array
 * types are never implicitly convertible.
 * @param {*} from
 * @param {*} to
 * @returns {boolean}
 */
function isImplicitlyConvertible(from, to) {
  if (from === null || to === null || from === undefined || to === undefined) return false;
  if (typeof from !== 'string' || typeof to !== 'string') return sameType(from, to);
  if (from === to) return true;
  if (!isElementary(from) || !isElementary(to)) return from.toUpperCase() === to.toUpperCase();

  const fc = typeClass(from);
  const tc = typeClass(to);
  const f = ELEMENTARY[from];
  const t = ELEMENTARY[to];

  if (fc === 'INT' && tc === 'INT') {
    if (f.signed === t.signed) return t.width >= f.width;
    return !f.signed && t.signed && t.width > f.width;
  }
  if (fc === 'BIT' && tc === 'BIT') return t.width >= f.width;
  if (from === 'BOOL' && tc === 'BIT') return true;
  if (fc === 'BIT' && tc === 'INT') {
    return t.signed ? t.width > f.width : t.width >= f.width;
  }
  if (fc === 'INT' && tc === 'BIT') {
    return !f.signed && t.width >= f.width;
  }
  if (fc === 'REAL' && tc === 'REAL') return t.width >= f.width;
  if (fc === 'INT' && tc === 'REAL') {
    return f.width < t.mantissa;
  }
  if (fc === 'STRING' && tc === 'STRING') return t.wide || !f.wide;
  return false;
}

/** Structural equality of resolved types (case-insensitive for user type names). */
function sameType(a, b) {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a === 'string' && typeof b === 'string') return a.toUpperCase() === b.toUpperCase();
  if (isArrayType(a) && isArrayType(b)) {
    return sameType(a.element, b.element) && a.size === b.size && (a.lo || 0) === (b.lo || 0);
  }
  return false;
}

/**
 * The common type two operands are brought to, or null when neither converts
 * implicitly to the other.
 */
function commonType(a, b) {
  if (sameType(a, b)) return a;
  if (isImplicitlyConvertible(a, b)) return b;
  if (isImplicitlyConvertible(b, a)) return a;
  return null;
}

/** Whether an implicit conversion `from` → `to` is a real change of representation. */
function needsConversion(from, to) {
  return !sameType(from, to);
}

// ─── Operator result rules ───────────────────────────────────────────────────

const ARITHMETIC_OPS = new Set(['+', '-', '*', '/', 'MOD', '**']);
const COMPARISON_OPS = new Set(['=', '<>', '<', '<=', '>', '>=']);
const LOGICAL_OPS = new Set(['AND', 'OR', 'XOR']);

/**
 * Result of a binary operator on operand types `lt` and `rt`.
 *
 * @param {string} op
 * @param {*} lt - resolved type of the left operand
 * @param {*} rt - resolved type of the right operand
 * @returns {{ type: *, left: string|null, right: string|null, error: string|null }}
 *   `left`/`right` name the type an operand is implicitly converted to (null
 *   when unchanged); `error` is a diagnostic message when the operation is
 *   not allowed (and `type` is then null).
 */
function binaryResultType(op, lt, rt) {
  const ok = (type, left = null, right = null) => ({ type, left, right, error: null });
  const fail = (error) => ({ type: null, left: null, right: null, error });
  const L = formatType(lt);
  const R = formatType(rt);

  if (ARITHMETIC_OPS.has(op)) {
    if (!isNumericLike(lt) || !isNumericLike(rt)) {
      return fail(`Operator '${op}' requires numeric operands, got ${L} and ${R}`);
    }
    if (op === 'MOD') {
      if (!isIntegerLike(lt) || !isIntegerLike(rt)) {
        return fail(`Operator 'MOD' requires integer operands, got ${L} and ${R}`);
      }
      return integerJoin(op, lt, rt);
    }
    if (op === '**') {
      if (isAnyReal(lt)) {
        // Base type wins; exponent may be any numeric type.
        return ok(lt);
      }
      if (isAnyReal(rt)) {
        return fail(`Operator '**' with an integer base requires an integer exponent, got ${L} and ${R}; convert the base to a real type`);
      }
      return integerJoin(op, lt, rt);
    }
    if (isAnyReal(lt) || isAnyReal(rt)) {
      return realJoin(op, lt, rt);
    }
    return integerJoin(op, lt, rt);
  }

  if (COMPARISON_OPS.has(op)) {
    if (lt === null || rt === null) return ok('BOOL');
    const common = commonType(lt, rt);
    if (common === null || isArrayType(common)) {
      return fail(`Cannot compare ${L} with ${R}: incompatible types`);
    }
    return ok('BOOL', sameType(lt, common) ? null : common, sameType(rt, common) ? null : common);
  }

  if (LOGICAL_OPS.has(op)) {
    if (lt === 'BOOL' && rt === 'BOOL') return ok('BOOL');
    if (isBitString(lt) && isBitString(rt)) {
      const common = commonType(lt, rt);
      return ok(common, sameType(lt, common) ? null : common, sameType(rt, common) ? null : common);
    }
    return fail(`Operator '${op}' requires BOOL or bit-string operands of the same kind, got ${L} and ${R}`);
  }

  return fail(`Unknown operator '${op}'`);
}

/** Integer/bit-string arithmetic: same signedness required, result is the wider type. */
function integerJoin(op, lt, rt) {
  const li = integerInfo(lt);
  const ri = integerInfo(rt);
  const L = formatType(lt);
  const R = formatType(rt);
  if (li.signed !== ri.signed) {
    return {
      type: null, left: null, right: null,
      error: `Operator '${op}' mixes signed and unsigned integers (${L} and ${R}); convert one operand explicitly`,
    };
  }
  const common = commonType(lt, rt);
  if (common === null) {
    return { type: null, left: null, right: null, error: `Operator '${op}' cannot combine ${L} and ${R}` };
  }
  return {
    type: common,
    left: sameType(lt, common) ? null : common,
    right: sameType(rt, common) ? null : common,
    error: null,
  };
}

/** Arithmetic with at least one real operand: the integer operand must convert exactly. */
function realJoin(op, lt, rt) {
  const L = formatType(lt);
  const R = formatType(rt);
  let common = commonType(lt, rt);
  if (common === null && isImplicitlyConvertible(lt, 'LREAL') && isImplicitlyConvertible(rt, 'LREAL')) {
    common = 'LREAL';
  }
  if (common === null || !isAnyReal(common)) {
    return {
      type: null, left: null, right: null,
      error: `Operator '${op}' cannot combine ${L} and ${R} without an explicit conversion`,
    };
  }
  return {
    type: common,
    left: sameType(lt, common) ? null : common,
    right: sameType(rt, common) ? null : common,
    error: null,
  };
}

/**
 * Result of a unary operator on operand type `t`.
 * @returns {{ type: *, error: string|null }}
 */
function unaryResultType(op, t) {
  if (t === null) return { type: null, error: null };
  if (op === 'NOT') {
    if (t === 'BOOL' || isBitString(t)) return { type: t, error: null };
    return { type: null, error: `Operator 'NOT' requires a BOOL or bit-string operand, got ${formatType(t)}` };
  }
  if (op === '-' || op === '+') {
    if (isNumericLike(t)) return { type: t, error: null };
    return { type: null, error: `Unary '${op}' requires a numeric operand, got ${formatType(t)}` };
  }
  return { type: null, error: `Unknown unary operator '${op}'` };
}

// ─── Standard function signatures ────────────────────────────────────────────

/**
 * Parameter classes: a generic class name ('ANY', 'ANY_ELEMENTARY', 'ANY_NUM',
 * 'ANY_INT', 'ANY_REAL', 'ANY_BIT', 'ANY_STRING', 'ANY_DATE', 'ANY_MAGNITUDE')
 * or a concrete elementary type name (an argument may then be any type that
 * converts implicitly to it).
 *
 * Result rules: 'FIRST' (type of the first argument), 'COMMON' (common type
 * of the homogeneous argument group), 'CONTEXT_INT' (the integer type the
 * context requires, DINT otherwise), or a concrete type name.
 *
 * @typedef {Object} FunctionSignature
 * @property {string} name
 * @property {string[]} params - parameter class per position (the last one repeats when variadic)
 * @property {number} min - minimum argument count
 * @property {number} max - maximum argument count (Infinity when variadic)
 * @property {string} result
 * @property {number[]} [homogeneous] - positions that must share one common type
 */

function sig(name, params, result, extra = {}) {
  return Object.freeze({
    name,
    params,
    min: extra.min !== undefined ? extra.min : params.length,
    max: extra.variadic ? Infinity : (extra.max !== undefined ? extra.max : params.length),
    result,
    homogeneous: extra.homogeneous || null,
    variadic: !!extra.variadic,
  });
}

const FUNCTION_LIST = [
  // Math
  sig('ABS', ['ANY_NUM'], 'FIRST'),
  sig('SQRT', ['ANY_REAL'], 'FIRST'),
  sig('LN', ['ANY_REAL'], 'FIRST'),
  sig('LOG', ['ANY_REAL'], 'FIRST'),
  sig('EXP', ['ANY_REAL'], 'FIRST'),
  sig('SIN', ['ANY_REAL'], 'FIRST'),
  sig('COS', ['ANY_REAL'], 'FIRST'),
  sig('TAN', ['ANY_REAL'], 'FIRST'),
  sig('ASIN', ['ANY_REAL'], 'FIRST'),
  sig('ACOS', ['ANY_REAL'], 'FIRST'),
  sig('ATAN', ['ANY_REAL'], 'FIRST'),
  sig('ATAN2', ['ANY_REAL', 'ANY_REAL'], 'COMMON', { homogeneous: [0, 1] }),
  sig('EXPT', ['ANY_REAL', 'ANY_NUM'], 'FIRST'),
  sig('TRUNC', ['ANY_REAL'], 'CONTEXT_INT'),

  // Numeric / selection
  sig('MAX', ['ANY_ELEMENTARY', 'ANY_ELEMENTARY'], 'COMMON', { homogeneous: [0, 1] }),
  sig('MIN', ['ANY_ELEMENTARY', 'ANY_ELEMENTARY'], 'COMMON', { homogeneous: [0, 1] }),
  sig('LIMIT', ['ANY_ELEMENTARY', 'ANY_ELEMENTARY', 'ANY_ELEMENTARY'], 'COMMON', { homogeneous: [0, 1, 2] }),
  sig('MOD_FUNC', ['ANY_INT', 'ANY_INT'], 'COMMON', { homogeneous: [0, 1] }),
  sig('SEL', ['BOOL', 'ANY', 'ANY'], 'COMMON', { homogeneous: [1, 2] }),
  sig('MUX', ['ANY_INT', 'ANY'], 'COMMON', { min: 2, variadic: true, homogeneous: [1] }),

  // String
  sig('LEN', ['ANY_STRING'], 'INT'),
  sig('LEFT', ['ANY_STRING', 'ANY_INT'], 'FIRST'),
  sig('RIGHT', ['ANY_STRING', 'ANY_INT'], 'FIRST'),
  sig('MID', ['ANY_STRING', 'ANY_INT', 'ANY_INT'], 'FIRST'),
  sig('CONCAT', ['ANY_STRING', 'ANY_STRING'], 'COMMON', { homogeneous: [0, 1] }),
  sig('INSERT', ['ANY_STRING', 'ANY_STRING', 'ANY_INT'], 'COMMON', { homogeneous: [0, 1] }),
  sig('DELETE', ['ANY_STRING', 'ANY_INT', 'ANY_INT'], 'FIRST'),
  sig('REPLACE', ['ANY_STRING', 'ANY_STRING', 'ANY_INT', 'ANY_INT'], 'COMMON', { homogeneous: [0, 1] }),
  sig('FIND', ['ANY_STRING', 'ANY_STRING'], 'INT', { homogeneous: [0, 1] }),

  // Bit
  sig('SHL', ['ANY_BIT', 'ANY_INT'], 'FIRST'),
  sig('SHR', ['ANY_BIT', 'ANY_INT'], 'FIRST'),
  sig('ROL', ['ANY_BIT', 'ANY_INT', 'ANY_INT'], 'FIRST', { min: 2 }),
  sig('ROR', ['ANY_BIT', 'ANY_INT', 'ANY_INT'], 'FIRST', { min: 2 }),

  // Misc
  sig('SIZEOF', ['ANY'], 'DINT'),
];

// Every `<FROM>_TO_<TO>` conversion between elementary types. The runtime in
// src/runtime/StandardFunctions.js ships implementations for a subset; hosts
// supply the rest (generated code calls them by name).
for (const from of ELEMENTARY_NAMES) {
  for (const to of ELEMENTARY_NAMES) {
    if (from === to) continue;
    FUNCTION_LIST.push(sig(`${from}_TO_${to}`, [from], to));
  }
}

/** @type {Map<string, FunctionSignature>} */
const STANDARD_FUNCTIONS = new Map(FUNCTION_LIST.map(s => [s.name, s]));

/** Standard function-block types that are always resolvable. */
const STANDARD_FB_TYPES = new Set([
  'TON', 'TOF', 'TP', 'RS', 'SR', 'CTU', 'CTD', 'CTUD', 'R_TRIG', 'F_TRIG',
]);

/** @returns {FunctionSignature|undefined} */
function lookupFunction(name) {
  return STANDARD_FUNCTIONS.get(String(name).toUpperCase());
}

function isStandardFunction(name) {
  return STANDARD_FUNCTIONS.has(String(name).toUpperCase());
}

function isStandardFBType(name) {
  return STANDARD_FB_TYPES.has(String(name).toUpperCase());
}

/**
 * Whether a resolved type satisfies a parameter class.
 * @param {*} t
 * @param {string} cls
 */
function matchesClass(t, cls) {
  if (t === null || t === undefined) return true; // unknown: never diagnosed
  switch (cls) {
    case 'ANY': return !isArrayType(t);
    case 'ANY_ELEMENTARY': return isElementary(t);
    case 'ANY_NUM': return isAnyNum(t);
    case 'ANY_INT': return isAnyInt(t);
    case 'ANY_REAL': return isAnyReal(t);
    case 'ANY_BIT': return isAnyBit(t);
    case 'ANY_STRING': return isAnyString(t);
    case 'ANY_DATE': return isAnyDate(t);
    case 'ANY_MAGNITUDE': return isAnyNum(t) || t === 'TIME';
    case 'BOOL': return t === 'BOOL';
    default: return isImplicitlyConvertible(t, cls);
  }
}

/** Whether a parameter class is a concrete elementary type. */
function isConcreteClass(cls) {
  return isElementary(cls);
}

module.exports = {
  ELEMENTARY,
  ELEMENTARY_NAMES,
  ALIASES,
  canonicalTypeName,
  isElementary,
  typeClass,
  formatType,
  isAnyInt,
  isAnyReal,
  isAnyBit,
  isBitString,
  isAnyNum,
  isAnyString,
  isAnyDate,
  isIntegerLike,
  isNumericLike,
  isArrayType,
  integerInfo,
  is64Bit,
  fitsInType,
  defaultIntegerTypeFor,
  isImplicitlyConvertible,
  sameType,
  commonType,
  needsConversion,
  ARITHMETIC_OPS,
  COMPARISON_OPS,
  LOGICAL_OPS,
  binaryResultType,
  unaryResultType,
  STANDARD_FUNCTIONS,
  STANDARD_FB_TYPES,
  lookupFunction,
  isStandardFunction,
  isStandardFBType,
  matchesClass,
  isConcreteClass,
};
