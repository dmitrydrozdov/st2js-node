'use strict';

const { compile } = require('../../src/index');
const vm = require('vm');

function runCompiled(code, runtimeGlobals = {}) {
  const script = new vm.Script(code);
  const mod = { exports: {} };
  const ctx = vm.createContext({ module: mod, exports: mod.exports, require, ...runtimeGlobals });
  script.runInContext(ctx);
  return mod.exports;
}

function compileAndRun(src, runtimeGlobals = {}) {
  const result = compile(src, { sourceMaps: false });
  if (result.errors.some(e => e.severity === 'error')) {
    throw new Error('Compilation failed: ' + result.errors.map(e => e.message).join('; '));
  }
  return runCompiled(result.code, runtimeGlobals);
}

describe('Integration: compile and execute', () => {
  describe('Counter function block', () => {
    test('counts up when EN=true', () => {
      const code = compile(`
        FUNCTION_BLOCK Counter
          VAR_INPUT EN: BOOL; END_VAR
          VAR Count: INT := 0; END_VAR
          IF EN THEN Count := Count + 1; END_IF
        END_FUNCTION_BLOCK
      `, { sourceMaps: false }).code;

      // The compiled code defines a class; we need to evaluate and use it
      const script = new vm.Script(code + '\nmodule.exports = { Counter };');
      const mod = { exports: {} };
      const ctx = vm.createContext({ module: mod, exports: mod.exports, require });
      script.runInContext(ctx);
      const { Counter } = mod.exports;

      const counter = new Counter();
      counter.call(true);
      counter.call(true);
      counter.call(true);
      expect(counter.Count).toBe(3);
    });

    test('does not count when EN=false', () => {
      const code = compile(`
        FUNCTION_BLOCK Counter
          VAR_INPUT EN: BOOL; END_VAR
          VAR Count: INT := 0; END_VAR
          IF EN THEN Count := Count + 1; END_IF
        END_FUNCTION_BLOCK
      `, { sourceMaps: false }).code;

      const script = new vm.Script(code + '\nmodule.exports = { Counter };');
      const mod = { exports: {} };
      const ctx = vm.createContext({ module: mod, exports: mod.exports, require });
      script.runInContext(ctx);
      const { Counter } = mod.exports;

      const counter = new Counter();
      counter.call(false);
      counter.call(false);
      expect(counter.Count).toBe(0);
    });
  });

  describe('Fibonacci function', () => {
    test('computes Fibonacci numbers correctly', () => {
      const code = compile(`
        FUNCTION Fibonacci: DINT
          VAR_INPUT N: INT; END_VAR
          VAR a: DINT; b: DINT; temp: DINT; i: INT; END_VAR
          a := 0;
          b := 1;
          FOR i := 2 TO N DO
            temp := a + b;
            a := b;
            b := temp;
          END_FOR
          Fibonacci := b;
        END_FUNCTION
      `, { sourceMaps: false }).code;

      const script = new vm.Script(code + '\nmodule.exports = { Fibonacci };');
      const mod = { exports: {} };
      const ctx = vm.createContext({ module: mod, exports: mod.exports, require });
      script.runInContext(ctx);
      const { Fibonacci } = mod.exports;

      expect(Fibonacci(1)).toBe(1);
      expect(Fibonacci(5)).toBe(5);
      expect(Fibonacci(10)).toBe(55);
    });
  });

  describe('State machine CASE', () => {
    test('cycles through states', () => {
      const exported = compileAndRun(`
        PROGRAM SM
          VAR state: INT := 0; output: INT := 0; END_VAR
          CASE state OF
            0: output := 10; state := 1;
            1: output := 20; state := 2;
            2: output := 30; state := 0;
          END_CASE
        END_PROGRAM
      `);

      exported.run();
      expect(exported.output).toBe(10);

      exported.run();
      expect(exported.output).toBe(20);

      exported.run();
      expect(exported.output).toBe(30);
    });
  });

  describe('WHILE loop', () => {
    test('accumulates sum', () => {
      const exported = compileAndRun(`
        PROGRAM P
          VAR x: INT := 0; sum: INT := 0; END_VAR
          x := 1;
          sum := 0;
          WHILE x <= 5 DO
            sum := sum + x;
            x := x + 1;
          END_WHILE
        END_PROGRAM
      `);

      exported.run();
      expect(exported.sum).toBe(15);
    });
  });

  describe('REPEAT loop', () => {
    test('executes at least once', () => {
      const exported = compileAndRun(`
        PROGRAM P
          VAR x: INT := 0; END_VAR
          REPEAT
            x := x + 1;
          UNTIL TRUE;
        END_PROGRAM
      `);

      exported.run();
      expect(exported.x).toBe(1);
    });
  });
});
