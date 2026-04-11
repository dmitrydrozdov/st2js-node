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

/** Opaque AST node; consumers should treat this as a black box. */
export interface ASTNode {
  type: string;
  loc?: unknown;
  [key: string]: unknown;
}

export interface ParseResult {
  ast: ASTNode | null;
  errors: STError[];
}

export interface ValidateResult {
  valid: boolean;
  errors: STError[];
}

export interface CompileOptions {
  sourceMaps?: boolean;
  strict?: boolean;
  filename?: string;
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
 */
export interface VariableDescriptor {
  name: string;
  /** IEC 61131-3 type identifier (e.g. 'INT', 'BOOL', 'REAL', 'STRING'). */
  type: string;
  direction: 'input' | 'output' | 'internal';
}

export interface AlgorithmCompileOptions {
  /** Promote validator warnings to errors. Defaults to false. */
  strict?: boolean;
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

/** Parse a full ST program (FUNCTION_BLOCK / FUNCTION / PROGRAM). */
export function parse(source: string): ParseResult;

/** Run semantic validation on an AST produced by `parse`. */
export function validate(ast: ASTNode): ValidateResult;

/** Compile a full ST program (POU-based) to JavaScript. */
export function compile(source: string, options?: CompileOptions): CompileResult;

/** Compile a full ST program and return only the generated JS string. */
export function compileSync(source: string, options?: CompileOptions): string;

/** Parse a bare ST algorithm (statement list) without validation. */
export function parseAlgorithm(source: string): ParseResult;

/**
 * Compile a bare ST algorithm against an externally supplied variable list.
 * Returns a body string that can be instantiated via
 * `new Function("__s", result.code)` and executed with a host-supplied scope
 * object.
 */
export function compileAlgorithm(
  source: string,
  variables: VariableDescriptor[],
  options?: AlgorithmCompileOptions,
): AlgorithmCompileResult;

declare const _default: {
  parse: typeof parse;
  validate: typeof validate;
  compile: typeof compile;
  compileSync: typeof compileSync;
  parseAlgorithm: typeof parseAlgorithm;
  compileAlgorithm: typeof compileAlgorithm;
};
export default _default;
