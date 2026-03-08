'use strict';

/**
 * @fileoverview ASTBuilder - Takes the raw CST from Parser and produces a clean, typed AST.
 * Since our Parser directly builds typed nodes (not a traditional CST),
 * ASTBuilder performs normalization and enrichment of the parse tree.
 */

const { NodeType, VarKind, TokenType } = require('../types');

class ASTBuilder {
  /**
   * @param {string} source - Original source for location enrichment
   */
  constructor(source) {
    this.source = source;
  }

  /**
   * Build a normalized AST from the parser's output.
   * @param {object} cst - Raw parse tree from Parser
   * @returns {import('../types').ASTNode}
   */
  build(cst) {
    return this.visitNode(cst);
  }

  visitNode(node) {
    if (!node) return null;

    switch (node.type) {
      case 'ProgramFile':             return this.visitProgramFile(node);
      case 'FunctionBlockDeclaration':return this.visitFunctionBlock(node);
      case 'FunctionDeclaration':     return this.visitFunction(node);
      case 'ProgramDeclaration':      return this.visitProgram(node);
      case 'TypeDeclaration':         return this.visitTypeDeclaration(node);
      case 'TypeAliasDeclaration':    return this.visitTypeAlias(node);
      case 'VarSection':              return this.visitVarSection(node);
      case 'VarDeclaration':          return this.visitVarDeclaration(node);

      // Types
      case 'PrimitiveType':           return node; // already clean
      case 'ArrayType':               return this.visitArrayType(node);
      case 'StructType':              return this.visitStructType(node);
      case 'StringType':              return node;
      case 'SubrangeType':            return this.visitSubrangeType(node);
      case 'EnumType':                return node;

      // Statements
      case 'Assignment':              return this.visitAssignment(node);
      case 'IfStatement':             return this.visitIfStatement(node);
      case 'ElsifClause':             return this.visitElsifClause(node);
      case 'ElseClause':              return this.visitElseClause(node);
      case 'CaseStatement':           return this.visitCaseStatement(node);
      case 'CaseClause':              return this.visitCaseClause(node);
      case 'ForStatement':            return this.visitForStatement(node);
      case 'WhileStatement':          return this.visitWhileStatement(node);
      case 'RepeatStatement':         return this.visitRepeatStatement(node);
      case 'ReturnStatement':         return node;
      case 'ExitStatement':           return node;
      case 'ContinueStatement':       return node;
      case 'FunctionCallStatement':   return this.visitFunctionCallStatement(node);

      // Expressions
      case 'BinaryExpr':              return this.visitBinaryExpr(node);
      case 'UnaryExpr':               return this.visitUnaryExpr(node);
      case 'FunctionCall':            return this.visitFunctionCall(node);
      case 'MemberAccess':            return this.visitMemberAccess(node);
      case 'ArrayAccess':             return this.visitArrayAccess(node);
      case 'IdentifierRef':           return node;
      case 'IntegerLiteral':          return node;
      case 'RealLiteral':             return node;
      case 'BoolLiteral':             return node;
      case 'StringLiteral':           return node;
      case 'TimeLiteral':             return node;
      case 'DateLiteral':             return node;
      case 'TypedLiteral':            return this.visitTypedLiteral(node);
      case 'RangeLiteral':            return node;
      case 'NamedArgument':           return this.visitNamedArgument(node);

      default:
        // Pass through unknown nodes
        return node;
    }
  }

  visitMany(nodes) {
    if (!Array.isArray(nodes)) return [];
    return nodes.map(n => this.visitNode(n)).filter(Boolean);
  }

  // ─── Top-level ─────────────────────────────────────────────────────────────

  visitProgramFile(node) {
    return {
      type: NodeType.PROGRAM_FILE,
      declarations: this.visitMany(node.declarations),
      loc: node.loc,
    };
  }

  visitFunctionBlock(node) {
    return {
      type: NodeType.FUNCTION_BLOCK_DECLARATION,
      name: node.name,
      varSections: this.visitMany(node.varSections),
      body: this.visitMany(node.body),
      loc: node.loc,
    };
  }

  visitFunction(node) {
    return {
      type: NodeType.FUNCTION_DECLARATION,
      name: node.name,
      returnType: node.returnType ? this.visitNode(node.returnType) : null,
      varSections: this.visitMany(node.varSections),
      body: this.visitMany(node.body),
      loc: node.loc,
    };
  }

  visitProgram(node) {
    return {
      type: NodeType.PROGRAM_DECLARATION,
      name: node.name,
      varSections: this.visitMany(node.varSections),
      body: this.visitMany(node.body),
      loc: node.loc,
    };
  }

  visitTypeDeclaration(node) {
    return {
      type: NodeType.TYPE_DECLARATION,
      declarations: this.visitMany(node.declarations),
      loc: node.loc,
    };
  }

  visitTypeAlias(node) {
    return {
      type: 'TypeAliasDeclaration',
      name: node.name,
      typeDef: this.visitNode(node.typeDef),
      initialValue: node.initialValue ? this.visitNode(node.initialValue) : null,
      loc: node.loc,
    };
  }

  // ─── Variables ─────────────────────────────────────────────────────────────

  visitVarSection(node) {
    // Map token type to VarKind string
    const kindMap = {
      [TokenType.VAR]: VarKind.LOCAL,
      [TokenType.VAR_INPUT]: VarKind.INPUT,
      [TokenType.VAR_OUTPUT]: VarKind.OUTPUT,
      [TokenType.VAR_IN_OUT]: VarKind.IN_OUT,
      [TokenType.VAR_GLOBAL]: VarKind.GLOBAL,
      [TokenType.VAR_TEMP]: VarKind.TEMP,
      [TokenType.VAR_EXTERNAL]: VarKind.EXTERNAL,
    };

    return {
      type: NodeType.VAR_SECTION,
      kind: kindMap[node.kind] || node.kind,
      modifiers: node.modifiers || [],
      declarations: this.visitMany(node.declarations),
      loc: node.loc,
    };
  }

  visitVarDeclaration(node) {
    return {
      type: NodeType.VAR_DECLARATION,
      name: node.name,
      varType: this.visitNode(node.varType),
      initialValue: node.initialValue ? this.visitNode(node.initialValue) : null,
      loc: node.loc,
    };
  }

  // ─── Types ─────────────────────────────────────────────────────────────────

  visitArrayType(node) {
    return {
      type: NodeType.ARRAY_TYPE,
      dimensions: node.dimensions.map(d => ({
        lo: this.visitNode(d.lo),
        hi: this.visitNode(d.hi),
      })),
      elementType: this.visitNode(node.elementType),
      loc: node.loc,
    };
  }

  visitStructType(node) {
    return {
      type: NodeType.STRUCT_TYPE,
      fields: this.visitMany(node.fields),
      loc: node.loc,
    };
  }

  visitSubrangeType(node) {
    return {
      type: NodeType.SUBRANGE_TYPE || 'SubrangeType',
      baseType: this.visitNode(node.baseType),
      range: {
        lo: this.visitNode(node.range.lo),
        hi: this.visitNode(node.range.hi),
      },
      loc: node.loc,
    };
  }

  // ─── Statements ────────────────────────────────────────────────────────────

  visitAssignment(node) {
    return {
      type: NodeType.ASSIGNMENT,
      target: this.visitNode(node.target),
      value: this.visitNode(node.value),
      loc: node.loc,
    };
  }

  visitIfStatement(node) {
    return {
      type: NodeType.IF_STATEMENT,
      condition: this.visitNode(node.condition),
      consequent: this.visitMany(node.consequent),
      elsifClauses: this.visitMany(node.elsifClauses),
      elseClause: node.elseClause ? this.visitNode(node.elseClause) : null,
      loc: node.loc,
    };
  }

  visitElsifClause(node) {
    return {
      type: NodeType.ELSIF_CLAUSE,
      condition: this.visitNode(node.condition),
      body: this.visitMany(node.body),
      loc: node.loc,
    };
  }

  visitElseClause(node) {
    return {
      type: NodeType.ELSE_CLAUSE,
      body: this.visitMany(node.body),
      loc: node.loc,
    };
  }

  visitCaseStatement(node) {
    return {
      type: NodeType.CASE_STATEMENT,
      discriminant: this.visitNode(node.discriminant),
      clauses: this.visitMany(node.clauses),
      elseClause: node.elseClause ? this.visitNode(node.elseClause) : null,
      loc: node.loc,
    };
  }

  visitCaseClause(node) {
    return {
      type: NodeType.CASE_CLAUSE,
      values: this.visitMany(node.values),
      body: this.visitMany(node.body),
      loc: node.loc,
    };
  }

  visitForStatement(node) {
    return {
      type: NodeType.FOR_STATEMENT,
      variable: this.visitNode(node.variable),
      from: this.visitNode(node.from),
      to: this.visitNode(node.to),
      by: node.by ? this.visitNode(node.by) : null,
      body: this.visitMany(node.body),
      loc: node.loc,
    };
  }

  visitWhileStatement(node) {
    return {
      type: NodeType.WHILE_STATEMENT,
      condition: this.visitNode(node.condition),
      body: this.visitMany(node.body),
      loc: node.loc,
    };
  }

  visitRepeatStatement(node) {
    return {
      type: NodeType.REPEAT_STATEMENT,
      body: this.visitMany(node.body),
      condition: this.visitNode(node.condition),
      loc: node.loc,
    };
  }

  visitFunctionCallStatement(node) {
    return {
      type: NodeType.FUNCTION_CALL_STATEMENT,
      call: this.visitNode(node.call),
      loc: node.loc,
    };
  }

  // ─── Expressions ───────────────────────────────────────────────────────────

  visitBinaryExpr(node) {
    return {
      type: NodeType.BINARY_EXPR,
      operator: node.operator,
      left: this.visitNode(node.left),
      right: this.visitNode(node.right),
      loc: node.loc,
    };
  }

  visitUnaryExpr(node) {
    return {
      type: NodeType.UNARY_EXPR,
      operator: node.operator,
      operand: this.visitNode(node.operand),
      loc: node.loc,
    };
  }

  visitFunctionCall(node) {
    return {
      type: NodeType.FUNCTION_CALL,
      callee: typeof node.callee === 'string' ? node.callee : this.visitNode(node.callee),
      args: this.visitMany(node.args),
      loc: node.loc,
    };
  }

  visitMemberAccess(node) {
    return {
      type: NodeType.MEMBER_ACCESS,
      object: this.visitNode(node.object),
      member: node.member,
      loc: node.loc,
    };
  }

  visitArrayAccess(node) {
    return {
      type: NodeType.ARRAY_ACCESS,
      array: this.visitNode(node.array),
      indices: this.visitMany(node.indices),
      loc: node.loc,
    };
  }

  visitTypedLiteral(node) {
    return {
      type: NodeType.TYPED_LITERAL,
      typeName: node.typeName,
      value: this.visitNode(node.value),
      loc: node.loc,
    };
  }

  visitNamedArgument(node) {
    return {
      type: NodeType.NAMED_ARGUMENT,
      name: node.name,
      value: node.value ? this.visitNode(node.value) : null,
      dir: node.dir || 'IN',
      negated: node.negated || false,
      loc: node.loc,
    };
  }
}

module.exports = ASTBuilder;
