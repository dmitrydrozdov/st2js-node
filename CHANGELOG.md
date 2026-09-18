# Changelog

## 2.0.0 — 2026-09-18

### Breaking

- **Type violations are errors.** A single static typing pass now applies the
  IEC 61131-3 implicit-conversion rules to every algorithm, expression, and
  POU, and rejects what previously compiled with a warning or in silence:
  narrowing assignments (`DINT` → `INT`, `LREAL` → `DINT`), real-to-integer
  assignment, arithmetic or comparison mixing signed and unsigned integers,
  comparison of incompatible types, `MOD` on non-integers, boolean operators
  on operands that are neither `BOOL` nor bit strings, non-`BOOL` `IF` /
  `WHILE` / `REPEAT` conditions, non-integer or out-of-range array indices,
  out-of-range literals, and calls to unknown standard functions or with the
  wrong arity or argument classes. Each is a `validator`-phase error,
  `compileAlgorithm` / `compileExpression` return empty `code`, and no option
  downgrades them. Programs that relied on implicit narrowing must add an
  explicit conversion function (e.g. `REAL_TO_DINT(x)`).
- **Width-correct integer wrapping.** Generated code wraps every value stored
  into an integer-typed variable, loop variable, or function result at the
  declared width instead of always truncating to 32 bits with `| 0`: `SINT`
  `((x) << 24) >> 24`, `USINT`/`BYTE` `(x) & 0xFF`, `INT` `((x) << 16) >> 16`,
  `UINT`/`WORD` `(x) & 0xFFFF`, `DINT` `(x) | 0`, `UDINT`/`DWORD` `(x) >>> 0`.
  `LINT`, `ULINT`, and `LWORD` are no longer truncated to 32 bits. Hosts that
  asserted on `| 0` in generated text must update their expectations.
- **Integer division truncates** toward zero (`Math.trunc(a / b)`) when both
  operands are integer-typed.
- `AND`, `OR`, `XOR`, and `NOT` on bit-string operands now emit bitwise
  operators (`&`, `|`, `^`, `~` masked to the width) instead of the boolean
  forms.
- Codegen reads the typing annotations only; `Codegen._inferType` and the
  `_varTypes` map were removed. An unanalyzed tree is emitted without
  integer wrapping.
- `TIME#...` and `DATE#...` now lex as `TYPED_LITERAL` tokens (with
  `typeName` and `valueText`) instead of `TIME_LITERAL` / `DATE_LITERAL`;
  `T#...` and `D#...` are unchanged. `INT#42` and the other numeric typed
  literals are `TYPED_LITERAL` tokens instead of `INTEGER_LITERAL`.
- The validator's `MemberAccess._compositeMember` / `_compositeParent`
  annotations were replaced by the `resolvedSymbol` annotation.

### Fixed

- **Typed literals produce values.** `DINT#1`, `REAL#2.5`, `BOOL#TRUE`,
  `WORD#16#FF`, `DINT#-5`, `INT#+42`, `BYTE#2#1010`, `LREAL#1.5e3`,
  `STRING#'a'`, `TIME#1s`, `TOD#12:30:00`, `DT#2024-01-01-00:00:00`, and every
  other `<TYPE>#<value>` form parse to a `TypedLiteral` node with a fully
  parsed inner literal and compile to the value; previously most of them
  compiled to `NaN`.
- **Exact integer constants.** Every `IntegerLiteral` carries `bigValue`
  (an exact `bigint`) next to `value` and `raw`, for all bases; the duplicated
  `16#` branch in the parser was removed.
- `CASE` range bounds accept identifiers and negative literals on either
  side of `..` (`LO..HI`, `-5..-1`, `DINT#1..DINT#9`); `RangeLiteral` is a
  declared node type, and a range with non-constant bounds lowers to an
  `if`/`else if` chain instead of a wrong `case` label.
- `REPEAT ... UNTIL cond END_REPEAT;` is accepted (the `END_REPEAT` keyword
  was previously rejected by the parser).

### Added

- **Static typing pass** in `src/analysis/TypeAnalyzer.js` over the shared
  type model in `src/analysis/types.js` (elementary type table, generic
  classes, implicit-conversion rules, operator result rules, standard-function
  signatures including a full `<FROM>_TO_<TO>` conversion matrix). It
  annotates the AST in place with `resolvedType`, `resolvedSymbol`,
  `constant`, and `conversion`; untyped literals take their context type;
  member access, array access, and standard-function calls are typed.
- **`analyzeAlgorithm(sourceOrAst, variables, options?)`** and
  **`analyzeExpression(sourceOrAst, variables, options?)`** public entry points
  (CommonJS and ESM) returning `{ ast, errors, warnings }`. `compileAlgorithm`,
  `compileExpression`, and `validate` use the same pass, so their diagnostics
  are identical.
- **`int64` option** (`'number'` default, `'bigint'`) on `compile`,
  `compileAlgorithm`, and `compileExpression`. In `number` mode 64-bit results
  use `Math.trunc` and no width wrap (exact to ±2^53); in `bigint` mode 64-bit
  literals, arithmetic, wrapping (`BigInt.asIntN` / `asUintN`), and boundary
  conversions (`BigInt(...)`) use `bigint`, and hosts supply `bigint` scope
  values for those types.
- **Descriptor fields** `arraySize` and `stringLength` (non-negative integers)
  on `VariableDescriptor` and `VariableMemberDescriptor`. `A[i]` on an array
  descriptor is typed as the element type, constant indices are range-checked,
  and the string length is recorded on the resolved symbol. Invalid values are
  `validator`-phase errors.
- **AST typings** in `index.d.ts`: the `STNode` discriminated union over every
  node kind (`type` as discriminant), `Location`, literal fields (`value`,
  `bigValue`, `raw`), `TypedLiteral`, `RangeLiteral`, statements and
  declarations, the annotation fields, `ResolvedSymbol`, `AnalysisResult`, and
  the `Int64Mode` option. `ASTNode` remains as an alias of `STNode`;
  `ParseResult` and `AnalysisResult` are generic in the root node kind.
- `TypeMapper.wrapInteger`, `bitwiseNot`, `integerLiteral`, and an
  `int64`-aware `getDefaultValue`.
- Over 340 new tests (lexer, parser, analysis, codegen, integration, descriptors, docs)
  and an exhaustive `STNode` walk in the strict TypeScript consumer.

### Notes

- Full design and tasks for this release live in
  `openspec/changes/static-typing-and-typed-literals/`.

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
