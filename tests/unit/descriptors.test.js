'use strict';

const { compileAlgorithm, compileExpression, analyzeAlgorithm } = require('../../src/index');

const d = (name, type, direction = 'input', extra = {}) => ({ name, type, direction, ...extra });

function expectDescriptorError(result, pattern) {
  const errs = result.errors.filter(e => e.severity === 'error');
  expect(errs).toHaveLength(1);
  expect(errs[0].phase).toBe('validator');
  expect(errs[0].message).toMatch(pattern);
  expect(result.code).toBe('');
}

describe('Descriptors: arraySize and stringLength', () => {
  test('array descriptor is accepted and typed; element access executes', () => {
    const result = compileAlgorithm('x := A[1];', [d('A', 'DINT', 'input', { arraySize: 4 }), d('x', 'DINT', 'output')]);
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
    const s = { A: [10, 20, 30, 40], x: 0 };
    new Function('__s', result.code)(s);
    expect(s.x).toBe(20);
  });

  test('A[i] is typed as the element type', () => {
    const r = analyzeAlgorithm('x := A[i];', [d('A', 'DINT', 'input', { arraySize: 4 }), d('i', 'INT'), d('x', 'DINT', 'output')]);
    expect(r.errors).toHaveLength(0);
    expect(r.ast.statements[0].value.resolvedType).toBe('DINT');
    expect(r.ast.statements[0].value.array.resolvedType).toEqual({ kind: 'array', element: 'DINT', size: 4, lo: 0 });
  });

  test('stringLength is recorded on the symbol', () => {
    const r = analyzeAlgorithm("s := 'abc';", [d('s', 'STRING', 'output', { stringLength: 16 })]);
    expect(r.errors).toHaveLength(0);
    expect(r.ast.statements[0].target.resolvedSymbol.stringLength).toBe(16);
    expect(r.ast.statements[0].target.resolvedType).toBe('STRING');
  });

  test.each([
    [{ arraySize: -1 }, /arraySize of variable 'A' must be a non-negative integer, got -1/],
    [{ arraySize: 1.5 }, /arraySize.*got 1\.5/],
    [{ arraySize: '4' }, /arraySize.*got "4"/],
    [{ arraySize: NaN }, /arraySize/],
    [{ stringLength: -1 }, /stringLength of variable 'A' must be a non-negative integer/],
    [{ stringLength: 2.5 }, /stringLength/],
  ])('invalid descriptor value %o is a validator error', (extra, pattern) => {
    expectDescriptorError(compileAlgorithm('x := 1;', [d('A', 'DINT', 'input', extra), d('x', 'DINT', 'output')]), pattern);
    expectDescriptorError(compileExpression('1', [d('A', 'DINT', 'input', extra)]), pattern);
  });

  test('arraySize 0 is accepted (every index is out of range)', () => {
    const r = compileAlgorithm('x := A[0];', [d('A', 'INT', 'input', { arraySize: 0 }), d('x', 'INT', 'output')]);
    expect(r.errors.some(e => /outside 0\.\.-1/.test(e.message))).toBe(true);
  });

  test('member descriptors accept and validate arraySize and stringLength', () => {
    const P = (extra) => d('P', 'ADAPTER', 'input', { members: [{ name: 'M', type: 'INT', direction: 'input', ...extra }] });
    const ok = analyzeAlgorithm('x := P.M[1];', [P({ arraySize: 2 }), d('x', 'INT', 'output')]);
    expect(ok.errors).toHaveLength(0);
    expect(ok.ast.statements[0].value.resolvedType).toBe('INT');
    expect(ok.ast.statements[0].value.array.resolvedSymbol.arraySize).toBe(2);
    expectDescriptorError(compileAlgorithm('x := 1;', [P({ arraySize: -2 }), d('x', 'INT', 'output')]), /arraySize of member 'P.M'/);
    expectDescriptorError(compileAlgorithm('x := 1;', [P({ stringLength: 'x' }), d('x', 'INT', 'output')]), /stringLength of member 'P.M'/);
  });

  test('array descriptors are never bucketed differently', () => {
    const r = compileAlgorithm('x := A[0];', [d('A', 'INT', 'input', { arraySize: 1 }), d('x', 'INT', 'output')]);
    expect(r.inputNames).toEqual(['A']);
    expect(r.outputNames).toEqual(['x']);
  });
});
