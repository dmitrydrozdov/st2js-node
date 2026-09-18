'use strict';

const {
  parse, validate, compile, compileSync,
  parseAlgorithm, compileAlgorithm, analyzeAlgorithm,
  parseExpression, compileExpression, analyzeExpression,
} = require('../../src/index');

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

  describe('parseAlgorithm()', () => {
    test('returns an AST without running validation', () => {
      const result = parseAlgorithm('Count := Missing + 1;');
      expect(result.ast).not.toBeNull();
      const validatorErrors = result.errors.filter(e => e.phase === 'validator');
      expect(validatorErrors).toHaveLength(0);
    });

    test('reports parse error', () => {
      const result = parseAlgorithm('Count := ;');
      const errs = result.errors.filter(e => e.severity === 'error');
      expect(errs.length).toBeGreaterThan(0);
    });
  });

  describe('compileAlgorithm()', () => {
    test('successful compile round-trip: simple counter', () => {
      const result = compileAlgorithm('Count := Count + 1;', [
        { name: 'Count', type: 'INT', direction: 'internal' },
      ]);
      expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
      expect(result.code).not.toBe('');
      const fn = new Function('__s', result.code);
      const scope = { Count: 4 };
      fn(scope);
      expect(scope.Count).toBe(5);
    });

    test('input read and output write', () => {
      const result = compileAlgorithm('CV := CI * 2;', [
        { name: 'CI', type: 'INT', direction: 'input' },
        { name: 'CV', type: 'INT', direction: 'output' },
      ]);
      expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
      expect(result.inputNames).toEqual(['CI']);
      expect(result.outputNames).toEqual(['CV']);
    });

    test('parse error returns empty code', () => {
      const result = compileAlgorithm('Count := ;', [
        { name: 'Count', type: 'INT', direction: 'internal' },
      ]);
      const errs = result.errors.filter(e => e.severity === 'error');
      expect(errs.length).toBeGreaterThan(0);
      expect(errs.some(e => e.phase === 'parser')).toBe(true);
      expect(result.code).toBe('');
    });

    test('validator error (write to input) returns empty code', () => {
      const result = compileAlgorithm('CI := 0;', [
        { name: 'CI', type: 'INT', direction: 'input' },
      ]);
      const errs = result.errors.filter(e => e.severity === 'error');
      expect(errs.length).toBeGreaterThan(0);
      expect(errs.some(e => e.phase === 'validator')).toBe(true);
      expect(result.code).toBe('');
    });

    test('strict mode promotes warnings to errors', () => {
      // assigning STRING to INT is a warning; strict should make it an error
      const result = compileAlgorithm('r := s;', [
        { name: 's', type: 'STRING', direction: 'input' },
        { name: 'r', type: 'INT', direction: 'output' },
      ], { strict: true });
      expect(result.errors.some(e => e.severity === 'error')).toBe(true);
      expect(result.code).toBe('');
    });

    test('duplicate descriptor names rejected', () => {
      const result = compileAlgorithm('Count := 1;', [
        { name: 'Count', type: 'INT', direction: 'input' },
        { name: 'Count', type: 'INT', direction: 'output' },
      ]);
      expect(result.errors.some(e => /Duplicate/.test(e.message))).toBe(true);
      expect(result.code).toBe('');
    });

    test('descriptor shape validation: not an array', () => {
      const result = compileAlgorithm('x := 1;', null);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.code).toBe('');
    });

    test('invalid direction rejected', () => {
      const result = compileAlgorithm('x := 1;', [
        { name: 'x', type: 'INT', direction: 'inout' },
      ]);
      expect(result.errors.some(e => /direction/.test(e.message))).toBe(true);
      expect(result.code).toBe('');
    });

    test('preserves descriptor order in name partitions', () => {
      const result = compileAlgorithm('b := a + c;', [
        { name: 'a', type: 'INT', direction: 'input' },
        { name: 'b', type: 'INT', direction: 'output' },
        { name: 'c', type: 'INT', direction: 'internal' },
      ]);
      expect(result.inputNames).toEqual(['a']);
      expect(result.outputNames).toEqual(['b']);
      expect(result.internalNames).toEqual(['c']);
    });
  });

  describe('analyzeAlgorithm()', () => {
    const vars = [
      { name: 'CI', type: 'INT', direction: 'input' },
      { name: 'CV', type: 'INT', direction: 'output' },
    ];

    test('analyzes source text and returns an annotated tree', () => {
      const result = analyzeAlgorithm('CV := CI + 1;', vars);
      expect(result.ast).not.toBeNull();
      expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
      expect(Array.isArray(result.warnings)).toBe(true);
      const assign = result.ast.statements[0];
      expect(assign.value.resolvedType).toBe('INT');
      expect(assign.target.resolvedType).toBe('INT');
      expect(assign.target.resolvedSymbol.name).toBe('CV');
      expect(assign.value.right.constant).toEqual({ type: 'INT', value: 1n });
    });

    test('analyzes a parsed tree in place and returns the same object', () => {
      const { ast } = parseAlgorithm('CV := CI + 1;');
      const result = analyzeAlgorithm(ast, vars);
      expect(result.ast).toBe(ast);
      expect(ast.statements[0].value.resolvedType).toBe('INT');
    });

    test('returns null ast and parser errors when parsing fails', () => {
      const result = analyzeAlgorithm('CV := ;', vars);
      expect(result.ast).toBeNull();
      expect(result.errors.some(e => e.phase === 'parser')).toBe(true);
      expect(result.warnings).toEqual([]);
    });

    test('rejects a non-array descriptor list and a non-source input', () => {
      expect(analyzeAlgorithm('CV := 1;', null).errors[0].phase).toBe('validator');
      expect(analyzeAlgorithm(42, vars).errors[0].phase).toBe('parser');
      expect(analyzeAlgorithm(42, vars).ast).toBeNull();
    });

    test('type violations are errors regardless of options', () => {
      const result = analyzeAlgorithm('CV := 1.5;', vars, { strict: false });
      expect(result.errors.some(e => e.severity === 'error' && e.phase === 'validator')).toBe(true);
    });

    test('strict promotes warnings to errors', () => {
      const lenient = analyzeAlgorithm('CV := Missing;', vars);
      expect(lenient.errors).toHaveLength(0);
      expect(lenient.warnings).toHaveLength(1);
      const strict = analyzeAlgorithm('CV := Missing;', vars, { strict: true });
      expect(strict.errors).toHaveLength(1);
      expect(strict.errors[0].severity).toBe('error');
    });

    test('compileAlgorithm reports the same diagnostics as analyzeAlgorithm', () => {
      for (const [src, opts] of [
        ['CV := CI + Missing;', {}],
        ['CV := CI + Missing;', { strict: true }],
        ['CV := 1.5;', {}],
        ['CV := CI;', {}],
        ['CV := ;', {}],
      ]) {
        const a = analyzeAlgorithm(src, vars, opts);
        const c = compileAlgorithm(src, vars, opts);
        expect(c.errors).toEqual(a.errors);
        expect(c.warnings).toEqual(a.warnings);
      }
    });

    test('compile results keep their shape', () => {
      const result = compileAlgorithm('CV := CI + 1;', vars);
      expect(Object.keys(result).sort()).toEqual(['code', 'errors', 'inputNames', 'internalNames', 'outputNames', 'warnings']);
      expect(typeof result.code).toBe('string');
      expect(result.inputNames).toEqual(['CI']);
      expect(result.outputNames).toEqual(['CV']);
      expect(result.internalNames).toEqual([]);
    });
  });

  describe('analyzeExpression()', () => {
    const vars = [
      { name: 'REQ', type: 'BOOL', direction: 'input' },
      { name: 'count', type: 'INT', direction: 'input' },
      { name: 'threshold', type: 'INT', direction: 'input' },
    ];

    test('annotates a parsed tree in place', () => {
      const { ast } = parseExpression('REQ AND count < threshold');
      const result = analyzeExpression(ast, vars);
      expect(result.ast).toBe(ast);
      expect(ast.resolvedType).toBe('BOOL');
      expect(ast.right.left.resolvedType).toBe('INT');
      expect(result.errors).toHaveLength(0);
    });

    test('analyzes source text', () => {
      const result = analyzeExpression('count + 1', vars);
      expect(result.ast.resolvedType).toBe('INT');
      expect(result.ast.right.constant).toEqual({ type: 'INT', value: 1n });
    });

    test('undeclared identifiers are errors', () => {
      const result = analyzeExpression('Missing > 0', []);
      expect(result.errors.some(e => e.severity === 'error' && /Missing/.test(e.message))).toBe(true);
    });

    test('compileExpression reports the same diagnostics as analyzeExpression', () => {
      for (const src of ['REQ AND count < threshold', 'count < REQ', 'Missing', 'count +']) {
        const a = analyzeExpression(src, vars);
        const c = compileExpression(src, vars);
        expect(c.errors).toEqual(a.errors);
        expect(c.warnings).toEqual(a.warnings);
      }
    });

    test('compile results keep their shape', () => {
      const result = compileExpression('count < threshold', vars);
      expect(Object.keys(result).sort()).toEqual(['code', 'errors', 'inputNames', 'internalNames', 'outputNames', 'warnings']);
      expect(result.code).toBe('(__s["count"] < __s["threshold"])');
    });
  });

  describe('validate() uses the typing pass', () => {
    test('annotates the POU tree and reports type errors', () => {
      const { ast } = parse(`
        PROGRAM P
          VAR x: INT; r: REAL; END_VAR
          x := x + 1;
          x := r;
        END_PROGRAM
      `);
      const result = validate(ast);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => /real to integer/.test(e.message))).toBe(true);
      expect(ast.declarations[0].body[0].value.resolvedType).toBe('INT');
    });
  });
});
