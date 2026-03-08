'use strict';

const sf = require('../../../src/runtime/StandardFunctions');

describe('StandardFunctions', () => {
  describe('Math functions', () => {
    test('ABS(-5) === 5', () => {
      expect(sf.ABS(-5)).toBe(5);
    });

    test('ABS(5) === 5', () => {
      expect(sf.ABS(5)).toBe(5);
    });

    test('SQRT(9) === 3', () => {
      expect(sf.SQRT(9)).toBe(3);
    });

    test('SQRT(0) === 0', () => {
      expect(sf.SQRT(0)).toBe(0);
    });

    test('LN(1) === 0', () => {
      expect(sf.LN(1)).toBe(0);
    });

    test('EXP(0) === 1', () => {
      expect(sf.EXP(0)).toBe(1);
    });

    test('SIN(0) === 0', () => {
      expect(sf.SIN(0)).toBe(0);
    });

    test('COS(0) === 1', () => {
      expect(sf.COS(0)).toBe(1);
    });
  });

  describe('Numeric functions', () => {
    test('MIN(3, 5) === 3', () => {
      expect(sf.MIN(3, 5)).toBe(3);
    });

    test('MAX(3, 5) === 5', () => {
      expect(sf.MAX(3, 5)).toBe(5);
    });

    test('LIMIT clamps below minimum', () => {
      expect(sf.LIMIT(0, -1, 10)).toBe(0);
    });

    test('LIMIT clamps above maximum', () => {
      expect(sf.LIMIT(0, 15, 10)).toBe(10);
    });

    test('LIMIT passes through in-range value', () => {
      expect(sf.LIMIT(0, 5, 10)).toBe(5);
    });

    test('SEL selects in0 when g=false', () => {
      expect(sf.SEL(false, 10, 20)).toBe(10);
    });

    test('SEL selects in1 when g=true', () => {
      expect(sf.SEL(true, 10, 20)).toBe(20);
    });
  });

  describe('String functions', () => {
    test('LEN("hello") === 5', () => {
      expect(sf.LEN('hello')).toBe(5);
    });

    test('LEFT("hello", 3) === "hel"', () => {
      expect(sf.LEFT('hello', 3)).toBe('hel');
    });

    test('RIGHT("hello", 3) === "llo"', () => {
      expect(sf.RIGHT('hello', 3)).toBe('llo');
    });

    test('MID("hello", 3, 2) === "ell"', () => {
      expect(sf.MID('hello', 3, 2)).toBe('ell');
    });

    test('CONCAT("hello", " world") === "hello world"', () => {
      expect(sf.CONCAT('hello', ' world')).toBe('hello world');
    });

    test('FIND returns 1-based index', () => {
      expect(sf.FIND('hello world', 'world')).toBe(7);
    });

    test('FIND returns 0 when not found', () => {
      expect(sf.FIND('hello', 'xyz')).toBe(0);
    });
  });

  describe('Type conversion functions', () => {
    test('BOOL_TO_INT', () => {
      expect(sf.BOOL_TO_INT(true)).toBe(1);
      expect(sf.BOOL_TO_INT(false)).toBe(0);
    });

    test('INT_TO_BOOL', () => {
      expect(sf.INT_TO_BOOL(1)).toBe(true);
      expect(sf.INT_TO_BOOL(0)).toBe(false);
    });

    test('REAL_TO_INT truncates', () => {
      expect(sf.REAL_TO_INT(3.7)).toBe(3);
      expect(sf.REAL_TO_INT(-2.9)).toBe(-2);
    });

    test('INT_TO_STRING', () => {
      expect(sf.INT_TO_STRING(42)).toBe('42');
    });
  });

  describe('Bit shift functions', () => {
    test('SHL', () => {
      expect(sf.SHL(1, 3)).toBe(8);
    });

    test('SHR', () => {
      expect(sf.SHR(8, 3)).toBe(1);
    });

    test('ROL', () => {
      expect(sf.ROL(1, 1, 8)).toBe(2);
    });

    test('ROR', () => {
      // ROR(2, 1) with default 32 bits: 2 >>> 1 = 1
      expect(sf.ROR(2, 1)).toBe(1);
    });
  });

  describe('More math functions', () => {
    test('LOG(10) is approximately 1', () => {
      expect(sf.LOG(10)).toBeCloseTo(1);
    });

    test('LN(Math.E) is approximately 1', () => {
      expect(sf.LN(Math.E)).toBeCloseTo(1);
    });

    test('TAN(0) === 0', () => {
      expect(sf.TAN(0)).toBe(0);
    });

    test('ASIN(0) === 0', () => {
      expect(sf.ASIN(0)).toBe(0);
    });

    test('ACOS(1) === 0', () => {
      expect(sf.ACOS(1)).toBe(0);
    });

    test('ATAN(0) === 0', () => {
      expect(sf.ATAN(0)).toBe(0);
    });

    test('ATAN2(0, 1) === 0', () => {
      expect(sf.ATAN2(0, 1)).toBe(0);
    });

    test('EXPT(2, 3) === 8', () => {
      expect(sf.EXPT(2, 3)).toBe(8);
    });

    test('TRUNC(3.7) === 3', () => {
      expect(sf.TRUNC(3.7)).toBe(3);
    });

    test('TRUNC(-2.3) === -2', () => {
      expect(sf.TRUNC(-2.3)).toBe(-2);
    });

    test('MOD_FUNC(10, 3) === 1', () => {
      expect(sf.MOD_FUNC(10, 3)).toBe(1);
    });
  });

  describe('More type conversions', () => {
    test('INT_TO_REAL', () => {
      expect(sf.INT_TO_REAL(42)).toBe(42);
    });

    test('DINT_TO_REAL', () => {
      expect(sf.DINT_TO_REAL(100)).toBe(100);
    });

    test('REAL_TO_DINT', () => {
      expect(sf.REAL_TO_DINT(3.7)).toBe(3);
    });

    test('INT_TO_DINT', () => {
      expect(sf.INT_TO_DINT(42)).toBe(42);
    });

    test('DINT_TO_INT', () => {
      const val = sf.DINT_TO_INT(42);
      expect(typeof val).toBe('number');
    });

    test('BOOL_TO_REAL', () => {
      expect(sf.BOOL_TO_REAL(true)).toBe(1.0);
      expect(sf.BOOL_TO_REAL(false)).toBe(0.0);
    });

    test('REAL_TO_BOOL', () => {
      expect(sf.REAL_TO_BOOL(1.0)).toBe(true);
      expect(sf.REAL_TO_BOOL(0.0)).toBe(false);
    });

    test('REAL_TO_STRING', () => {
      expect(sf.REAL_TO_STRING(3.14)).toBe('3.14');
    });

    test('STRING_TO_REAL', () => {
      expect(sf.STRING_TO_REAL('3.14')).toBeCloseTo(3.14);
    });

    test('STRING_TO_INT', () => {
      expect(sf.STRING_TO_INT('42')).toBe(42);
    });

    test('BOOL_TO_STRING', () => {
      expect(sf.BOOL_TO_STRING(true)).toBe('TRUE');
      expect(sf.BOOL_TO_STRING(false)).toBe('FALSE');
    });
  });

  describe('More string functions', () => {
    test('INSERT', () => {
      expect(sf.INSERT('hello', ' world', 5)).toBe('hello world');
    });

    test('DELETE', () => {
      expect(sf.DELETE('hello world', 6, 6)).toBe('hello');
    });

    test('REPLACE', () => {
      expect(sf.REPLACE('hello world', 'there', 5, 7)).toBe('hello there');
    });
  });

  describe('Selection functions', () => {
    test('MUX selects by index', () => {
      expect(sf.MUX(0, 10, 20, 30)).toBe(10);
      expect(sf.MUX(2, 10, 20, 30)).toBe(30);
    });

    test('MUX out of range returns first', () => {
      expect(sf.MUX(99, 10, 20, 30)).toBe(10);
    });
  });
});
