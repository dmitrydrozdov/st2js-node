# Changelog

## 1.1.0 — 2026-04-12

### Added

- **`compileAlgorithm(source, variables, options?)`** — compile a bare ST
  *statement list* (not a full POU) against an externally supplied variable
  descriptor list. Emits a JavaScript body that reads and writes an `__s`
  scope object passed in by the host, matching the shape already used by the
  IEC 61499 runtime's own `compileAlgorithm()` wrapper.
- **`parseAlgorithm(source)`** — a parse-only entry point for hosts that
  want to run their own validation or codegen against the statement list.
- **`Parser.prototype.parseStatementList()`** — public recursive-descent
  entry that loops over `parseStatement()` until EOF and returns a
  `StatementList` CST node. Existing `parse()` continues to require a
  top-level POU.
- **`Validator.prototype.validateAlgorithm(ast, variables)`** — validator
  mode that seeds a fresh scope from a caller-supplied
  `VariableDescriptor[]` (name, type, direction) and runs the normal
  statement-level checks. Writes to `direction: 'input'` symbols are
  surfaced as validator errors; duplicate descriptor names and invalid
  `direction` values are rejected up front.
- **`Codegen.prototype.generateAlgorithm(ast, variables, options)`** —
  codegen mode that emits a bare JS body with descriptor reads/writes
  routed through `__s["name"]`. Integer clamping (`| 0`) is preserved for
  integer-typed targets. No class/function/`'use strict'` wrapper is
  emitted — hosts wrap the body themselves via
  `new Function('__s', code)`.
- **`index.d.ts`** — hand-written TypeScript declarations for the entire
  public API (`parse`, `validate`, `compile`, `compileSync`,
  `parseAlgorithm`, `compileAlgorithm`, `STError`, `VariableDescriptor`,
  `CompileOptions`, `CompileResult`, `AlgorithmCompileResult`). Referenced
  from `package.json` via `"types"`.
- **`npm run typecheck`** — dev-only smoke check that compiles
  `tests/typecheck/consumer.ts` under `tsc --strict --noEmit` and verifies
  the negative scenario (malformed `direction` literal) via a
  `@ts-expect-error` guard.
- **Tests** — 45 new test cases under `tests/unit/parser/`,
  `tests/unit/validator/`, `tests/unit/codegen/`, `tests/unit/api.test.js`,
  and `tests/integration/algorithm.test.js`, plus three new algorithm
  fixtures under `tests/fixtures/algorithms/`.

### Notes

- No breaking changes. The existing `parse`, `validate`, `compile`, and
  `compileSync` exports retain their signatures, return shapes, and
  runtime behaviour.
- Full design and tasks for this release live in
  `openspec/changes/iec61499-algorithm-compile/`.

## 1.0.0

- Initial release.
