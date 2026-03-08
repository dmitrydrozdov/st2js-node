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
});
