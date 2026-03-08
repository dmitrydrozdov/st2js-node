'use strict';

const { parse, validate } = require('../../../src/index');
const Validator = require('../../../src/parser/Validator');

function validateSource(src) {
  const { ast, errors: parseErrors } = parse(src);
  if (!ast) return { valid: false, errors: parseErrors };
  const { valid, errors } = validate(ast);
  return { valid, errors: [...parseErrors, ...errors] };
}

function realErrors(errors) {
  return errors.filter(e => e.severity === 'error');
}

function warnings(errors) {
  return errors.filter(e => e.severity === 'warning');
}

describe('Validator', () => {
  describe('valid programs', () => {
    test('simple valid program produces no errors', () => {
      const { errors } = validateSource(`
        PROGRAM P
          VAR x: INT := 0; END_VAR
          x := x + 1;
        END_PROGRAM
      `);
      expect(realErrors(errors)).toHaveLength(0);
    });

    test('valid function block produces no errors', () => {
      const { errors } = validateSource(`
        FUNCTION_BLOCK FB1
          VAR_INPUT en: BOOL; END_VAR
          VAR count: INT := 0; END_VAR
          IF en THEN count := count + 1; END_IF
        END_FUNCTION_BLOCK
      `);
      expect(realErrors(errors)).toHaveLength(0);
    });

    test('valid function produces no errors', () => {
      const { errors } = validateSource(`
        FUNCTION Add: INT
          VAR_INPUT a: INT; b: INT; END_VAR
          Add := a + b;
        END_FUNCTION
      `);
      expect(realErrors(errors)).toHaveLength(0);
    });
  });

  describe('undeclared variables', () => {
    test('undeclared variable produces warning', () => {
      const { errors } = validateSource(`
        PROGRAM P
          VAR x: INT; END_VAR
          x := undeclaredVar;
        END_PROGRAM
      `);
      const w = warnings(errors);
      expect(w.length).toBeGreaterThan(0);
      expect(w.some(e => e.message.includes('undeclaredVar'))).toBe(true);
    });
  });

  describe('duplicate variables', () => {
    test('duplicate variable name produces error', () => {
      const { errors } = validateSource(`
        PROGRAM P
          VAR x: INT; x: REAL; END_VAR
          x := 1;
        END_PROGRAM
      `);
      const errs = realErrors(errors);
      expect(errs.length).toBeGreaterThan(0);
      expect(errs.some(e => e.message.includes("already declared"))).toBe(true);
    });
  });

  describe('EXIT outside loop', () => {
    test('EXIT outside loop produces error', () => {
      const { errors } = validateSource(`
        PROGRAM P
          VAR x: INT; END_VAR
          EXIT;
        END_PROGRAM
      `);
      const errs = realErrors(errors);
      expect(errs.length).toBeGreaterThan(0);
      expect(errs.some(e => e.message.includes('EXIT') || e.message.includes('loop'))).toBe(true);
    });

    test('EXIT inside loop is valid', () => {
      const { errors } = validateSource(`
        PROGRAM P
          VAR i: INT; END_VAR
          FOR i := 0 TO 10 DO
            EXIT;
          END_FOR
        END_PROGRAM
      `);
      const errs = realErrors(errors);
      expect(errs).toHaveLength(0);
    });
  });

  describe('type compatibility', () => {
    test('no warnings for compatible numeric types', () => {
      const { errors } = validateSource(`
        PROGRAM P
          VAR x: INT; y: DINT; END_VAR
          x := y;
        END_PROGRAM
      `);
      const w = warnings(errors).filter(e => e.message.includes('incompatible'));
      expect(w).toHaveLength(0);
    });
  });

  describe('loop validation', () => {
    test('WHILE loop validates condition', () => {
      const { errors } = validateSource(`
        PROGRAM P
          VAR x: INT; END_VAR
          WHILE x > 0 DO x := x - 1; END_WHILE
        END_PROGRAM
      `);
      expect(realErrors(errors)).toHaveLength(0);
    });

    test('REPEAT loop validates', () => {
      const { errors } = validateSource(`
        PROGRAM P
          VAR x: INT; END_VAR
          REPEAT x := x + 1; UNTIL x > 10;
        END_PROGRAM
      `);
      expect(realErrors(errors)).toHaveLength(0);
    });

    test('FOR loop variable check', () => {
      const { errors } = validateSource(`
        PROGRAM P
          VAR i: INT; END_VAR
          FOR i := 0 TO 10 DO i := i; END_FOR
        END_PROGRAM
      `);
      expect(realErrors(errors)).toHaveLength(0);
    });
  });

  describe('function call validation', () => {
    test('standard functions produce no warnings', () => {
      const { errors } = validateSource(`
        PROGRAM P
          VAR x: INT; END_VAR
          x := ABS(x);
        END_PROGRAM
      `);
      const w = warnings(errors).filter(e => e.message.includes('Unknown function'));
      expect(w).toHaveLength(0);
    });

    test('unknown function produces warning', () => {
      const { errors } = validateSource(`
        PROGRAM P
          VAR x: INT; END_VAR
          x := TotallyUnknownFunc(x);
        END_PROGRAM
      `);
      const w = warnings(errors);
      expect(w.some(e => e.message.includes('TotallyUnknownFunc'))).toBe(true);
    });
  });

  describe('binary expressions', () => {
    test('validates comparison operators return BOOL', () => {
      const { errors } = validateSource(`
        PROGRAM P
          VAR a: BOOL; x: INT; END_VAR
          a := x > 0;
        END_PROGRAM
      `);
      expect(realErrors(errors)).toHaveLength(0);
    });

    test('validates arithmetic', () => {
      const { errors } = validateSource(`
        PROGRAM P
          VAR x: INT; y: REAL; END_VAR
          x := 1 + 2;
          y := 1.0 * 2.0;
        END_PROGRAM
      `);
      expect(realErrors(errors)).toHaveLength(0);
    });
  });

  describe('CASE statement validation', () => {
    test('CASE with else validates', () => {
      const { errors } = validateSource(`
        PROGRAM P
          VAR x: INT; END_VAR
          CASE x OF
            0: x := 10;
          ELSE
            x := 99;
          END_CASE
        END_PROGRAM
      `);
      expect(realErrors(errors)).toHaveLength(0);
    });
  });

  describe('member access and array access', () => {
    test('member access returns ANY type', () => {
      const { errors } = validateSource(`
        PROGRAM P
          VAR x: INT; END_VAR
          x := a.b;
        END_PROGRAM
      `);
      // Should not produce hard errors, just possible warnings
      expect(realErrors(errors)).toHaveLength(0);
    });
  });

  describe('RETURN statement validation', () => {
    test('RETURN in function is valid', () => {
      const { errors } = validateSource(`
        FUNCTION Foo: INT
          VAR_INPUT x: INT; END_VAR
          RETURN;
        END_FUNCTION
      `);
      expect(realErrors(errors)).toHaveLength(0);
    });
  });

  describe('function call statement validation', () => {
    test('standalone function call validates', () => {
      const { errors } = validateSource(`
        PROGRAM P
          VAR x: INT; END_VAR
          ABS(x);
        END_PROGRAM
      `);
      expect(realErrors(errors)).toHaveLength(0);
    });
  });

  describe('IF condition type warning', () => {
    test('non-BOOL IF condition produces warning', () => {
      const { errors } = validateSource(`
        PROGRAM P
          VAR x: INT; END_VAR
          IF x THEN x := 1; END_IF
        END_PROGRAM
      `);
      const w = warnings(errors);
      expect(w.some(e => e.message.includes('BOOL'))).toBe(true);
    });
  });

  describe('unary NOT validation', () => {
    test('NOT on BOOL is valid', () => {
      const { errors } = validateSource(`
        PROGRAM P
          VAR a: BOOL; b: BOOL; END_VAR
          b := NOT a;
        END_PROGRAM
      `);
      expect(realErrors(errors)).toHaveLength(0);
    });
  });

  describe('typed literal validation', () => {
    test('typed literal validates', () => {
      const { errors } = validateSource(`
        PROGRAM P
          VAR x: INT; END_VAR
          x := INT#42;
        END_PROGRAM
      `);
      expect(realErrors(errors)).toHaveLength(0);
    });
  });

  describe('named argument validation', () => {
    test('named argument validates', () => {
      const { errors } = validateSource(`
        PROGRAM P
          VAR x: INT; END_VAR
          x := MyFunc(a := 1);
        END_PROGRAM
      `);
      expect(realErrors(errors)).toHaveLength(0);
    });
  });

  describe('ELSIF clause validation', () => {
    test('ELSIF validates condition and body', () => {
      const { errors } = validateSource(`
        PROGRAM P
          VAR x: INT; END_VAR
          IF x > 0 THEN
            x := 1;
          ELSIF x < 0 THEN
            x := -1;
          ELSE
            x := 0;
          END_IF
        END_PROGRAM
      `);
      expect(realErrors(errors)).toHaveLength(0);
    });
  });

  describe('validator handles null AST', () => {
    test('returns empty errors for null ast', () => {
      const validator = new Validator();
      const errors = validator.validate(null);
      expect(errors).toHaveLength(0);
    });
  });

  describe('multiple POUs in same file', () => {
    test('validates cross-references', () => {
      const { errors } = validateSource(`
        FUNCTION_BLOCK FB1
          VAR x: INT := 0; END_VAR
          x := x + 1;
        END_FUNCTION_BLOCK

        PROGRAM P
          VAR x: INT; END_VAR
          x := 1;
        END_PROGRAM
      `);
      expect(realErrors(errors)).toHaveLength(0);
    });
  });

  describe('TYPE declaration validation', () => {
    test('validates type declarations', () => {
      const { errors } = validateSource(`
        TYPE
          Color: (Red, Green, Blue);
        END_TYPE
      `);
      expect(realErrors(errors)).toHaveLength(0);
    });
  });
});
