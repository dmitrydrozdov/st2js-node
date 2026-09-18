'use strict';

/**
 * @fileoverview The static typing pass.
 *
 * `TypeAnalyzer` types expression trees and the expression parts of
 * statements, writing annotations onto the AST nodes in place:
 *
 *  - `resolvedType` on every expression node: an elementary type name, a
 *    user type name, an array descriptor `{ kind: 'array', element, size, lo }`,
 *    or `null` when the expression could not be resolved;
 *  - `resolvedSymbol` on identifier and member-access nodes: the symbol
 *    record the name resolved to (descriptor, composite member, or POU
 *    variable);
 *  - `constant` on literal nodes (and folded typed literals and negated
 *    literals): `{ type, value }` where integer values are exact `bigint`s;
 *  - `conversion` on any operand or assigned value that an implicit widening
 *    conversion adapts to the type its context requires:
 *    `{ from, to, implicit: true }`.
 *
 * Names are resolved through a `symbols` interface supplied by the caller
 * (the `Validator`, which owns scope construction and reports undeclared
 * names, direction violations, and composite-descriptor errors):
 *
 *  - `lookupIdentifier(node)` → symbol record or null;
 *  - `lookupMember(node)` → `{ kind: 'member', record }`, `{ kind: 'error' }`,
 *    or `{ kind: 'none' }` for a plain member access;
 *  - `lookupMemberType(objectType, memberName)` → symbol record or null;
 *  - `lookupCallee(node)` → `{ type }` or null for a non-standard callee.
 *
 * Diagnostics go to `diagnostics.error(message, node)`.
 *
 * Every violation of the implicit-conversion rules is an error; there is no
 * lenient mode. An expression that contains an unresolved name is typed as
 * `null` and produces no further type diagnostics.
 */

const { NodeType } = require('../types');
const T = require('./types');

const UNTYPED_LITERAL_KINDS = new Set([NodeType.INTEGER_LITERAL, NodeType.REAL_LITERAL]);

/**
 * Whether `node` is an untyped numeric literal expression: an integer or real
 * literal, a negated one, or arithmetic over such expressions only. Such an
 * expression takes its type from the context it appears in.
 */
function isUntypedLiteralExpr(node) {
  if (!node) return false;
  if (UNTYPED_LITERAL_KINDS.has(node.type)) return true;
  if (node.type === NodeType.UNARY_EXPR && (node.operator === '-' || node.operator === '+')) {
    return isUntypedLiteralExpr(node.operand);
  }
  if (node.type === NodeType.BINARY_EXPR && T.ARITHMETIC_OPS.has(node.operator)) {
    return isUntypedLiteralExpr(node.left) && isUntypedLiteralExpr(node.right);
  }
  return false;
}

/**
 * Resolve a declared type node (from a POU `VAR` section, a function return
 * type, or a struct field) to a resolved type.
 *
 * @param {object} typeNode
 * @param {Map<string, object>} [userTypes] - user type name (upper) → TypeAliasDeclaration
 * @param {number} [depth]
 * @returns {*} resolved type (string, array descriptor) or null
 */
function resolveDeclaredType(typeNode, userTypes, depth = 0) {
  if (!typeNode || depth > 16) return null;
  switch (typeNode.type) {
    case NodeType.PRIMITIVE_TYPE: {
      const canon = T.canonicalTypeName(typeNode.name);
      if (canon) return canon;
      const name = typeNode.name;
      if (!name || name === 'ANY') return null;
      const alias = userTypes && userTypes.get(String(name).toUpperCase());
      if (alias && alias.typeDef) {
        const def = alias.typeDef;
        if (def.type === NodeType.PRIMITIVE_TYPE || def.type === NodeType.STRING_TYPE ||
            def.type === NodeType.ARRAY_TYPE || def.type === NodeType.SUBRANGE_TYPE) {
          return resolveDeclaredType(def, userTypes, depth + 1);
        }
        // STRUCT and enumeration types keep their own name.
        return alias.name;
      }
      return name; // user-defined (FB, struct, enum, or unknown) type name
    }
    case NodeType.STRING_TYPE:
      return typeNode.kind === 'WSTRING' ? 'WSTRING' : 'STRING';
    case NodeType.SUBRANGE_TYPE:
      return resolveDeclaredType(typeNode.baseType, userTypes, depth + 1);
    case NodeType.ARRAY_TYPE: {
      const element = resolveDeclaredType(typeNode.elementType, userTypes, depth + 1);
      const dims = typeNode.dimensions || [];
      const descriptor = { kind: 'array', element };
      if (dims.length === 1) {
        const lo = literalNumber(dims[0].lo);
        const hi = literalNumber(dims[0].hi);
        if (lo !== null && hi !== null && hi >= lo) {
          descriptor.lo = lo;
          descriptor.size = hi - lo + 1;
        }
      }
      return descriptor;
    }
    default:
      return typeNode.name || null;
  }
}

/** Numeric value of an integer literal node (possibly negated), or null. */
function literalNumber(node) {
  if (!node) return null;
  if (node.type === NodeType.INTEGER_LITERAL) return node.value;
  if (node.type === NodeType.UNARY_EXPR && node.operator === '-' && node.operand &&
      node.operand.type === NodeType.INTEGER_LITERAL) {
    return -node.operand.value;
  }
  if (node.type === NodeType.TYPED_LITERAL && node.value && node.value.type === NodeType.INTEGER_LITERAL) {
    return node.value.value;
  }
  return null;
}

class TypeAnalyzer {
  /**
   * @param {object} options
   * @param {object} options.symbols - name resolution interface (see file comment)
   * @param {object} options.diagnostics - `{ error(message, node) }`
   */
  constructor({ symbols, diagnostics }) {
    this.symbols = symbols;
    this.diagnostics = diagnostics;
  }

  error(message, node) {
    this.diagnostics.error(message, node);
  }

  // ─── Statement-level entry points ───────────────────────────────────────

  /**
   * Type an assignment: the target, the value in the target's context, and
   * the implicit conversion between them.
   */
  typeAssignment(node) {
    const targetType = this.typeExpression(node.target, null);
    const valueType = this.typeExpression(node.value, targetType);
    this.checkAssignable(node.value, valueType, targetType, node, 'assign');
  }

  /**
   * Type a condition expression (IF / ELSIF / WHILE / REPEAT UNTIL); it must be BOOL.
   * @param {object} node
   * @param {string} keyword - statement keyword for the message
   */
  typeCondition(node, keyword) {
    const t = this.typeExpression(node, 'BOOL');
    if (t !== null && t !== 'BOOL') {
      this.error(`${keyword} condition must be BOOL, got ${T.formatType(t)}`, node);
    }
    return t;
  }

  /** Type the header of a FOR statement: loop variable and bounds. */
  typeForStatement(node) {
    const varType = this.typeExpression(node.variable, null);
    if (varType !== null && !T.isIntegerLike(varType)) {
      this.error(`FOR loop variable must be an integer type, got ${T.formatType(varType)}`, node.variable);
    }
    const context = varType !== null && T.isIntegerLike(varType) ? varType : null;
    for (const bound of [node.from, node.to, node.by]) {
      if (!bound) continue;
      const bt = this.typeExpression(bound, context);
      if (bt === null || context === null) continue;
      this.checkAssignable(bound, bt, context, bound, 'for');
    }
  }

  /** Type the selector and the clause labels of a CASE statement. */
  typeCaseStatement(node) {
    const selType = this.typeExpression(node.discriminant, null);
    if (selType !== null && !T.isIntegerLike(selType) && !this.isUserType(selType)) {
      this.error(`CASE selector must be an integer type, got ${T.formatType(selType)}`, node.discriminant);
    }
    const context = selType !== null && (T.isIntegerLike(selType) || this.isUserType(selType)) ? selType : null;
    for (const clause of node.clauses || []) {
      for (const value of clause.values || []) {
        if (value.type === NodeType.RANGE_LITERAL) {
          const lo = this.typeCaseLabel(value.lo, context);
          const hi = this.typeCaseLabel(value.hi, context);
          value.resolvedType = lo !== null && hi !== null ? context || lo : null;
        } else {
          this.typeCaseLabel(value, context);
        }
      }
    }
  }

  typeCaseLabel(node, context) {
    const t = this.typeExpression(node, context);
    if (t === null || context === null) return t;
    this.checkAssignable(node, t, context, node, 'case');
    return t;
  }

  /** Type a function-call statement (the call's value is discarded). */
  typeCallStatement(node) {
    this.typeExpression(node.call, null);
  }

  /** Type a variable initial value against its declared type. */
  typeInitialValue(node, declaredType) {
    const context = typeof declaredType === 'string' ? declaredType : null;
    const t = this.typeExpression(node, context);
    if (t !== null && declaredType !== null) {
      this.checkAssignable(node, t, declaredType, node, 'init');
    }
  }

  // ─── Assignability ─────────────────────────────────────────────────────

  /**
   * Check that a value of type `from` may be stored in a slot of type `to`,
   * recording a `conversion` annotation on `valueNode` when an implicit
   * widening applies and reporting an error otherwise.
   */
  checkAssignable(valueNode, from, to, at, kind) {
    if (from === null || to === null || from === undefined || to === undefined) return true;
    if (T.sameType(from, to)) return true;
    if (T.isImplicitlyConvertible(from, to)) {
      valueNode.conversion = { from, to, implicit: true };
      return true;
    }
    const F = T.formatType(from);
    const To = T.formatType(to);
    let message;
    if (kind === 'for') {
      message = `FOR bound of type ${F} is not compatible with loop variable type ${To}`;
    } else if (kind === 'case') {
      message = `CASE label of type ${F} is not compatible with selector type ${To}`;
    } else if (T.isAnyReal(from) && T.isIntegerLike(to)) {
      message = `Cannot assign ${F} to ${To}: real to integer requires an explicit conversion (e.g. ${F}_TO_${To})`;
    } else if (T.isIntegerLike(from) && T.isIntegerLike(to)) {
      const fi = T.integerInfo(from);
      const ti = T.integerInfo(to);
      if (fi.signed !== ti.signed) {
        message = `Cannot assign ${F} to ${To}: signedness differs; use an explicit conversion (e.g. ${F}_TO_${To})`;
      } else {
        message = `Cannot assign ${F} to ${To}: narrowing conversion is not implicit; use an explicit conversion (e.g. ${F}_TO_${To})`;
      }
    } else if (T.isAnyReal(from) && T.isAnyReal(to)) {
      message = `Cannot assign ${F} to ${To}: narrowing conversion is not implicit; use an explicit conversion (e.g. ${F}_TO_${To})`;
    } else if (T.isAnyNum(from) && T.isAnyReal(to)) {
      message = `Cannot assign ${F} to ${To}: ${To} cannot represent every ${F} value; use an explicit conversion (e.g. ${F}_TO_${To})`;
    } else {
      message = `Cannot assign ${F} to ${To}: incompatible types`;
    }
    this.error(message, at);
    return false;
  }

  isUserType(t) {
    return typeof t === 'string' && !T.isElementary(t);
  }

  // ─── Expressions ───────────────────────────────────────────────────────

  /**
   * Type an expression node, annotate it, and return its resolved type.
   * @param {object} node
   * @param {*} expected - the type the context requires (used to type
   *   untyped literals), or null
   */
  typeExpression(node, expected = null) {
    if (!node) return null;
    let t = null;
    switch (node.type) {
      case NodeType.INTEGER_LITERAL: t = this.typeIntegerLiteral(node, expected, false); break;
      case NodeType.REAL_LITERAL:    t = this.typeRealLiteral(node, expected); break;
      case NodeType.BOOL_LITERAL:
        t = 'BOOL';
        node.constant = { type: 'BOOL', value: !!node.value };
        break;
      case NodeType.STRING_LITERAL:
        t = T.isAnyString(expected) ? expected : (node.raw && node.raw[0] === '"' ? 'WSTRING' : 'STRING');
        node.constant = { type: t, value: node.value };
        break;
      case NodeType.TIME_LITERAL:
        t = 'TIME';
        node.constant = { type: 'TIME', value: node.ms !== undefined ? node.ms : 0 };
        break;
      case NodeType.DATE_LITERAL:
        t = 'DATE';
        node.constant = { type: 'DATE', value: node.value };
        break;
      case NodeType.TYPED_LITERAL:   t = this.typeTypedLiteral(node); break;
      case NodeType.IDENTIFIER_REF:  t = this.typeIdentifier(node); break;
      case NodeType.MEMBER_ACCESS:   t = this.typeMemberAccess(node); break;
      case NodeType.ARRAY_ACCESS:    t = this.typeArrayAccess(node); break;
      case NodeType.FUNCTION_CALL:   t = this.typeCall(node, expected); break;
      case NodeType.BINARY_EXPR:     t = this.typeBinary(node, expected); break;
      case NodeType.UNARY_EXPR:      t = this.typeUnary(node, expected); break;
      case NodeType.NAMED_ARGUMENT:  t = node.value ? this.typeExpression(node.value, null) : null; break;
      case NodeType.RANGE_LITERAL:
        this.typeExpression(node.lo, expected);
        this.typeExpression(node.hi, expected);
        t = null;
        break;
      default:
        t = null;
    }
    node.resolvedType = t;
    return t;
  }

  // ─── Literals ──────────────────────────────────────────────────────────

  /**
   * An untyped integer literal takes the integer (or real) type the context
   * requires and defaults to DINT (or the smallest of LINT/ULINT that holds
   * it). The value is range-checked against the resolved type.
   * @param {object} node
   * @param {*} expected
   * @param {boolean} negate - the literal is the operand of a unary minus
   */
  typeIntegerLiteral(node, expected, negate) {
    const big = typeof node.bigValue === 'bigint' ? node.bigValue : BigInt(Math.trunc(node.value || 0));
    const effective = negate ? -big : big;
    let t;
    if (T.isIntegerLike(expected)) {
      t = expected;
    } else if (T.isAnyReal(expected)) {
      node.constant = { type: expected, value: Number(big) };
      return expected;
    } else {
      t = T.defaultIntegerTypeFor(effective);
      if (t === null) {
        this.error(`Integer literal ${node.raw} is too large for any integer type`, node);
        t = 'LINT';
      }
    }
    if (!T.fitsInType(effective, t)) {
      const info = T.integerInfo(t);
      const shown = negate ? `-${node.raw}` : node.raw;
      this.error(`Literal ${shown} is outside the range of ${t} (${info.min}..${info.max})`, node);
    }
    node.constant = { type: t, value: big };
    return t;
  }

  typeRealLiteral(node, expected) {
    const t = T.isAnyReal(expected) ? expected : 'REAL';
    node.constant = { type: t, value: node.value };
    return t;
  }

  /**
   * A typed literal has its declared type. The inner literal is annotated
   * with the same type and constant; integer values are range-checked.
   */
  typeTypedLiteral(node) {
    const canon = T.canonicalTypeName(node.typeName);
    const inner = node.value;
    if (canon === null) {
      // Identifier-prefixed literal (enumeration value: `Colour#Red`).
      const userType = node.typeName;
      if (inner && inner.type === NodeType.IDENTIFIER_REF) {
        const member = this.symbols.lookupEnumValue ? this.symbols.lookupEnumValue(userType, inner.name) : null;
        if (member) {
          inner.resolvedType = userType;
          inner.resolvedSymbol = member;
        } else {
          this.typeExpression(inner, null);
          inner.resolvedType = userType;
        }
      } else if (inner) {
        this.typeExpression(inner, null);
      }
      node.constant = inner && inner.type === NodeType.IDENTIFIER_REF
        ? { type: userType, value: inner.name }
        : (inner && inner.constant ? { type: userType, value: inner.constant.value } : undefined);
      return userType;
    }
    if (!inner) return canon;

    const cls = T.typeClass(canon);
    let value;
    switch (cls) {
      case 'INT':
      case 'BIT': {
        if (inner.type !== NodeType.INTEGER_LITERAL) return this.typedLiteralMismatch(node, canon);
        const big = inner.bigValue;
        if (!T.fitsInType(big, canon)) {
          const info = T.integerInfo(canon);
          this.error(`Literal ${node.raw} is outside the range of ${canon} (${info.min}..${info.max})`, node);
        }
        value = big;
        break;
      }
      case 'REAL':
        if (inner.type !== NodeType.REAL_LITERAL && inner.type !== NodeType.INTEGER_LITERAL) {
          return this.typedLiteralMismatch(node, canon);
        }
        value = Number(inner.value);
        break;
      case 'BOOL':
        if (inner.type !== NodeType.BOOL_LITERAL) return this.typedLiteralMismatch(node, canon);
        value = !!inner.value;
        break;
      case 'STRING':
        if (inner.type !== NodeType.STRING_LITERAL) return this.typedLiteralMismatch(node, canon);
        value = inner.value;
        break;
      case 'TIME':
        if (inner.type !== NodeType.TIME_LITERAL) return this.typedLiteralMismatch(node, canon);
        value = inner.ms !== undefined ? inner.ms : 0;
        break;
      default: // DATE, TIME_OF_DAY, DATE_AND_TIME
        if (inner.type !== NodeType.DATE_LITERAL) return this.typedLiteralMismatch(node, canon);
        value = inner.value;
        break;
    }
    inner.resolvedType = canon;
    inner.constant = { type: canon, value };
    node.constant = { type: canon, value };
    return canon;
  }

  typedLiteralMismatch(node, canon) {
    this.error(`Typed literal ${node.raw || node.typeName + '#...'} does not hold a ${canon} value`, node);
    this.typeExpression(node.value, null);
    return null;
  }

  // ─── Names ─────────────────────────────────────────────────────────────

  typeIdentifier(node) {
    const record = this.symbols.lookupIdentifier(node);
    if (!record) return null;
    node.resolvedSymbol = record;
    return record.type === undefined ? null : record.type;
  }

  typeMemberAccess(node) {
    const res = this.symbols.lookupMember(node);
    if (res && res.kind === 'member') {
      node.resolvedSymbol = res.record;
      return res.record.type === undefined ? null : res.record.type;
    }
    if (res && res.kind === 'error') {
      return null;
    }
    const objType = this.typeExpression(node.object, null);
    if (objType === null) return null;
    const record = this.symbols.lookupMemberType ? this.symbols.lookupMemberType(objType, node.member) : null;
    if (record) {
      node.resolvedSymbol = record;
      return record.type === undefined ? null : record.type;
    }
    return null;
  }

  typeArrayAccess(node) {
    const arrType = this.typeExpression(node.array, null);
    const indices = node.indices || [];
    for (const idx of indices) {
      const it = this.typeExpression(idx, null);
      if (it !== null && !T.isIntegerLike(it)) {
        this.error(`Array index must be an integer type, got ${T.formatType(it)}`, idx);
      }
    }
    if (arrType === null) return null;
    if (!T.isArrayType(arrType)) {
      if (this.isUserType(arrType)) return null; // unknown user structure; not diagnosed
      this.error(`Cannot index a value of type ${T.formatType(arrType)}: not an array`, node);
      return null;
    }
    if (indices.length === 1 && arrType.size !== undefined) {
      const c = indices[0].constant;
      if (c && typeof c.value === 'bigint') {
        const lo = BigInt(arrType.lo || 0);
        const hi = lo + BigInt(arrType.size) - 1n;
        if (c.value < lo || c.value > hi) {
          this.error(`Array index ${c.value} is outside ${lo}..${hi}`, indices[0]);
        }
      }
    }
    return arrType.element === undefined ? null : arrType.element;
  }

  // ─── Calls ─────────────────────────────────────────────────────────────

  typeCall(node, expected) {
    const args = node.args || [];
    if (typeof node.callee !== 'string') {
      // Method-style call on a member access: type the callee object, args untyped.
      if (node.callee) this.typeExpression(node.callee, null);
      for (const a of args) this.typeExpression(a, null);
      return null;
    }
    const sig = T.lookupFunction(node.callee);
    if (sig) return this.typeStandardCall(node, sig, expected);

    const user = this.symbols.lookupCallee(node);
    for (const a of args) this.typeExpression(a, null);
    return user && user.type !== undefined ? user.type : null;
  }

  /**
   * Type a call to a standard function against its signature: arity,
   * parameter classes, homogeneous argument groups, and the result rule.
   */
  typeStandardCall(node, sig, expected) {
    const name = sig.name;
    const args = (node.args || []).map(a => (a.type === NodeType.NAMED_ARGUMENT ? a.value : a));
    const n = args.length;
    if (n < sig.min || n > sig.max) {
      const count = sig.min === sig.max ? `${sig.min}` : (sig.max === Infinity ? `at least ${sig.min}` : `${sig.min} to ${sig.max}`);
      this.error(`${name} expects ${count} argument(s), got ${n}`, node);
      for (const a of args) if (a) this.typeExpression(a, null);
      return null;
    }

    const classOf = (i) => sig.params[Math.min(i, sig.params.length - 1)];
    const group = new Set(sig.homogeneous || []);
    const inGroup = (i) => group.has(i) || (sig.variadic && i >= sig.params.length - 1 && group.has(sig.params.length - 1));

    // Anchor type of the homogeneous group: the join of its typed arguments;
    // otherwise the type the context requires (when it satisfies the class).
    let anchor = null;
    let anchorConflict = false;
    for (let i = 0; i < n; i++) {
      if (!inGroup(i) || !args[i] || isUntypedLiteralExpr(args[i])) continue;
      const t = this.typeExpression(args[i], null);
      if (t === null) continue;
      if (anchor === null) { anchor = t; continue; }
      const common = T.commonType(anchor, t);
      if (common === null) anchorConflict = true; else anchor = common;
    }
    if (anchor === null && expected !== null && group.size > 0) {
      const cls = classOf(sig.homogeneous[0]);
      if (T.matchesClass(expected, cls) && !T.isArrayType(expected)) anchor = expected;
    }

    let unresolved = false;
    const types = [];
    for (let i = 0; i < n; i++) {
      const arg = args[i];
      if (!arg) { types.push(null); continue; }
      const cls = classOf(i);
      let t;
      if (arg.resolvedType !== undefined && !isUntypedLiteralExpr(arg) && inGroup(i)) {
        t = arg.resolvedType; // already typed while computing the anchor
      } else {
        let context = null;
        if (T.isConcreteClass(cls)) context = cls;
        else if (inGroup(i) && anchor !== null) context = anchor;
        else if (cls === 'ANY_REAL') context = 'REAL';
        else if (cls === 'ANY_INT' && T.isIntegerLike(expected) && sig.result === 'CONTEXT_INT') context = expected;
        t = this.typeExpression(arg, context);
      }
      types.push(t);
      if (t === null) { unresolved = true; continue; }
      if (!T.matchesClass(t, cls)) {
        this.error(`Argument ${i + 1} of ${name} must be ${cls}, got ${T.formatType(t)}`, arg);
        unresolved = true;
        continue;
      }
      if (T.isConcreteClass(cls) && !T.sameType(t, cls)) {
        arg.conversion = { from: t, to: cls, implicit: true };
      } else if (inGroup(i) && anchor !== null && !T.sameType(t, anchor)) {
        if (T.isImplicitlyConvertible(t, anchor)) {
          arg.conversion = { from: t, to: anchor, implicit: true };
        } else {
          anchorConflict = true;
        }
      }
    }
    if (anchorConflict) {
      const shown = [...group].filter(i => i < n).map(i => T.formatType(types[i])).join(', ');
      this.error(`Arguments of ${name} must have a common type, got ${shown}`, node);
      return null;
    }
    if (unresolved) return null;
    if (anchor === null && group.size > 0) {
      // Every group argument was an untyped literal: join their default types.
      for (let i = 0; i < n; i++) {
        if (!inGroup(i) || types[i] === null) continue;
        anchor = anchor === null ? types[i] : (T.commonType(anchor, types[i]) || anchor);
      }
    }

    switch (sig.result) {
      case 'FIRST': return types[0] === undefined ? null : types[0];
      case 'COMMON': return anchor;
      case 'CONTEXT_INT': return T.isIntegerLike(expected) ? expected : 'DINT';
      default: return sig.result;
    }
  }

  // ─── Operators ─────────────────────────────────────────────────────────

  typeBinary(node, expected) {
    const op = node.operator;
    const propagate = T.ARITHMETIC_OPS.has(op) ? expected : null;
    const lu = isUntypedLiteralExpr(node.left);
    const ru = isUntypedLiteralExpr(node.right);
    let lt;
    let rt;
    if (lu && !ru) {
      rt = this.typeExpression(node.right, propagate);
      lt = this.typeExpression(node.left, this.literalContext(rt, propagate));
    } else if (ru && !lu) {
      lt = this.typeExpression(node.left, propagate);
      rt = this.typeExpression(node.right, this.literalContext(lt, propagate));
    } else {
      lt = this.typeExpression(node.left, propagate);
      rt = this.typeExpression(node.right, propagate);
    }
    if (lt === null || rt === null) return null;

    const r = T.binaryResultType(op, lt, rt);
    if (r.error) {
      this.error(r.error, node);
      return null;
    }
    if (r.left) node.left.conversion = { from: lt, to: r.left, implicit: true };
    if (r.right) node.right.conversion = { from: rt, to: r.right, implicit: true };
    return r.type;
  }

  /** The context type for an untyped literal opposite a typed operand. */
  literalContext(otherType, propagate) {
    if (T.isNumericLike(otherType)) return otherType;
    return propagate;
  }

  typeUnary(node, expected) {
    const op = node.operator;
    const operand = node.operand;
    if (op === '-' && operand && operand.type === NodeType.INTEGER_LITERAL) {
      const t = this.typeIntegerLiteral(operand, expected, true);
      operand.resolvedType = t;
      if (operand.constant) node.constant = { type: t, value: -operand.constant.value };
      return t;
    }
    if (op === '-' && operand && operand.type === NodeType.REAL_LITERAL) {
      const t = this.typeRealLiteral(operand, expected);
      operand.resolvedType = t;
      node.constant = { type: t, value: -operand.value };
      return t;
    }
    const t = this.typeExpression(operand, op === 'NOT' ? null : expected);
    if (t === null) return null;
    const r = T.unaryResultType(op, t);
    if (r.error) {
      this.error(r.error, node);
      return null;
    }
    return r.type;
  }
}

module.exports = TypeAnalyzer;
module.exports.isUntypedLiteralExpr = isUntypedLiteralExpr;
module.exports.resolveDeclaredType = resolveDeclaredType;
