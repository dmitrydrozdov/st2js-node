'use strict';

const fs = require('fs');
const path = require('path');
const { compileAlgorithm } = require('../../src/index');

const FIX = path.join(__dirname, '..', 'fixtures', 'algorithms');
const readFixture = (name) => fs.readFileSync(path.join(FIX, name), 'utf8');

function buildRunner(src, variables) {
  const result = compileAlgorithm(src, variables);
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
  return new Function('__s', result.code);
}

describe('Integration: compileAlgorithm', () => {
  test('counter fixture: reset + enable increment', () => {
    const run = buildRunner(readFixture('counter.st'), [
      { name: 'Reset', type: 'BOOL', direction: 'input' },
      { name: 'Enable', type: 'BOOL', direction: 'input' },
      { name: 'Count', type: 'INT', direction: 'output' },
    ]);

    const scope = { Reset: false, Enable: true, Count: 0 };
    run(scope); expect(scope.Count).toBe(1);
    run(scope); expect(scope.Count).toBe(2);
    scope.Reset = true;
    run(scope); expect(scope.Count).toBe(0);
    scope.Reset = false; scope.Enable = false;
    run(scope); expect(scope.Count).toBe(0);
  });

  test('threshold fixture: banded state output', () => {
    const run = buildRunner(readFixture('threshold.st'), [
      { name: 'Value', type: 'INT', direction: 'input' },
      { name: 'Low', type: 'INT', direction: 'input' },
      { name: 'High', type: 'INT', direction: 'input' },
      { name: 'State', type: 'INT', direction: 'output' },
    ]);

    const s = { Value: 0, Low: 10, High: 20, State: -1 };
    s.Value = 5;  run(s); expect(s.State).toBe(0);
    s.Value = 15; run(s); expect(s.State).toBe(1);
    s.Value = 25; run(s); expect(s.State).toBe(2);
  });

  test('accumulator fixture: FOR loop sum', () => {
    const run = buildRunner(readFixture('accumulator.st'), [
      { name: 'N', type: 'INT', direction: 'input' },
      { name: 'i', type: 'INT', direction: 'internal' },
      { name: 'Sum', type: 'INT', direction: 'output' },
    ]);

    const s = { N: 10, i: 0, Sum: 0 };
    run(s);
    expect(s.Sum).toBe(55);
  });

  test('runs hundreds of times without state leaking across calls', () => {
    const run = buildRunner('Count := Count + 1;', [
      { name: 'Count', type: 'INT', direction: 'internal' },
    ]);
    const s = { Count: 0 };
    for (let i = 0; i < 500; i++) run(s);
    expect(s.Count).toBe(500);

    // A fresh scope should not inherit any state from the first run.
    const s2 = { Count: 100 };
    run(s2);
    expect(s2.Count).toBe(101);
  });
});
