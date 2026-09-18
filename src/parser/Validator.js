'use strict';

/**
 * @fileoverview Semantic validator for the st2js AST.
 *
 * The validator owns scope construction (POU declarations or host-supplied
 * variable descriptors), name resolution and its diagnostics (undeclared
 * identifiers, composite-descriptor rules), direction checks (writes to
 * inputs), and control-flow checks (EXIT/CONTINUE inside loops). Every type
 * question is delegated to the static typing pass in
 * `src/analysis/TypeAnalyzer.js`, which annotates the tree in place; the
 * validator performs no type inference of its own.
 */

const { NodeType, VarKind, makeError } = require('../types');
const Types = require('../analysis/types');
const TypeAnalyzer = require('../analysis/TypeAnalyzer');
const { resolveDeclaredType } = TypeAnalyzer;

class Scope {
  constructor(parent = null) {
    this.parent = parent;
    this.symbols = new Map(); // upper-cased name -> symbol record
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

/** Validate an optional non-negative integer descriptor field. Returns an error message or null. */
function checkCount(value, label) {
  if (value === undefined) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return `${label} must be a non-negative integer, got ${JSON.stringify(value)}`;
  }
  return null;
}

/** Resolved type of a descriptor (or member) from its `type`, `arraySize`, and `stringLength`. */
function descriptorType(d) {
  const canon = Types.canonicalTypeName(d.type);
  const base = canon || String(d.type);
  if (d.arraySize !== undefined) {
    return { kind: 'array', element: base, size: d.arraySize, lo: 0 };
  }
  return base;
}

class Validator {
  constructor() {
    this.errors = /** @type {import('../types').STError[]} */ ([]);
    this.globalScope = new Scope();
    this.currentScope = this.globalScope;
    this.inLoop = false;
    this.inFunction = false;
    this.currentPouName = null;
    this.userTypes = new Map(); // upper type name -> TypeAliasDeclaration node
    this.pous = new Map();      // upper POU name -> declaration node
    this._algoMode = false;
    this._exprMode = false;
    this.analyzer = new TypeAnalyzer({ symbols: this, diagnostics: this });
  }

  /**
   * Validate a POU-file AST and return all semantic diagnostics. The tree is
   * annotated in place by the typing pass.
   * @param {import('../types').ASTNode} ast
   * @returns {import('../types').STError[]}
   */
  validate(ast) {
    this.errors = [];
    this._algoMode = false;
    this._exprMode = false;
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
   * descriptors, then runs the statement-level walker.
   *
   * @param {import('../types').ASTNode} ast
   * @param {import('../types').VariableDescriptor[]} variables
   * @returns {import('../types').STError[]}
   */
  validateAlgorithm(ast, variables) {
    return this._runDescriptorMode(ast, variables, false);
  }

  /**
   * Validate an expression-mode AST (a single expression node) against an
   * externally supplied variable descriptor list. Undeclared identifiers are
   * hard errors here, since an expression has no statement-list context.
   *
   * @param {import('../types').ASTNode} ast
   * @param {import('../types').VariableDescriptor[]} variables
   * @returns {import('../types').STError[]}
   */
  validateExpression(ast, variables) {
    return this._runDescriptorMode(ast, variables, true);
  }

  _runDescriptorMode(ast, variables, exprMode) {
    this.errors = [];
    this._algoMode = true;
    this._exprMode = exprMode;
    try {
      if (!this._initAlgoState(variables) || !ast) return this.errors;
      try {
        if (exprMode) {
          this.analyzer.typeExpression(ast, null);
        } else {
          this.visitNode(ast);
        }
      } catch (e) {
        this.errors.push(makeError('validator', `Internal validator error: ${e.message}`, 1, 0));
      }
      return this.errors;
    } finally {
      this._algoMode = false;
      this._exprMode = false;
    }
  }

  /**
   * Validate descriptor shape and seed the root scope. Returns true on
   * success. On any descriptor-shape failure, pushes a validator error onto
   * `this.errors` and returns false.
   *
   * @param {import('../types').VariableDescriptor[]} variables
   * @returns {boolean}
   */
  _initAlgoState(variables) {
    if (!Array.isArray(variables)) {
      this.errors.push(makeError('validator', 'variables must be an array of VariableDescriptor', 1, 0));
      return false;
    }

    const fail = (message) => {
      this.errors.push(makeError('validator', message, 1, 0));
      return false;
    };

    const seen = new Set();
    const seeded = [];
    for (const v of variables) {
      if (!v || typeof v.name !== 'string' || typeof v.type !== 'string') {
        return fail('Each VariableDescriptor must have string name and type');
      }
      if (v.direction !== 'input' && v.direction !== 'output' && v.direction !== 'internal') {
        return fail(`Invalid direction '${v.direction}' for variable '${v.name}'`);
      }
      const sizeError = checkCount(v.arraySize, `arraySize of variable '${v.name}'`) ||
        checkCount(v.stringLength, `stringLength of variable '${v.name}'`);
      if (sizeError) return fail(sizeError);
      const key = v.name.toUpperCase();
      if (seen.has(key)) {
        return fail(`Duplicate variable descriptor name '${v.name}'`);
      }
      seen.add(key);

      if (v.members !== undefined) {
        if (!Array.isArray(v.members)) {
          return fail(`Composite descriptor '${v.name}' members must be an array`);
        }
        const memberMap = new Map();
        for (const m of v.members) {
          if (!m || typeof m.name !== 'string' || typeof m.type !== 'string') {
            return fail(`Composite descriptor '${v.name}' has a member with invalid name or type`);
          }
          if (m.direction !== 'input' && m.direction !== 'output') {
            return fail(`Invalid direction '${m.direction}' for member '${v.name}.${m.name}'`);
          }
          if (m.accessKey !== undefined && typeof m.accessKey !== 'string') {
            return fail(`Member '${v.name}.${m.name}' accessKey must be a string`);
          }
          const memberError = checkCount(m.arraySize, `arraySize of member '${v.name}.${m.name}'`) ||
            checkCount(m.stringLength, `stringLength of member '${v.name}.${m.name}'`);
          if (memberError) return fail(memberError);
          const mKey = m.name.toUpperCase();
          if (memberMap.has(mKey)) {
            return fail(`Duplicate member name '${m.name}' in composite descriptor '${v.name}'`);
          }
          const record = {
            kind: 'member',
            parent: v.name,
            name: m.name,
            type: descriptorType(m),
            direction: m.direction,
            accessKey: typeof m.accessKey === 'string' ? m.accessKey : `${v.name}.${m.name}`,
            member: m,
          };
          if (m.arraySize !== undefined) record.arraySize = m.arraySize;
          if (m.stringLength !== undefined) record.stringLength = m.stringLength;
          memberMap.set(mKey, record);
        }
        seeded.push({
          kind: 'composite',
          name: v.name,
          type: v.type,
          direction: v.direction,
          members: memberMap,
          descriptor: v,
        });
      } else {
        const record = {
          kind: 'descriptor',
          name: v.name,
          type: descriptorType(v),
          direction: v.direction,
          descriptor: v,
        };
        if (v.arraySize !== undefined) record.arraySize = v.arraySize;
        if (v.stringLength !== undefined) record.stringLength = v.stringLength;
        seeded.push(record);
      }
    }

    // Fresh root scope.
    this.globalScope = new Scope();
    this.currentScope = this.globalScope;
    this.inLoop = false;
    this.inFunction = false;
    this.currentPouName = null;
    this.userTypes = new Map();
    this.pous = new Map();

    for (const record of seeded) {
      this.currentScope.define(record.name, record);
    }
    return true;
  }

  // ─── Diagnostics ───────────────────────────────────────────────────────

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

  // ─── Name resolution (TypeAnalyzer `symbols` interface) ───────────────

  /**
   * Resolve an identifier reference to its symbol record, reporting
   * undeclared names and bare composite references. Returns null when the
   * name does not resolve to a value.
   */
  lookupIdentifier(node) {
    const sym = this.currentScope.lookup(node.name);
    if (!sym) {
      const upperName = node.name.toUpperCase();
      if (!Types.isStandardFBType(upperName) && !Types.isStandardFunction(upperName) &&
          !this.userTypes.has(upperName)) {
        if (this._exprMode) {
          this.error(`Undeclared identifier '${node.name}'`, node);
        } else {
          this.warning(`Undeclared identifier '${node.name}'`, node);
        }
      }
      return null;
    }
    if (sym.kind === 'composite') {
      this.error(`Composite descriptor '${sym.name}' cannot be referenced without a member`, node);
      return null;
    }
    return sym;
  }

  /**
   * Resolve a member access against composite descriptors.
   * @returns {{ kind: 'member', record: object } | { kind: 'error' } | { kind: 'none' }}
   */
  lookupMember(node) {
    if (node.object && node.object.type === NodeType.IDENTIFIER_REF) {
      const sym = this.currentScope.lookup(node.object.name);
      if (sym && sym.kind === 'composite') {
        const memberKey = String(node.member || '').toUpperCase();
        const record = sym.members.get(memberKey);
        if (!record) {
          this.error(`Composite descriptor '${sym.name}' has no member '${node.member}'`, node);
          return { kind: 'error' };
        }
        node.object.resolvedType = null;
        node.object.resolvedSymbol = sym;
        return { kind: 'member', record };
      }
    }

    // Multi-level access against a composite descriptor: reject explicitly.
    if (node.object && node.object.type === NodeType.MEMBER_ACCESS) {
      const rootIdent = this._memberAccessRootIdent(node.object);
      if (rootIdent) {
        const rootSym = this.currentScope.lookup(rootIdent);
        if (rootSym && rootSym.kind === 'composite') {
          this.error(`Nested members are not supported on composite descriptor '${rootSym.name}'`, node);
          return { kind: 'error' };
        }
      }
    }
    return { kind: 'none' };
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

  /**
   * Resolve `<member>` on a value of user type `objectType`: a STRUCT field
   * or a variable of a POU declared in the same file (FB outputs, etc.).
   */
  lookupMemberType(objectType, member) {
    if (typeof objectType !== 'string') return null;
    const upper = objectType.toUpperCase();
    const memberUpper = String(member || '').toUpperCase();
    const alias = this.userTypes.get(upper);
    if (alias && alias.typeDef && alias.typeDef.type === NodeType.STRUCT_TYPE) {
      for (const field of alias.typeDef.fields || []) {
        if (field.name.toUpperCase() === memberUpper) {
          return { kind: 'field', parent: objectType, name: field.name, type: resolveDeclaredType(field.varType, this.userTypes), declaration: field };
        }
      }
      return null;
    }
    const pou = this.pous.get(upper);
    if (pou) {
      for (const section of pou.varSections || []) {
        for (const decl of section.declarations || []) {
          if (decl.name.toUpperCase() === memberUpper) {
            return { kind: 'variable', name: decl.name, type: resolveDeclaredType(decl.varType, this.userTypes), varKind: section.kind, declaration: decl };
          }
        }
      }
    }
    return null;
  }

  /** Resolve an enumeration value `Type#Value` against a user enum type. */
  lookupEnumValue(typeName, valueName) {
    const alias = this.userTypes.get(String(typeName).toUpperCase());
    if (!alias || !alias.typeDef || alias.typeDef.type !== NodeType.ENUM_TYPE) return null;
    const upper = String(valueName).toUpperCase();
    for (const v of alias.typeDef.values || []) {
      const name = typeof v === 'string' ? v : v.name;
      if (name.toUpperCase() === upper) return { kind: 'enum', parent: alias.name, name, type: alias.name };
    }
    return null;
  }

  /**
   * Resolve a non-standard callee: a POU declared in the file, a function
   * block instance variable, or a standard FB type. Reports unknown callees.
   * @returns {{ type: * } | null}
   */
  lookupCallee(node) {
    const calleeName = node.callee;
    const upper = calleeName.toUpperCase();
    const sym = this.currentScope.lookup(calleeName);
    const pou = this.pous.get(upper);
    if (pou) {
      const type = pou.type === NodeType.FUNCTION_DECLARATION && pou.returnType
        ? resolveDeclaredType(pou.returnType, this.userTypes)
        : null;
      return { type };
    }
    if (sym || Types.isStandardFBType(upper) || this.globalScope.lookup(calleeName)) {
      return { type: null }; // FB instance call or standard FB: no expression value
    }
    if (this._algoMode) {
      this.error(`Unknown function '${calleeName}'`, node);
    } else {
      this.warning(`Unknown function or function block '${calleeName}'`, node);
    }
    return null;
  }

  // ─── Walker ────────────────────────────────────────────────────────────

  visitNode(node) {
    if (!node) return;

    switch (node.type) {
      case NodeType.PROGRAM_FILE:               return this.visitProgramFile(node);
      case NodeType.STATEMENT_LIST:             return this.visitMany(node.statements);
      case NodeType.FUNCTION_BLOCK_DECLARATION: return this.visitFunctionBlock(node);
      case NodeType.FUNCTION_DECLARATION:       return this.visitFunction(node);
      case NodeType.PROGRAM_DECLARATION:        return this.visitProgram(node);
      case NodeType.TYPE_DECLARATION:           return this.visitTypeDeclaration(node);
      case NodeType.TYPE_ALIAS_DECLARATION:     return this.visitTypeAlias(node);
      case NodeType.VAR_SECTION:                return this.visitVarSection(node);
      case NodeType.VAR_DECLARATION:            return this.visitVarDeclaration(node);

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
      case NodeType.ELSIF_CLAUSE:            return this.visitElsifClause(node);
      case NodeType.ELSE_CLAUSE:             return this.visitElseClause(node);
      case NodeType.CASE_CLAUSE:             return this.visitCaseClause(node);

      default:
        // Bare expressions (e.g. a statement list containing only an expression)
        this.analyzer.typeExpression(node, null);
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
      if (decl.type === NodeType.TYPE_DECLARATION) {
        for (const alias of decl.declarations) {
          this.userTypes.set(alias.name.toUpperCase(), alias);
        }
      }
    }
    for (const decl of node.declarations) {
      if (decl.name) {
        const type = decl.type === NodeType.FUNCTION_DECLARATION && decl.returnType
          ? resolveDeclaredType(decl.returnType, this.userTypes)
          : null;
        this.globalScope.define(decl.name, { kind: 'pou', name: decl.name, type, node: decl });
        this.pous.set(decl.name.toUpperCase(), decl);
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
        name: node.name,
        type: resolveDeclaredType(node.returnType, this.userTypes),
        declaration: node,
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
    for (const decl of node.declarations || []) {
      this.visitVarDeclaration(decl, node);
    }
  }

  visitVarDeclaration(node, section = null) {
    if (this.currentScope.has(node.name)) {
      this.error(`Variable '${node.name}' is already declared in this scope`, node);
    }
    const type = resolveDeclaredType(node.varType, this.userTypes);
    const record = {
      kind: 'variable',
      name: node.name,
      type,
      varKind: section ? section.kind : VarKind.LOCAL,
      declaration: node,
    };
    if (section && (section.modifiers || []).includes('CONSTANT')) record.constant = true;
    if (node.varType && node.varType.type === NodeType.STRING_TYPE && node.varType.maxLength !== undefined) {
      record.stringLength = node.varType.maxLength;
    }
    this.currentScope.define(node.name, record);

    if (node.initialValue) {
      this.analyzer.typeInitialValue(node.initialValue, type);
    }
  }

  // ─── Statements ────────────────────────────────────────────────────────────

  visitAssignment(node) {
    this.analyzer.typeAssignment(node);

    const target = node.target;
    // Check that target is assignable (not a constant, not an input)
    if (target.type === NodeType.IDENTIFIER_REF) {
      const sym = this.currentScope.lookup(target.name);
      if (sym && sym.constant) {
        this.error(`Cannot assign to constant '${target.name}'`, node);
      }
      if (sym && sym.direction === 'input') {
        this.error(`Cannot assign to read-only input '${target.name}'`, node);
      }
    }
    // Composite-member assignment: only 'output' members are writable in algo mode.
    if (target.type === NodeType.MEMBER_ACCESS && target.resolvedSymbol && target.resolvedSymbol.kind === 'member') {
      const m = target.resolvedSymbol;
      if (m.direction === 'input') {
        this.error(`Cannot assign to input-direction member '${m.parent}.${m.name}'`, node);
      }
    }
    // Array element of an input descriptor
    if (target.type === NodeType.ARRAY_ACCESS && target.array && target.array.type === NodeType.IDENTIFIER_REF) {
      const sym = this.currentScope.lookup(target.array.name);
      if (sym && sym.direction === 'input') {
        this.error(`Cannot assign to read-only input '${target.array.name}'`, node);
      }
    }
  }

  visitIfStatement(node) {
    this.analyzer.typeCondition(node.condition, 'IF');
    this.visitMany(node.consequent);
    this.visitMany(node.elsifClauses);
    if (node.elseClause) this.visitNode(node.elseClause);
  }

  visitCaseStatement(node) {
    this.analyzer.typeCaseStatement(node);
    this.visitMany(node.clauses);
    if (node.elseClause) this.visitNode(node.elseClause);
  }

  visitForStatement(node) {
    // Check that loop variable is declared
    if (node.variable.type === NodeType.IDENTIFIER_REF) {
      const sym = this.currentScope.lookup(node.variable.name);
      if (!sym) {
        this.error(`Undeclared loop variable '${node.variable.name}'`, node.variable);
      } else if (sym.direction === 'input') {
        this.error(`Cannot assign to read-only input '${node.variable.name}'`, node.variable);
      }
    }

    this.analyzer.typeForStatement(node);

    const wasInLoop = this.inLoop;
    this.inLoop = true;
    this.visitMany(node.body);
    this.inLoop = wasInLoop;
  }

  visitWhileStatement(node) {
    this.analyzer.typeCondition(node.condition, 'WHILE');
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
    this.analyzer.typeCondition(node.condition, 'REPEAT UNTIL');
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
    this.analyzer.typeCallStatement(node);
  }

  visitElsifClause(node) {
    this.analyzer.typeCondition(node.condition, 'ELSIF');
    this.visitMany(node.body);
  }

  visitElseClause(node) {
    this.visitMany(node.body);
  }

  visitCaseClause(node) {
    this.visitMany(node.body);
  }
}

module.exports = Validator;
module.exports.Scope = Scope;
