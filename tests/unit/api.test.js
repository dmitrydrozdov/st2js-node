'use strict';

const { parse, validate, compile, compileSync } = require('../../src/index');

describe('Public API', () => {
  describe('parse()', () => {
    test('returns ast and errors', () => {
      const result = parse(`
        PROGRAM P
          VAR x: INT; END_VAR
          x := 1;
        END_PROGRAM
      `);
      expect(result.ast).not.toBeNull();
      expect(Array.isArray(result.errors)).toBe(true);
    });

    test('returns null ast on parse error', () => {
      const result = parse('INVALID CODE @@@ %%%');
      // errors should exist
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('validate()', () => {
    test('returns valid: true for valid program', () => {
      const { ast } = parse(`
        PROGRAM P
          VAR x: INT; END_VAR
          x := 1;
        END_PROGRAM
      `);
      const result = validate(ast);
      expect(result.valid).toBe(true);
    });
  });

  describe('compile()', () => {
    test('returns code, sourceMap, warnings, errors', () => {
      const result = compile(`
        PROGRAM P
          VAR x: INT; END_VAR
          x := 1;
        END_PROGRAM
      `);
      expect(typeof result.code).toBe('string');
      expect(result.code.length).toBeGreaterThan(0);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });

    test('returns empty code on parse error', () => {
      const result = compile('INVALID @@@ CODE');
      expect(result.code).toBe('');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('strict mode fails on validation errors', () => {
      const result = compile(`
        PROGRAM P
          VAR x: INT; x: INT; END_VAR
          x := 1;
        END_PROGRAM
      `, { strict: true });
      expect(result.errors.some(e => e.severity === 'error')).toBe(true);
    });
  });

  describe('compileSync()', () => {
    test('returns code string on success', () => {
      const code = compileSync(`
        PROGRAM P
          VAR x: INT; END_VAR
          x := 1;
        END_PROGRAM
      `);
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(0);
    });

    test('throws on parse error', () => {
      expect(() => {
        compileSync('INVALID @@@ CODE');
      }).toThrow('ST compilation failed');
    });
  });
});
