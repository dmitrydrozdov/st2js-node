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
    │ AST (typed, normalized)
    ▼
┌───────────┐
│ Validator │  src/parser/Validator.js
└───────────┘
    │ AST + errors/warnings
    ▼
┌────────┐
│ Codegen│  src/codegen/Codegen.js
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
- Literal parsing: integers (decimal, `16#hex`, `8#octal`, `2#binary`), reals, booleans, strings, time (`T#1s500ms`), dates
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

**Error recovery:** The parser records errors and uses `synchronize()` to skip to the next safe token, allowing multiple errors to be reported in a single parse.

### 3. ASTBuilder (`src/parser/ASTBuilder.js`)

Normalizes the raw CST from the Parser into a clean, fully-typed AST using `NodeType` constants from `src/types.js`.

**Transformations:**
- Maps parser's string-based `type` fields to `NodeType.*` constants
- Maps `kind` token types to `VarKind.*` strings (`VAR_INPUT` → `'VAR_INPUT'`)
- Ensures consistent field names across all node types
- Recursively visits all nodes via `visitNode()` dispatch table

### 4. Validator (`src/parser/Validator.js`)

Performs semantic analysis over the AST using a symbol table (scope stack).

**Checks:**
- Variable declaration: duplicate names in same scope
- Variable usage: warns on undeclared identifiers
- Type compatibility: warns on mismatched assignment types
- Control flow: `EXIT`/`CONTINUE` only inside loops
- Standard functions/FBs: suppresses warnings for known ST library names

**Scope model:** Nested `Scope` objects with `parent` links; `lookup()` walks up the chain.

### 5. Codegen (`src/codegen/Codegen.js`)

Walks the typed AST and emits indented JavaScript source code.

**Code generation strategy:**

| ST Construct | JavaScript Output |
|---|---|
| `FUNCTION_BLOCK Foo` | `class Foo { constructor() {...} call(...) {...} }` |
| `FUNCTION Bar: INT` | `function Bar(inputs) { let _result = 0; ...; return _result; }` |
| `PROGRAM Baz` | Module-level vars + `function run()` + `module.exports` |
| Instance var access | `this.VarName` (inside class) |
| Integer arithmetic | `(expr) \| 0` (bitwise truncation to 32-bit int) |
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
- `getDefaultValue(stType)` — Returns JS literal for ST type's zero value
- `needsIntegerClamp(stType)` — Returns true for integer types needing `| 0`
- `isReal(stType)`, `isInteger(stType)`, etc. — Type category predicates

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

### Integer Clamping

ST integers are 32-bit (for `INT`/`DINT`). JS numbers are 64-bit floats. Arithmetic results are clamped using `| 0` (bitwise OR with 0 forces 32-bit integer truncation) at every assignment to an integer-typed variable.

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
- **Validator** exposes `validateAlgorithm(ast, variables)`: it builds a fresh
  root scope, seeds it from a caller-supplied `VariableDescriptor[]` (name,
  type, direction), and then delegates to the existing statement-level walker.
  Writes to `direction: 'input'` symbols are surfaced as validator errors.
  Standard-function resolution already uses module-level allow-lists, so it
  works without any POU scope.
- **Codegen** exposes `generateAlgorithm(ast, variables, options)`: it walks
  the statement list using the existing `_genNode`/`_genExpr` helpers and
  overrides `_varRef()` so that descriptor names resolve to `__s["name"]`
  reads and writes. Integer clamping is preserved because descriptor types are
  registered in `_varTypes` before emission. No class, function, or `'use
  strict';` wrapper is emitted — the output is a bare body that hosts wrap
  themselves via `new Function('__s', code)`.
- **Public API** exports `parseAlgorithm(source)` and
  `compileAlgorithm(source, variables, options?)` from `src/index.js` /
  `src/index.mjs`. `compileAlgorithm` returns `{ code, inputNames, outputNames,
  internalNames, warnings, errors }`; `code` is empty whenever `errors`
  contains any `severity: 'error'` entry.

The generated algorithm body intentionally omits `'use strict';`: a JS
fragment cannot legally include a strict directive mid-function, and the
host's `new Function('__s', ...)` shim already runs in strict-by-default
context inside an ES module. Hosts embedding the fragment should not be
surprised by its absence.

## Extension Points

- **New ST constructs:** Add token types to `src/types.js`, parsing rules to `Parser.js`, normalization to `ASTBuilder.js`, validation to `Validator.js`, and code generation to `Codegen.js`
- **New runtime FBs:** Add classes to `src/runtime/TimerBlocks.js`
- **New standard functions:** Add to `src/runtime/StandardFunctions.js`
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
│   │   └── Validator.js      Semantic checker
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
│   │   ├── parser/Parser.test.js
│   │   ├── validator/Validator.test.js
│   │   ├── codegen/Codegen.test.js
│   │   ├── codegen/TypeMapper.test.js
│   │   ├── runtime/TimerBlocks.test.js
│   │   ├── runtime/StandardFunctions.test.js
│   │   └── api.test.js
│   ├── integration/
│   │   ├── compile.test.js
│   │   └── realworld.test.js
│   └── fixtures/
│       ├── pid_controller.st
│       ├── state_machine.st
│       └── data_processing.st
├── example/
│   ├── sample.st             Example ST program
│   ├── output.js             Generated JS (from sample.st)
│   └── app.js                Demo application
├── package.json
├── README.md
└── ARCHITECTURE.md
```
