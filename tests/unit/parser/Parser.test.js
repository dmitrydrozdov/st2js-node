'use strict';

const Lexer = require('../../../src/lexer/Lexer');
const Parser = require('../../../src/parser/Parser');
const ASTBuilder = require('../../../src/parser/ASTBuilder');
const { NodeType, VarKind } = require('../../../src/types');

function parseSource(src) {
  const lexer = new Lexer(src);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, src);
  const cst = parser.parse();
  const builder = new ASTBuilder(src);
  return { ast: builder.build(cst), errors: [...lexer.errors, ...parser.errors] };
}

function getDecl(src) {
  const { ast } = parseSource(src);
  return ast.declarations[0];
}

describe('Parser', () => {
  describe('FUNCTION_BLOCK declaration', () => {
    test('parses name, varSections, and body', () => {
      const decl = getDecl(`
        FUNCTION_BLOCK MyFB
          VAR x: INT; END_VAR
          x := 1;
        END_FUNCTION_BLOCK
      `);
      expect(decl.type).toBe(NodeType.FUNCTION_BLOCK_DECLARATION);
      expect(decl.name).toBe('MyFB');
      expect(decl.varSections).toHaveLength(1);
      expect(decl.body).toHaveLength(1);
    });
  });

  describe('FUNCTION declaration', () => {
    test('parses return type and parameters', () => {
      const decl = getDecl(`
        FUNCTION Add: INT
          VAR_INPUT a: INT; b: INT; END_VAR
          Add := a + b;
        END_FUNCTION
      `);
      expect(decl.type).toBe(NodeType.FUNCTION_DECLARATION);
      expect(decl.name).toBe('Add');
      expect(decl.returnType).not.toBeNull();
      expect(decl.returnType.name).toBe('INT');
      expect(decl.varSections).toHaveLength(1);
      expect(decl.varSections[0].kind).toBe(VarKind.INPUT);
    });
  });

  describe('PROGRAM declaration', () => {
    test('parses variables and body', () => {
      const decl = getDecl(`
        PROGRAM Main
          VAR x: INT := 0; END_VAR
          x := x + 1;
        END_PROGRAM
      `);
      expect(decl.type).toBe(NodeType.PROGRAM_DECLARATION);
      expect(decl.name).toBe('Main');
      expect(decl.varSections).toHaveLength(1);
      expect(decl.body).toHaveLength(1);
    });
  });

  describe('VAR sections', () => {
    test('VAR parsed to LOCAL kind', () => {
      const decl = getDecl(`
        FUNCTION_BLOCK FB1
          VAR x: INT; END_VAR
        END_FUNCTION_BLOCK
      `);
      expect(decl.varSections[0].kind).toBe(VarKind.LOCAL);
    });

    test('VAR_INPUT parsed to INPUT kind', () => {
      const decl = getDecl(`
        FUNCTION_BLOCK FB1
          VAR_INPUT x: INT; END_VAR
        END_FUNCTION_BLOCK
      `);
      expect(decl.varSections[0].kind).toBe(VarKind.INPUT);
    });

    test('VAR_OUTPUT parsed to OUTPUT kind', () => {
      const decl = getDecl(`
        FUNCTION_BLOCK FB1
          VAR_OUTPUT x: INT; END_VAR
        END_FUNCTION_BLOCK
      `);
      expect(decl.varSections[0].kind).toBe(VarKind.OUTPUT);
    });

    test('multiple variables in one declaration', () => {
      const decl = getDecl(`
        FUNCTION_BLOCK FB1
          VAR a, b, c: INT; END_VAR
        END_FUNCTION_BLOCK
      `);
      expect(decl.varSections[0].declarations).toHaveLength(3);
    });

    test('variable with initial value', () => {
      const decl = getDecl(`
        FUNCTION_BLOCK FB1
          VAR x: INT := 42; END_VAR
        END_FUNCTION_BLOCK
      `);
      const v = decl.varSections[0].declarations[0];
      expect(v.name).toBe('x');
      expect(v.initialValue).not.toBeNull();
      expect(v.initialValue.value).toBe(42);
    });
  });

  describe('IF statement', () => {
    test('IF/THEN/END_IF', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR x: INT; END_VAR
          IF x > 0 THEN x := 1; END_IF
        END_PROGRAM
      `);
      const ifStmt = decl.body[0];
      expect(ifStmt.type).toBe(NodeType.IF_STATEMENT);
      expect(ifStmt.condition.type).toBe(NodeType.BINARY_EXPR);
      expect(ifStmt.consequent).toHaveLength(1);
    });

    test('IF/ELSIF/ELSE/END_IF', () => {
      const decl = getDecl(`
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
      const ifStmt = decl.body[0];
      expect(ifStmt.elsifClauses).toHaveLength(1);
      expect(ifStmt.elsifClauses[0].type).toBe(NodeType.ELSIF_CLAUSE);
      expect(ifStmt.elseClause).not.toBeNull();
      expect(ifStmt.elseClause.type).toBe(NodeType.ELSE_CLAUSE);
    });
  });

  describe('CASE statement', () => {
    test('CASE/OF/END_CASE', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR x: INT; END_VAR
          CASE x OF
            0: x := 10;
            1: x := 20;
          END_CASE
        END_PROGRAM
      `);
      const caseStmt = decl.body[0];
      expect(caseStmt.type).toBe(NodeType.CASE_STATEMENT);
      expect(caseStmt.discriminant.type).toBe(NodeType.IDENTIFIER_REF);
      expect(caseStmt.clauses).toHaveLength(2);
    });

    test('CASE with ELSE', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR x: INT; END_VAR
          CASE x OF
            0: x := 10;
          ELSE
            x := 99;
          END_CASE
        END_PROGRAM
      `);
      const caseStmt = decl.body[0];
      expect(caseStmt.elseClause).not.toBeNull();
    });
  });

  describe('FOR statement', () => {
    test('FOR/TO/DO/END_FOR', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR i: INT; END_VAR
          FOR i := 0 TO 10 DO
            i := i;
          END_FOR
        END_PROGRAM
      `);
      const forStmt = decl.body[0];
      expect(forStmt.type).toBe(NodeType.FOR_STATEMENT);
      expect(forStmt.variable.name).toBe('i');
      expect(forStmt.from.value).toBe(0);
      expect(forStmt.to.value).toBe(10);
      expect(forStmt.by).toBeNull();
    });

    test('FOR with BY clause', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR i: INT; END_VAR
          FOR i := 0 TO 100 BY 2 DO
            i := i;
          END_FOR
        END_PROGRAM
      `);
      const forStmt = decl.body[0];
      expect(forStmt.by).not.toBeNull();
      expect(forStmt.by.value).toBe(2);
    });
  });

  describe('WHILE statement', () => {
    test('WHILE/DO/END_WHILE', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR x: BOOL; END_VAR
          WHILE x DO x := FALSE; END_WHILE
        END_PROGRAM
      `);
      const whileStmt = decl.body[0];
      expect(whileStmt.type).toBe(NodeType.WHILE_STATEMENT);
      expect(whileStmt.condition).toBeDefined();
      expect(whileStmt.body).toHaveLength(1);
    });
  });

  describe('REPEAT statement', () => {
    test('REPEAT/UNTIL/END_REPEAT', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR x: INT; END_VAR
          REPEAT x := x + 1; UNTIL x > 10;
        END_PROGRAM
      `);
      const repeatStmt = decl.body[0];
      expect(repeatStmt.type).toBe(NodeType.REPEAT_STATEMENT);
      expect(repeatStmt.body).toHaveLength(1);
      expect(repeatStmt.condition).toBeDefined();
    });
  });

  describe('Assignment', () => {
    test('simple assignment', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR x: INT; END_VAR
          x := 42;
        END_PROGRAM
      `);
      const assign = decl.body[0];
      expect(assign.type).toBe(NodeType.ASSIGNMENT);
      expect(assign.target.name).toBe('x');
      expect(assign.value.value).toBe(42);
    });
  });

  describe('Function calls', () => {
    test('positional args', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR x: INT; END_VAR
          x := ABS(x);
        END_PROGRAM
      `);
      const call = decl.body[0].value;
      expect(call.type).toBe(NodeType.FUNCTION_CALL);
      expect(call.callee).toBe('ABS');
      expect(call.args).toHaveLength(1);
    });

    test('named args', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR x: INT; END_VAR
          x := MyFunc(a := 1, b := 2);
        END_PROGRAM
      `);
      const call = decl.body[0].value;
      expect(call.args).toHaveLength(2);
      expect(call.args[0].type).toBe(NodeType.NAMED_ARGUMENT);
      expect(call.args[0].name).toBe('a');
    });
  });

  describe('Array access', () => {
    test('single index', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR arr: ARRAY[1..10] OF INT; END_VAR
          arr[1] := 5;
        END_PROGRAM
      `);
      const target = decl.body[0].target;
      expect(target.type).toBe(NodeType.ARRAY_ACCESS);
      expect(target.indices).toHaveLength(1);
    });
  });

  describe('Member access', () => {
    test('a.b.c chain', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR x: INT; END_VAR
          x := a.b.c;
        END_PROGRAM
      `);
      const expr = decl.body[0].value;
      expect(expr.type).toBe(NodeType.MEMBER_ACCESS);
      expect(expr.member).toBe('c');
      expect(expr.object.type).toBe(NodeType.MEMBER_ACCESS);
      expect(expr.object.member).toBe('b');
    });
  });

  describe('Binary expressions', () => {
    test('arithmetic operators', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR x: INT; END_VAR
          x := 1 + 2 * 3;
        END_PROGRAM
      `);
      const expr = decl.body[0].value;
      expect(expr.type).toBe(NodeType.BINARY_EXPR);
      expect(expr.operator).toBe('+');
    });

    test('comparison operators', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR x: BOOL; END_VAR
          x := 1 <> 2;
        END_PROGRAM
      `);
      const expr = decl.body[0].value;
      expect(expr.operator).toBe('<>');
    });

    test('logical operators', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR x: BOOL; END_VAR
          x := TRUE AND FALSE;
        END_PROGRAM
      `);
      const expr = decl.body[0].value;
      expect(expr.operator).toBe('AND');
    });

    test('power operator', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR x: INT; END_VAR
          x := 2 ** 3;
        END_PROGRAM
      `);
      const expr = decl.body[0].value;
      expect(expr.operator).toBe('**');
    });
  });

  describe('RETURN statement', () => {
    test('parses RETURN', () => {
      const decl = getDecl(`
        FUNCTION Foo: INT
          VAR_INPUT x: INT; END_VAR
          RETURN;
        END_FUNCTION
      `);
      expect(decl.body[0].type).toBe(NodeType.RETURN_STATEMENT);
    });
  });

  describe('EXIT and CONTINUE statements', () => {
    test('parses EXIT inside loop', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR i: INT; END_VAR
          FOR i := 0 TO 10 DO EXIT; END_FOR
        END_PROGRAM
      `);
      expect(decl.body[0].body[0].type).toBe(NodeType.EXIT_STATEMENT);
    });

    test('parses CONTINUE inside loop', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR i: INT; END_VAR
          FOR i := 0 TO 10 DO CONTINUE; END_FOR
        END_PROGRAM
      `);
      expect(decl.body[0].body[0].type).toBe(NodeType.CONTINUE_STATEMENT);
    });
  });

  describe('Function call statement', () => {
    test('parses standalone function call', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR x: INT; END_VAR
          MyFunc(1, 2);
        END_PROGRAM
      `);
      expect(decl.body[0].type).toBe(NodeType.FUNCTION_CALL_STATEMENT);
    });
  });

  describe('ARRAY type', () => {
    test('parses ARRAY type in var declaration', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR arr: ARRAY[1..10] OF INT; END_VAR
          arr[1] := 5;
        END_PROGRAM
      `);
      const arrDecl = decl.varSections[0].declarations[0];
      expect(arrDecl.varType.type).toBe(NodeType.ARRAY_TYPE);
      expect(arrDecl.varType.dimensions).toHaveLength(1);
    });
  });

  describe('STRING type', () => {
    test('parses STRING type', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR s: STRING; END_VAR
          s := 'hello';
        END_PROGRAM
      `);
      const sDecl = decl.varSections[0].declarations[0];
      expect(sDecl.varType.type).toBe('StringType');
    });

    test('parses STRING[N] type', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR s: STRING[50]; END_VAR
          s := 'hello';
        END_PROGRAM
      `);
      const sDecl = decl.varSections[0].declarations[0];
      expect(sDecl.varType.maxLength).toBe(50);
    });
  });

  describe('TYPE declarations', () => {
    test('parses enum type', () => {
      const { ast } = parseSource(`
        TYPE
          Color: (Red, Green, Blue);
        END_TYPE
      `);
      expect(ast.declarations[0].type).toBe(NodeType.TYPE_DECLARATION);
    });

    test('parses struct type', () => {
      const { ast } = parseSource(`
        TYPE
          Point: STRUCT
            x: REAL;
            y: REAL;
          END_STRUCT;
        END_TYPE
      `);
      expect(ast.declarations[0].type).toBe(NodeType.TYPE_DECLARATION);
    });
  });

  describe('Parenthesized expressions', () => {
    test('parses (a + b) * c', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR x: INT; a: INT; b: INT; c: INT; END_VAR
          x := (a + b) * c;
        END_PROGRAM
      `);
      const expr = decl.body[0].value;
      expect(expr.type).toBe(NodeType.BINARY_EXPR);
      expect(expr.operator).toBe('*');
    });
  });

  describe('Literal types', () => {
    test('real literal', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR x: REAL; END_VAR
          x := 3.14;
        END_PROGRAM
      `);
      expect(decl.body[0].value.type).toBe(NodeType.REAL_LITERAL);
      expect(decl.body[0].value.value).toBeCloseTo(3.14);
    });

    test('bool literal', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR x: BOOL; END_VAR
          x := TRUE;
        END_PROGRAM
      `);
      expect(decl.body[0].value.type).toBe(NodeType.BOOL_LITERAL);
      expect(decl.body[0].value.value).toBe(true);
    });

    test('string literal', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR x: STRING; END_VAR
          x := 'hello';
        END_PROGRAM
      `);
      expect(decl.body[0].value.type).toBe(NodeType.STRING_LITERAL);
    });

    test('time literal', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR x: TIME; END_VAR
          x := T#1s;
        END_PROGRAM
      `);
      expect(decl.body[0].value.type).toBe(NodeType.TIME_LITERAL);
      expect(decl.body[0].value.ms).toBe(1000);
    });
  });

  describe('Operator precedence', () => {
    test('MOD operator', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR x: INT; END_VAR
          x := 10 MOD 3;
        END_PROGRAM
      `);
      expect(decl.body[0].value.operator).toBe('MOD');
    });

    test('XOR operator', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR x: BOOL; END_VAR
          x := TRUE XOR FALSE;
        END_PROGRAM
      `);
      expect(decl.body[0].value.operator).toBe('XOR');
    });

    test('OR operator', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR x: BOOL; END_VAR
          x := TRUE OR FALSE;
        END_PROGRAM
      `);
      expect(decl.body[0].value.operator).toBe('OR');
    });

    test('comparison operators', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR a: BOOL; END_VAR
          a := 1 < 2;
        END_PROGRAM
      `);
      expect(decl.body[0].value.operator).toBe('<');
    });
  });

  describe('Unary expressions', () => {
    test('NOT', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR x: BOOL; END_VAR
          x := NOT TRUE;
        END_PROGRAM
      `);
      const expr = decl.body[0].value;
      expect(expr.type).toBe(NodeType.UNARY_EXPR);
      expect(expr.operator).toBe('NOT');
    });

    test('unary minus', () => {
      const decl = getDecl(`
        PROGRAM P
          VAR x: INT; END_VAR
          x := -5;
        END_PROGRAM
      `);
      const expr = decl.body[0].value;
      expect(expr.type).toBe(NodeType.UNARY_EXPR);
      expect(expr.operator).toBe('-');
    });
  });
});
