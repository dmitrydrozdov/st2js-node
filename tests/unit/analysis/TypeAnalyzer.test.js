'use strict';

const { analyzeAlgorithm, analyzeExpression, parseExpression, parse, validate } = require('../../../src/index');
const { isUntypedLiteralExpr, resolveDeclaredType } = require('../../../src/analysis/TypeAnalyzer');
const { NodeType } = require('../../../src/types');

const d = (name, type, direction = 'input', extra = {}) => ({ name, type, direction, ...extra });

function expr(src, vars) {
  const r = analyzeExpression(src, vars);
  expect(r.errors).toHaveLength(0);
  return r.ast;
}

function algo(src, vars) {
  const r = analyzeAlgorithm(src, vars);
  expect(r.errors).toHaveLength(0);
  return r.ast;
}

describe('TypeAnalyzer: literal annotations', () => {
  test('untyped integer literal defaults to DINT with an exact constant', () => {
    const ast = expr('42', []);
    expect(ast.resolvedType).toBe('DINT');
    expect(ast.constant).toEqual({ type: 'DINT', value: 42n });
  });

  test('untyped literal takes its context type', () => {
    const ast = algo('x := 7;', [d('x', 'UINT', 'output')]);
    const lit = ast.statements[0].value;
    expect(lit.resolvedType).toBe('UINT');
    expect(lit.constant).toEqual({ type: 'UINT', value: 7n });
    expect(lit.conversion).toBeUndefined();
  });

  test('integer literal in a real context becomes a real constant', () => {
    const ast = algo('r := 5;', [d('r', 'REAL', 'output')]);
    expect(ast.statements[0].value.resolvedType).toBe('REAL');
    expect(ast.statements[0].value.constant).toEqual({ type: 'REAL', value: 5 });
  });

  test('large untyped literal defaults to LINT, then ULINT', () => {
    expect(expr('9007199254740993', []).constant).toEqual({ type: 'LINT', value: 9007199254740993n });
    expect(expr('18446744073709551615', []).resolvedType).toBe('ULINT');
  });

  test('real literal defaults to REAL and adapts to LREAL', () => {
    expect(expr('2.5', []).constant).toEqual({ type: 'REAL', value: 2.5 });
    const ast = algo('l := 2.5;', [d('l', 'LREAL', 'output')]);
    expect(ast.statements[0].value.resolvedType).toBe('LREAL');
  });

  test('bool, string, time, and date literals', () => {
    expect(expr('TRUE', []).constant).toEqual({ type: 'BOOL', value: true });
    expect(expr("'abc'", []).constant).toEqual({ type: 'STRING', value: 'abc' });
    expect(expr('"abc"', []).resolvedType).toBe('WSTRING');
    expect(expr('T#1s500ms', []).constant).toEqual({ type: 'TIME', value: 1500 });
    expect(expr('D#2024-01-01', []).constant).toEqual({ type: 'DATE', value: 'D#2024-01-01' });
    const ws = algo("s := 'x';", [d('s', 'WSTRING', 'output')]);
    expect(ws.statements[0].value.resolvedType).toBe('WSTRING');
  });

  test.each([
    ['DINT#1', 'DINT', 1n],
    ['DINT#-5', 'DINT', -5n],
    ['INT#+42', 'INT', 42n],
    ['WORD#16#FF', 'WORD', 255n],
    ['BYTE#2#1010', 'BYTE', 10n],
    ['LWORD#16#FFFFFFFFFFFFFFFF', 'LWORD', 18446744073709551615n],
    ['REAL#2.5', 'REAL', 2.5],
    ['LREAL#1.5e3', 'LREAL', 1500],
    ['BOOL#TRUE', 'BOOL', true],
    ["STRING#'a'", 'STRING', 'a'],
    ['TIME#1s', 'TIME', 1000],
    ['DT#2024-01-01-00:00:00', 'DATE_AND_TIME', '2024-01-01-00:00:00'],
    ['TOD#12:30:00', 'TIME_OF_DAY', '12:30:00'],
    ['DATE#2024-01-01', 'DATE', '2024-01-01'],
  ])('typed literal %s folds to a %s constant', (src, type, value) => {
    const ast = expr(src, []);
    expect(ast.resolvedType).toBe(type);
    expect(ast.constant).toEqual({ type, value });
    expect(ast.value.resolvedType).toBe(type);
    expect(ast.value.constant).toEqual({ type, value });
  });

  test('typed literal keeps its type regardless of context and records a conversion', () => {
    const ast = algo('d := INT#5;', [d('d', 'DINT', 'output')]);
    expect(ast.statements[0].value.resolvedType).toBe('INT');
    expect(ast.statements[0].value.conversion).toEqual({ from: 'INT', to: 'DINT', implicit: true });
  });

  test('negated literal is folded onto the unary node', () => {
    const ast = algo('s := -128;', [d('s', 'SINT', 'output')]);
    const u = ast.statements[0].value;
    expect(u.type).toBe(NodeType.UNARY_EXPR);
    expect(u.resolvedType).toBe('SINT');
    expect(u.constant).toEqual({ type: 'SINT', value: -128n });
    expect(u.operand.resolvedType).toBe('SINT');
    const r = expr('-2.5', []);
    expect(r.constant).toEqual({ type: 'REAL', value: -2.5 });
  });

  test('isUntypedLiteralExpr', () => {
    const ast = parseExpression('-(1 + 2) * 3').ast;
    expect(isUntypedLiteralExpr(ast)).toBe(true);
    expect(isUntypedLiteralExpr(parseExpression('x + 1').ast)).toBe(false);
    expect(isUntypedLiteralExpr(parseExpression('INT#1').ast)).toBe(false);
    expect(isUntypedLiteralExpr(null)).toBe(false);
  });

  test('literal-only arithmetic takes the assignment context', () => {
    const ast = algo('x := 1 + 2 * 3;', [d('x', 'INT', 'output')]);
    const v = ast.statements[0].value;
    expect(v.resolvedType).toBe('INT');
    expect(v.left.constant).toEqual({ type: 'INT', value: 1n });
    expect(v.right.resolvedType).toBe('INT');
    expect(v.right.right.constant.type).toBe('INT');
  });
});

describe('TypeAnalyzer: identifiers, members, arrays, calls', () => {
  test('identifier resolves to its descriptor', () => {
    const ast = expr('count', [d('count', 'INT')]);
    expect(ast.resolvedType).toBe('INT');
    expect(ast.resolvedSymbol).toMatchObject({ kind: 'descriptor', name: 'count', type: 'INT', direction: 'input' });
    expect(ast.resolvedSymbol.descriptor).toEqual(d('count', 'INT'));
  });

  test('string descriptor records stringLength on the symbol', () => {
    const ast = expr('s', [d('s', 'STRING', 'input', { stringLength: 80 })]);
    expect(ast.resolvedType).toBe('STRING');
    expect(ast.resolvedSymbol.stringLength).toBe(80);
  });

  test('composite member access is typed and names the member and access key', () => {
    const ast = expr('P.VALUE', [
      d('P', 'ADAPTER', 'input', { members: [{ name: 'VALUE', type: 'REAL', direction: 'input', accessKey: 'P__VALUE' }] }),
    ]);
    expect(ast.resolvedType).toBe('REAL');
    expect(ast.resolvedSymbol).toMatchObject({ kind: 'member', parent: 'P', name: 'VALUE', type: 'REAL', accessKey: 'P__VALUE', direction: 'input' });
    expect(ast.object.resolvedSymbol.kind).toBe('composite');
  });

  test('array access with arraySize yields the element type', () => {
    const ast = algo('x := A[2];', [d('A', 'DINT', 'input', { arraySize: 4 }), d('x', 'DINT', 'output')]);
    const access = ast.statements[0].value;
    expect(access.type).toBe(NodeType.ARRAY_ACCESS);
    expect(access.resolvedType).toBe('DINT');
    expect(access.conversion).toBeUndefined();
    expect(access.array.resolvedType).toEqual({ kind: 'array', element: 'DINT', size: 4, lo: 0 });
    expect(access.array.resolvedSymbol.arraySize).toBe(4);
    expect(access.indices[0].resolvedType).toBe('DINT');
  });

  test('array access with a variable index', () => {
    const ast = algo('x := A[i];', [d('A', 'INT', 'input', { arraySize: 4 }), d('i', 'INT'), d('x', 'INT', 'output')]);
    expect(ast.statements[0].value.resolvedType).toBe('INT');
  });

  test('composite member with arraySize', () => {
    const ast = expr('P.ARR[1]', [
      d('P', 'ADAPTER', 'input', { members: [{ name: 'ARR', type: 'UINT', direction: 'input', arraySize: 2 }] }),
    ]);
    expect(ast.resolvedType).toBe('UINT');
  });

  test('standard function is typed by signature', () => {
    expect(expr('ABS(v)', [d('v', 'DINT')]).resolvedType).toBe('DINT');
    expect(expr('SQRT(r)', [d('r', 'LREAL')]).resolvedType).toBe('LREAL');
    expect(expr('LEN(s)', [d('s', 'STRING')]).resolvedType).toBe('INT');
    expect(expr('LEFT(s, 2)', [d('s', 'WSTRING')]).resolvedType).toBe('WSTRING');
    expect(expr('REAL_TO_DINT(r)', [d('r', 'REAL')]).resolvedType).toBe('DINT');
    expect(expr('SEL(b, 1, 2)', [d('b', 'BOOL')]).resolvedType).toBe('DINT');
    expect(expr('MUX(k, a, b, c)', [d('k', 'INT'), d('a', 'REAL'), d('b', 'REAL'), d('c', 'REAL')]).resolvedType).toBe('REAL');
    expect(expr('SHL(w, 2)', [d('w', 'WORD')]).resolvedType).toBe('WORD');
    expect(expr('ATAN2(y, x)', [d('y', 'REAL'), d('x', 'LREAL')]).resolvedType).toBe('LREAL');
    expect(expr('DINT_TO_TIME(t)', [d('t', 'DINT')]).resolvedType).toBe('TIME');
  });

  test('homogeneous arguments take the anchor type and record conversions', () => {
    const ast = expr('MAX(i, d)', [d('i', 'INT'), d('d', 'DINT')]);
    expect(ast.resolvedType).toBe('DINT');
    expect(ast.args[0].conversion).toEqual({ from: 'INT', to: 'DINT', implicit: true });
    expect(ast.args[1].conversion).toBeUndefined();
    const lim = expr('LIMIT(0, x, 100)', [d('x', 'INT')]);
    expect(lim.resolvedType).toBe('INT');
    expect(lim.args[0].constant.type).toBe('INT');
    expect(lim.args[2].constant.type).toBe('INT');
  });

  test('literal-only homogeneous arguments take the assignment context', () => {
    const ast = algo('x := MAX(1, 2);', [d('x', 'INT', 'output')]);
    expect(ast.statements[0].value.resolvedType).toBe('INT');
    expect(ast.statements[0].value.args[0].constant.type).toBe('INT');
  });

  test('TRUNC takes the integer type the context requires', () => {
    const ast = algo('i := TRUNC(r); j := TRUNC(r);', [d('r', 'REAL'), d('i', 'INT', 'output'), d('j', 'LINT', 'output')]);
    expect(ast.statements[0].value.resolvedType).toBe('INT');
    expect(ast.statements[1].value.resolvedType).toBe('LINT');
    expect(expr('TRUNC(r)', [d('r', 'REAL')]).resolvedType).toBe('DINT');
  });

  test('concrete parameter class records a widening conversion on the argument', () => {
    const ast = expr('DINT_TO_REAL(i)', [d('i', 'INT')]);
    expect(ast.resolvedType).toBe('REAL');
    expect(ast.args[0].conversion).toEqual({ from: 'INT', to: 'DINT', implicit: true });
  });

  test('named arguments to a standard function are typed positionally', () => {
    const ast = expr('ABS(IN := v)', [d('v', 'INT')]);
    expect(ast.resolvedType).toBe('INT');
  });
});

describe('TypeAnalyzer: operators', () => {
  test('arithmetic resolves to the wider operand type with a conversion on the narrower one', () => {
    const ast = expr('a + b', [d('a', 'INT'), d('b', 'DINT')]);
    expect(ast.resolvedType).toBe('DINT');
    expect(ast.left.conversion).toEqual({ from: 'INT', to: 'DINT', implicit: true });
    expect(ast.right.conversion).toBeUndefined();
  });

  test('comparison yields BOOL without conversions for equal types', () => {
    const ast = expr('count < threshold', [d('count', 'INT'), d('threshold', 'INT')]);
    expect(ast.resolvedType).toBe('BOOL');
    expect(ast.left.conversion).toBeUndefined();
    expect(ast.right.conversion).toBeUndefined();
  });

  test('literal opposite a typed operand takes its type', () => {
    const ast = expr('count < 5', [d('count', 'INT')]);
    expect(ast.right.constant).toEqual({ type: 'INT', value: 5n });
    const ast2 = expr('5 * count', [d('count', 'USINT')]);
    expect(ast2.left.constant.type).toBe('USINT');
    expect(ast2.resolvedType).toBe('USINT');
  });

  test('boolean expression tree from the spec', () => {
    const ast = expr('REQ AND count < threshold', [d('REQ', 'BOOL'), d('count', 'INT'), d('threshold', 'INT')]);
    expect(ast.resolvedType).toBe('BOOL');
    expect(ast.left.resolvedType).toBe('BOOL');
    expect(ast.right.resolvedType).toBe('BOOL');
    expect(ast.right.left.resolvedSymbol.name).toBe('count');
  });

  test('bitwise operators on bit strings and NOT', () => {
    const ast = expr('w AND 16#FF', [d('w', 'WORD')]);
    expect(ast.resolvedType).toBe('WORD');
    expect(ast.right.constant).toEqual({ type: 'WORD', value: 255n });
    expect(expr('NOT w', [d('w', 'WORD')]).resolvedType).toBe('WORD');
    expect(expr('NOT b', [d('b', 'BOOL')]).resolvedType).toBe('BOOL');
    expect(expr('b1 XOR b2', [d('b1', 'BOOL'), d('b2', 'BOOL')]).resolvedType).toBe('BOOL');
    const mixed = expr('dw OR w', [d('dw', 'DWORD'), d('w', 'WORD')]);
    expect(mixed.resolvedType).toBe('DWORD');
    expect(mixed.right.conversion).toEqual({ from: 'WORD', to: 'DWORD', implicit: true });
  });

  test('integer and real arithmetic', () => {
    expect(expr('i * 2.5', [d('i', 'INT')]).resolvedType).toBe('REAL');
    const ast = expr('r + i', [d('r', 'REAL'), d('i', 'INT')]);
    expect(ast.right.conversion).toEqual({ from: 'INT', to: 'REAL', implicit: true });
    expect(expr('7.0 / 2.0', []).resolvedType).toBe('REAL');
    expect(expr('a / b', [d('a', 'DINT'), d('b', 'DINT')]).resolvedType).toBe('DINT');
    expect(expr('a MOD b', [d('a', 'DINT'), d('b', 'INT')]).resolvedType).toBe('DINT');
    expect(expr('r ** 2', [d('r', 'REAL')]).resolvedType).toBe('REAL');
    expect(expr('-i', [d('i', 'INT')]).resolvedType).toBe('INT');
  });
});

describe('TypeAnalyzer: statements', () => {
  test('assignment records a widening conversion on the value', () => {
    const ast = algo('d := i;', [d('i', 'INT'), d('d', 'DINT', 'output')]);
    const stmt = ast.statements[0];
    expect(stmt.target.resolvedType).toBe('DINT');
    expect(stmt.value.resolvedType).toBe('INT');
    expect(stmt.value.conversion).toEqual({ from: 'INT', to: 'DINT', implicit: true });
  });

  test('conditions, loops, and case labels are typed', () => {
    const ast = algo(`
      IF flag THEN x := 1; ELSIF x > 2 THEN x := 2; END_IF;
      WHILE x < 10 DO x := x + 1; END_WHILE;
      REPEAT x := x - 1; UNTIL x = 0 END_REPEAT;
      FOR i := 0 TO 10 BY 2 DO x := x + i; END_FOR;
      CASE x OF 1, 2: y := 1; 3..5: y := 2; ELSE y := 0; END_CASE;
    `, [d('flag', 'BOOL'), d('x', 'INT', 'internal'), d('i', 'INT', 'internal'), d('y', 'INT', 'output')]);
    const [ifS, whileS, repeatS, forS, caseS] = ast.statements;
    expect(ifS.condition.resolvedType).toBe('BOOL');
    expect(ifS.elsifClauses[0].condition.resolvedType).toBe('BOOL');
    expect(whileS.condition.resolvedType).toBe('BOOL');
    expect(repeatS.condition.resolvedType).toBe('BOOL');
    expect(forS.variable.resolvedType).toBe('INT');
    expect(forS.from.constant.type).toBe('INT');
    expect(forS.to.constant.type).toBe('INT');
    expect(forS.by.constant.type).toBe('INT');
    expect(caseS.discriminant.resolvedType).toBe('INT');
    expect(caseS.clauses[0].values[0].constant).toEqual({ type: 'INT', value: 1n });
    const range = caseS.clauses[1].values[0];
    expect(range.type).toBe(NodeType.RANGE_LITERAL);
    expect(range.resolvedType).toBe('INT');
    expect(range.lo.constant.type).toBe('INT');
    expect(range.hi.constant.type).toBe('INT');
  });

  test('FOR bounds of a narrower type record conversions', () => {
    const ast = algo('FOR i := lo TO 10 DO x := i; END_FOR;', [d('i', 'DINT', 'internal'), d('lo', 'INT'), d('x', 'DINT', 'output')]);
    expect(ast.statements[0].from.conversion).toEqual({ from: 'INT', to: 'DINT', implicit: true });
  });

  test('CASE labels may be identifiers of the selector type', () => {
    const ast = algo('CASE x OF LO..HI: y := 1; END_CASE;', [d('x', 'INT'), d('LO', 'INT'), d('HI', 'INT'), d('y', 'INT', 'output')]);
    const range = ast.statements[0].clauses[0].values[0];
    expect(range.lo.resolvedSymbol.name).toBe('LO');
    expect(range.resolvedType).toBe('INT');
  });

  test('function call statement is typed', () => {
    const ast = algo('ABS(x);', [d('x', 'INT')]);
    expect(ast.statements[0].call.resolvedType).toBe('INT');
  });
});

describe('TypeAnalyzer: POU trees', () => {
  function pou(src) {
    const { ast, errors } = parse(src);
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
    const result = validate(ast);
    return { ast, result };
  }

  test('POU variables resolve to their declared types', () => {
    const { ast, result } = pou(`
      PROGRAM P
        VAR x: INT := 1; y: DINT; s: STRING[20]; arr: ARRAY[1..10] OF INT; i: INT; END_VAR
        y := x + 1;
        arr[i] := x;
        s := 'hi';
      END_PROGRAM
    `);
    expect(result.errors).toHaveLength(0);
    const body = ast.declarations[0].body;
    expect(body[0].value.resolvedType).toBe('INT');
    expect(body[0].value.conversion).toEqual({ from: 'INT', to: 'DINT', implicit: true });
    expect(body[0].value.left.resolvedSymbol).toMatchObject({ kind: 'variable', name: 'x', type: 'INT', varKind: 'VAR' });
    expect(body[1].target.resolvedType).toBe('INT');
    expect(body[1].target.array.resolvedType).toEqual({ kind: 'array', element: 'INT', lo: 1, size: 10 });
    expect(body[2].target.resolvedSymbol.stringLength).toBe(20);
    const init = ast.declarations[0].varSections[0].declarations[0].initialValue;
    expect(init.constant).toEqual({ type: 'INT', value: 1n });
  });

  test('function return symbol, function calls, and FB members', () => {
    const { ast, result } = pou(`
      FUNCTION_BLOCK FB
        VAR_INPUT en: BOOL; END_VAR
        VAR_OUTPUT q: INT; END_VAR
        IF en THEN q := q + 1; END_IF
      END_FUNCTION_BLOCK
      FUNCTION Twice: DINT
        VAR_INPUT n: INT; END_VAR
        Twice := n * 2;
      END_FUNCTION
      PROGRAM P
        VAR fb: FB; d: DINT; t: TON; END_VAR
        fb(en := TRUE);
        d := Twice(n := 3) + fb.q;
        t(IN := TRUE, PT := T#1s);
        IF t.Q THEN d := 0; END_IF
      END_PROGRAM
    `);
    expect(result.errors).toHaveLength(0);
    const fn = ast.declarations[1];
    expect(fn.body[0].target.resolvedSymbol.kind).toBe('return');
    expect(fn.body[0].target.resolvedType).toBe('DINT');
    expect(fn.body[0].value.resolvedType).toBe('INT');
    const prog = ast.declarations[2];
    const sum = prog.body[1].value;
    expect(sum.left.resolvedType).toBe('DINT');
    expect(sum.right.resolvedType).toBe('INT');
    expect(sum.right.resolvedSymbol).toMatchObject({ kind: 'variable', name: 'q', varKind: 'VAR_OUTPUT' });
    expect(sum.resolvedType).toBe('DINT');
    expect(prog.body[3].condition.resolvedType).toBeNull(); // TON is opaque
  });

  test('user types: aliases, subranges, structs, and enumerations', () => {
    const { ast, result } = pou(`
      TYPE
        Counter: INT;
        Small: INT (0..10);
        Point: STRUCT x: REAL; y: REAL; END_STRUCT;
        Colour: (Red, Green);
      END_TYPE
      PROGRAM P
        VAR c: Counter; s: Small; p: Point; col: Colour; r: REAL; END_VAR
        c := s + 1;
        r := p.x * 2.0;
        col := Colour#Red;
        IF col = Colour#Green THEN r := 0.0; END_IF
      END_PROGRAM
    `);
    expect(result.errors).toHaveLength(0);
    const body = ast.declarations[1].body;
    expect(body[0].target.resolvedType).toBe('INT');
    expect(body[0].value.left.resolvedType).toBe('INT');
    expect(body[1].value.left.resolvedType).toBe('REAL');
    expect(body[1].value.left.resolvedSymbol).toMatchObject({ kind: 'field', name: 'x', type: 'REAL' });
    expect(body[2].value.resolvedType).toBe('Colour');
    expect(body[2].value.constant).toEqual({ type: 'Colour', value: 'Red' });
    expect(body[2].value.value.resolvedSymbol).toMatchObject({ kind: 'enum', name: 'Red' });
    expect(body[3].condition.resolvedType).toBe('BOOL');
  });

  test('resolveDeclaredType handles the declared type node shapes', () => {
    const prim = (name) => ({ type: NodeType.PRIMITIVE_TYPE, name });
    const lit = (value) => ({ type: NodeType.INTEGER_LITERAL, value, bigValue: BigInt(value) });
    expect(resolveDeclaredType(prim('dint'))).toBe('DINT');
    expect(resolveDeclaredType(prim('TOD'))).toBe('TIME_OF_DAY');
    expect(resolveDeclaredType({ type: NodeType.STRING_TYPE, kind: 'WSTRING' })).toBe('WSTRING');
    expect(resolveDeclaredType({ type: NodeType.ARRAY_TYPE, elementType: prim('INT'), dimensions: [{ lo: lit(0), hi: lit(3) }] }))
      .toEqual({ kind: 'array', element: 'INT', lo: 0, size: 4 });
    expect(resolveDeclaredType({ type: NodeType.ARRAY_TYPE, elementType: prim('INT'), dimensions: [{ lo: lit(0), hi: lit(3) }, { lo: lit(0), hi: lit(1) }] }))
      .toEqual({ kind: 'array', element: 'INT' });
    expect(resolveDeclaredType({ type: NodeType.ARRAY_TYPE, elementType: prim('INT'), dimensions: [{ lo: { type: NodeType.UNARY_EXPR, operator: '-', operand: lit(2) }, hi: lit(2) }] }))
      .toEqual({ kind: 'array', element: 'INT', lo: -2, size: 5 });
    expect(resolveDeclaredType(prim('ANY'))).toBeNull();
    expect(resolveDeclaredType(null)).toBeNull();
    expect(resolveDeclaredType(prim('MyFB'))).toBe('MyFB');
    expect(resolveDeclaredType({ type: 'Weird', name: 'X' })).toBe('X');
  });
});
