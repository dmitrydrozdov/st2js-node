'use strict';

// Pins the examples documented in README.md to the actual output of the
// package, so the documentation cannot drift from the implementation.

const fs = require('fs');
const path = require('path');
const { compile, compileAlgorithm, compileExpression, analyzeAlgorithm } = require('../../src/index');

const readme = fs.readFileSync(path.join(__dirname, '..', '..', 'README.md'), 'utf8');

describe('README examples', () => {
  test('quick start function block output', () => {
    const { code } = compile(`
FUNCTION_BLOCK Counter
  VAR_INPUT EN: BOOL; END_VAR
  VAR Count: INT := 0; END_VAR
  IF EN THEN
    Count := Count + 1;
  END_IF
END_FUNCTION_BLOCK
`);
    const line = 'this.Count = ((this.Count + 1) << 16) >> 16;';
    expect(code).toContain(line);
    expect(readme).toContain(line);
  });

  test('compileAlgorithm counter example', () => {
    const result = compileAlgorithm(
      `IF Reset THEN
     Count := 0;
   ELSIF Enable THEN
     Count := Count + 1;
   END_IF;`,
      [
        { name: 'Reset', type: 'BOOL', direction: 'input' },
        { name: 'Enable', type: 'BOOL', direction: 'input' },
        { name: 'Count', type: 'INT', direction: 'output' },
      ],
    );
    expect(result.errors).toHaveLength(0);
    const run = new Function('__s', result.code);
    const scope = { Reset: false, Enable: true, Count: 0 };
    run(scope); expect(scope.Count).toBe(1);
    run(scope); expect(scope.Count).toBe(2);
  });

  test('compileExpression transition example', () => {
    const result = compileExpression('REQ AND count < threshold', [
      { name: 'REQ', type: 'BOOL', direction: 'input' },
      { name: 'count', type: 'INT', direction: 'input' },
      { name: 'threshold', type: 'INT', direction: 'input' },
    ]);
    const documented = '(__s["REQ"] && (__s["count"] < __s["threshold"]))';
    expect(result.code).toBe(documented);
    expect(readme).toContain(documented);
  });

  test('analyzeAlgorithm annotation example', () => {
    const { ast, errors } = analyzeAlgorithm('OUT := IN + DINT#1;', [
      { name: 'IN', type: 'INT', direction: 'input' },
      { name: 'OUT', type: 'DINT', direction: 'output' },
    ]);
    expect(errors).toHaveLength(0);
    const value = ast.statements[0].value;
    expect(value.resolvedType).toBe('DINT');
    expect(value.left.resolvedSymbol).toMatchObject({ kind: 'descriptor', name: 'IN', type: 'INT', direction: 'input' });
    expect(value.left.conversion).toEqual({ from: 'INT', to: 'DINT', implicit: true });
    expect(value.right.constant).toEqual({ type: 'DINT', value: 1n });
  });

  test('int64 examples', () => {
    const vars = [{ name: 'L', type: 'LINT', direction: 'internal' }];
    const number = compileAlgorithm('L := L + 1;', vars).code;
    const bigint = compileAlgorithm('L := L + 1;', vars, { int64: 'bigint' }).code;
    expect(number).toBe('__s["L"] = Math.trunc(__s["L"] + 1);\n');
    expect(bigint).toBe('__s["L"] = BigInt.asIntN(64, __s["L"] + 1n);\n');
    expect(readme).toContain(number.trim());
    expect(readme).toContain(bigint.trim());
  });

  test('type rule example: narrowing assignment names both types', () => {
    const r = compileAlgorithm('OUT := R;', [
      { name: 'R', type: 'LREAL', direction: 'input' },
      { name: 'OUT', type: 'DINT', direction: 'output' },
    ]);
    expect(r.code).toBe('');
    expect(r.errors[0].message).toMatch(/LREAL_TO_DINT/);
    const fixed = compileAlgorithm('OUT := LREAL_TO_DINT(R);', [
      { name: 'R', type: 'LREAL', direction: 'input' },
      { name: 'OUT', type: 'DINT', direction: 'output' },
    ]);
    expect(fixed.errors).toHaveLength(0);
  });

  test('data type table wrap forms match TypeMapper', () => {
    const TypeMapper = require('../../src/codegen/TypeMapper');
    const rows = {
      SINT: '((x) << 24) >> 24', USINT: '(x) & 0xFF', INT: '((x) << 16) >> 16',
      UINT: '(x) & 0xFFFF', DINT: '(x) | 0', UDINT: '(x) >>> 0',
    };
    for (const [type, form] of Object.entries(rows)) {
      expect(TypeMapper.wrapInteger('x', type)).toBe(form);
      expect(readme.replace(/\\\|/g, '|')).toContain(form);
    }
  });
});
