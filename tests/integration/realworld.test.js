'use strict';

const fs = require('fs');
const path = require('path');
const { compile } = require('../../src/index');
const vm = require('vm');

function loadFixture(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'fixtures', name), 'utf8');
}

function compileFixture(name) {
  const src = loadFixture(name);
  const result = compile(src, { sourceMaps: false });
  if (result.errors.some(e => e.severity === 'error')) {
    throw new Error(`Compilation of ${name} failed: ` + result.errors.map(e => e.message).join('; '));
  }
  return result.code;
}

function runProgram(code) {
  const script = new vm.Script(code);
  const mod = { exports: {} };
  const ctx = vm.createContext({ module: mod, exports: mod.exports, require });
  script.runInContext(ctx);
  return mod.exports;
}

function runClass(code, className) {
  const script = new vm.Script(code + `\nmodule.exports = { ${className} };`);
  const mod = { exports: {} };
  const ctx = vm.createContext({ module: mod, exports: mod.exports, require });
  script.runInContext(ctx);
  return mod.exports[className];
}

describe('Real-world fixtures', () => {
  describe('PID Controller', () => {
    test('compiles without errors', () => {
      const code = compileFixture('pid_controller.st');
      expect(code).toBeTruthy();
    });

    test('output is positive when setpoint > process value', () => {
      const code = compileFixture('pid_controller.st');
      const PID = runClass(code, 'PID');
      const pid = new PID();

      // Run a few cycles
      for (let i = 0; i < 5; i++) {
        pid.call(100.0, 0.0, 1.0, 0.1, 0.01, 0.1, true)  // Setpoint, PV, Kp, Ki, Kd, DeltaT, Enable;
      }
      expect(pid.Output).toBeGreaterThan(0);
    });

    test('output is 0 when disabled', () => {
      const code = compileFixture('pid_controller.st');
      const PID = runClass(code, 'PID');
      const pid = new PID();

      pid.call(100.0, 0.0, 1.0, 0.1, 0.01, 0.1, false);
      expect(pid.Output).toBe(0);
    });
  });

  describe('Traffic Light State Machine', () => {
    test('compiles without errors', () => {
      const code = compileFixture('state_machine.st');
      expect(code).toBeTruthy();
    });

    test('starts in red state', () => {
      const code = compileFixture('state_machine.st');
      const exported = runProgram(code);

      exported.run();
      expect(exported.redOn).toBe(true);
      expect(exported.greenOn).toBe(false);
      expect(exported.yellowOn).toBe(false);
    });

    test('transitions through states', () => {
      const code = compileFixture('state_machine.st');
      const exported = runProgram(code);

      // Run enough cycles to get through red (counter > 5)
      for (let i = 0; i < 7; i++) {
        exported.run();
      }
      // Should have transitioned to green (state 1)
      expect(exported.greenOn).toBe(true);
    });
  });

  describe('Data Processing', () => {
    test('compiles without errors', () => {
      const code = compileFixture('data_processing.st');
      expect(code).toBeTruthy();
    });

    test('finds correct max value', () => {
      const code = compileFixture('data_processing.st');
      const exported = runProgram(code);

      exported.run();
      // max of i*3 for i=1..10 is 30
      expect(exported.maxVal).toBe(30);
    });
  });
});
