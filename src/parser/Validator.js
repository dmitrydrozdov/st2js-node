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

  /**
   * Validate an algorithm-mode AST (a StatementList) against an externally
   * supplied variable descriptor list. Seeds the root scope with the
   * descriptors, then runs the usual statement-level walker.
   *
   * @param {import('../types').ASTNode} ast
   * @param {import('../types').VariableDescriptor[]} variables
   * @returns {import('../types').STError[]}
   */
  validateAlgorithm(ast, variables) {
    this.errors = [];
    this._algoMode = true;
    this._exprMode = false;
    if (!this._initAlgoState(variables)) {
      this._algoMode = false;
      this._algoDescriptors = null;
      return this.errors;
    }

    if (!ast) {
      this._algoMode = false;
      this._algoDescriptors = null;
      return this.errors;
    }

    try {
      this.visitNode(ast);
    } catch (e) {
      this.errors.push(makeError('validator', `Internal validator error: ${e.message}`, 1, 0));
    }

    this._algoMode = false;
    this._algoDescriptors = null;
    return this.errors;
  }

  /**
   * Validate an expression-mode AST (a single expression node) against an
   * externally supplied variable descriptor list. Mirrors `validateAlgorithm`
   * descriptor checks but treats undeclared identifiers as hard errors instead
   * of warnings, since an expression has no statement-list context where a
   * stray name might be declared elsewhere.
   *
   * @param {import('../types').ASTNode} ast
   * @param {import('../types').VariableDescriptor[]} variables
   * @returns {import('../types').STError[]}
   */
  validateExpression(ast, variables) {
    this.errors = [];
    this._algoMode = true;
    this._exprMode = true;
    if (!this._initAlgoState(variables)) {
      this._algoMode = false;
      this._exprMode = false;
      this._algoDescriptors = null;
      return this.errors;
    }

    if (!ast) {
      this._algoMode = false;
      this._exprMode = false;
      this._algoDescriptors = null;
      return this.errors;
    }

    try {
      this.visitNode(ast);
    } catch (e) {
      this.errors.push(makeError('validator', `Internal validator error: ${e.message}`, 1, 0));
    }

    this._algoMode = false;
    this._exprMode = false;
    this._algoDescriptors = null;
    return this.errors;
  }

  /**
   * Validate descriptor shape and seed `globalScope` / `_algoDescriptors`.
   * Returns true on success. On any descriptor-shape failure, pushes a
   * validator error onto `this.errors` and returns false.
   *
   * @param {import('../types').VariableDescriptor[]} variables
   * @returns {boolean}
   */
  _initAlgoState(variables) {
    if (!Array.isArray(variables)) {
      this.errors.push(makeError('validator', 'variables must be an array of VariableDescriptor', 1, 0));
      return false;
    }

    const seen = new Set();
    const seeded = [];
    for (const v of variables) {
      if (!v || typeof v.name !== 'string' || typeof v.type !== 'string') {
        this.errors.push(makeError('validator', 'Each VariableDescriptor must have string name and type', 1, 0));
        return false;
      }
      if (v.direction !== 'input' && v.direction !== 'output' && v.direction !== 'internal') {
        this.errors.push(makeError('validator', `Invalid direction '${v.direction}' for variable '${v.name}'`, 1, 0));
        return false;
      }
      const key = v.name.toUpperCase();
      if (seen.has(key)) {
        this.errors.push(makeError('validator', `Duplicate variable descriptor name '${v.name}'`, 1, 0));
        return false;
      }
      seen.add(key);

      let info;
      if (v.members !== undefined) {
        if (!Array.isArray(v.members)) {
          this.errors.push(makeError('validator', `Composite descriptor '${v.name}' members must be an array`, 1, 0));
          return false;
        }
        const memberMap = new Map();
        const memberSeen = new Set();
        for (const m of v.members) {
          if (!m || typeof m.name !== 'string' || typeof m.type !== 'string') {
            this.errors.push(makeError('validator', `Composite descriptor '${v.name}' has a member with invalid name or type`, 1, 0));
            return false;
          }
          if (m.direction !== 'input' && m.direction !== 'output') {
            this.errors.push(makeError('validator', `Invalid direction '${m.direction}' for member '${v.name}.${m.name}'`, 1, 0));
            return false;
          }
          if (m.accessKey !== undefined && typeof m.accessKey !== 'string') {
            this.errors.push(makeError('validator', `Member '${v.name}.${m.name}' accessKey must be a string`, 1, 0));
            return false;
          }
          const mKey = m.name.toUpperCase();
          if (memberSeen.has(mKey)) {
            this.errors.push(makeError('validator', `Duplicate member name '${m.name}' in composite descriptor '${v.name}'`, 1, 0));
            return false;
          }
          memberSeen.add(mKey);
          memberMap.set(mKey, {
            name: m.name,
            type: m.type,
            direction: m.direction,
            accessKey: typeof m.accessKey === 'string' ? m.accessKey : `${v.name}.${m.name}`,
          });
        }
        info = {
          kind: 'composite',
          name: v.name,
          type: v.type,
          direction: v.direction,
          members: memberMap,
        };
      } else {
        info = {
          kind: 'flat',
          name: v.name,
          type: v.type,
          direction: v.direction,
        };
      }
      seeded.push(info);
    }

    // Fresh root scope.
    this.globalScope = new Scope();
    this.currentScope = this.globalScope;
    this.inLoop = false;
    this.inFunction = false;
    this.currentPouName = null;
    this.userTypes = new Map();
    this._algoDescriptors = new Map();

    for (const info of seeded) {
      this._algoDescriptors.set(info.name.toUpperCase(), info);
      if (info.kind === 'composite') {
        this.currentScope.define(info.name, {
          kind: 'composite-descriptor',
          descriptorInfo: info,
          direction: info.direction,
        });
      } else {
        this.currentScope.define(info.name, {
          kind: 'variable',
          varType: { type: NodeType.PRIMITIVE_TYPE, name: info.type.toUpperCase() },
          direction: info.direction,
        });
      }
    }
    return true;
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
      case NodeType.STATEMENT_LIST:           return this.visitMany(node.statements);
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
      if (sym && sym.direction === 'input') {
        this.error(`Cannot assign to read-only input '${node.target.name}'`, node);
      }
    }
    // Composite-member assignment: only 'output' members are writable in algo mode.
    if (node.target.type === NodeType.MEMBER_ACCESS && node.target._compositeMember) {
      const m = node.target._compositeMember;
      if (m.direction === 'input') {
        this.error(
          `Cannot assign to input-direction member '${node.target._compositeParent}.${m.name}'`,
          node,
        );
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
    // Composite-descriptor handling: when the object is a direct identifier
    // referring to a composite descriptor, resolve the member against the
    // descriptor's members map. Skip the regular identifier visit so the
    // bare-composite-reference error doesn't fire.
    if (node.object && node.object.type === NodeType.IDENTIFIER_REF) {
      const sym = this.currentScope.lookup(node.object.name);
      if (sym && sym.kind === 'composite-descriptor') {
        const info = sym.descriptorInfo;
        const memberKey = String(node.member || '').toUpperCase();
        const member = info.members.get(memberKey);
        if (!member) {
          this.error(
            `Composite descriptor '${info.name}' has no member '${node.member}'`,
            node,
          );
          return 'ANY';
        }
        node._compositeMember = member;
        node._compositeParent = info.name;
        return member.type.toUpperCase();
      }
    }

    // Multi-level access against a composite descriptor: reject explicitly.
    if (node.object && node.object.type === NodeType.MEMBER_ACCESS) {
      const rootIdent = this._memberAccessRootIdent(node.object);
      if (rootIdent) {
        const rootSym = this.currentScope.lookup(rootIdent);
        if (rootSym && rootSym.kind === 'composite-descriptor') {
          this.error(
            `Nested members are not supported on composite descriptor '${rootSym.descriptorInfo.name}'`,
            node,
          );
          return 'ANY';
        }
      }
    }

    this.visitNode(node.object);
    return 'ANY'; // Would need symbol table with struct info for precise typing
  }

  /** Walk a chain of MemberAccess nodes back to the root IDENTIFIER_REF name, or null. */
  _memberAccessRootIdent(node) {
    let cur = node;
    while (cur && cur.type === NodeType.MEMBER_ACCESS) {
      cur = cur.object;
    }
    if (cur && cur.type === NodeType.IDENTIFIER_REF) return cur.name;
    return null;
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
        if (this._exprMode) {
          this.error(`Undeclared identifier '${node.name}'`, node);
        } else {
          this.warning(`Undeclared identifier '${node.name}'`, node);
        }
      }
      return 'ANY';
    }

    if (sym.kind === 'composite-descriptor') {
      this.error(
        `Composite descriptor '${sym.descriptorInfo.name}' cannot be referenced without a member`,
        node,
      );
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
