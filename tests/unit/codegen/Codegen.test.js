'use strict';

const { compile } = require('../../../src/index');

function getCode(src) {
  const result = compile(src, { sourceMaps: false });
  if (result.errors.some(e => e.severity === 'error')) {
    throw new Error('Compilation failed: ' + result.errors.map(e => e.message).join('; '));
  }
  return result.code;
}

describe('Codegen', () => {
  describe('FUNCTION_BLOCK generates class', () => {
    test('generates class with constructor and call()', () => {
      const code = getCode(`
        FUNCTION_BLOCK Counter
          VAR_INPUT EN: BOOL; END_VAR
          VAR Count: INT := 0; END_VAR
          IF EN THEN Count := Count + 1; END_IF
        END_FUNCTION_BLOCK
      `);
      expect(code).toContain('class Counter');
      expect(code).toContain('constructor()');
      expect(code).toContain('call(EN)');
    });

    test('instance vars use this. prefix', () => {
      const code = getCode(`
        FUNCTION_BLOCK FB1
          VAR x: INT := 0; END_VAR
          x := x + 1;
        END_FUNCTION_BLOCK
      `);
      expect(code).toContain('this.x');
    });
  });

  describe('FUNCTION generates function', () => {
    test('generates function with return', () => {
      const code = getCode(`
        FUNCTION Add: INT
          VAR_INPUT a: INT; b: INT; END_VAR
          Add := a + b;
        END_FUNCTION
      `);
      expect(code).toContain('function Add(a, b)');
      expect(code).toContain('return _result;');
    });

    test('assignments to function name go to _result', () => {
      const code = getCode(`
        FUNCTION Foo: INT
          VAR_INPUT x: INT; END_VAR
          Foo := x + 1;
        END_FUNCTION
      `);
      expect(code).toContain('_result =');
      expect(code).not.toMatch(/\bFoo\s*=/);
    });
  });

  describe('PROGRAM generates module', () => {
    test('generates run() and exports', () => {
      const code = getCode(`
        PROGRAM Main
          VAR x: INT := 0; END_VAR
          x := x + 1;
        END_PROGRAM
      `);
      expect(code).toContain('function run()');
      expect(code).toContain('module.exports');
    });
  });

  describe('control flow', () => {
    test('IF generates if/else if/else', () => {
      const code = getCode(`
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
      expect(code).toContain('if (');
      expect(code).toContain('} else if (');
      expect(code).toContain('} else {');
    });

    test('CASE generates switch/case with break', () => {
      const code = getCode(`
        PROGRAM P
          VAR x: INT; END_VAR
          CASE x OF
            0: x := 10;
            1: x := 20;
          END_CASE
        END_PROGRAM
      `);
      expect(code).toContain('switch (');
      expect(code).toContain('case 0:');
      expect(code).toContain('case 1:');
      expect(code).toContain('break;');
    });

    test('FOR generates for loop', () => {
      const code = getCode(`
        PROGRAM P
          VAR i: INT; END_VAR
          FOR i := 0 TO 10 DO
            i := i;
          END_FOR
        END_PROGRAM
      `);
      expect(code).toContain('for (');
    });

    test('WHILE generates while loop', () => {
      const code = getCode(`
        PROGRAM P
          VAR x: BOOL; END_VAR
          WHILE x DO x := FALSE; END_WHILE
        END_PROGRAM
      `);
      expect(code).toContain('while (');
    });

    test('REPEAT generates do/while loop', () => {
      const code = getCode(`
        PROGRAM P
          VAR x: INT; END_VAR
          REPEAT x := x + 1; UNTIL x > 10;
        END_PROGRAM
      `);
      expect(code).toContain('do {');
      expect(code).toContain('} while (');
    });
  });

  describe('integer clamping', () => {
    test('integer assignment uses | 0', () => {
      const code = getCode(`
        PROGRAM P
          VAR x: INT; y: INT; END_VAR
          x := y + 1;
        END_PROGRAM
      `);
      expect(code).toContain('| 0');
    });
  });

  describe('operators', () => {
    test('AND becomes &&', () => {
      const code = getCode(`
        PROGRAM P
          VAR a: BOOL; b: BOOL; c: BOOL; END_VAR
          c := a AND b;
        END_PROGRAM
      `);
      expect(code).toContain('&&');
    });

    test('OR becomes ||', () => {
      const code = getCode(`
        PROGRAM P
          VAR a: BOOL; b: BOOL; c: BOOL; END_VAR
          c := a OR b;
        END_PROGRAM
      `);
      expect(code).toContain('||');
    });

    test('NOT becomes !', () => {
      const code = getCode(`
        PROGRAM P
          VAR a: BOOL; b: BOOL; END_VAR
          b := NOT a;
        END_PROGRAM
      `);
      expect(code).toContain('!');
    });

    test('<> becomes !==', () => {
      const code = getCode(`
        PROGRAM P
          VAR a: BOOL; x: INT; END_VAR
          a := x <> 0;
        END_PROGRAM
      `);
      expect(code).toContain('!==');
    });

    test('= becomes ===', () => {
      const code = getCode(`
        PROGRAM P
          VAR a: BOOL; x: INT; END_VAR
          a := x = 0;
        END_PROGRAM
      `);
      expect(code).toContain('===');
    });

    test('MOD becomes %', () => {
      const code = getCode(`
        PROGRAM P
          VAR x: INT; END_VAR
          x := 10 MOD 3;
        END_PROGRAM
      `);
      expect(code).toContain('%');
    });

    test('** becomes **', () => {
      const code = getCode(`
        PROGRAM P
          VAR x: INT; END_VAR
          x := 2 ** 3;
        END_PROGRAM
      `);
      expect(code).toContain('**');
    });

    test('XOR on BOOL uses !== comparison', () => {
      const code = getCode(`
        PROGRAM P
          VAR a: BOOL; b: BOOL; c: BOOL; END_VAR
          c := a XOR b;
        END_PROGRAM
      `);
      expect(code).toContain('!==');
    });
  });

  describe('variable defaults', () => {
    test('BOOL defaults to false', () => {
      const code = getCode(`
        PROGRAM P
          VAR x: BOOL; END_VAR
          x := TRUE;
        END_PROGRAM
      `);
      expect(code).toContain('let x = false');
    });

    test('REAL defaults to 0', () => {
      const code = getCode(`
        PROGRAM P
          VAR x: REAL; END_VAR
          x := 1.0;
        END_PROGRAM
      `);
      expect(code).toContain('let x = 0');
    });

    test('STRING defaults to empty string', () => {
      const code = getCode(`
        PROGRAM P
          VAR s: STRING; END_VAR
          s := 'hello';
        END_PROGRAM
      `);
      expect(code).toContain("let s = ''");
    });

    test('TIME defaults to 0', () => {
      const code = getCode(`
        PROGRAM P
          VAR t: TIME; END_VAR
          t := T#1s;
        END_PROGRAM
      `);
      expect(code).toContain('let t = 0');
    });
  });

  describe('literals in codegen', () => {
    test('bool literal TRUE becomes true', () => {
      const code = getCode(`
        PROGRAM P
          VAR x: BOOL; END_VAR
          x := TRUE;
        END_PROGRAM
      `);
      expect(code).toContain('= true');
    });

    test('string literal is quoted', () => {
      const code = getCode(`
        PROGRAM P
          VAR s: STRING; END_VAR
          s := 'hello';
        END_PROGRAM
      `);
      expect(code).toContain('"hello"');
    });

    test('time literal outputs ms value', () => {
      const code = getCode(`
        PROGRAM P
          VAR t: TIME; END_VAR
          t := T#500ms;
        END_PROGRAM
      `);
      expect(code).toContain('500');
    });
  });

  describe('function with RETURN', () => {
    test('RETURN generates return _result', () => {
      const code = getCode(`
        FUNCTION Foo: INT
          VAR_INPUT x: INT; END_VAR
          IF x > 0 THEN RETURN; END_IF
          Foo := x;
        END_FUNCTION
      `);
      expect(code).toContain('return _result;');
    });
  });

  describe('EXIT and CONTINUE', () => {
    test('EXIT generates break', () => {
      const code = getCode(`
        PROGRAM P
          VAR i: INT; END_VAR
          FOR i := 0 TO 10 DO EXIT; END_FOR
        END_PROGRAM
      `);
      expect(code).toContain('break;');
    });

    test('CONTINUE generates continue', () => {
      const code = getCode(`
        PROGRAM P
          VAR i: INT; END_VAR
          FOR i := 0 TO 10 DO CONTINUE; END_FOR
        END_PROGRAM
      `);
      expect(code).toContain('continue;');
    });
  });

  describe('FOR with BY step', () => {
    test('FOR with BY generates step-aware loop', () => {
      const code = getCode(`
        PROGRAM P
          VAR i: INT; END_VAR
          FOR i := 0 TO 100 BY 5 DO
            i := i;
          END_FOR
        END_PROGRAM
      `);
      expect(code).toContain('for (');
      expect(code).toContain('5');
    });
  });

  describe('member access in codegen', () => {
    test('a.b generates a.b', () => {
      const code = getCode(`
        PROGRAM P
          VAR x: INT; END_VAR
          x := a.b;
        END_PROGRAM
      `);
      expect(code).toContain('a.b');
    });
  });

  describe('array access in codegen', () => {
    test('arr[i] generates arr[i]', () => {
      const code = getCode(`
        PROGRAM P
          VAR arr: ARRAY[1..10] OF INT; i: INT; END_VAR
          arr[i] := 5;
        END_PROGRAM
      `);
      expect(code).toContain('[i]');
    });
  });

  describe('function call in codegen', () => {
    test('function call generates callee(args)', () => {
      const code = getCode(`
        PROGRAM P
          VAR x: INT; END_VAR
          x := MAX(1, 2);
        END_PROGRAM
      `);
      expect(code).toContain('MAX(1, 2)');
    });
  });

  describe('FUNCTION_BLOCK with input and output', () => {
    test('inputs are call() parameters, outputs are this.', () => {
      const code = getCode(`
        FUNCTION_BLOCK MyFB
          VAR_INPUT en: BOOL; END_VAR
          VAR_OUTPUT result: INT; END_VAR
          VAR count: INT := 0; END_VAR
          IF en THEN
            count := count + 1;
            result := count;
          END_IF
        END_FUNCTION_BLOCK
      `);
      expect(code).toContain('call(en)');
      expect(code).toContain('this.result');
      expect(code).toContain('this.count');
    });
  });

  describe('TYPE declaration codegen', () => {
    test('enum type generates frozen object', () => {
      const code = getCode(`
        TYPE
          Color: (Red, Green, Blue);
        END_TYPE
      `);
      expect(code).toContain('Object.freeze');
      expect(code).toContain('Red');
    });

    test('struct type generates class', () => {
      const code = getCode(`
        TYPE
          Point: STRUCT
            x: REAL;
            y: REAL;
          END_STRUCT;
        END_TYPE
      `);
      expect(code).toContain('class Point');
      expect(code).toContain('this.x');
      expect(code).toContain('this.y');
    });
  });

  describe('source maps comment', () => {
    test('with sourceMaps=true includes ST line comments', () => {
      const result = compile(`
        PROGRAM P
          VAR x: INT; END_VAR
          x := 1;
        END_PROGRAM
      `, { sourceMaps: true });
      expect(result.code).toContain('// ST line');
    });

    test('sourceMap object returned when sourceMaps=true', () => {
      const result = compile(`
        PROGRAM P
          VAR x: INT; END_VAR
          x := 1;
        END_PROGRAM
      `, { sourceMaps: true });
      expect(result.sourceMap).not.toBeNull();
    });
  });

  describe('unary minus in codegen', () => {
    test('generates negation', () => {
      const code = getCode(`
        PROGRAM P
          VAR x: INT; END_VAR
          x := -5;
        END_PROGRAM
      `);
      expect(code).toContain('-(');
    });
  });

  describe('CASE with ELSE', () => {
    test('generates default clause', () => {
      const code = getCode(`
        PROGRAM P
          VAR x: INT; END_VAR
          CASE x OF
            0: x := 1;
          ELSE
            x := 99;
          END_CASE
        END_PROGRAM
      `);
      expect(code).toContain('default:');
    });
  });

  describe('program with no vars', () => {
    test('generates simple exports', () => {
      const code = getCode(`
        PROGRAM P
        END_PROGRAM
      `);
      expect(code).toContain('module.exports = { run }');
    });
  });

  describe('REAL assignment does not clamp', () => {
    test('REAL assignment has no | 0', () => {
      const code = getCode(`
        PROGRAM P
          VAR x: REAL; END_VAR
          x := 3.14;
        END_PROGRAM
      `);
      // The assignment line for x should not have | 0
      const lines = code.split('\n');
      const assignLine = lines.find(l => l.includes('x = 3.14'));
      expect(assignLine).toBeDefined();
      expect(assignLine).not.toContain('| 0');
    });
  });
});
