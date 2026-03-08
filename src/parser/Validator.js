'use strict';

/**
 * @fileoverview Semantic validator for the st2js AST.
 * Performs type checking, scope analysis, and constraint validation.
 */

const { NodeType, VarKind, makeError } = require('../types');

// Standard function blocks and library functions that are always available
const STANDARD_FB_TYPES = new Set([
  'TON', 'TOF', 'TP', 'RS', 'SR', 'CTU', 'CTD', 'CTUD', 'R_TRIG', 'F_TRIG',
]);

const STANDARD_FUNCTIONS = new Set([
  // Math
  'ABS', 'SQRT', 'LN', 'LOG', 'EXP', 'SIN', 'COS', 'TAN', 'ASIN', 'ACOS', 'ATAN', 'ATAN2',
  // Numeric
  'MAX', 'MIN', 'LIMIT', 'MUX', 'SEL',
  // Type conversions (BOOL_TO_INT etc.)
  'BOOL_TO_INT', 'BOOL_TO_DINT', 'BOOL_TO_REAL',
  'INT_TO_BOOL', 'INT_TO_DINT', 'INT_TO_REAL', 'INT_TO_STRING',
  'DINT_TO_BOOL', 'DINT_TO_INT', 'DINT_TO_REAL', 'DINT_TO_STRING',
  'REAL_TO_BOOL', 'REAL_TO_INT', 'REAL_TO_DINT', 'REAL_TO_STRING',
  'STRING_TO_INT', 'STRING_TO_DINT', 'STRING_TO_REAL', 'STRING_TO_BOOL',
  // String
  'LEN', 'LEFT', 'RIGHT', 'MID', 'CONCAT', 'INSERT', 'DELETE', 'REPLACE', 'FIND',
  // Bit
  'SHL', 'SHR', 'ROL', 'ROR',
  // Time
  'TIME_TO_DINT', 'DINT_TO_TIME',
  // Array
  'SIZEOF',
]);

const NUMERIC_TYPES = new Set([
  'BOOL', 'BYTE', 'WORD', 'DWORD', 'LWORD',
  'SINT', 'INT', 'DINT', 'LINT',
  'USINT', 'UINT', 'UDINT', 'ULINT',
  'REAL', 'LREAL',
]);

const INTEGER_TYPES = new Set([
  'BOOL', 'BYTE', 'WORD', 'DWORD', 'LWORD',
  'SINT', 'INT', 'DINT', 'LINT',
  'USINT', 'UINT', 'UDINT', 'ULINT',
]);

class Scope {
  constructor(parent = null) {
    this.parent = parent;
    this.symbols = new Map(); // name -> { type, kind, varType }
  }

  define(name, info) {
    this.symbols.set(name.toUpperCase(), info);
  }

  lookup(name) {
    const upper = name.toUpperCase();
    if (this.symbols.has(upper)) return this.symbols.get(upper);
    if (this.parent) return this.parent.lookup(name);
    return null;
  }

  has(name) {
    return this.symbols.has(name.toUpperCase());
  }
}

class Validator {
  constructor() {
    this.errors = /** @type {import('../types').STError[]} */ ([]);
    this.globalScope = new Scope();
    this.currentScope = this.globalScope;
    this.inLoop = false;
    this.inFunction = false;
    this.currentPouName = null;
    this.userTypes = new Map(); // type name -> AST node
  }

  /**
   * Validate an AST and return all semantic errors.
   * @param {import('../types').ASTNode} ast
   * @returns {import('../types').STError[]}
   */
  validate(ast) {
    this.errors = [];
    if (!ast) return this.errors;

    try {
      this.visitNode(ast);
    } catch (e) {
      this.errors.push(makeError('validator', `Internal validator error: ${e.message}`, 1, 0));
    }

    return this.errors;
  }

  error(message, node, severity = 'error', code = undefined) {
    const line = node && node.loc ? node.loc.line : 1;
    const col = node && node.loc ? node.loc.column : 0;
    this.errors.push(makeError('validator', message, line, col, severity, code));
  }

  warning(message, node) {
    this.error(message, node, 'warning');
  }

  pushScope() {
    this.currentScope = new Scope(this.currentScope);
  }

  popScope() {
    this.currentScope = this.currentScope.parent;
  }

  visitNode(node) {
    if (!node) return null;

    switch (node.type) {
      case NodeType.PROGRAM_FILE:             return this.visitProgramFile(node);
      case NodeType.FUNCTION_BLOCK_DECLARATION: return this.visitFunctionBlock(node);
      case NodeType.FUNCTION_DECLARATION:     return this.visitFunction(node);
      case NodeType.PROGRAM_DECLARATION:      return this.visitProgram(node);
      case NodeType.TYPE_DECLARATION:         return this.visitTypeDeclaration(node);
      case 'TypeAliasDeclaration':            return this.visitTypeAlias(node);
      case NodeType.VAR_SECTION:              return this.visitVarSection(node);
      case NodeType.VAR_DECLARATION:          return this.visitVarDeclaration(node);

      // Statements
      case NodeType.ASSIGNMENT:              return this.visitAssignment(node);
      case NodeType.IF_STATEMENT:            return this.visitIfStatement(node);
      case NodeType.CASE_STATEMENT:          return this.visitCaseStatement(node);
      case NodeType.FOR_STATEMENT:           return this.visitForStatement(node);
      case NodeType.WHILE_STATEMENT:         return this.visitWhileStatement(node);
      case NodeType.REPEAT_STATEMENT:        return this.visitRepeatStatement(node);
      case NodeType.RETURN_STATEMENT:        return this.visitReturnStatement(node);
      case NodeType.EXIT_STATEMENT:          return this.visitExitStatement(node);
      case NodeType.CONTINUE_STATEMENT:      return this.visitExitStatement(node); // same logic
      case NodeType.FUNCTION_CALL_STATEMENT: return this.visitFunctionCallStatement(node);

      // Expressions - return type string
      case NodeType.BINARY_EXPR:             return this.visitBinaryExpr(node);
      case NodeType.UNARY_EXPR:              return this.visitUnaryExpr(node);
      case NodeType.FUNCTION_CALL:           return this.visitFunctionCall(node);
      case NodeType.MEMBER_ACCESS:           return this.visitMemberAccess(node);
      case NodeType.ARRAY_ACCESS:            return this.visitArrayAccess(node);
      case NodeType.IDENTIFIER_REF:          return this.visitIdentifierRef(node);
      case NodeType.INTEGER_LITERAL:         return 'INT';
      case NodeType.REAL_LITERAL:            return 'REAL';
      case NodeType.BOOL_LITERAL:            return 'BOOL';
      case NodeType.STRING_LITERAL:          return 'STRING';
      case NodeType.TIME_LITERAL:            return 'TIME';
      case NodeType.DATE_LITERAL:            return 'DATE';
      case NodeType.TYPED_LITERAL:           return this.visitTypedLiteral(node);
      case NodeType.NAMED_ARGUMENT:          return this.visitNamedArgument(node);

      default:
        // Pass through unknown/unvalidated nodes
        return 'ANY';
    }
  }

  visitMany(nodes) {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) this.visitNode(node);
  }

  // ─── Top-level ─────────────────────────────────────────────────────────────

  visitProgramFile(node) {
    // First pass: collect all POU and type names
    for (const decl of node.declarations) {
      if (decl.name) {
        this.globalScope.define(decl.name, { kind: 'pou', node: decl });
      }
      if (decl.type === NodeType.TYPE_DECLARATION) {
        for (const alias of decl.declarations) {
          this.userTypes.set(alias.name.toUpperCase(), alias);
        }
      }
    }
    this.visitMany(node.declarations);
  }

  visitFunctionBlock(node) {
    this.pushScope();
    this.currentPouName = node.name;
    this.inFunction = false;

    // Define VAR sections into scope
    this.visitMany(node.varSections);
    // Validate body
    this.visitMany(node.body);

    this.popScope();
    this.currentPouName = null;
  }

  visitFunction(node) {
    this.pushScope();
    this.currentPouName = node.name;
    this.inFunction = true;

    // The function return value is accessed via the function name
    if (node.returnType) {
      this.currentScope.define(node.name, {
        kind: 'return',
        varType: node.returnType,
      });
    }

    this.visitMany(node.varSections);
    this.visitMany(node.body);

    this.popScope();
    this.currentPouName = null;
    this.inFunction = false;
  }

  visitProgram(node) {
    this.pushScope();
    this.currentPouName = node.name;

    this.visitMany(node.varSections);
    this.visitMany(node.body);

    this.popScope();
    this.currentPouName = null;
  }

  visitTypeDeclaration(node) {
    this.visitMany(node.declarations);
  }

  visitTypeAlias(node) {
    // Register type
    this.userTypes.set(node.name.toUpperCase(), node);
  }

  visitVarSection(node) {
    this.visitMany(node.declarations);
  }

  visitVarDeclaration(node) {
    if (this.currentScope.has(node.name)) {
      this.error(`Variable '${node.name}' is already declared in this scope`, node);
    }
    this.currentScope.define(node.name, {
      kind: 'variable',
      varType: node.varType,
      node,
    });

    if (node.initialValue) {
      this.visitNode(node.initialValue);
    }
  }

  // ─── Statements ────────────────────────────────────────────────────────────

  visitAssignment(node) {
    const targetType = this.visitNode(node.target);
    const valueType = this.visitNode(node.value);

    // Check that target is assignable (not a constant)
    if (node.target.type === NodeType.IDENTIFIER_REF) {
      const sym = this.currentScope.lookup(node.target.name);
      if (sym && sym.kind === 'constant') {
        this.error(`Cannot assign to constant '${node.target.name}'`, node);
      }
    }

    // Basic type compatibility (widened check)
    if (targetType && valueType && targetType !== 'ANY' && valueType !== 'ANY') {
      if (!this.typesCompatible(targetType, valueType)) {
        this.warning(
          `Possibly incompatible types: assigning ${valueType} to ${targetType}`,
          node,
        );
      }
    }
  }

  visitIfStatement(node) {
    const condType = this.visitNode(node.condition);
    if (condType && condType !== 'BOOL' && condType !== 'ANY') {
      this.warning(`IF condition should be BOOL, got ${condType}`, node.condition);
    }
    this.visitMany(node.consequent);
    this.visitMany(node.elsifClauses);
    if (node.elseClause) this.visitNode(node.elseClause);
  }

  visitCaseStatement(node) {
    this.visitNode(node.discriminant);
    this.visitMany(node.clauses);
    if (node.elseClause) this.visitNode(node.elseClause);
  }

  visitForStatement(node) {
    // Check that loop variable is declared
    if (node.variable.type === NodeType.IDENTIFIER_REF) {
      const sym = this.currentScope.lookup(node.variable.name);
      if (!sym) {
        this.error(`Undeclared loop variable '${node.variable.name}'`, node.variable);
      }
    }

    this.visitNode(node.from);
    this.visitNode(node.to);
    if (node.by) this.visitNode(node.by);

    const wasInLoop = this.inLoop;
    this.inLoop = true;
    this.visitMany(node.body);
    this.inLoop = wasInLoop;
  }

  visitWhileStatement(node) {
    this.visitNode(node.condition);
    const wasInLoop = this.inLoop;
    this.inLoop = true;
    this.visitMany(node.body);
    this.inLoop = wasInLoop;
  }

  visitRepeatStatement(node) {
    const wasInLoop = this.inLoop;
    this.inLoop = true;
    this.visitMany(node.body);
    this.inLoop = wasInLoop;
    this.visitNode(node.condition);
  }

  visitReturnStatement(node) {
    // RETURN is valid anywhere inside a function/function block
  }

  visitExitStatement(node) {
    if (!this.inLoop) {
      this.error('EXIT/CONTINUE can only be used inside a loop', node);
    }
  }

  visitFunctionCallStatement(node) {
    this.visitNode(node.call);
  }

  // ─── Expressions ───────────────────────────────────────────────────────────

  visitBinaryExpr(node) {
    const leftType = this.visitNode(node.left);
    const rightType = this.visitNode(node.right);
    const op = node.operator;

    // Logical operators require BOOL
    if (['AND', 'OR', 'XOR'].includes(op)) {
      if (leftType && leftType !== 'BOOL' && leftType !== 'ANY') {
        this.warning(`Logical operator '${op}' expects BOOL operands, got ${leftType}`, node.left);
      }
      return 'BOOL';
    }

    // Comparison operators return BOOL
    if (['=', '<>', '<', '<=', '>', '>='].includes(op)) {
      return 'BOOL';
    }

    // Arithmetic - result type depends on operands
    if (['+', '-', '*', '/', 'MOD', '**'].includes(op)) {
      if (leftType === 'REAL' || rightType === 'REAL' ||
          leftType === 'LREAL' || rightType === 'LREAL') {
        return 'REAL';
      }
      return leftType || rightType || 'INT';
    }

    return leftType || 'ANY';
  }

  visitUnaryExpr(node) {
    const opType = this.visitNode(node.operand);
    if (node.operator === 'NOT') {
      if (opType && opType !== 'BOOL' && opType !== 'ANY' && !INTEGER_TYPES.has(opType)) {
        this.warning(`NOT operator expects BOOL or integer type, got ${opType}`, node);
      }
      return 'BOOL';
    }
    return opType || 'INT';
  }

  visitFunctionCall(node) {
    const calleeName = typeof node.callee === 'string' ? node.callee : null;

    if (calleeName) {
      // Check if it's a known function or function block instance
      const sym = this.currentScope.lookup(calleeName);
      const isStdFunc = STANDARD_FUNCTIONS.has(calleeName.toUpperCase());
      const isStdFB = STANDARD_FB_TYPES.has(calleeName.toUpperCase());
      const isUserDefined = this.globalScope.lookup(calleeName);

      if (!sym && !isStdFunc && !isStdFB && !isUserDefined) {
        this.warning(`Unknown function or function block '${calleeName}'`, node);
      }
    }

    // Validate args
    for (const arg of node.args) {
      this.visitNode(arg);
    }

    return 'ANY'; // Return type unknown without type inference
  }

  visitMemberAccess(node) {
    this.visitNode(node.object);
    return 'ANY'; // Would need symbol table with struct info for precise typing
  }

  visitArrayAccess(node) {
    this.visitNode(node.array);
    for (const idx of node.indices) {
      const idxType = this.visitNode(idx);
      if (idxType && !INTEGER_TYPES.has(idxType) && idxType !== 'ANY') {
        this.warning(`Array index should be an integer type, got ${idxType}`, idx);
      }
    }
    return 'ANY'; // Would need array element type
  }

  visitIdentifierRef(node) {
    const sym = this.currentScope.lookup(node.name);
    if (!sym) {
      // Check if it's a type name, standard FB, or function
      const upperName = node.name.toUpperCase();
      if (!STANDARD_FB_TYPES.has(upperName) && !STANDARD_FUNCTIONS.has(upperName) &&
          !this.userTypes.has(upperName)) {
        this.warning(`Undeclared identifier '${node.name}'`, node);
      }
      return 'ANY';
    }

    if (sym.varType) {
      return this.getTypeName(sym.varType);
    }
    return 'ANY';
  }

  visitTypedLiteral(node) {
    this.visitNode(node.value);
    return node.typeName ? node.typeName.toUpperCase() : 'ANY';
  }

  visitNamedArgument(node) {
    if (node.value) this.visitNode(node.value);
    return 'ANY';
  }

  visitElsifClause(node) {
    this.visitNode(node.condition);
    this.visitMany(node.body);
  }

  visitElseClause(node) {
    this.visitMany(node.body);
  }

  visitCaseClause(node) {
    this.visitMany(node.body);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  getTypeName(typeNode) {
    if (!typeNode) return 'ANY';
    if (typeNode.type === NodeType.PRIMITIVE_TYPE) return typeNode.name;
    if (typeNode.type === NodeType.ARRAY_TYPE) return 'ARRAY';
    if (typeNode.type === NodeType.STRUCT_TYPE) return 'STRUCT';
    if (typeNode.type === 'StringType') return 'STRING';
    return typeNode.name || 'ANY';
  }

  typesCompatible(target, source) {
    if (target === source) return true;
    if (target === 'ANY' || source === 'ANY') return true;

    // Numeric widening
    if (NUMERIC_TYPES.has(target) && NUMERIC_TYPES.has(source)) return true;

    // BOOL to INT widening
    if (INTEGER_TYPES.has(target) && source === 'BOOL') return true;

    // String types
    if ((target === 'STRING' || target === 'WSTRING') &&
        (source === 'STRING' || source === 'WSTRING')) return true;

    // Time types
    if (target === 'TIME' && source === 'TIME') return true;

    return false;
  }
}

module.exports = Validator;
