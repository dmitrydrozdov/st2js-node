// Smoke test that exercises the hand-written index.d.ts under strict mode.
// This file is never executed — it is only type-checked by tsc --noEmit.

import st2js, {
  parse,
  validate,
  compile,
  compileSync,
  parseAlgorithm,
  compileAlgorithm,
  parseExpression,
  compileExpression,
  STError,
  VariableDescriptor,
  CompileOptions,
  CompileResult,
  AlgorithmCompileResult,
  ExpressionCompileResult,
} from '../../index';

// parse / validate / compile / compileSync
const parsed = parse('FUNCTION_BLOCK FB\nEND_FUNCTION_BLOCK');
const validated = parsed.ast ? validate(parsed.ast) : { valid: false, errors: [] as STError[] };
const opts: CompileOptions = { strict: true, sourceMaps: false, filename: 'in.st' };
const compiled: CompileResult = compile('FUNCTION_BLOCK FB\nEND_FUNCTION_BLOCK', opts);
const jsCode: string = compileSync('FUNCTION_BLOCK FB\nEND_FUNCTION_BLOCK');

// parseAlgorithm
const parsedAlgo = parseAlgorithm('Count := Count + 1;');
const ast = parsedAlgo.ast;

// compileAlgorithm — happy path
const descriptors: VariableDescriptor[] = [
  { name: 'Count', type: 'INT', direction: 'internal' },
  { name: 'Trigger', type: 'BOOL', direction: 'input' },
  { name: 'Out', type: 'INT', direction: 'output' },
];

const algo: AlgorithmCompileResult = compileAlgorithm(
  'IF Trigger THEN Count := Count + 1; Out := Count; END_IF;',
  descriptors,
  { strict: false },
);

const _code: string = algo.code;
const _ins: string[] = algo.inputNames;
const _outs: string[] = algo.outputNames;
const _ints: string[] = algo.internalNames;
const _errs: STError[] = algo.errors;
const _warns: STError[] = algo.warnings;

// parseExpression
const parsedExpr = parseExpression('REQ AND count < threshold');
const exprAst = parsedExpr.ast;

// compileExpression — happy path
const expr: ExpressionCompileResult = compileExpression(
  'REQ AND count < threshold',
  descriptors,
);
const _exprCode: string = expr.code;
const _exprIns: string[] = expr.inputNames;
const _exprOuts: string[] = expr.outputNames;
const _exprInts: string[] = expr.internalNames;
const _exprErrs: STError[] = expr.errors;
const _exprWarns: STError[] = expr.warnings;

// Default-export shape
const all = st2js;
all.parse('');
all.compileAlgorithm('', []);
all.parseExpression('');
all.compileExpression('', []);

// Reference variables to silence unused-locals diagnostics
void validated; void jsCode; void compiled; void ast; void _code;
void _ins; void _outs; void _ints; void _errs; void _warns;
void exprAst; void _exprCode; void _exprIns; void _exprOuts;
void _exprInts; void _exprErrs; void _exprWarns;

// NOTE: the negative test (malformed direction) lives in consumer-bad.ts and is
// expected to produce a diagnostic when compiled.
