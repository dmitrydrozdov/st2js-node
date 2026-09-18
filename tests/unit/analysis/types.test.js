'use strict';

const T = require('../../../src/analysis/types');

describe('analysis/types: elementary type table', () => {
  test('canonicalTypeName normalises case and aliases', () => {
    expect(T.canonicalTypeName('dint')).toBe('DINT');
    expect(T.canonicalTypeName('TOD')).toBe('TIME_OF_DAY');
    expect(T.canonicalTypeName('dt')).toBe('DATE_AND_TIME');
    expect(T.canonicalTypeName('Colour')).toBeNull();
    expect(T.canonicalTypeName(null)).toBeNull();
  });

  test.each([
    ['SINT', 8, true, -128n, 127n],
    ['INT', 16, true, -32768n, 32767n],
    ['DINT', 32, true, -2147483648n, 2147483647n],
    ['LINT', 64, true, -9223372036854775808n, 9223372036854775807n],
    ['USINT', 8, false, 0n, 255n],
    ['UINT', 16, false, 0n, 65535n],
    ['UDINT', 32, false, 0n, 4294967295n],
    ['ULINT', 64, false, 0n, 18446744073709551615n],
    ['BYTE', 8, false, 0n, 255n],
    ['WORD', 16, false, 0n, 65535n],
    ['DWORD', 32, false, 0n, 4294967295n],
    ['LWORD', 64, false, 0n, 18446744073709551615n],
  ])('%s has width %i, signed=%s, range %s..%s', (name, width, signed, min, max) => {
    expect(T.integerInfo(name)).toEqual({ width, signed, min, max });
    expect(T.fitsInType(min, name)).toBe(true);
    expect(T.fitsInType(max, name)).toBe(true);
    expect(T.fitsInType(min - 1n, name)).toBe(false);
    expect(T.fitsInType(max + 1n, name)).toBe(false);
  });

  test('class membership', () => {
    for (const t of ['SINT', 'INT', 'DINT', 'LINT', 'USINT', 'UINT', 'UDINT', 'ULINT']) {
      expect(T.isAnyInt(t)).toBe(true);
      expect(T.isAnyNum(t)).toBe(true);
      expect(T.isIntegerLike(t)).toBe(true);
      expect(T.isAnyReal(t)).toBe(false);
      expect(T.isAnyBit(t)).toBe(false);
    }
    for (const t of ['REAL', 'LREAL']) {
      expect(T.isAnyReal(t)).toBe(true);
      expect(T.isAnyNum(t)).toBe(true);
      expect(T.isAnyInt(t)).toBe(false);
    }
    for (const t of ['BYTE', 'WORD', 'DWORD', 'LWORD']) {
      expect(T.isAnyBit(t)).toBe(true);
      expect(T.isBitString(t)).toBe(true);
      expect(T.isIntegerLike(t)).toBe(true);
      expect(T.isAnyNum(t)).toBe(false);
    }
    expect(T.isAnyBit('BOOL')).toBe(true);
    expect(T.isBitString('BOOL')).toBe(false);
    expect(T.isAnyString('STRING')).toBe(true);
    expect(T.isAnyString('WSTRING')).toBe(true);
    expect(T.isAnyDate('DATE')).toBe(true);
    expect(T.isAnyDate('TIME_OF_DAY')).toBe(true);
    expect(T.isAnyDate('DATE_AND_TIME')).toBe(true);
    expect(T.isAnyDate('TIME')).toBe(false);
    expect(T.is64Bit('LINT')).toBe(true);
    expect(T.is64Bit('LWORD')).toBe(true);
    expect(T.is64Bit('DINT')).toBe(false);
  });

  test('defaultIntegerTypeFor picks DINT, then LINT, then ULINT', () => {
    expect(T.defaultIntegerTypeFor(5n)).toBe('DINT');
    expect(T.defaultIntegerTypeFor(2147483648n)).toBe('LINT');
    expect(T.defaultIntegerTypeFor(9223372036854775808n)).toBe('ULINT');
    expect(T.defaultIntegerTypeFor(18446744073709551616n)).toBeNull();
  });

  test('formatType renders arrays and unknowns', () => {
    expect(T.formatType('DINT')).toBe('DINT');
    expect(T.formatType({ kind: 'array', element: 'INT', size: 4, lo: 0 })).toBe('ARRAY[0..3] OF INT');
    expect(T.formatType({ kind: 'array', element: 'INT' })).toBe('ARRAY OF INT');
    expect(T.formatType(null)).toBe('unknown');
  });
});

describe('analysis/types: implicit conversions', () => {
  const ok = (from, to) => expect(T.isImplicitlyConvertible(from, to)).toBe(true);
  const no = (from, to) => expect(T.isImplicitlyConvertible(from, to)).toBe(false);

  test('widening integers of the same signedness', () => {
    ok('SINT', 'INT'); ok('INT', 'DINT'); ok('DINT', 'LINT'); ok('SINT', 'LINT');
    ok('USINT', 'UINT'); ok('UINT', 'UDINT'); ok('UDINT', 'ULINT');
    ok('INT', 'INT');
  });

  test('narrowing integers is not implicit', () => {
    no('DINT', 'INT'); no('INT', 'SINT'); no('LINT', 'DINT'); no('UDINT', 'UINT');
  });

  test('unsigned to strictly wider signed', () => {
    ok('USINT', 'INT'); ok('UINT', 'DINT'); ok('UDINT', 'LINT');
    no('UINT', 'INT'); no('UDINT', 'DINT'); no('ULINT', 'LINT');
  });

  test('signedness change is not implicit', () => {
    no('INT', 'UINT'); no('SINT', 'USINT'); no('DINT', 'UDINT'); no('INT', 'UDINT');
  });

  test('reals', () => {
    ok('REAL', 'LREAL'); no('LREAL', 'REAL');
  });

  test('integer to a real type that represents every value', () => {
    ok('SINT', 'REAL'); ok('INT', 'REAL'); ok('USINT', 'REAL'); ok('UINT', 'REAL');
    no('DINT', 'REAL'); no('UDINT', 'REAL');
    ok('DINT', 'LREAL'); ok('UDINT', 'LREAL'); no('LINT', 'LREAL'); no('ULINT', 'LREAL');
  });

  test('real to integer is never implicit', () => {
    no('REAL', 'DINT'); no('LREAL', 'LINT'); no('REAL', 'INT');
  });

  test('bit strings widen; BOOL widens to any bit string', () => {
    ok('BYTE', 'WORD'); ok('WORD', 'DWORD'); ok('DWORD', 'LWORD'); no('WORD', 'BYTE');
    ok('BOOL', 'BYTE'); ok('BOOL', 'LWORD'); no('BYTE', 'BOOL');
  });

  test('bit strings behave as unsigned integers for conversions', () => {
    ok('BYTE', 'USINT'); ok('WORD', 'UINT'); ok('WORD', 'UDINT'); ok('BYTE', 'INT'); ok('WORD', 'DINT');
    no('WORD', 'INT'); no('DWORD', 'DINT'); no('WORD', 'USINT');
    ok('UINT', 'WORD'); ok('USINT', 'WORD'); no('INT', 'WORD'); no('UDINT', 'WORD');
  });

  test('BOOL and integers are not interchangeable', () => {
    no('BOOL', 'INT'); no('INT', 'BOOL'); no('BOOL', 'REAL');
  });

  test('strings', () => {
    ok('STRING', 'WSTRING'); no('WSTRING', 'STRING'); no('STRING', 'INT');
  });

  test('unknown, user, and array types', () => {
    no(null, 'INT'); no('INT', null);
    expect(T.isImplicitlyConvertible('Colour', 'colour')).toBe(true);
    no('Colour', 'INT');
    const arr = { kind: 'array', element: 'INT', size: 3, lo: 0 };
    expect(T.isImplicitlyConvertible(arr, { kind: 'array', element: 'INT', size: 3, lo: 0 })).toBe(true);
    expect(T.isImplicitlyConvertible(arr, { kind: 'array', element: 'INT', size: 4, lo: 0 })).toBe(false);
    no(arr, 'INT');
  });

  test('commonType', () => {
    expect(T.commonType('INT', 'DINT')).toBe('DINT');
    expect(T.commonType('DINT', 'INT')).toBe('DINT');
    expect(T.commonType('INT', 'INT')).toBe('INT');
    expect(T.commonType('INT', 'UINT')).toBeNull();
    expect(T.commonType('BOOL', 'DINT')).toBeNull();
    expect(T.commonType('REAL', 'INT')).toBe('REAL');
  });
});

describe('analysis/types: operator result rules', () => {
  const bin = (op, l, r) => T.binaryResultType(op, l, r);

  test('arithmetic on two integers resolves to the wider type and records the conversion', () => {
    expect(bin('+', 'INT', 'DINT')).toEqual({ type: 'DINT', left: 'DINT', right: null, error: null });
    expect(bin('-', 'DINT', 'INT')).toEqual({ type: 'DINT', left: null, right: 'DINT', error: null });
    expect(bin('*', 'INT', 'INT')).toEqual({ type: 'INT', left: null, right: null, error: null });
    expect(bin('/', 'USINT', 'UDINT').type).toBe('UDINT');
  });

  test('mixed signedness is an error', () => {
    const r = bin('+', 'INT', 'UINT');
    expect(r.type).toBeNull();
    expect(r.error).toMatch(/signed and unsigned/);
    expect(bin('*', 'UDINT', 'DINT').error).toMatch(/signed and unsigned/);
  });

  test('integer with real resolves to a real type that represents the integer', () => {
    expect(bin('+', 'INT', 'REAL').type).toBe('REAL');
    expect(bin('+', 'REAL', 'INT')).toEqual({ type: 'REAL', left: null, right: 'REAL', error: null });
    expect(bin('*', 'DINT', 'REAL').type).toBe('LREAL');
    expect(bin('*', 'DINT', 'LREAL').type).toBe('LREAL');
    expect(bin('+', 'REAL', 'LREAL').type).toBe('LREAL');
    expect(bin('+', 'LINT', 'REAL').error).toMatch(/explicit conversion/);
  });

  test('arithmetic requires numeric operands', () => {
    expect(bin('+', 'BOOL', 'INT').error).toMatch(/numeric/);
    expect(bin('+', 'STRING', 'STRING').error).toMatch(/numeric/);
    expect(bin('-', 'TIME', 'TIME').error).toMatch(/numeric/);
  });

  test('bit strings take part in arithmetic as unsigned values', () => {
    expect(bin('+', 'WORD', 'WORD').type).toBe('WORD');
    expect(bin('+', 'WORD', 'UINT').type).toBe('UINT');
    expect(bin('+', 'WORD', 'INT').error).toMatch(/signed and unsigned/);
  });

  test('MOD requires integer operands', () => {
    expect(bin('MOD', 'INT', 'INT').type).toBe('INT');
    expect(bin('MOD', 'WORD', 'BYTE').type).toBe('WORD');
    expect(bin('MOD', 'REAL', 'INT').error).toMatch(/MOD/);
    expect(bin('MOD', 'INT', 'LREAL').error).toMatch(/integer/);
  });

  test('** yields the base type', () => {
    expect(bin('**', 'REAL', 'INT').type).toBe('REAL');
    expect(bin('**', 'LREAL', 'REAL').type).toBe('LREAL');
    expect(bin('**', 'INT', 'INT').type).toBe('INT');
    expect(bin('**', 'INT', 'REAL').error).toMatch(/\*\*/);
  });

  test('comparisons yield BOOL for compatible operands', () => {
    expect(bin('<', 'INT', 'INT')).toEqual({ type: 'BOOL', left: null, right: null, error: null });
    expect(bin('=', 'INT', 'DINT')).toEqual({ type: 'BOOL', left: 'DINT', right: null, error: null });
    expect(bin('>=', 'REAL', 'INT').right).toBe('REAL');
    expect(bin('=', 'BOOL', 'BOOL').type).toBe('BOOL');
    expect(bin('=', 'STRING', 'STRING').type).toBe('BOOL');
    expect(bin('<', 'TIME', 'TIME').type).toBe('BOOL');
    expect(bin('=', 'Colour', 'Colour').type).toBe('BOOL');
  });

  test('comparisons of incompatible operands are errors', () => {
    expect(bin('<', 'BOOL', 'DINT').error).toMatch(/Cannot compare BOOL with DINT/);
    expect(bin('=', 'STRING', 'INT').error).toMatch(/incompatible/);
    expect(bin('<', 'INT', 'UINT').error).toMatch(/incompatible/);
    expect(bin('=', 'TIME', 'DINT').error).toMatch(/incompatible/);
  });

  test('comparison with an unknown operand is BOOL without diagnostics', () => {
    expect(bin('<', null, 'DINT')).toEqual({ type: 'BOOL', left: null, right: null, error: null });
  });

  test('boolean operators on BOOL and bitwise on bit strings', () => {
    expect(bin('AND', 'BOOL', 'BOOL').type).toBe('BOOL');
    expect(bin('OR', 'WORD', 'BYTE')).toEqual({ type: 'WORD', left: null, right: 'WORD', error: null });
    expect(bin('XOR', 'DWORD', 'DWORD').type).toBe('DWORD');
    expect(bin('AND', 'INT', 'INT').error).toMatch(/BOOL or bit-string/);
    expect(bin('AND', 'BOOL', 'WORD').error).toMatch(/BOOL or bit-string/);
    expect(bin('OR', 'BOOL', 'INT').error).toBeTruthy();
  });

  test('unknown operator', () => {
    expect(bin('???', 'INT', 'INT').error).toMatch(/Unknown operator/);
  });

  test('unary operators', () => {
    expect(T.unaryResultType('NOT', 'BOOL')).toEqual({ type: 'BOOL', error: null });
    expect(T.unaryResultType('NOT', 'WORD')).toEqual({ type: 'WORD', error: null });
    expect(T.unaryResultType('NOT', 'INT').error).toMatch(/NOT/);
    expect(T.unaryResultType('-', 'INT')).toEqual({ type: 'INT', error: null });
    expect(T.unaryResultType('-', 'REAL').type).toBe('REAL');
    expect(T.unaryResultType('-', 'BOOL').error).toMatch(/numeric/);
    expect(T.unaryResultType('-', null)).toEqual({ type: null, error: null });
    expect(T.unaryResultType('?', 'INT').error).toMatch(/Unknown unary/);
  });

  test('matchesClass', () => {
    expect(T.matchesClass('INT', 'ANY_NUM')).toBe(true);
    expect(T.matchesClass('WORD', 'ANY_NUM')).toBe(false);
    expect(T.matchesClass('WORD', 'ANY_BIT')).toBe(true);
    expect(T.matchesClass('REAL', 'ANY_REAL')).toBe(true);
    expect(T.matchesClass('INT', 'ANY_REAL')).toBe(false);
    expect(T.matchesClass('STRING', 'ANY_STRING')).toBe(true);
    expect(T.matchesClass('DATE', 'ANY_DATE')).toBe(true);
    expect(T.matchesClass('TIME', 'ANY_MAGNITUDE')).toBe(true);
    expect(T.matchesClass('INT', 'DINT')).toBe(true);
    expect(T.matchesClass('DINT', 'INT')).toBe(false);
    expect(T.matchesClass('BOOL', 'BOOL')).toBe(true);
    expect(T.matchesClass({ kind: 'array', element: 'INT' }, 'ANY')).toBe(false);
    expect(T.matchesClass('Colour', 'ANY_ELEMENTARY')).toBe(false);
    expect(T.matchesClass(null, 'ANY_INT')).toBe(true);
  });
});
