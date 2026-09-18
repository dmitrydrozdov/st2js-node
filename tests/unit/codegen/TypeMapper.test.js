'use strict';

const TypeMapper = require('../../../src/codegen/TypeMapper');

describe('TypeMapper', () => {
  describe('isInteger', () => {
    test('INT is integer', () => expect(TypeMapper.isInteger('INT')).toBe(true));
    test('DINT is integer', () => expect(TypeMapper.isInteger('DINT')).toBe(true));
    test('SINT is integer', () => expect(TypeMapper.isInteger('SINT')).toBe(true));
    test('LINT is integer', () => expect(TypeMapper.isInteger('LINT')).toBe(true));
    test('USINT is integer', () => expect(TypeMapper.isInteger('USINT')).toBe(true));
    test('UINT is integer', () => expect(TypeMapper.isInteger('UINT')).toBe(true));
    test('UDINT is integer', () => expect(TypeMapper.isInteger('UDINT')).toBe(true));
    test('ULINT is integer', () => expect(TypeMapper.isInteger('ULINT')).toBe(true));
    test('REAL is not integer', () => expect(TypeMapper.isInteger('REAL')).toBe(false));
    test('BOOL is not integer', () => expect(TypeMapper.isInteger('BOOL')).toBe(false));
  });

  describe('isReal', () => {
    test('REAL is real', () => expect(TypeMapper.isReal('REAL')).toBe(true));
    test('LREAL is real', () => expect(TypeMapper.isReal('LREAL')).toBe(true));
    test('INT is not real', () => expect(TypeMapper.isReal('INT')).toBe(false));
  });

  describe('isBit', () => {
    test('BYTE is bit', () => expect(TypeMapper.isBit('BYTE')).toBe(true));
    test('WORD is bit', () => expect(TypeMapper.isBit('WORD')).toBe(true));
    test('DWORD is bit', () => expect(TypeMapper.isBit('DWORD')).toBe(true));
    test('LWORD is bit', () => expect(TypeMapper.isBit('LWORD')).toBe(true));
    test('INT is not bit', () => expect(TypeMapper.isBit('INT')).toBe(false));
  });

  describe('isNumeric', () => {
    test('INT is numeric', () => expect(TypeMapper.isNumeric('INT')).toBe(true));
    test('REAL is numeric', () => expect(TypeMapper.isNumeric('REAL')).toBe(true));
    test('BYTE is numeric', () => expect(TypeMapper.isNumeric('BYTE')).toBe(true));
    test('BOOL is not numeric', () => expect(TypeMapper.isNumeric('BOOL')).toBe(false));
    test('STRING is not numeric', () => expect(TypeMapper.isNumeric('STRING')).toBe(false));
  });

  describe('isTime', () => {
    test('TIME is time', () => expect(TypeMapper.isTime('TIME')).toBe(true));
    test('DATE is time', () => expect(TypeMapper.isTime('DATE')).toBe(true));
    test('INT is not time', () => expect(TypeMapper.isTime('INT')).toBe(false));
  });

  describe('isString', () => {
    test('STRING is string', () => expect(TypeMapper.isString('STRING')).toBe(true));
    test('WSTRING is string', () => expect(TypeMapper.isString('WSTRING')).toBe(true));
    test('INT is not string', () => expect(TypeMapper.isString('INT')).toBe(false));
  });

  describe('getDefaultValue', () => {
    test('BOOL defaults to false', () => expect(TypeMapper.getDefaultValue('BOOL')).toBe('false'));
    test('INT defaults to 0', () => expect(TypeMapper.getDefaultValue('INT')).toBe('0'));
    test('REAL defaults to 0', () => expect(TypeMapper.getDefaultValue('REAL')).toBe('0'));
    test('STRING defaults to empty', () => expect(TypeMapper.getDefaultValue('STRING')).toBe("''"));
    test('TIME defaults to 0', () => expect(TypeMapper.getDefaultValue('TIME')).toBe('0'));
    test('unknown type defaults to null', () => expect(TypeMapper.getDefaultValue('MyType')).toBe('null'));
  });

  describe('getJSType', () => {
    test('BOOL -> boolean', () => expect(TypeMapper.getJSType('BOOL')).toBe('boolean'));
    test('INT -> number', () => expect(TypeMapper.getJSType('INT')).toBe('number'));
    test('REAL -> number', () => expect(TypeMapper.getJSType('REAL')).toBe('number'));
    test('STRING -> string', () => expect(TypeMapper.getJSType('STRING')).toBe('string'));
    test('ARRAY -> Array', () => expect(TypeMapper.getJSType('ARRAY')).toBe('Array'));
    test('STRUCT -> Object', () => expect(TypeMapper.getJSType('STRUCT')).toBe('Object'));
    test('unknown -> passthrough', () => expect(TypeMapper.getJSType('MyType')).toBe('MyType'));
    test('BYTE -> number', () => expect(TypeMapper.getJSType('BYTE')).toBe('number'));
    test('TIME -> number', () => expect(TypeMapper.getJSType('TIME')).toBe('number'));
  });

  describe('needsIntegerClamp', () => {
    test('INT needs clamp', () => expect(TypeMapper.needsIntegerClamp('INT')).toBe(true));
    test('DINT needs clamp', () => expect(TypeMapper.needsIntegerClamp('DINT')).toBe(true));
    test('BYTE needs clamp', () => expect(TypeMapper.needsIntegerClamp('BYTE')).toBe(true));
    test('REAL does not need clamp', () => expect(TypeMapper.needsIntegerClamp('REAL')).toBe(false));
    test('BOOL does not need clamp', () => expect(TypeMapper.needsIntegerClamp('BOOL')).toBe(false));
    test('STRING does not need clamp', () => expect(TypeMapper.needsIntegerClamp('STRING')).toBe(false));
  });

  describe('parenthesize / unparenthesize', () => {
    test('adds parentheses only when needed', () => {
      expect(TypeMapper.parenthesize('a + b')).toBe('(a + b)');
      expect(TypeMapper.parenthesize('(a + b)')).toBe('(a + b)');
      expect(TypeMapper.parenthesize('(a) + (b)')).toBe('((a) + (b))');
      expect(TypeMapper.parenthesize('f(x)')).toBe('(f(x))');
      expect(TypeMapper.parenthesize('')).toBe('()');
    });

    test('removes one redundant outer pair', () => {
      expect(TypeMapper.unparenthesize('(a + b)')).toBe('a + b');
      expect(TypeMapper.unparenthesize('((a))')).toBe('(a)');
      expect(TypeMapper.unparenthesize('(a) + (b)')).toBe('(a) + (b)');
      expect(TypeMapper.unparenthesize('x')).toBe('x');
      expect(TypeMapper.unparenthesize('(")" + x)')).toBe('(")" + x)');
    });
  });

  describe('wrapInteger', () => {
    test.each([
      ['SINT', '((a + b) << 24) >> 24'],
      ['INT', '((a + b) << 16) >> 16'],
      ['DINT', '(a + b) | 0'],
      ['USINT', '(a + b) & 0xFF'],
      ['UINT', '(a + b) & 0xFFFF'],
      ['UDINT', '(a + b) >>> 0'],
      ['BYTE', '(a + b) & 0xFF'],
      ['WORD', '(a + b) & 0xFFFF'],
      ['DWORD', '(a + b) >>> 0'],
      ['LINT', 'Math.trunc(a + b)'],
      ['ULINT', 'Math.trunc(a + b)'],
      ['LWORD', 'Math.trunc(a + b)'],
      ['REAL', 'a + b'],
      ['BOOL', 'a + b'],
    ])('%s -> %s', (type, expected) => {
      expect(TypeMapper.wrapInteger('a + b', type)).toBe(expected);
    });

    test('bigint mode for 64-bit types', () => {
      expect(TypeMapper.wrapInteger('(a + b)', 'LINT', 'bigint')).toBe('BigInt.asIntN(64, a + b)');
      expect(TypeMapper.wrapInteger('a', 'ULINT', 'bigint')).toBe('BigInt.asUintN(64, a)');
      expect(TypeMapper.wrapInteger('a', 'LWORD', 'bigint')).toBe('BigInt.asUintN(64, a)');
      expect(TypeMapper.wrapInteger('a', 'DINT', 'bigint')).toBe('(a) | 0');
    });
  });
});
