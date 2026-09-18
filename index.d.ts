// Type declarations for st2js — IEC 61131-3 Structured Text to JavaScript compiler.

export type STErrorPhase = 'lexer' | 'parser' | 'validator' | 'codegen';
export type STErrorSeverity = 'error' | 'warning';

export interface STError {
  phase: STErrorPhase;
  severity: STErrorSeverity;
  message: string;
  line: number;
  column: number;
  code?: string;
}

// ─── Source locations ────────────────────────────────────────────────────────

/** Source span of an AST node. Offsets index the source string. */
export interface Location {
  start: number;
  end: number;
  /** 1-based */
  line: number;
  /** 0-based */
  column: number;
  /** 1-based */
  endLine: number;
  /** 0-based */
  endColumn: number;
}

// ─── Types resolved by the static typing pass ────────────────────────────────

export type ElementaryTypeName =
  | 'BOOL'
  | 'SINT' | 'INT' | 'DINT' | 'LINT'
  | 'USINT' | 'UINT' | 'UDINT' | 'ULINT'
  | 'BYTE' | 'WORD' | 'DWORD' | 'LWORD'
  | 'REAL' | 'LREAL'
  | 'STRING' | 'WSTRING'
  | 'TIME'
  | 'DATE' | 'TIME_OF_DAY' | 'DATE_AND_TIME';

/** An array-typed symbol: `element` indexed from `lo` (default 0) over `size` elements. */
export interface ArrayResolvedType {
  kind: 'array';
  element: ResolvedTypeName;
  /** Element count; absent when the bounds are not constant. */
  size?: number;
  /** Lowest valid index; absent means 0. */
  lo?: number;
}

/** An elementary type name or a user-defined type name (STRUCT, enumeration, FB). */
export type ResolvedTypeName = ElementaryTypeName | (string & {});

/** Resolved type of an expression; `null` when the expression could not be resolved. */
export type ResolvedType = ResolvedTypeName | ArrayResolvedType;

/** A constant value: integers are exact `bigint`s, reals and TIME (milliseconds) are numbers. */
export interface Constant {
  type: ResolvedTypeName;
  value: bigint | number | boolean | string;
}

/** An implicit widening conversion applied to an operand or assigned value. */
export interface Conversion {
  from: ResolvedType;
  to: ResolvedType;
  implicit: true;
}

/** The symbol an identifier or member access resolved to. */
export type ResolvedSymbol =
  | DescriptorSymbol
  | MemberSymbol
  | CompositeSymbol
  | VariableSymbol
  | ReturnSymbol
  | PouSymbol
  | FieldSymbol
  | EnumValueSymbol;

/** A flat host-supplied variable descriptor. */
export interface DescriptorSymbol {
  kind: 'descriptor';
  name: string;
  type: ResolvedType;
  direction: 'input' | 'output' | 'internal';
  arraySize?: number;
  stringLength?: number;
  descriptor: VariableDescriptor;
}

/** A member of a composite descriptor, with its effective scope access key. */
export interface MemberSymbol {
  kind: 'member';
  parent: string;
  name: string;
  type: ResolvedType;
  direction: 'input' | 'output';
  accessKey: string;
  arraySize?: number;
  stringLength?: number;
  member: VariableMemberDescriptor;
}

/** The composite descriptor itself (object of a member access). */
export interface CompositeSymbol {
  kind: 'composite';
  name: string;
  type: string;
  direction: 'input' | 'output' | 'internal';
  members: Map<string, MemberSymbol>;
  descriptor: VariableDescriptor;
}

/** A variable declared in a POU `VAR*` section. */
export interface VariableSymbol {
  kind: 'variable';
  name: string;
  type: ResolvedType | null;
  varKind: VarKind;
  declaration: VarDeclaration;
  constant?: boolean;
  stringLength?: number;
}

/** The return value of a FUNCTION, addressed by the function name. */
export interface ReturnSymbol {
  kind: 'return';
  name: string;
  type: ResolvedType | null;
  declaration: FunctionDeclaration;
}

/** A POU declared in the same file. */
export interface PouSymbol {
  kind: 'pou';
  name: string;
  type: ResolvedType | null;
  node: FunctionDeclaration | FunctionBlockDeclaration | ProgramDeclaration;
}

/** A STRUCT field reached by member access. */
export interface FieldSymbol {
  kind: 'field';
  parent: string;
  name: string;
  type: ResolvedType | null;
  declaration: VarDeclaration;
}

/** An enumeration value (`Type#Value`). */
export interface EnumValueSymbol {
  kind: 'enum';
  parent: string;
  name: string;
  type: string;
}

/** Annotations written onto expression nodes by the static typing pass. */
export interface TypeAnnotations {
  /** Resolved type; `null` when unresolved. Absent until the node is analyzed. */
  resolvedType?: ResolvedType | null;
  /** Set on identifier and member-access nodes. */
  resolvedSymbol?: ResolvedSymbol;
  /** Set on literals, typed literals, and folded negated literals. */
  constant?: Constant;
  /** Set when an implicit widening adapts the value to the type its context requires. */
  conversion?: Conversion;
}

// ─── AST nodes ───────────────────────────────────────────────────────────────

export type VarKind = 'VAR' | 'VAR_INPUT' | 'VAR_OUTPUT' | 'VAR_IN_OUT' | 'VAR_GLOBAL' | 'VAR_TEMP' | 'VAR_EXTERNAL';

export type BinaryOperator =
  | '+' | '-' | '*' | '/' | 'MOD' | '**'
  | '=' | '<>' | '<' | '<=' | '>' | '>='
  | 'AND' | 'OR' | 'XOR';

export type UnaryOperator = '-' | '+' | 'NOT';

interface NodeBase<K extends string> {
  type: K;
  loc: Location;
}

// Top-level
export interface ProgramFile extends NodeBase<'ProgramFile'> {
  declarations: Declaration[];
}
export interface FunctionDeclaration extends NodeBase<'FunctionDeclaration'> {
  name: string;
  returnType: TypeNode | null;
  varSections: VarSection[];
  body: Statement[];
}
export interface FunctionBlockDeclaration extends NodeBase<'FunctionBlockDeclaration'> {
  name: string;
  varSections: VarSection[];
  body: Statement[];
}
export interface ProgramDeclaration extends NodeBase<'ProgramDeclaration'> {
  name: string;
  varSections: VarSection[];
  body: Statement[];
}
export interface TypeDeclaration extends NodeBase<'TypeDeclaration'> {
  declarations: TypeAliasDeclaration[];
}
export interface TypeAliasDeclaration extends NodeBase<'TypeAliasDeclaration'> {
  name: string;
  typeDef: TypeNode;
  initialValue: Expression | null;
}
export type Declaration =
  | FunctionDeclaration
  | FunctionBlockDeclaration
  | ProgramDeclaration
  | TypeDeclaration
  | VarSection;

// Variables
export interface VarSection extends NodeBase<'VarSection'> {
  kind: VarKind;
  modifiers: string[];
  declarations: VarDeclaration[];
}
export interface VarDeclaration extends NodeBase<'VarDeclaration'> {
  name: string;
  varType: TypeNode;
  initialValue: Expression | null;
}

// Type references
export interface PrimitiveType extends NodeBase<'PrimitiveType'> {
  /** Elementary type name (upper case) or a user-defined type name. */
  name: string;
}
export interface ArrayType extends NodeBase<'ArrayType'> {
  dimensions: { lo: Expression; hi: Expression }[];
  elementType: TypeNode;
}
export interface StructType extends NodeBase<'StructType'> {
  fields: VarDeclaration[];
}
export interface EnumType extends NodeBase<'EnumType'> {
  values: { name: string; value: Expression | null }[];
}
export interface UserDefinedType extends NodeBase<'UserDefinedType'> {
  name: string;
}
export interface StringType extends NodeBase<'StringType'> {
  kind: 'STRING' | 'WSTRING';
  maxLength: number;
}
export interface SubrangeType extends NodeBase<'SubrangeType'> {
  baseType: TypeNode;
  range: { lo: Expression; hi: Expression };
}
export type TypeNode =
  | PrimitiveType
  | ArrayType
  | StructType
  | EnumType
  | UserDefinedType
  | StringType
  | SubrangeType;

// Statements
export interface StatementList extends NodeBase<'StatementList'> {
  statements: Statement[];
}
export interface Assignment extends NodeBase<'Assignment'> {
  target: Expression;
  value: Expression;
}
export interface IfStatement extends NodeBase<'IfStatement'> {
  condition: Expression;
  consequent: Statement[];
  elsifClauses: ElsifClause[];
  elseClause: ElseClause | null;
}
export interface ElsifClause extends NodeBase<'ElsifClause'> {
  condition: Expression;
  body: Statement[];
}
export interface ElseClause extends NodeBase<'ElseClause'> {
  body: Statement[];
}
export interface CaseStatement extends NodeBase<'CaseStatement'> {
  discriminant: Expression;
  clauses: CaseClause[];
  elseClause: ElseClause | null;
}
export interface CaseClause extends NodeBase<'CaseClause'> {
  values: CaseLabel[];
  body: Statement[];
}
/** A CASE label: a signed integer literal, a typed literal, an identifier, or a range. */
export type CaseBound = IntegerLiteral | TypedLiteral | IdentifierRef;
export type CaseLabel = CaseBound | RangeLiteral;
export interface ForStatement extends NodeBase<'ForStatement'> {
  variable: IdentifierRef;
  from: Expression;
  to: Expression;
  by: Expression | null;
  body: Statement[];
}
export interface WhileStatement extends NodeBase<'WhileStatement'> {
  condition: Expression;
  body: Statement[];
}
export interface RepeatStatement extends NodeBase<'RepeatStatement'> {
  body: Statement[];
  condition: Expression;
}
export interface ReturnStatement extends NodeBase<'ReturnStatement'> {}
export interface ExitStatement extends NodeBase<'ExitStatement'> {}
export interface ContinueStatement extends NodeBase<'ContinueStatement'> {}
export interface EmptyStatement extends NodeBase<'EmptyStatement'> {}
export interface FunctionCallStatement extends NodeBase<'FunctionCallStatement'> {
  call: FunctionCall;
}
export type Statement =
  | Assignment
  | IfStatement
  | CaseStatement
  | ForStatement
  | WhileStatement
  | RepeatStatement
  | ReturnStatement
  | ExitStatement
  | ContinueStatement
  | EmptyStatement
  | FunctionCallStatement;

// Expressions
export interface BinaryExpr extends NodeBase<'BinaryExpr'>, TypeAnnotations {
  operator: BinaryOperator;
  left: Expression;
  right: Expression;
}
export interface UnaryExpr extends NodeBase<'UnaryExpr'>, TypeAnnotations {
  operator: UnaryOperator;
  operand: Expression;
}
export interface MemberAccess extends NodeBase<'MemberAccess'>, TypeAnnotations {
  object: Expression;
  member: string;
}
export interface ArrayAccess extends NodeBase<'ArrayAccess'>, TypeAnnotations {
  array: Expression;
  indices: Expression[];
}
export interface FunctionCall extends NodeBase<'FunctionCall'>, TypeAnnotations {
  /** Function name, or an expression for method-style calls (`fb.method()`). */
  callee: string | Expression;
  args: (Expression | NamedArgument)[];
}
export interface IdentifierRef extends NodeBase<'IdentifierRef'>, TypeAnnotations {
  name: string;
}
export interface IntegerLiteral extends NodeBase<'IntegerLiteral'>, TypeAnnotations {
  /** Nearest double; may round for values beyond ±2^53. */
  value: number;
  /** Exact value. */
  bigValue: bigint;
  raw: string;
}
export interface RealLiteral extends NodeBase<'RealLiteral'>, TypeAnnotations {
  value: number;
  raw: string;
}
export interface BoolLiteral extends NodeBase<'BoolLiteral'>, TypeAnnotations {
  value: boolean;
  raw: string;
}
export interface StringLiteral extends NodeBase<'StringLiteral'>, TypeAnnotations {
  /** Unescaped text. */
  value: string;
  /** Quoted source text. */
  raw: string;
}
export interface TimeLiteral extends NodeBase<'TimeLiteral'>, TypeAnnotations {
  /** Source text of the duration. */
  value: string;
  /** Duration in milliseconds. */
  ms: number;
  raw: string;
}
export interface DateLiteral extends NodeBase<'DateLiteral'>, TypeAnnotations {
  /** Source text of the date, time of day, or date and time. */
  value: string;
  raw: string;
}
/**
 * `<TYPE>#<value>`. For an elementary `typeName` the inner `value` is a fully
 * parsed literal node of the matching kind; for an identifier prefix
 * (`Colour#Red`) it is an `IdentifierRef`.
 */
export interface TypedLiteral extends NodeBase<'TypedLiteral'>, TypeAnnotations {
  typeName: string;
  value: IntegerLiteral | RealLiteral | BoolLiteral | StringLiteral | TimeLiteral | DateLiteral | IdentifierRef;
  raw?: string;
}
/** A CASE label range `lo..hi`. */
export interface RangeLiteral extends NodeBase<'RangeLiteral'>, TypeAnnotations {
  lo: CaseBound;
  hi: CaseBound;
}
export interface NamedArgument extends NodeBase<'NamedArgument'>, TypeAnnotations {
  name: string;
  value: Expression | null;
  dir: 'IN' | 'OUT';
  negated: boolean;
}
export interface StructInit extends NodeBase<'StructInit'> {}
export interface ArrayInit extends NodeBase<'ArrayInit'> {}

export type Literal =
  | IntegerLiteral
  | RealLiteral
  | BoolLiteral
  | StringLiteral
  | TimeLiteral
  | DateLiteral
  | TypedLiteral;

export type Expression =
  | BinaryExpr
  | UnaryExpr
  | MemberAccess
  | ArrayAccess
  | FunctionCall
  | IdentifierRef
  | Literal;

/** Every AST node kind, discriminated by `type`. */
export type STNode =
  | ProgramFile
  | FunctionDeclaration
  | FunctionBlockDeclaration
  | ProgramDeclaration
  | TypeDeclaration
  | TypeAliasDeclaration
  | VarSection
  | VarDeclaration
  | TypeNode
  | StatementList
  | Statement
  | ElsifClause
  | ElseClause
  | CaseClause
  | Expression
  | RangeLiteral
  | NamedArgument
  | StructInit
  | ArrayInit;

/** @deprecated Alias of `STNode`, kept for compatibility. */
export type ASTNode = STNode;

// ─── Results and options ─────────────────────────────────────────────────────

export interface ParseResult<N extends STNode = STNode> {
  ast: N | null;
  errors: STError[];
}

export interface ValidateResult {
  valid: boolean;
  errors: STError[];
}

/** Representation of LINT, ULINT, and LWORD values in generated code. */
export type Int64Mode = 'number' | 'bigint';

export interface CompileOptions {
  sourceMaps?: boolean;
  strict?: boolean;
  filename?: string;
  /**
   * `'number'` (default) keeps JavaScript numbers with truncation toward zero
   * and no 64-bit wrap (exact to ±2^53); `'bigint'` uses `bigint` values wrapped
   * at 64 bits and requires the host to supply `bigint` scope values for those types.
   */
  int64?: Int64Mode;
}

export interface CompileResult {
  code: string;
  sourceMap: unknown;
  warnings: string[];
  errors: STError[];
}

/**
 * A single variable on the host-side FB interface that an algorithm can
 * read from (all directions) and, for output/internal, write to.
 *
 * When `members` is present, the descriptor is *composite*: ST source can
 * use dotted access (`<name>.<member>`) to reach individual leaves, and the
 * generated code emits `__s["<accessKey>"]` for each member (defaulting to
 * `"<name>.<member>"` if `accessKey` is omitted). A bare reference to a
 * composite descriptor (`<name>` without `.<member>`) is a validator error.
 */
export interface VariableDescriptor {
  name: string;
  /** IEC 61131-3 type identifier (e.g. 'INT', 'BOOL', 'REAL', 'STRING'). */
  type: string;
  direction: 'input' | 'output' | 'internal';
  /**
   * Element count of an array of `type`, indexed from 0 to `arraySize - 1`
   * (the IEC 61499 `ArraySize` attribute). Must be a non-negative integer.
   */
  arraySize?: number;
  /** Maximum character count of a STRING or WSTRING descriptor. Must be a non-negative integer. */
  stringLength?: number;
  /**
   * Optional named leaf elements reachable via dotted access. When present,
   * the descriptor is composite (see `VariableMemberDescriptor`).
   */
  members?: VariableMemberDescriptor[];
}

/**
 * A leaf element of a composite `VariableDescriptor`. Reached from ST source
 * as `<parent.name>.<member.name>`. The generated code emits
 * `__s["<accessKey>"]` for reads and writes; if `accessKey` is omitted, the
 * default is `"<parent.name>.<member.name>"`.
 */
export interface VariableMemberDescriptor {
  name: string;
  /** IEC 61131-3 type identifier of the member's value. */
  type: string;
  /** `'output'` members may be assigned to in algorithm mode; `'input'` may not. */
  direction: 'input' | 'output';
  /**
   * Override for the runtime scope key used in the emitted JavaScript.
   * Defaults to `"<parent.name>.<name>"`.
   */
  accessKey?: string;
  /** Element count of an array member, indexed from 0. Must be a non-negative integer. */
  arraySize?: number;
  /** Maximum character count of a STRING or WSTRING member. Must be a non-negative integer. */
  stringLength?: number;
}

export interface AnalyzeOptions {
  /** Promote validator warnings (e.g. undeclared identifiers) to errors. Type violations are always errors. */
  strict?: boolean;
}

/** Result of `analyzeAlgorithm` / `analyzeExpression`: the tree annotated in place. */
export interface AnalysisResult<N extends STNode = STNode> {
  /** The annotated tree, or `null` when parsing failed. */
  ast: N | null;
  errors: STError[];
  warnings: STError[];
}

export interface AlgorithmCompileOptions {
  /** Promote validator warnings to errors. Defaults to false. */
  strict?: boolean;
  /** Representation of LINT/ULINT/LWORD values. Defaults to `'number'`. */
  int64?: Int64Mode;
}

export interface AlgorithmCompileResult {
  /**
   * Bare JavaScript body that reads and writes `__s["name"]` properties on a
   * single `__s` parameter. Empty string when `errors` contains any
   * `severity === 'error'` entry.
   */
  code: string;
  inputNames: string[];
  outputNames: string[];
  internalNames: string[];
  warnings: STError[];
  errors: STError[];
}

export interface ExpressionCompileOptions {
  /** Promote validator warnings to errors. Defaults to false. */
  strict?: boolean;
  /** Representation of LINT/ULINT/LWORD values. Defaults to `'number'`. */
  int64?: Int64Mode;
}

export interface ExpressionCompileResult {
  /**
   * Bare JavaScript expression string. Reads descriptor variables through
   * `__s["name"]`. Not wrapped in a function, statement, or `return`.
   * Empty string when `errors` contains any `severity === 'error'` entry.
   */
  code: string;
  inputNames: string[];
  outputNames: string[];
  internalNames: string[];
  warnings: STError[];
  errors: STError[];
}

// ─── Entry points ────────────────────────────────────────────────────────────

/** Parse a full ST program (FUNCTION_BLOCK / FUNCTION / PROGRAM). */
export function parse(source: string): ParseResult<ProgramFile>;

/**
 * Run semantic validation on an AST produced by `parse`. Runs the static
 * typing pass, which annotates the tree in place.
 */
export function validate(ast: STNode): ValidateResult;

/** Compile a full ST program (POU-based) to JavaScript. */
export function compile(source: string, options?: CompileOptions): CompileResult;

/** Compile a full ST program and return only the generated JS string. */
export function compileSync(source: string, options?: CompileOptions): string;

/** Parse a bare ST algorithm (statement list) without validation. */
export function parseAlgorithm(source: string): ParseResult<StatementList>;

/**
 * Run the static typing pass over an ST algorithm (source text or a tree from
 * `parseAlgorithm`) against a descriptor list. The returned `ast` is the tree
 * annotated in place with `resolvedType`, `resolvedSymbol`, `constant`, and
 * `conversion`. Type violations are always errors.
 */
export function analyzeAlgorithm(
  sourceOrAst: string | StatementList,
  variables: VariableDescriptor[],
  options?: AnalyzeOptions,
): AnalysisResult<StatementList>;

/**
 * Compile a bare ST algorithm against an externally supplied variable list.
 * Returns a body string that can be instantiated via
 * `new Function("__s", result.code)` and executed with a host-supplied scope
 * object.
 *
 * Composite descriptors (those with a `members` array) expand to
 * `__s["<accessKey>"]` accesses for each member used in ST source, and
 * contribute their members' effective access keys (rather than the parent
 * `name`) to `inputNames`/`outputNames` according to each member's
 * `direction`.
 *
 * The static typing pass runs first (see `analyzeAlgorithm`); any type
 * violation is an error and yields empty `code`. Integer-typed writes are
 * wrapped at the declared width; 64-bit types follow `options.int64`.
 */
export function compileAlgorithm(
  source: string,
  variables: VariableDescriptor[],
  options?: AlgorithmCompileOptions,
): AlgorithmCompileResult;

/**
 * Parse a single ST expression and return the AST plus parser errors.
 * Trailing tokens after the expression produce a parser error.
 */
export function parseExpression(source: string): ParseResult<Expression>;

/**
 * Run the static typing pass over a single ST expression (source text or a
 * tree from `parseExpression`) against a descriptor list. See `analyzeAlgorithm`.
 */
export function analyzeExpression(
  sourceOrAst: string | Expression,
  variables: VariableDescriptor[],
  options?: AnalyzeOptions,
): AnalysisResult<Expression>;

/**
 * Compile a single ST expression to a bare JavaScript expression string that
 * reads descriptor variables through `__s["name"]`. Suitable for evaluation
 * via `new Function("__s", "return " + result.code)`.
 *
 * Composite descriptors (those with a `members` array) expand to
 * `__s["<accessKey>"]` for member accesses in ST source. A bare reference to
 * a composite descriptor (without `.<member>`) is a validator error.
 */
export function compileExpression(
  source: string,
  variables: VariableDescriptor[],
  options?: ExpressionCompileOptions,
): ExpressionCompileResult;

declare const _default: {
  parse: typeof parse;
  validate: typeof validate;
  compile: typeof compile;
  compileSync: typeof compileSync;
  parseAlgorithm: typeof parseAlgorithm;
  compileAlgorithm: typeof compileAlgorithm;
  analyzeAlgorithm: typeof analyzeAlgorithm;
  parseExpression: typeof parseExpression;
  compileExpression: typeof compileExpression;
  analyzeExpression: typeof analyzeExpression;
};
export default _default;
