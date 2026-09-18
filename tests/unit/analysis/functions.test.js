'use strict';

const T = require('../../../src/analysis/types');
const runtime = require('../../../src/runtime/StandardFunctions');

// Names the validator accepted before the signature table existed.
const LEGACY_ALLOW_LIST = [
  'ABS', 'SQRT', 'LN', 'LOG', 'EXP', 'SIN', 'COS', 'TAN', 'ASIN', 'ACOS', 'ATAN', 'ATAN2',
  'MAX', 'MIN', 'LIMIT', 'MUX', 'SEL',
  'BOOL_TO_INT', 'BOOL_TO_DINT', 'BOOL_TO_REAL',
  'INT_TO_BOOL', 'INT_TO_DINT', 'INT_TO_REAL', 'INT_TO_STRING',
  'DINT_TO_BOOL', 'DINT_TO_INT', 'DINT_TO_REAL', 'DINT_TO_STRING',
  'REAL_TO_BOOL', 'REAL_TO_INT', 'REAL_TO_DINT', 'REAL_TO_STRING',
  'STRING_TO_INT', 'STRING_TO_DINT', 'STRING_TO_REAL', 'STRING_TO_BOOL',
  'LEN', 'LEFT', 'RIGHT', 'MID', 'CONCAT', 'INSERT', 'DELETE', 'REPLACE', 'FIND',
  'SHL', 'SHR', 'ROL', 'ROR',
  'TIME_TO_DINT', 'DINT_TO_TIME',
  'SIZEOF',
];

describe('analysis/types: standard function signatures', () => {
  test('every legacy allow-list name has a signature', () => {
    for (const name of LEGACY_ALLOW_LIST) {
      expect(T.lookupFunction(name)).toBeDefined();
      expect(T.isStandardFunction(name.toLowerCase())).toBe(true);
    }
  });

  test('every runtime export has a signature whose arity matches the implementation', () => {
    for (const [name, fn] of Object.entries(runtime)) {
      if (typeof fn !== 'function') continue;
      const sig = T.lookupFunction(name);
      expect(sig).toBeDefined();
      if (sig.variadic) {
        // Rest parameters do not count toward fn.length.
        expect(fn.length).toBeLessThanOrEqual(sig.min);
      } else {
        expect(fn.length).toBeGreaterThanOrEqual(sig.min);
        expect(fn.length).toBeLessThanOrEqual(sig.max);
      }
    }
  });

  test('signatures have consistent arity bounds and parameter classes', () => {
    const classes = new Set(['ANY', 'ANY_ELEMENTARY', 'ANY_NUM', 'ANY_INT', 'ANY_REAL', 'ANY_BIT',
      'ANY_STRING', 'ANY_DATE', 'ANY_MAGNITUDE', ...T.ELEMENTARY_NAMES]);
    for (const sig of T.STANDARD_FUNCTIONS.values()) {
      expect(sig.min).toBeGreaterThanOrEqual(0);
      expect(sig.max).toBeGreaterThanOrEqual(sig.min);
      expect(sig.params.length).toBeGreaterThan(0);
      for (const cls of sig.params) expect(classes.has(cls)).toBe(true);
      const results = new Set(['FIRST', 'COMMON', 'CONTEXT_INT', ...T.ELEMENTARY_NAMES]);
      expect(results.has(sig.result)).toBe(true);
      if (sig.homogeneous) {
        for (const i of sig.homogeneous) expect(i).toBeLessThan(sig.params.length);
      }
    }
  });

  test('conversion functions exist for every pair of elementary types', () => {
    for (const from of T.ELEMENTARY_NAMES) {
      for (const to of T.ELEMENTARY_NAMES) {
        if (from === to) continue;
        const sig = T.lookupFunction(`${from}_TO_${to}`);
        expect(sig).toBeDefined();
        expect(sig.params).toEqual([from]);
        expect(sig.result).toBe(to);
        expect(sig.min).toBe(1);
      }
    }
    expect(T.lookupFunction('INT_TO_INT')).toBeUndefined();
  });

  test('selected signatures', () => {
    expect(T.lookupFunction('ABS')).toMatchObject({ params: ['ANY_NUM'], result: 'FIRST', min: 1, max: 1 });
    expect(T.lookupFunction('MAX')).toMatchObject({ result: 'COMMON', homogeneous: [0, 1] });
    expect(T.lookupFunction('MUX')).toMatchObject({ min: 2, max: Infinity, variadic: true });
    expect(T.lookupFunction('ROL')).toMatchObject({ min: 2, max: 3 });
    expect(T.lookupFunction('LEN')).toMatchObject({ params: ['ANY_STRING'], result: 'INT' });
    expect(T.lookupFunction('TRUNC')).toMatchObject({ result: 'CONTEXT_INT' });
    expect(T.lookupFunction('nope')).toBeUndefined();
    expect(T.isStandardFBType('ton')).toBe(true);
    expect(T.isStandardFBType('ABS')).toBe(false);
  });
});
