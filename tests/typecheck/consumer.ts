// Smoke test that exercises the hand-written index.d.ts under strict mode.
// This file is never executed — it is only type-checked by tsc --noEmit.

import st2js, {
  parse,
  validate,
  compile,
  compileSync,
  parseAlgorithm,
  compileAlgorithm,
  analyzeAlgorithm,
  parseExpression,
  compileExpression,
  analyzeExpression,
  STError,
  STNode,
  ASTNode,
  Location,
  Expression,
  Statement,
  StatementList,
  Literal,
  IntegerLiteral,
  TypedLiteral,
  RangeLiteral,
  ResolvedType,
  ResolvedSymbol,
  Constant,
  Conversion,
  AnalysisResult,
  VariableDescriptor,
  VariableMemberDescriptor,
  CompileOptions,
  CompileResult,
  AlgorithmCompileResult,
  ExpressionCompileResult,
} from '../../index';

// parse / validate / compile / compileSync
const parsed = parse('FUNCTION_BLOCK FB\nEND_FUNCTION_BLOCK');
const validated = parsed.ast ? validate(parsed.ast) : { valid: false, errors: [] as STError[] };
const opts: CompileOptions = { strict: true, sourceMaps: false, filename: 'in.st', int64: 'bigint' };
const compiled: CompileResult = compile('FUNCTION_BLOCK FB\nEND_FUNCTION_BLOCK', opts);
const jsCode: string = compileSync('FUNCTION_BLOCK FB\nEND_FUNCTION_BLOCK');

// parseAlgorithm
const parsedAlgo = parseAlgorithm('Count := Count + 1;');
const ast: StatementList | null = parsedAlgo.ast;

// compileAlgorithm — happy path
const descriptors: VariableDescriptor[] = [
  { name: 'Count', type: 'INT', direction: 'internal' },
  { name: 'Trigger', type: 'BOOL', direction: 'input' },
  { name: 'Out', type: 'INT', direction: 'output' },
  { name: 'A', type: 'DINT', direction: 'input', arraySize: 4 },
  { name: 'S', type: 'STRING', direction: 'internal', stringLength: 80 },
];

const algo: AlgorithmCompileResult = compileAlgorithm(
  'IF Trigger THEN Count := Count + 1; Out := Count; END_IF;',
  descriptors,
  { strict: false, int64: 'number' },
);

const _code: string = algo.code;
const _ins: string[] = algo.inputNames;
const _outs: string[] = algo.outputNames;
const _ints: string[] = algo.internalNames;
const _errs: STError[] = algo.errors;
const _warns: STError[] = algo.warnings;

// parseExpression
const parsedExpr = parseExpression('REQ AND count < threshold');
const exprAst: Expression | null = parsedExpr.ast;

// compileExpression — happy path
const expr: ExpressionCompileResult = compileExpression(
  'REQ AND count < threshold',
  descriptors,
  { int64: 'bigint' },
);
const _exprCode: string = expr.code;
const _exprIns: string[] = expr.inputNames;
const _exprOuts: string[] = expr.outputNames;
const _exprInts: string[] = expr.internalNames;
const _exprErrs: STError[] = expr.errors;
const _exprWarns: STError[] = expr.warnings;

// analyzeAlgorithm / analyzeExpression — from source and from a parsed tree
const analysis: AnalysisResult<StatementList> = analyzeAlgorithm('Out := Count + DINT#1;', descriptors, { strict: true });
const reanalysis: AnalysisResult<StatementList> = ast ? analyzeAlgorithm(ast, descriptors) : analysis;
const exprAnalysis: AnalysisResult<Expression> = exprAst
  ? analyzeExpression(exprAst, descriptors)
  : analyzeExpression('REQ', descriptors);
const _analysisErrors: STError[] = analysis.errors;
const _analysisWarnings: STError[] = analysis.warnings;
const rootType: ResolvedType | null | undefined = exprAnalysis.ast?.resolvedType;

// Default-export shape
const all = st2js;
all.parse('');
all.compileAlgorithm('', []);
all.parseExpression('');
all.compileExpression('', []);
all.analyzeAlgorithm('', []);
all.analyzeExpression('', []);

// Composite descriptors (members + accessKey + sizes)
const portMembers: VariableMemberDescriptor[] = [
  { name: 'REQ', type: 'BOOL', direction: 'input' },
  { name: 'CNF', type: 'BOOL', direction: 'output', accessKey: 'P__$$__CNF' },
  { name: 'BUF', type: 'BYTE', direction: 'input', arraySize: 8 },
  { name: 'NAME', type: 'STRING', direction: 'input', stringLength: 32 },
];
const compositeDescriptors: VariableDescriptor[] = [
  { name: 'X', type: 'INT', direction: 'internal' },
  { name: 'P', type: 'ADAPTER', direction: 'input', members: portMembers },
];
const compositeAlgo: AlgorithmCompileResult = compileAlgorithm(
  'IF P.REQ THEN P.CNF := TRUE; X := X + 1; END_IF;',
  compositeDescriptors,
);
const compositeExpr: ExpressionCompileResult = compileExpression(
  'P.REQ AND X > 0',
  compositeDescriptors,
);
const _compositeCode: string = compositeAlgo.code;
const _compositeExprCode: string = compositeExpr.code;

// ASTNode remains an alias of STNode
const asAstNode: ASTNode | null = ast;
const backToStNode: STNode | null = asAstNode;

// ─── Walking an annotated tree with exhaustive narrowing ─────────────────────

function readLiteral(node: Literal): Constant | undefined {
  const t: ResolvedType | null | undefined = node.resolvedType;
  void t;
  switch (node.type) {
    case 'IntegerLiteral': {
      const exact: bigint = node.bigValue;
      const approx: number = node.value;
      const raw: string = node.raw;
      void exact; void approx; void raw;
      return node.constant;
    }
    case 'RealLiteral': return node.constant;
    case 'BoolLiteral': return node.constant;
    case 'StringLiteral': return node.constant;
    case 'TimeLiteral': { const ms: number = node.ms; void ms; return node.constant; }
    case 'DateLiteral': return node.constant;
    case 'TypedLiteral': {
      const name: string = node.typeName;
      void name;
      if (node.value.type === 'IdentifierRef') return undefined;
      return readLiteral(node.value);
    }
  }
}

function walkStatements(statements: Statement[]): void {
  for (const s of statements) walk(s);
}

function walk(node: STNode): void {
  const loc: Location = node.loc;
  void loc.line; void loc.column; void loc.endLine; void loc.endColumn; void loc.start; void loc.end;
  switch (node.type) {
    case 'ProgramFile':
      for (const d of node.declarations) walk(d);
      break;
    case 'FunctionDeclaration':
      if (node.returnType) walk(node.returnType);
      for (const v of node.varSections) walk(v);
      walkStatements(node.body);
      break;
    case 'FunctionBlockDeclaration':
    case 'ProgramDeclaration':
      for (const v of node.varSections) walk(v);
      walkStatements(node.body);
      break;
    case 'TypeDeclaration':
      for (const t of node.declarations) walk(t);
      break;
    case 'TypeAliasDeclaration':
      walk(node.typeDef);
      if (node.initialValue) walk(node.initialValue);
      break;
    case 'VarSection':
      for (const d of node.declarations) walk(d);
      break;
    case 'VarDeclaration':
      walk(node.varType);
      if (node.initialValue) walk(node.initialValue);
      break;
    case 'PrimitiveType':
    case 'UserDefinedType':
      void node.name;
      break;
    case 'ArrayType':
      for (const d of node.dimensions) { walk(d.lo); walk(d.hi); }
      walk(node.elementType);
      break;
    case 'StructType':
      for (const f of node.fields) walk(f);
      break;
    case 'EnumType':
      for (const v of node.values) if (v.value) walk(v.value);
      break;
    case 'StringType':
      void node.maxLength;
      break;
    case 'SubrangeType':
      walk(node.baseType); walk(node.range.lo); walk(node.range.hi);
      break;
    case 'StatementList':
      walkStatements(node.statements);
      break;
    case 'Assignment':
      walk(node.target); walk(node.value);
      break;
    case 'IfStatement':
      walk(node.condition);
      walkStatements(node.consequent);
      for (const c of node.elsifClauses) walk(c);
      if (node.elseClause) walk(node.elseClause);
      break;
    case 'ElsifClause':
      walk(node.condition); walkStatements(node.body);
      break;
    case 'ElseClause':
      walkStatements(node.body);
      break;
    case 'CaseStatement':
      walk(node.discriminant);
      for (const c of node.clauses) walk(c);
      if (node.elseClause) walk(node.elseClause);
      break;
    case 'CaseClause':
      for (const v of node.values) walk(v);
      walkStatements(node.body);
      break;
    case 'ForStatement':
      walk(node.variable); walk(node.from); walk(node.to);
      if (node.by) walk(node.by);
      walkStatements(node.body);
      break;
    case 'WhileStatement':
    case 'RepeatStatement':
      walk(node.condition); walkStatements(node.body);
      break;
    case 'ReturnStatement':
    case 'ExitStatement':
    case 'ContinueStatement':
    case 'EmptyStatement':
    case 'StructInit':
    case 'ArrayInit':
      break;
    case 'FunctionCallStatement':
      walk(node.call);
      break;
    case 'BinaryExpr': {
      const conv: Conversion | undefined = node.left.conversion;
      void conv?.from; void conv?.to;
      walk(node.left); walk(node.right);
      break;
    }
    case 'UnaryExpr':
      walk(node.operand);
      break;
    case 'MemberAccess': {
      const sym: ResolvedSymbol | undefined = node.resolvedSymbol;
      if (sym && sym.kind === 'member') { const key: string = sym.accessKey; void key; }
      walk(node.object);
      break;
    }
    case 'ArrayAccess':
      walk(node.array);
      for (const i of node.indices) walk(i);
      break;
    case 'FunctionCall':
      if (typeof node.callee !== 'string') walk(node.callee);
      for (const a of node.args) walk(a);
      break;
    case 'IdentifierRef': {
      const sym = node.resolvedSymbol;
      if (sym && sym.kind === 'descriptor') { const size: number | undefined = sym.arraySize; void size; }
      if (sym && sym.kind === 'variable') { const decl = sym.declaration; void decl.name; }
      break;
    }
    case 'IntegerLiteral':
    case 'RealLiteral':
    case 'BoolLiteral':
    case 'StringLiteral':
    case 'TimeLiteral':
    case 'DateLiteral':
    case 'TypedLiteral':
      void readLiteral(node);
      break;
    case 'RangeLiteral': {
      const r: RangeLiteral = node;
      walk(r.lo); walk(r.hi);
      break;
    }
    case 'NamedArgument':
      if (node.value) walk(node.value);
      break;
    default: {
      const exhaustive: never = node;
      void exhaustive;
    }
  }
}

if (analysis.ast) walk(analysis.ast);
if (reanalysis.ast) walk(reanalysis.ast);
if (parsed.ast) walk(parsed.ast);

const someLiteral: IntegerLiteral | TypedLiteral | undefined = undefined;
void someLiteral;

// Reference variables to silence unused-locals diagnostics
void validated; void jsCode; void compiled; void ast; void _code;
void _ins; void _outs; void _ints; void _errs; void _warns;
void exprAst; void _exprCode; void _exprIns; void _exprOuts;
void _exprInts; void _exprErrs; void _exprWarns;
void _compositeCode; void _compositeExprCode;
void _analysisErrors; void _analysisWarnings; void rootType; void backToStNode;

// NOTE: the negative tests (malformed direction, misspelled node kind, missing
// annotation property) live in consumer-bad.ts and are expected to produce
// diagnostics when compiled.
