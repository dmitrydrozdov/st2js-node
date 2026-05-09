'use strict';

/**
 * @fileoverview JavaScript code generator for IEC 61131-3 Structured Text ASTs.
 * Walks the AST produced by the parser and emits equivalent JavaScript code.
 */

const { NodeType, VarKind } = require('../types');
const TypeMapper = require('./TypeMapper');

class Codegen {
  constructor(options = {}) {
    this.sourceMaps = options.sourceMaps !== false;
    this.filename = options.filename || '<input>';
    this.source = options.source || '';
    this.warnings = [];
    this._indent = 0;
    this._lines = [];
    // Track variable types: name -> type string
    this._varTypes = new Map();
    // Track which variables are FB/class instances: name -> class name
    this._fbInstanceVarTypes = new Map();
    // Track which variables belong to `this` in a function block
    this._fbInstanceVars = new Set();
    // Track input params (no `this.` prefix)
    this._fbInputParams = new Set();
    // Current context
    this._inFB = false;
    this._returnType = null;
    this._functionName = null;
    // POU names declared at top level (function blocks, functions, programs)
    this._topLevelPOUs = new Set();
    // Algorithm mode: descriptor names routed through __s[...]
    this._inAlgo = false;
    this._algoScopeVars = new Set();
    // Composite descriptor lookup (algo mode only):
    //   parentNameUpper -> Map<memberNameUpper, { name, type, direction, accessKey }>
    this._compositeDescriptors = new Map();
  }

  /**
   * Generate JavaScript from an AST.
   * @param {object} ast - Root AST node (ProgramFile)
   * @returns {{ code: string, sourceMap: object, warnings: string[] }}
   */
  generate(ast) {
    this._lines = [];
    this._indent = 0;
    this.warnings = [];

    if (ast.type === NodeType.PROGRAM_FILE) {
      this._genProgramFile(ast);
    } else {
      this._genNode(ast);
    }

    const code = this._lines.join('\n') + '\n';
    return {
      code,
      sourceMap: this.sourceMaps ? { file: this.filename, mappings: [] } : null,
      warnings: this.warnings,
    };
  }

  /**
   * Generate a bare JS body for an algorithm (statement list) using a host
   * scope object. Reads and writes to descriptor-named variables are rewritten
   * to `__s["name"]` accesses.
   *
   * @param {object} ast - Root AST node (StatementList)
   * @param {import('../types').VariableDescriptor[]} variables
   * @param {object} [options]
   * @returns {import('../types').AlgorithmCompileResult}
   */
  generateAlgorithm(ast, variables, options = {}) {
    this._lines = [];
    this._indent = 0;
    this.warnings = [];

    const prevInAlgo = this._inAlgo;
    const prevAlgoVars = this._algoScopeVars;
    const prevVarTypes = new Map(this._varTypes);
    const prevInFB = this._inFB;
    const prevComposite = this._compositeDescriptors;

    this._inAlgo = true;
    this._inFB = false;
    this._algoScopeVars = new Set();
    this._compositeDescriptors = new Map();

    const { inputNames, outputNames, internalNames } = this._seedAlgoDescriptors(variables);

    const statements = (ast && ast.statements) || [];
    for (const stmt of statements) {
      this._emitLineComment(stmt);
      this._genNode(stmt);
    }

    const code = this._lines.join('\n') + (this._lines.length ? '\n' : '');

    // Restore state
    this._inAlgo = prevInAlgo;
    this._algoScopeVars = prevAlgoVars;
    this._varTypes = prevVarTypes;
    this._inFB = prevInFB;
    this._compositeDescriptors = prevComposite;

    return {
      code,
      inputNames,
      outputNames,
      internalNames,
      warnings: this.warnings.slice(),
      errors: [],
    };
  }

  /**
   * Generate a bare JS expression string for a single ST expression AST.
   * Descriptor variables are read through `__s["name"]`.
   *
   * @param {object} ast - Root expression AST node
   * @param {import('../types').VariableDescriptor[]} variables
   * @param {object} [options]
   * @returns {{ code: string, inputNames: string[], outputNames: string[], internalNames: string[], warnings: string[], errors: any[] }}
   */
  generateExpression(ast, variables, options = {}) {
    this._lines = [];
    this._indent = 0;
    this.warnings = [];

    const prevInAlgo = this._inAlgo;
    const prevAlgoVars = this._algoScopeVars;
    const prevVarTypes = new Map(this._varTypes);
    const prevInFB = this._inFB;
    const prevComposite = this._compositeDescriptors;

    this._inAlgo = true;
    this._inFB = false;
    this._algoScopeVars = new Set();
    this._compositeDescriptors = new Map();

    const { inputNames, outputNames, internalNames } = this._seedAlgoDescriptors(variables);

    const code = this._genExpr(ast);

    this._inAlgo = prevInAlgo;
    this._algoScopeVars = prevAlgoVars;
    this._varTypes = prevVarTypes;
    this._inFB = prevInFB;
    this._compositeDescriptors = prevComposite;

    return {
      code,
      inputNames,
      outputNames,
      internalNames,
      warnings: this.warnings.slice(),
      errors: [],
    };
  }

  /**
   * Seed algorithm-mode state from a descriptor list. Flat descriptors
   * register their `name` in `_algoScopeVars` and contribute it to the
   * direction bucket. Composite descriptors register their parent `name` in
   * `_algoScopeVars` so member-access lookups can recognise it, but the parent
   * does NOT contribute to the direction buckets — each member contributes
   * its effective access key (`accessKey` or `"<parent>.<member>"`) to the
   * bucket matching the member's `direction`.
   *
   * @param {import('../types').VariableDescriptor[]} variables
   * @returns {{ inputNames: string[], outputNames: string[], internalNames: string[] }}
   */
  _seedAlgoDescriptors(variables) {
    const inputNames = [];
    const outputNames = [];
    const internalNames = [];

    for (const v of variables || []) {
      if (Array.isArray(v.members)) {
        // Composite: register parent for member-access lookup; bucket each
        // member's effective access key by member direction.
        this._algoScopeVars.add(v.name);
        const memberMap = new Map();
        for (const m of v.members) {
          if (!m || typeof m.name !== 'string') continue;
          const accessKey = typeof m.accessKey === 'string' ? m.accessKey : `${v.name}.${m.name}`;
          memberMap.set(m.name.toUpperCase(), {
            name: m.name,
            type: String(m.type || '').toUpperCase(),
            direction: m.direction,
            accessKey,
          });
          this._varTypes.set(accessKey, String(m.type || '').toUpperCase());
          if (m.direction === 'input') inputNames.push(accessKey);
          else if (m.direction === 'output') outputNames.push(accessKey);
        }
        this._compositeDescriptors.set(v.name.toUpperCase(), memberMap);
      } else {
        this._algoScopeVars.add(v.name);
        this._varTypes.set(v.name, String(v.type).toUpperCase());
        if (v.direction === 'input') inputNames.push(v.name);
        else if (v.direction === 'output') outputNames.push(v.name);
        else if (v.direction === 'internal') internalNames.push(v.name);
      }
    }
    return { inputNames, outputNames, internalNames };
  }

  /**
   * If `node` is a `MemberAccess` whose object is a composite-descriptor
   * IDENTIFIER_REF in algorithm mode, return the matching member descriptor;
   * otherwise null.
   */
  _resolveCompositeMember(node) {
    if (!this._inAlgo) return null;
    if (!node || node.type !== NodeType.MEMBER_ACCESS) return null;
    if (!node.object || node.object.type !== NodeType.IDENTIFIER_REF) return null;
    const map = this._compositeDescriptors.get(String(node.object.name).toUpperCase());
    if (!map) return null;
    return map.get(String(node.member || '').toUpperCase()) || null;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  _emit(text) {
    this._lines.push('  '.repeat(this._indent) + text);
  }

  _emitRaw(text) {
    this._lines.push(text);
  }

  _emitLineComment(node) {
    if (this.sourceMaps && node && node.loc) {
      this._emit(`// ST line ${node.loc.line}`);
    }
  }

  _pushIndent() { this._indent++; }
  _popIndent() { this._indent = Math.max(0, this._indent - 1); }

  // ─── Program File ─────────────────────────────────────────────────────────

  _genProgramFile(node) {
    // Collect all POU names first (for FB instance detection)
    for (const decl of node.declarations || []) {
      if (decl.name) this._topLevelPOUs.add(decl.name.toUpperCase());
    }

    this._emit("'use strict';");
    this._emitRaw('');
    for (const decl of node.declarations || []) {
      this._genNode(decl);
      this._emitRaw('');
    }
  }

  // ─── Dispatcher ───────────────────────────────────────────────────────────

  _genNode(node) {
    if (!node) return;
    switch (node.type) {
      case NodeType.PROGRAM_FILE:               return this._genProgramFile(node);
      case NodeType.FUNCTION_DECLARATION:       return this._genFunction(node);
      case NodeType.FUNCTION_BLOCK_DECLARATION: return this._genFunctionBlock(node);
      case NodeType.PROGRAM_DECLARATION:        return this._genProgram(node);
      case NodeType.TYPE_DECLARATION:           return this._genTypeDeclaration(node);

      // Statements
      case NodeType.ASSIGNMENT:                 return this._genAssignment(node);
      case NodeType.IF_STATEMENT:               return this._genIf(node);
      case NodeType.CASE_STATEMENT:             return this._genCase(node);
      case NodeType.FOR_STATEMENT:              return this._genFor(node);
      case NodeType.WHILE_STATEMENT:            return this._genWhile(node);
      case NodeType.REPEAT_STATEMENT:           return this._genRepeat(node);
      case NodeType.RETURN_STATEMENT:           return this._genReturn(node);
      case NodeType.EXIT_STATEMENT:             this._emit('break;'); return;
      case NodeType.CONTINUE_STATEMENT:         this._emit('continue;'); return;
      case NodeType.FUNCTION_CALL_STATEMENT:    return this._genFunctionCallStatement(node);
      case NodeType.EMPTY_STATEMENT:            return;

      default:
        this.warnings.push(`Unknown node type in statement: ${node.type}`);
    }
  }

  // ─── FUNCTION_BLOCK → class ───────────────────────────────────────────────

  _genFunctionBlock(node) {
    const name = node.name;
    this._emit(`class ${name} {`);
    this._pushIndent();

    const { inputs, outputs, inouts, locals } = this._collectVars(node.varSections || []);

    // Save state
    const prevInFB = this._inFB;
    const prevFBVars = this._fbInstanceVars;
    const prevFBInputs = this._fbInputParams;
    const prevVarTypes = new Map(this._varTypes);
    const prevFBInstanceVarTypes = new Map(this._fbInstanceVarTypes);

    this._inFB = true;
    this._fbInstanceVars = new Set();
    this._fbInputParams = new Set();

    // Instance variables: locals + outputs
    for (const v of [...locals, ...outputs]) {
      this._fbInstanceVars.add(v.name);
      const typeName = this._getVarTypeName(v);
      this._varTypes.set(v.name, typeName);
      if (this._isClassType(typeName)) {
        this._fbInstanceVarTypes.set(v.name, typeName);
      }
    }
    // Input params (passed to call())
    for (const v of [...inputs, ...inouts]) {
      this._fbInputParams.add(v.name);
      const typeName = this._getVarTypeName(v);
      this._varTypes.set(v.name, typeName);
    }

    // Constructor: initialize instance vars
    this._emit('constructor() {');
    this._pushIndent();
    for (const v of [...locals, ...outputs]) {
      const defVal = this._getVarDefault(v);
      const typeComment = ` // ${this._getVarTypeName(v)}`;
      this._emit(`this.${v.name} = ${defVal};${typeComment}`);
    }
    // Also initialize in-out vars as instance if they have defaults
    for (const v of inouts) {
      if (v.initialValue) {
        this._emit(`this.${v.name} = ${this._getVarDefault(v)}; // ${this._getVarTypeName(v)}`);
      }
    }
    this._popIndent();
    this._emit('}');
    this._emitRaw('');

    // call() method
    const inputParams = [...inputs, ...inouts].map(v => v.name);
    this._emit(`call(${inputParams.join(', ')}) {`);
    this._pushIndent();

    for (const stmt of node.body || []) {
      this._emitLineComment(stmt);
      this._genNode(stmt);
    }

    this._popIndent();
    this._emit('}');

    this._popIndent();
    this._emit('}');

    // Restore state
    this._inFB = prevInFB;
    this._fbInstanceVars = prevFBVars;
    this._fbInputParams = prevFBInputs;
    this._varTypes = prevVarTypes;
    this._fbInstanceVarTypes = prevFBInstanceVarTypes;
  }

  // ─── FUNCTION → function ──────────────────────────────────────────────────

  _genFunction(node) {
    const name = node.name;
    const { inputs, outputs, inouts, locals } = this._collectVars(node.varSections || []);
    const paramNames = [...inputs, ...inouts].map(v => v.name);

    this._emit(`function ${name}(${paramNames.join(', ')}) {`);
    this._pushIndent();

    const prevReturnType = this._returnType;
    const prevFunctionName = this._functionName;
    const prevVarTypes = new Map(this._varTypes);
    const prevInFB = this._inFB;
    this._inFB = false;

    const returnTypeName = this._getReturnTypeName(node);
    this._returnType = returnTypeName;
    this._functionName = name;

    const retDefault = TypeMapper.getDefaultValue(returnTypeName);
    this._emit(`let _result = ${retDefault}; // return value (${returnTypeName})`);

    // Register return var under function name for assignment detection
    this._varTypes.set(name, returnTypeName);
    this._varTypes.set('_result', returnTypeName);

    // Locals and output vars
    for (const v of [...locals, ...outputs]) {
      const defVal = this._getVarDefault(v);
      const typeName = this._getVarTypeName(v);
      this._emit(`let ${v.name} = ${defVal}; // ${typeName}`);
      this._varTypes.set(v.name, typeName);
    }

    // Register inputs
    for (const v of [...inputs, ...inouts]) {
      this._varTypes.set(v.name, this._getVarTypeName(v));
    }

    // Body
    for (const stmt of node.body || []) {
      this._emitLineComment(stmt);
      this._genNode(stmt);
    }

    this._emit('return _result;');
    this._popIndent();
    this._emit('}');

    this._returnType = prevReturnType;
    this._functionName = prevFunctionName;
    this._varTypes = prevVarTypes;
    this._inFB = prevInFB;
  }

  // ─── PROGRAM → module ─────────────────────────────────────────────────────

  _genProgram(node) {
    const name = node.name;
    this._emit(`// Program: ${name}`);

    const prevVarTypes = new Map(this._varTypes);
    const prevInFB = this._inFB;
    this._inFB = false;

    const { inputs, outputs, inouts, locals } = this._collectVars(node.varSections || []);
    const allVars = [...inputs, ...outputs, ...inouts, ...locals];

    for (const v of allVars) {
      const typeName = this._getVarTypeName(v);
      const defVal = this._getVarDefault(v);
      this._emit(`let ${v.name} = ${defVal}; // ${typeName}`);
      this._varTypes.set(v.name, typeName);
      if (this._isClassType(typeName)) {
        this._fbInstanceVarTypes.set(v.name, typeName);
      }
    }

    this._emitRaw('');
    this._emit('function run() {');
    this._pushIndent();
    for (const stmt of node.body || []) {
      this._emitLineComment(stmt);
      this._genNode(stmt);
    }
    this._popIndent();
    this._emit('}');
    this._emitRaw('');

    if (allVars.length > 0) {
      const getters = allVars.map(v => `get ${v.name}() { return ${v.name}; }`);
      this._emit(`module.exports = { run, ${getters.join(', ')} };`);
    } else {
      this._emit('module.exports = { run };');
    }

    this._varTypes = prevVarTypes;
    this._inFB = prevInFB;
  }

  // ─── Type Declarations ────────────────────────────────────────────────────

  _genTypeDeclaration(node) {
    for (const alias of node.declarations || []) {
      if (!alias.typeDef) continue;
      if (alias.typeDef.type === NodeType.STRUCT_TYPE) {
        this._genStructClass(alias.name, alias.typeDef);
      } else if (alias.typeDef.type === 'EnumType') {
        this._genEnumType(alias.name, alias.typeDef);
      }
      // Other type aliases (subrange, array) don't need JS output
    }
  }

  _genStructClass(name, spec) {
    this._emit(`class ${name} {`);
    this._pushIndent();
    this._emit('constructor() {');
    this._pushIndent();
    for (const field of spec.fields || []) {
      const defVal = this._getVarDefault(field);
      this._emit(`this.${field.name} = ${defVal}; // ${this._getVarTypeName(field)}`);
    }
    this._popIndent();
    this._emit('}');
    this._popIndent();
    this._emit('}');
  }

  _genEnumType(name, spec) {
    this._emit(`const ${name} = Object.freeze({`);
    this._pushIndent();
    let idx = 0;
    for (const v of spec.values || []) {
      const vname = typeof v === 'string' ? v : v.name;
      const vval = (v && v.value) ? this._genExpr(v.value) : idx;
      this._emit(`${vname}: ${vval},`);
      idx++;
    }
    this._popIndent();
    this._emit('});');
  }

  // ─── Variable Helpers ─────────────────────────────────────────────────────

  _collectVars(varSections) {
    const inputs = [], outputs = [], inouts = [], locals = [];
    for (const section of varSections) {
      let target;
      switch (section.kind) {
        case VarKind.INPUT:    target = inputs; break;
        case VarKind.OUTPUT:   target = outputs; break;
        case VarKind.IN_OUT:   target = inouts; break;
        default:               target = locals; break;
      }
      for (const decl of section.declarations || []) {
        target.push(decl);
      }
    }
    return { inputs, outputs, inouts, locals };
  }

  _getVarTypeName(varDecl) {
    // varDecl.varType comes from ASTBuilder (normalized from VarDeclaration)
    const vt = varDecl.varType;
    if (!vt) return 'INT';
    if (vt.type === NodeType.PRIMITIVE_TYPE) return vt.name;
    if (vt.type === 'StringType') return 'STRING';
    if (vt.type === NodeType.ARRAY_TYPE) return 'ARRAY';
    if (vt.type === NodeType.STRUCT_TYPE) return 'STRUCT';
    return vt.name || 'INT';
  }

  _getReturnTypeName(funcNode) {
    if (!funcNode.returnType) return 'INT';
    const rt = funcNode.returnType;
    if (rt.type === NodeType.PRIMITIVE_TYPE) return rt.name;
    if (rt.type === 'StringType') return 'STRING';
    return rt.name || 'INT';
  }

  _getVarDefault(varDecl) {
    if (varDecl.initialValue) {
      return this._genExpr(varDecl.initialValue);
    }
    const typeName = this._getVarTypeName(varDecl);
    if (this._isClassType(typeName)) {
      return `new ${typeName}()`;
    }
    return TypeMapper.getDefaultValue(typeName);
  }

  /** Returns true if typeName is a user-defined class/FB type (not a primitive) */
  _isClassType(typeName) {
    if (!typeName || typeName === 'ANY' || typeName === 'ARRAY' || typeName === 'STRUCT') return false;
    if (TypeMapper.getDefaultValue(typeName) !== 'null') return false; // has a known primitive default
    // It's a user-defined type → treat as class
    return true;
  }

  // ─── Prefix helper for `this.` in FB context ──────────────────────────────

  _varRef(name) {
    if (this._inAlgo && this._algoScopeVars.has(name)) {
      return `__s[${JSON.stringify(name)}]`;
    }
    if (this._inFB && this._fbInstanceVars.has(name)) {
      return `this.${name}`;
    }
    return name;
  }

  // ─── Statements ───────────────────────────────────────────────────────────

  _genAssignment(node) {
    const target = this._genExprLhs(node.target);
    const value = this._genExpr(node.value);
    const targetType = this._inferType(node.target);

    // Check if assigning to function name (return value in FUNCTION context)
    if (!this._inFB && this._functionName &&
        node.target.type === NodeType.IDENTIFIER_REF &&
        node.target.name === this._functionName) {
      if (TypeMapper.needsIntegerClamp(this._returnType)) {
        this._emit(`_result = (${value}) | 0;`);
      } else {
        this._emit(`_result = ${value};`);
      }
      return;
    }

    if (TypeMapper.needsIntegerClamp(targetType)) {
      this._emit(`${target} = (${value}) | 0;`);
    } else if (targetType === 'REAL' || targetType === 'LREAL') {
      this._emit(`${target} = ${value};`);
    } else {
      this._emit(`${target} = ${value};`);
    }
  }

  _genIf(node) {
    const cond = this._genExpr(node.condition);
    this._emit(`if (${cond}) {`);
    this._pushIndent();
    for (const stmt of node.consequent || []) {
      this._emitLineComment(stmt);
      this._genNode(stmt);
    }
    this._popIndent();

    for (const elsif of node.elsifClauses || []) {
      const elsifCond = this._genExpr(elsif.condition);
      this._emit(`} else if (${elsifCond}) {`);
      this._pushIndent();
      for (const stmt of elsif.body || []) {
        this._emitLineComment(stmt);
        this._genNode(stmt);
      }
      this._popIndent();
    }

    if (node.elseClause) {
      this._emit('} else {');
      this._pushIndent();
      for (const stmt of node.elseClause.body || []) {
        this._emitLineComment(stmt);
        this._genNode(stmt);
      }
      this._popIndent();
    }

    this._emit('}');
  }

  _genCase(node) {
    const expr = this._genExpr(node.discriminant);
    this._emit(`switch (${expr}) {`);
    this._pushIndent();

    for (const clause of node.clauses || []) {
      for (const val of clause.values || []) {
        if (val.type === 'RangeLiteral') {
          // Expand range into individual cases
          if (val.lo.type === NodeType.INTEGER_LITERAL && val.hi.type === NodeType.INTEGER_LITERAL) {
            for (let i = val.lo.value; i <= val.hi.value; i++) {
              this._emit(`case ${i}:`);
            }
          } else {
            this._emit(`case ${this._genExpr(val.lo)}: // range ..${this._genExpr(val.hi)}`);
          }
        } else {
          this._emit(`case ${this._genExpr(val)}:`);
        }
      }
      this._pushIndent();
      for (const stmt of clause.body || []) {
        this._emitLineComment(stmt);
        this._genNode(stmt);
      }
      this._emit('break;');
      this._popIndent();
    }

    if (node.elseClause) {
      this._emit('default:');
      this._pushIndent();
      for (const stmt of node.elseClause.body || []) {
        this._emitLineComment(stmt);
        this._genNode(stmt);
      }
      this._emit('break;');
      this._popIndent();
    }

    this._popIndent();
    this._emit('}');
  }

  _genFor(node) {
    const varRef = this._genExprLhs(node.variable);
    const from = this._genExpr(node.from);
    const to = this._genExpr(node.to);
    const step = node.by ? this._genExpr(node.by) : '1';
    const stepIsLiteral = !node.by;

    if (stepIsLiteral) {
      this._emit(`for (${varRef} = (${from}) | 0; ${varRef} <= (${to}) | 0; ${varRef} = (${varRef} + 1) | 0) {`);
    } else {
      this._emit(`for (${varRef} = (${from}) | 0; (${step}) > 0 ? ${varRef} <= (${to}) | 0 : ${varRef} >= (${to}) | 0; ${varRef} = (${varRef} + (${step})) | 0) {`);
    }
    this._pushIndent();
    for (const stmt of node.body || []) {
      this._emitLineComment(stmt);
      this._genNode(stmt);
    }
    this._popIndent();
    this._emit('}');
  }

  _genWhile(node) {
    const cond = this._genExpr(node.condition);
    this._emit(`while (${cond}) {`);
    this._pushIndent();
    for (const stmt of node.body || []) {
      this._emitLineComment(stmt);
      this._genNode(stmt);
    }
    this._popIndent();
    this._emit('}');
  }

  _genRepeat(node) {
    this._emit('do {');
    this._pushIndent();
    for (const stmt of node.body || []) {
      this._emitLineComment(stmt);
      this._genNode(stmt);
    }
    this._popIndent();
    const cond = this._genExpr(node.condition);
    this._emit(`} while (!(${cond}));`);
  }

  _genReturn(node) {
    if (this._returnType) {
      this._emit('return _result;');
    } else {
      this._emit('return;');
    }
  }

  _genFunctionCallStatement(node) {
    const call = node.call;
    this._emit(`${this._genExpr(call)};`);
  }

  // ─── Expressions ──────────────────────────────────────────────────────────

  /** Generate expression for use as assignment target (LHS) */
  _genExprLhs(node) {
    if (!node) return '/* error */';
    switch (node.type) {
      case NodeType.IDENTIFIER_REF:
        return this._varRef(node.name);
      case NodeType.MEMBER_ACCESS: {
        const member = this._resolveCompositeMember(node);
        if (member) {
          return `__s[${JSON.stringify(member.accessKey)}]`;
        }
        return `${this._genExprLhs(node.object)}.${node.member}`;
      }
      case NodeType.ARRAY_ACCESS: {
        const arr = this._genExprLhs(node.array);
        const idxs = (node.indices || []).map(i => this._genExpr(i));
        // Multi-dimensional: arr[i][j]
        return arr + idxs.map(i => `[${i}]`).join('');
      }
      default:
        return this._genExpr(node);
    }
  }

  _genExpr(node) {
    if (!node) return 'undefined';

    switch (node.type) {
      case NodeType.INTEGER_LITERAL:
        return String(node.value);

      case NodeType.REAL_LITERAL:
        return String(node.value);

      case NodeType.BOOL_LITERAL:
        return node.value ? 'true' : 'false';

      case NodeType.STRING_LITERAL:
        return JSON.stringify(node.value);

      case NodeType.TIME_LITERAL:
        return String(node.ms !== undefined ? node.ms : node.value);

      case NodeType.DATE_LITERAL:
        return `/* DATE: ${node.value} */ 0`;

      case NodeType.TYPED_LITERAL:
        return this._genExpr(node.value);

      case NodeType.IDENTIFIER_REF:
        return this._varRef(node.name);

      case NodeType.MEMBER_ACCESS: {
        const member = this._resolveCompositeMember(node);
        if (member) {
          return `__s[${JSON.stringify(member.accessKey)}]`;
        }
        return `${this._genExpr(node.object)}.${node.member}`;
      }

      case NodeType.ARRAY_ACCESS: {
        const arr = this._genExpr(node.array);
        const idxs = (node.indices || []).map(i => this._genExpr(i));
        return arr + idxs.map(i => `[${i}]`).join('');
      }

      case NodeType.BINARY_EXPR:
        return this._genBinaryExpr(node);

      case NodeType.UNARY_EXPR:
        return this._genUnaryExpr(node);

      case NodeType.FUNCTION_CALL:
        return this._genFunctionCall(node);

      case NodeType.NAMED_ARGUMENT:
        return node.value ? this._genExpr(node.value) : 'undefined';

      case 'RangeLiteral':
        return this._genExpr(node.lo); // fallback

      default:
        this.warnings.push(`Unknown expression type: ${node.type}`);
        return '/* unknown */';
    }
  }

  _genBinaryExpr(node) {
    const left = this._genExpr(node.left);
    const right = this._genExpr(node.right);
    const op = node.operator;

    if (op === 'AND') return `(${left} && ${right})`;
    if (op === 'OR')  return `(${left} || ${right})`;
    if (op === 'XOR') {
      const lt = this._inferType(node.left);
      if (lt === 'BOOL') return `(!!(${left}) !== !!(${right}))`;
      return `((${left}) ^ (${right}))`;
    }

    const opMap = {
      '+': '+', '-': '-', '*': '*', '/': '/',
      'MOD': '%', '**': '**',
      '=': '===', '<>': '!==',
      '<': '<', '<=': '<=', '>': '>', '>=': '>=',
    };

    const jsOp = opMap[op] || op;
    return `(${left} ${jsOp} ${right})`;
  }

  _genUnaryExpr(node) {
    const operand = this._genExpr(node.operand);
    switch (node.operator) {
      case 'NOT': {
        const t = this._inferType(node.operand);
        return t === 'BOOL' ? `!(${operand})` : `(~(${operand}))`;
      }
      case '-': return `(-(${operand}))`;
      case '+': return `(+(${operand}))`;
      default:  return `(${node.operator}(${operand}))`;
    }
  }

  _genFunctionCall(node) {
    // callee can be string (simple function name) or an AST node (member access)
    let callee;
    let isFBCall = false;
    let fbInstanceRef = null;

    if (typeof node.callee === 'string') {
      // Check if callee is a known FB instance variable
      const varName = node.callee;
      const fbVarType = this._fbInstanceVarTypes.get(varName);

      if (fbVarType) {
        // It's a function block instance call: fb(inputs) → ref.call(inputs)
        isFBCall = true;
        fbInstanceRef = this._varRef(varName);
        callee = `${fbInstanceRef}.call`;
      } else {
        callee = varName;
      }
    } else if (node.callee) {
      callee = this._genExpr(node.callee);
    } else {
      callee = '/* unknown */';
    }

    const args = (node.args || []).map(a => {
      if (a.type === NodeType.NAMED_ARGUMENT) {
        return a.value ? this._genExpr(a.value) : 'undefined';
      }
      return this._genExpr(a);
    });

    return `${callee}(${args.join(', ')})`;
  }

  // ─── Type Inference ───────────────────────────────────────────────────────

  _inferType(node) {
    if (!node) return 'INT';
    switch (node.type) {
      case NodeType.IDENTIFIER_REF:
        return this._varTypes.get(node.name) || 'INT';
      case NodeType.INTEGER_LITERAL:  return 'INT';
      case NodeType.REAL_LITERAL:     return 'REAL';
      case NodeType.BOOL_LITERAL:     return 'BOOL';
      case NodeType.STRING_LITERAL:   return 'STRING';
      case NodeType.TIME_LITERAL:     return 'TIME';
      case NodeType.TYPED_LITERAL:    return node.typeName ? node.typeName.toUpperCase() : 'INT';
      case NodeType.BINARY_EXPR: {
        if (['=', '<>', '<', '<=', '>', '>=', 'AND', 'OR', 'XOR'].includes(node.operator)) {
          return 'BOOL';
        }
        const lt = this._inferType(node.left);
        const rt = this._inferType(node.right);
        if (TypeMapper.isReal(lt) || TypeMapper.isReal(rt)) return 'REAL';
        return lt;
      }
      case NodeType.UNARY_EXPR:
        if (node.operator === 'NOT') return 'BOOL';
        return this._inferType(node.operand);
      case NodeType.MEMBER_ACCESS: {
        const member = this._resolveCompositeMember(node);
        if (member && member.type) return member.type;
        return 'INT'; // conservative
      }
      case NodeType.ARRAY_ACCESS:     return 'INT'; // conservative
      case NodeType.FUNCTION_CALL:    return 'INT'; // conservative
      default:                        return 'INT';
    }
  }
}

module.exports = Codegen;
