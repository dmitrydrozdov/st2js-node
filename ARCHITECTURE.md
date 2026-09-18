# st2js Architecture

## Overview

st2js translates IEC 61131-3 Structured Text (ST) source code to JavaScript through a classical compiler pipeline:

```
ST Source
    │
    ▼
┌─────────┐
│  Lexer  │  src/lexer/Lexer.js
└─────────┘
    │ Token[]
    ▼
┌─────────┐
│ Parser  │  src/parser/Parser.js
└─────────┘
    │ CST (raw parse nodes)
    ▼
┌────────────┐
│ ASTBuilder │  src/parser/ASTBuilder.js
└────────────┘
    │ AST (normalized)
    ▼
┌──────────────────────────────┐
│ Validator  +  TypeAnalyzer   │  src/parser/Validator.js
│ (scope, names, control flow) │  src/analysis/TypeAnalyzer.js
│ (static typing pass)         │  src/analysis/types.js
└──────────────────────────────┘
    │ AST annotated in place (resolvedType, resolvedSymbol,
    │ constant, conversion) + errors/warnings
    ▼
┌────────┐
│ Codegen│  src/codegen/Codegen.js (reads annotations only)
└────────┘
    │
    ▼
JavaScript Source + Source Map
```

## Component Descriptions

### 1. Lexer (`src/lexer/Lexer.js`)

A hand-written tokenizer that converts raw ST source into a flat token stream.

**Responsibilities:**
- Single-pass character scanning
- Keyword recognition (case-insensitive; keywords normalized to uppercase)
- Multi-character operator disambiguation: `:=` vs `:`, `..` vs `.`, `**` vs `*`, `<>` vs `<`/`>`, `<=`, `>=`
- Literal parsing: integers (decimal, `16#hex`, `8#octal`, `2#binary`), reals, booleans, strings, time (`T#1s500ms`), dates (`D#2024-01-01`)
- Typed literals: every elementary type keyword immediately followed by `#` (`DINT#-5`, `WORD#16#FF`, `REAL#2.5`, `BOOL#TRUE`, `STRING#'a'`, `TIME#1s`, `TOD#12:00:00`, `DT#2024-01-01-00:00:00`) becomes one `TYPED_LITERAL` token carrying `typeName` (canonical: `TOD` → `TIME_OF_DAY`, `DT` → `DATE_AND_TIME`) and `valueText`. The value text is scanned per type class so the parser can apply the ordinary literal rules; whitespace between the keyword and `#` is not a typed literal, and `T#`/`D#` remain plain `TIME_LITERAL`/`DATE_LITERAL` tokens
- Comment skipping: `(* block *)` and `// line` styles
- Error recovery: records `STError` objects and continues scanning

**Output:** `Token[]` where each token is:
```javascript
{ type: string, value: string, line: number, column: number, start: number, end: number }
```

### 2. Parser (`src/parser/Parser.js`)

A recursive descent parser that consumes the token stream and produces a Concrete Syntax Tree (CST).

**Grammar coverage:**
- Top-level: `FUNCTION_BLOCK`, `FUNCTION`, `PROGRAM`, `TYPE` declarations
- Variable sections: all `VAR*` blocks with modifiers (`CONSTANT`, `RETAIN`)
- Type references: primitives, `ARRAY[lo..hi] OF T`, inline `STRUCT`, `STRING[N]`
- Statements: assignments, `IF`, `CASE`, `FOR`, `WHILE`, `REPEAT`, `RETURN`, `EXIT`, `CONTINUE`
- Expressions: full precedence hierarchy (OR < XOR < AND < comparison < +/- < *//(MOD) < unary < ** < primary)
- Function calls: positional and named (`name := value`) arguments
- Postfix: array access `a[i]`, member access `a.b.c`
- Literals: every `IntegerLiteral` carries `value` (nearest `number`), `bigValue` (exact `bigint`, computed with `BigInt` for every base), and `raw`. A `TYPED_LITERAL` token becomes a `TypedLiteral` node whose `value` is a fully parsed inner literal (`IntegerLiteral`, `RealLiteral`, `BoolLiteral`, `StringLiteral`, `TimeLiteral`, or `DateLiteral`); malformed value text is a parser error and never yields a `null`/`NaN` value. Identifier-prefixed literals (`Colour#Red`) keep the `TypedLiteral` + `IdentifierRef` shape
- `CASE` labels: each bound of a label or `lo..hi` range is a signed integer literal, a typed literal, or an identifier; ranges are `RangeLiteral` nodes

**Error recovery:** The parser records errors and uses `synchronize()` to skip to the next safe token, allowing multiple errors to be reported in a single parse.

### 3. ASTBuilder (`src/parser/ASTBuilder.js`)

Normalizes the raw CST from the Parser into a clean, fully-typed AST using `NodeType` constants from `src/types.js`.

**Transformations:**
- Maps parser's string-based `type` fields to `NodeType.*` constants
- Maps `kind` token types to `VarKind.*` strings (`VAR_INPUT` → `'VAR_INPUT'`)
- Ensures consistent field names across all node types
- Recursively visits all nodes via `visitNode()` dispatch table

### 4. Validator (`src/parser/Validator.js`)

Performs semantic analysis over the AST using a symbol table (scope stack) and
drives the static typing pass. The validator owns everything about *names*;
every *type* question is delegated to the `TypeAnalyzer`.

**Checks (validator):**
- Variable declaration: duplicate names in same scope
- Variable usage: undeclared identifiers (warning in POU and algorithm mode, error in expression mode)
- Direction: writes to `input` descriptors, input-direction composite members, and input array elements
- Composite descriptors: unknown members, nested member access, bare references
- Control flow: `EXIT`/`CONTINUE` only inside loops
- Standard functions/FBs: known library names never count as undeclared; unknown callees are a warning in POU mode and an error in algorithm/expression mode

**Scope model:** Nested `Scope` objects with `parent` links; `lookup()` walks up the chain. Each scope entry is a *symbol record* (`{ kind: 'descriptor' | 'member' | 'composite' | 'variable' | 'return' | 'pou' | 'field' | 'enum', name, type, ... }`) whose `type` is already resolved (`resolveDeclaredType` maps `VAR` type nodes and user type aliases to elementary names, array descriptors, or user type names). The same record becomes the `resolvedSymbol` annotation of every identifier that resolves to it.

The validator exposes the analyzer's name-resolution interface (`lookupIdentifier`, `lookupMember`, `lookupMemberType`, `lookupEnumValue`, `lookupCallee`) and its diagnostics sink. It has no type inference of its own: the former per-expression type strings, the literal-to-`INT` default, and the `typesCompatible` table were removed in favour of the analyzer.

### 4a. Static typing pass (`src/analysis/`)

`src/analysis/types.js` is the single type model shared by validation, code generation, and external consumers:

- the elementary type table (width, signedness, exact `bigint` range, class), the generic classes `ANY_INT`, `ANY_REAL`, `ANY_BIT`, `ANY_NUM`, `ANY_STRING`, `ANY_DATE`, and the predicates over them;
- the implicit-conversion relation (`isImplicitlyConvertible`, `commonType`): only conversions that cannot lose information are implicit;
- the result-type rules for every operator (`binaryResultType`, `unaryResultType`), which return either a result type plus the conversions applied to each operand, or an error message;
- the standard-function signature table (arity, parameter classes, homogeneous argument groups, result rule) including a generated `<FROM>_TO_<TO>` conversion matrix.

`src/analysis/TypeAnalyzer.js` walks expression trees and the expression parts of statements (called by the validator's statement walker for assignments, conditions, `FOR` headers, `CASE` headers, call statements, and initial values) and writes annotations onto the nodes in place:

| Annotation | Set on | Value |
|---|---|---|
| `resolvedType` | every expression node | elementary name, user type name, `{ kind: 'array', element, size, lo }`, or `null` when unresolved |
| `resolvedSymbol` | identifiers, member accesses | the symbol record (descriptor, composite member with `accessKey`, POU variable, struct field, enum value) |
| `constant` | literals, typed literals, negated literals | `{ type, value }` with exact `bigint` integers |
| `conversion` | operands and assigned values adapted by an implicit widening | `{ from, to, implicit: true }` |

Typing rules: untyped integer and real literals take the type their context requires (assignment target, the typed operand of a binary expression, a concrete or homogeneous function parameter) and default to `DINT`/`REAL`; typed literals keep their declared type; all integer literals are range-checked with `bigValue`. Arithmetic on integers joins to the wider type of the same signedness; integer with real joins to a real type that represents the integer; comparisons require a common type and yield `BOOL`; `AND`/`OR`/`XOR`/`NOT` are boolean on `BOOL` and bitwise on bit strings; `MOD` requires integers; `**` yields the base type. Array access requires an integer index and yields the element type, with constant indices checked against the declared size. Every violation is a `validator`-phase error; there is no lenient mode. An expression containing an unresolved name is typed `null` and produces no further diagnostics.

The public entry points `analyzeAlgorithm(sourceOrAst, variables, options?)` and `analyzeExpression(...)` in `src/index.js` run the parser (when given text) and the validator, and return `{ ast, errors, warnings }`; `compileAlgorithm`, `compileExpression`, and `validate` use exactly the same pass, so their diagnostics are identical.

### 5. Codegen (`src/codegen/Codegen.js`)

Walks the annotated AST and emits indented JavaScript source code. Codegen
performs no type inference: it reads `constant` for literal values,
`resolvedType` for integer wrapping and operator lowering, `conversion` for
64-bit boundary casts, and `resolvedSymbol` for composite access keys. The
former private inference (`_inferType` and the `_varTypes` map, which
defaulted every unknown to `INT`) was removed; an unanalyzed tree is emitted
without wrapping. Declared types of POU variables are still read from their
declaration nodes for default values and FB-instance detection.

**Code generation strategy:**

| ST Construct | JavaScript Output |
|---|---|
| `FUNCTION_BLOCK Foo` | `class Foo { constructor() {...} call(...) {...} }` |
| `FUNCTION Bar: INT` | `function Bar(inputs) { let _result = 0; ...; return _result; }` |
| `PROGRAM Baz` | Module-level vars + `function run()` + `module.exports` |
| Instance var access | `this.VarName` (inside class) |
| Integer store | wrapped at the target width: `SINT` `((x) << 24) >> 24`, `USINT`/`BYTE` `(x) & 0xFF`, `INT` `((x) << 16) >> 16`, `UINT`/`WORD` `(x) & 0xFFFF`, `DINT` `(x) \| 0`, `UDINT`/`DWORD` `(x) >>> 0`; 64-bit types `Math.trunc(x)` or `BigInt.asIntN/asUintN(64, x)` per `int64` |
| Integer division | `Math.trunc(a / b)` when both operands are integer-typed |
| Literals | from `constant`: `DINT#1` → `1`, `WORD#16#FF` → `255`, `BOOL#TRUE` → `true`, `LINT#1` → `1n` in `bigint` mode |
| `AND`/`OR`/`XOR`/`NOT` | `&&`/`\|\|`/`!==`/`!` on `BOOL`; `&`/`\|`/`^`/`~` (masked to width) on bit strings |
| `CASE lo..hi` | expanded `case` labels for constant bounds (≤1024 labels); an `if`/`else if` chain over a `__st_case<n>` temporary otherwise |
| FB instance calls | `instance.call(args...)` |
| FB instance init | `new TypeName()` |
| `IF/ELSIF/ELSE` | `if/else if/else` |
| `CASE/OF` | `switch/case/default` with break |
| `FOR/TO/BY` | `for` with step-aware condition |
| `WHILE` | `while` |
| `REPEAT/UNTIL` | `do/while (!condition)` |

**FB instance detection:** During code generation, variables whose type is not a known primitive are assumed to be FB/class instances. They are initialized with `new TypeName()` and calls to them are rewritten as `instance.call(...)`.

**Return value pattern:** Functions use a local `_result` variable. Assignments to the function name (ST's return value syntax) are rewritten as `_result = ...`. The function ends with `return _result;`.

### 6. TypeMapper (`src/codegen/TypeMapper.js`)

Utility module for ST-to-JS type mappings:
- `getDefaultValue(stType, int64)` — Returns JS literal for ST type's zero value (`0n` for 64-bit types in `bigint` mode)
- `wrapInteger(expr, stType, int64)` — The width-correct wrapping form for a stored integer value
- `bitwiseNot(expr, stType, int64)` and `integerLiteral(value, stType, int64)` — Bitwise complement masked to the width, and exact integer literal emission
- `isReal(stType)`, `isInteger(stType)`, `is64Bit(stType)`, etc. — Type category predicates

### 7. Runtime (`src/runtime/`)

**`TimerBlocks.js`** — Working JS implementations of IEC 61131-3 standard FB timers:
- `TON` (on-delay), `TOF` (off-delay), `TP` (pulse)
- `RS` (reset-dominant latch), `SR` (set-dominant latch)
- `CTU` (count up), `CTD` (count down), `CTUD` (count up/down)

Timer FBs use `Date.now()` for millisecond timing. The `call(inputs)` method matches the pattern generated by Codegen for FB instances.

**`StandardFunctions.js`** — JS implementations of the IEC 61131-3 standard function library: math, type conversions, string operations, bit manipulation, and selection functions.

## Data Flow Details

### AST Node Shape

Every AST node follows this pattern:
```javascript
{
  type: NodeType.SOME_TYPE,   // string constant from NodeType
  loc: {
    start: number,            // byte offset in source
    end: number,
    line: number,             // 1-based
    column: number,           // 0-based
    endLine: number,
    endColumn: number,
  },
  // ... node-specific fields
}
```

### Variable Declaration Node
```javascript
{
  type: NodeType.VAR_DECLARATION,
  name: 'Count',
  varType: { type: NodeType.PRIMITIVE_TYPE, name: 'INT', loc },
  initialValue: { type: NodeType.INTEGER_LITERAL, value: 0, raw: '0', loc },
  loc,
}
```

### Error Object
```javascript
{
  phase: 'lexer' | 'parser' | 'validator',
  severity: 'error' | 'warning',
  message: 'Human-readable description',
  line: 5,      // 1-based
  column: 12,   // 0-based
  code: undefined, // optional error code
}
```

## Design Decisions

### Hand-Written Parser vs ANTLR4

The module uses a hand-written recursive descent parser rather than generating one from the ANTLR4 grammar. Reasons:
1. **No Java dependency** at runtime or build time
2. **Better error recovery** — custom synchronize points
3. **Simpler deployment** — no generated files to commit

The `grammar/ST.g4` file serves as the formal specification and can be used to generate an alternative parser with `npm run generate-parser` (requires Java 11+).

### Integer Width

ST integers have a declared width (8, 16, 32, or 64 bits, signed or unsigned); JS numbers are 64-bit floats. Every value stored into an integer-typed variable, loop variable, or function result is wrapped at the target's width using the form keyed by its `resolvedType` (see the Codegen table), so overflow follows IEC 61131-3 semantics at the point of storage. Intermediate results are not wrapped. 64-bit types are never truncated to 32 bits: in the default `int64: 'number'` mode they are `Math.trunc`ed numbers (exact to ±2^53); in `int64: 'bigint'` mode they are `bigint`s wrapped with `BigInt.asIntN`/`asUintN`, literals are emitted as `123n`, and narrower operands are cast with `BigInt(...)` where the analyzer recorded a conversion to a 64-bit type.

### One Type Model

Before the typing pass, the validator returned a type string per expression (defaulting integer literals to `INT` and member/array/call results to `ANY`) and codegen re-inferred types from its own `_varTypes` table (defaulting to `INT`). Neither was attached to the AST and they disagreed. Both were removed: `src/analysis/types.js` is the only place that knows the type lattice, `TypeAnalyzer` is the only inference, and its annotations are the contract between the validator, the code generator, and external consumers such as a device compiler.

### Function Block Call Pattern

ST function blocks are called as: `fb_instance(inputs...)`. Since JS doesn't allow calling an object as a function, the compiler detects FB instance calls and rewrites them as `fb_instance.call(inputs...)`. The generated class always has a `call()` method.

### Module Exports for PROGRAM

ST `PROGRAM` declarations become CommonJS modules. All declared variables are exported as read-only getters so external code can observe state without mutation.

## Algorithm Compile Mode (IEC 61499 snippets)

The pipeline also supports a second entry shape for host environments (e.g. the
IEC 61499 runtime) that need to compile a *bare statement list* against an
externally declared variable interface. This is a thin alternate entry point
that reuses the statement-level rules of each stage rather than a fork of the
pipeline.

- **Parser** exposes `parseStatementList()`: a public entry that loops over
  `parseStatement()` until EOF and wraps the result in a `StatementList` CST
  node. The internal helper used by control-flow bodies was renamed to
  `_parseStatementsUntil(stopTypes)` so the public name is free. The existing
  `parse()` entry still requires a top-level POU and rejects bare statement
  lists.
- **ASTBuilder** normalises the `StatementList` CST node into the corresponding
  AST node (`NodeType.STATEMENT_LIST`).
- **Validator** exposes `validateAlgorithm(ast, variables)`: it validates the
  descriptor shapes (including the optional non-negative integer `arraySize`
  and `stringLength`), builds a fresh root scope seeded with one symbol record
  per descriptor (an array descriptor resolves to
  `{ kind: 'array', element, size, lo: 0 }`), and then runs the statement-level
  walker, which drives the typing pass. Writes to `direction: 'input'` symbols
  are surfaced as validator errors. Standard-function resolution uses the
  signature table, so it works without any POU scope.
- **Codegen** exposes `generateAlgorithm(ast, variables, options)`: it walks
  the statement list using the existing `_genNode`/`_genExpr` helpers and
  overrides `_varRef()` so that descriptor names resolve to `__s["name"]`
  reads and writes. Integer wrapping is keyed by the `resolvedType` annotation
  of each assignment target, so codegen expects an analyzed tree. No class,
  function, or `'use strict';` wrapper is emitted — the output is a bare body
  that hosts wrap themselves via `new Function('__s', code)`.
- **Public API** exports `parseAlgorithm(source)`,
  `analyzeAlgorithm(sourceOrAst, variables, options?)`, and
  `compileAlgorithm(source, variables, options?)` from `src/index.js` /
  `src/index.mjs`. `compileAlgorithm` runs `analyzeAlgorithm` and returns
  `{ code, inputNames, outputNames, internalNames, warnings, errors }`; `code`
  is empty whenever `errors` contains any `severity: 'error'` entry.
  `options.int64` selects the 64-bit representation.

The generated algorithm body intentionally omits `'use strict';`: a JS
fragment cannot legally include a strict directive mid-function, and the
host's `new Function('__s', ...)` shim already runs in strict-by-default
context inside an ES module. Hosts embedding the fragment should not be
surprised by its absence.

## Expression Compile Mode (transition conditions)

A third entry shape supports hosts that need to compile a *single* ST
expression — for example IEC 61499 Basic FB transition conditions like
`REQ AND count < threshold`. This mode reuses the same expression rules as
algorithm mode and emits a bare JavaScript expression string rather than a
statement body.

- **Parser** already exposes `parseExpression()` for use inside statement and
  control-flow rules. The public facade in `src/index.js` invokes it directly,
  then asserts that the parser is at EOF and records a `parser`-phase error if
  any tokens remain. This rejects inputs like `REQ count` and JS-only syntax
  such as `count === threshold` (which lexes as three `=` tokens, leaving the
  trailing `= threshold` unconsumed).
- **ASTBuilder** processes the expression CST via the existing `visitNode`
  dispatch, which already handles `BinaryExpr`, `UnaryExpr`, `IdentifierRef`,
  `FunctionCall`, and the literal node types.
- **Validator** exposes `validateExpression(ast, variables)`: it shares the
  descriptor-shape and uniqueness checks with `validateAlgorithm`, seeds a
  fresh root scope from the descriptors, and hands the expression to the
  typing pass. The `_exprMode` flag promotes the "undeclared identifier"
  warning to a hard error so missing names fail compilation, and standard
  functions still resolve through the signature table. There is no
  write-to-input check because expressions cannot assign.
- **Codegen** exposes `generateExpression(ast, variables, options)`: it
  configures the same algorithm-mode scope state used by `generateAlgorithm`
  (`_inAlgo`, `_algoScopeVars`, the composite lookup) so descriptor references
  emit as `__s["name"]`, then calls `_genExpr(ast)` and returns the resulting
  string directly. The expression carries no statement terminator, no
  `return`, no function wrapper, and no assignment.
- **Public API** exports `parseExpression(source)`,
  `analyzeExpression(sourceOrAst, variables, options?)`, and
  `compileExpression(source, variables, options?)` from `src/index.js` /
  `src/index.mjs`. `compileExpression` runs `analyzeExpression` and returns
  `{ code, inputNames, outputNames, internalNames, warnings, errors }`; `code`
  is the empty string whenever `errors` contains any `severity: 'error'`
  entry. Hosts wrap the returned expression themselves, typically via
  `new Function('__s', 'return ' + code)`.

## Composite Descriptors

A descriptor passed to `compileAlgorithm`/`compileExpression` (and their
validator and codegen entry points) may declare an optional `members` array,
turning it into a *composite* descriptor. Composite descriptors model
domain-shaped identifiers — e.g. IEC 61499 adapter ports — that ST source
reaches via dotted access (`<parent>.<member>`) while the host maps each leaf
to a flat key on the `__s` runtime scope object.

The validator and codegen agree on the **access-key contract**: each member
has an effective access key — its `accessKey` override, or
`"<parent>.<member>"` by default — and the generated JavaScript reads and
writes that key via `__s["<accessKey>"]`. Both reads and writes use the
identical access-key form; direction enforcement is the validator's job, not
codegen's.

- **Validator** (`Validator._initAlgoState`) registers each composite
  descriptor in the root scope as a single `composite` symbol record carrying
  a normalised `members: Map<UPPER, MemberSymbol>` map (with each member's
  resolved `accessKey`, type, and optional `arraySize`/`stringLength` baked
  in). When the typing pass asks the validator to resolve a member access
  (`lookupMember`) whose object is a composite symbol, the member record
  becomes the node's `resolvedSymbol` and its type the node's `resolvedType`.
  Unknown members, multi-level access against a composite root, duplicate
  member names, bare composite references, and assignments to
  `direction: 'input'` members are surfaced as `validator`-phase errors.
- **Codegen** (`Codegen._seedAlgoDescriptors`) builds its own composite
  lookup (`Map<parentNameUpper, Map<memberNameUpper, memberInfo>>`) from the
  descriptor list for the result buckets, and `_resolveCompositeMember`
  prefers a `MemberAccess` node's `resolvedSymbol` (kind `member`) before
  falling back to that map. `_genExpr`/`_genExprLhs` emit `__s["<accessKey>"]`
  for both reads and writes. Non-composite member access (any `MemberAccess`
  whose root is not a registered composite parent) passes through the
  existing `${objectExpr}.${memberName}` lowering unchanged.
- **Result arrays** (`AlgorithmCompileResult` / `ExpressionCompileResult`)
  skip the composite parent's own `name` and instead append each member's
  effective access key to the bucket matching that member's `direction`.
  Flat descriptors continue to contribute their `name` to the bucket matching
  their own `direction`. Composite descriptors do not appear in
  `internalNames`.

The empty-string `code` contract on validator errors is unchanged: when
`compileAlgorithm`/`compileExpression` see any `severity: 'error'` entry,
they return `code: ''` and the buckets are populated only from successful
seeding.

## Extension Points

- **New ST constructs:** Add token types to `src/types.js`, parsing rules to `Parser.js`, normalization to `ASTBuilder.js`, name checks to `Validator.js`, typing rules to `src/analysis/TypeAnalyzer.js`, code generation to `Codegen.js`, and the node shape to `index.d.ts` (the `STNode` union is exhaustive; `tests/typecheck/consumer.ts` fails to compile when a kind is missing)
- **New runtime FBs:** Add classes to `src/runtime/TimerBlocks.js`
- **New standard functions:** Add the implementation to `src/runtime/StandardFunctions.js` and its signature (arity, parameter classes, result rule) to `src/analysis/types.js`; `tests/unit/analysis/functions.test.js` cross-checks the two
- **Alternative output targets:** Create a new `Codegen` class that walks the same AST
- **Source maps:** The `sourceMap` object returned by `compile()` is a scaffold; implement V3 source map generation for debugger integration

## File Index

```
st2js/
├── src/
│   ├── index.js              Public API facade
│   ├── index.mjs             ESM wrapper
│   ├── types.js              Shared constants and type definitions
│   ├── lexer/
│   │   └── Lexer.js          Hand-written tokenizer
│   ├── parser/
│   │   ├── Parser.js         Recursive descent parser
│   │   ├── ASTBuilder.js     CST → AST normalizer
│   │   └── Validator.js      Scope, names, control flow; drives the typing pass
│   ├── analysis/
│   │   ├── types.js          Elementary type table, conversion/operator rules, function signatures
│   │   └── TypeAnalyzer.js   Static typing pass (annotates the AST in place)
│   ├── codegen/
│   │   ├── Codegen.js        JavaScript emitter
│   │   └── TypeMapper.js     ST → JS type utilities
│   ├── runtime/
│   │   ├── TimerBlocks.js    TON, TOF, TP, RS, SR, CTU, CTD, CTUD
│   │   └── StandardFunctions.js  IEC 61131-3 standard library
│   └── generated/            (ANTLR4 output, if generated)
├── grammar/
│   └── ST.g4                 Formal ANTLR4 grammar (documentation)
├── scripts/
│   ├── build.js              Build validation script
│   └── generate-parser.sh    ANTLR4 parser generation (optional)
├── tests/
│   ├── unit/
│   │   ├── lexer/Lexer.test.js
│   │   ├── parser/Parser.test.js, StatementList.test.js, TypedLiteral.test.js
│   │   ├── analysis/types.test.js, functions.test.js, TypeAnalyzer.test.js, diagnostics.test.js
│   │   ├── validator/Validator.test.js, Algorithm.test.js
│   │   ├── codegen/Codegen.test.js, Algorithm.test.js, Typed.test.js, TypeMapper.test.js
│   │   ├── runtime/TimerBlocks.test.js, StandardFunctions.test.js
│   │   ├── api.test.js, composite.test.js, descriptors.test.js
│   │   └── expression.test.js
│   ├── integration/
│   │   ├── algorithm.test.js
│   │   ├── compile.test.js
│   │   ├── expression.test.js
│   │   ├── realworld.test.js
│   │   └── typing.test.js
│   ├── typecheck/
│   │   ├── consumer.ts       Positive strict-mode consumer (exhaustive STNode walk)
│   │   └── consumer-bad.ts   Negative cases guarded by @ts-expect-error
│   └── fixtures/
│       ├── pid_controller.st
│       ├── state_machine.st
│       └── data_processing.st
├── example/
│   ├── sample.st             Example ST program
│   ├── output.js             Generated JS (from sample.st)
│   └── app.js                Demo application
├── index.d.ts                Hand-written typings: API, STNode union, annotations
├── package.json
├── README.md
└── ARCHITECTURE.md
```
