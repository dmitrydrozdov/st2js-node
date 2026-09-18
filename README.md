# st2js

Compiles **IEC 61131-3 Structured Text (ST)** to JavaScript. Designed for bringing PLC logic into Node.js applications.

## Installation

```bash
npm install st2js
```

## Quick Start

```javascript
const { compile, parse, validate } = require('st2js');

const stSource = `
FUNCTION_BLOCK Counter
  VAR_INPUT EN: BOOL; END_VAR
  VAR Count: INT := 0; END_VAR
  IF EN THEN
    Count := Count + 1;
  END_IF
END_FUNCTION_BLOCK
`;

// Compile ST to JavaScript
const { code, errors, warnings } = compile(stSource);

if (errors.some(e => e.severity === 'error')) {
  errors.forEach(e => console.error(`[${e.phase}] line ${e.line}: ${e.message}`));
} else {
  console.log(code);
}
```

**Generated output:**
```javascript
'use strict';

class Counter {
  constructor() {
    this.Count = 0; // INT
  }

  call(EN) {
    // ST line 5
    if (EN) {
      // ST line 6
      this.Count = ((this.Count + 1) << 16) >> 16;
    }
  }
}
```

## API Reference

### `compile(source, options?)`

Compiles an ST source string to JavaScript.

**Parameters:**
- `source: string` — Structured Text source code
- `options.sourceMaps: boolean` — Include `// ST line N` comments (default: `true`)
- `options.filename: string` — Source filename for error messages (default: `'<input>'`)
- `options.strict: boolean` — Fail on warnings (default: `false`)
- `options.int64: 'number' | 'bigint'` — Representation of `LINT`, `ULINT`, and `LWORD` values (default: `'number'`; see [64-bit integers](#64-bit-integers))

**Returns:**
```typescript
{
  code: string;          // Generated JavaScript
  sourceMap: object;     // Source map (file and mappings)
  warnings: string[];    // Non-fatal warnings from codegen
  errors: STError[];     // Parse and validation errors
}
```

### `compileSync(source, options?)`

Like `compile()` but throws on errors instead of returning them.

```javascript
const { compileSync } = require('st2js');
const code = compileSync(stSource); // throws if ST has errors
```

### `parse(source)`

Tokenizes and parses ST source, returning an AST.

```javascript
const { parse } = require('st2js');
const { ast, errors } = parse(stSource);
```

### `validate(ast)`

Performs semantic validation on a parsed AST. This runs the static typing
pass, so the tree is annotated in place (see [Static typing](#static-typing)).
Type violations are reported as errors.

```javascript
const { validate } = require('st2js');
const { valid, errors } = validate(ast);
```

### Compiling IEC 61499 algorithm snippets

For hosts like the IEC 61499 runtime that need to compile a *bare statement list*
(not a full POU) against a variable interface that lives outside the ST source,
use `compileAlgorithm(source, variables, options?)`.

```javascript
const { compileAlgorithm } = require('st2js');

const result = compileAlgorithm(
  `IF Reset THEN
     Count := 0;
   ELSIF Enable THEN
     Count := Count + 1;
   END_IF;`,
  [
    { name: 'Reset',  type: 'BOOL', direction: 'input' },
    { name: 'Enable', type: 'BOOL', direction: 'input' },
    { name: 'Count',  type: 'INT',  direction: 'output' },
  ],
);

if (result.errors.some(e => e.severity === 'error')) {
  throw new Error(result.errors.map(e => e.message).join('\n'));
}

// Wrap and execute against a host scope object. All descriptor variables are
// read/written as __s["name"] on a single `__s` parameter.
const run = new Function('__s', result.code);
const scope = { Reset: false, Enable: true, Count: 0 };
run(scope); // scope.Count === 1
run(scope); // scope.Count === 2
```

`compileAlgorithm` returns an `AlgorithmCompileResult`:

```typescript
{
  code: string;            // bare JS body; "" if errors contains any severity: 'error'
  inputNames: string[];    // descriptor names partitioned by direction (in caller order)
  outputNames: string[];
  internalNames: string[];
  warnings: STError[];
  errors: STError[];
}
```

Descriptor rules:

- `direction: 'input'` variables are **read-only**. Any assignment in the ST body
  is reported as a validator error and `code` is empty.
- `direction: 'output'` and `'internal'` variables can be read and written.
- Descriptor names must be unique; duplicates are a validator error.
- `type` is a plain ST type string (`'INT'`, `'BOOL'`, `'REAL'`, `'STRING'`, ...).
  Every write to an integer-typed variable is wrapped at the declared width
  (see [Data Types](#data-types)).
- `arraySize` (optional, non-negative integer) makes the descriptor an array
  of `type` indexed from `0` to `arraySize - 1`, matching the IEC 61499
  `ArraySize` attribute. `A[i]` is then typed as the element type, and a
  constant index outside the range is a validator error. The host supplies a
  JavaScript array as the scope value.
- `stringLength` (optional, non-negative integer) records the maximum
  character count of a `STRING`/`WSTRING` descriptor on the resolved symbol.
- A negative or non-integer `arraySize` or `stringLength` is a validator error.
- The algorithm is statically typed before code generation; any type violation
  (see [Type rules](#type-rules)) is a `validator`-phase error and `code` is empty.
- `options.strict` promotes the remaining warnings (undeclared identifiers) to
  errors; `options.int64` selects the representation of 64-bit integers.

A matching `parseAlgorithm(source)` is exposed for hosts that want to do their own
validation or codegen — it returns `{ ast, errors }` and skips the validator pass.

#### Composite descriptors (`P.REQ` style)

A descriptor may declare an optional `members` array, turning it into a
*composite* descriptor. Composite descriptors let ST authors write dotted
access (`<descriptor>.<member>`) — useful for adapter ports and similar
domain shapes — while the host keeps full control over the flat key the
generated code reads and writes.

```javascript
const result = compileAlgorithm(
  `IF P.REQ THEN
     P.RESULT := X * 2;
     X := X + 1;
   END_IF;`,
  [
    { name: 'X', type: 'INT', direction: 'internal' },
    {
      name: 'P', type: 'ADAPTER', direction: 'input',
      members: [
        { name: 'REQ',    type: 'BOOL', direction: 'input'  },
        { name: 'RESULT', type: 'INT',  direction: 'output', accessKey: 'P__$$__RESULT' },
      ],
    },
  ],
);

// result.code reads __s["P.REQ"], writes __s["P__$$__RESULT"], and __s["X"].
// result.inputNames    === ['P.REQ']
// result.outputNames   === ['P__$$__RESULT']
// result.internalNames === ['X']
```

`VariableMemberDescriptor` rules:

- `name`, `type`, and `direction: 'input' | 'output'` are required.
- `arraySize` and `stringLength` are accepted with the same meaning as on a
  flat descriptor.
- `accessKey` overrides the runtime scope-object key. The default is
  `"<parentName>.<memberName>"` — note the dot is part of the literal key on
  `__s`, not a property dereference.
- Member names must be unique within a single composite descriptor.
- Writing to an `'input'` member is a validator error; only `'output'` members
  are assignable in algorithm mode.
- A bare reference to the composite parent (`X := P;`) is a validator error.
- Multi-level access (`P.A.B`) against a composite descriptor is a validator
  error — only one level of dotted access is supported.
- Composite descriptors do **not** contribute their parent `name` to
  `inputNames` / `outputNames` / `internalNames`; each member's effective
  access key is bucketed by the member's own `direction`.

The same shape applies to `compileExpression`.

### Compiling ST expressions (transition conditions)

For hosts that need to evaluate a *single* ST expression — for example IEC 61499
Basic FB transition conditions like `REQ AND count < threshold` — use
`compileExpression(source, variables, options?)`. It compiles one ST expression
to a bare JavaScript expression string that reads descriptor variables through
`__s["name"]` on a host-supplied scope object. The returned `code` is **not**
wrapped in `return`, a function, an assignment, or a statement terminator, so the
host can plug it into whatever evaluation wrapper it likes.

```javascript
const { compileExpression } = require('st2js');

const result = compileExpression(
  'REQ AND count < threshold',
  [
    { name: 'REQ',       type: 'BOOL', direction: 'input' },
    { name: 'count',     type: 'INT',  direction: 'input' },
    { name: 'threshold', type: 'INT',  direction: 'input' },
  ],
);

if (result.errors.some(e => e.severity === 'error')) {
  throw new Error(result.errors.map(e => e.message).join('\n'));
}

// result.code === '(__s["REQ"] && (__s["count"] < __s["threshold"]))'

const evalExpr = new Function('__s', 'return ' + result.code);
evalExpr({ REQ: true,  count: 2, threshold: 5 }); // true
evalExpr({ REQ: false, count: 2, threshold: 5 }); // false
```

`compileExpression` returns an `ExpressionCompileResult`:

```typescript
{
  code: string;            // bare JS expression; "" if errors contains any severity: 'error'
  inputNames: string[];    // descriptor names partitioned by direction (in caller order)
  outputNames: string[];
  internalNames: string[];
  warnings: STError[];
  errors: STError[];
}
```

The same descriptor rules as `compileAlgorithm` apply (unique names, valid
`direction`, etc.). Since expressions cannot assign, there is no "write to
input" check. Identifiers that do not resolve against the descriptor list or a
supported standard function are reported as `validator`-phase errors. The
expression parser rejects trailing tokens and JavaScript-only syntax such as
`===`, so `compileExpression('count === threshold', ...)` is a parser error.

A matching `parseExpression(source)` returns `{ ast, errors }` for hosts that
want to inspect or transform the expression AST without running the validator
or codegen.

`compileExpression` accepts the same composite descriptor shape documented
above for `compileAlgorithm`. For example,
`compileExpression('P.REQ AND count < threshold', [...])` with a composite
`P` descriptor emits `(__s["P.REQ"] && (__s["count"] < __s["threshold"]))`.

### Static typing

Every compile entry point runs one static typing pass before code
generation. Hosts that need the resolved types themselves (for example a
device compiler emitting precompiled code from the AST) call it directly:

- `analyzeAlgorithm(sourceOrAst, variables, options?)`
- `analyzeExpression(sourceOrAst, variables, options?)`

Both accept either source text or a tree returned by `parseAlgorithm` /
`parseExpression`, and return `{ ast, errors, warnings }` where `ast` is the
parsed tree **annotated in place** (or `null` when parsing failed).
`options.strict` has the same meaning as for `compileAlgorithm`; type
violations are errors regardless of options.

```javascript
const { analyzeAlgorithm } = require('st2js');

const { ast, errors } = analyzeAlgorithm('OUT := IN + DINT#1;', [
  { name: 'IN',  type: 'INT',  direction: 'input' },
  { name: 'OUT', type: 'DINT', direction: 'output' },
]);

const value = ast.statements[0].value;   // the BinaryExpr `IN + DINT#1`
value.resolvedType;                       // 'DINT'
value.left.resolvedSymbol;                // { kind: 'descriptor', name: 'IN', type: 'INT', direction: 'input', ... }
value.left.conversion;                    // { from: 'INT', to: 'DINT', implicit: true }
value.right.constant;                     // { type: 'DINT', value: 1n }
```

The annotations written onto expression nodes are:

| Annotation | Set on | Value |
|---|---|---|
| `resolvedType` | every expression node | an elementary type name (`'DINT'`, `'BOOL'`, ...), a user type name, an array descriptor `{ kind: 'array', element, size, lo }`, or `null` when the expression could not be resolved |
| `resolvedSymbol` | identifiers and member accesses | the descriptor, composite member (with its `accessKey`), or POU variable the name resolved to |
| `constant` | literals, typed literals, negated literals | `{ type, value }`; integer values are exact `bigint`s, reals and `TIME` (milliseconds) are numbers |
| `conversion` | operands and assigned values adapted by an implicit widening | `{ from, to, implicit: true }` |

Untyped literals take the type their context requires (`x := 7;` with `x: UINT`
types the literal `UINT`; `count < 5` types `5` as `count`'s type) and default
to `DINT` (integers) or `REAL` (reals) otherwise. Typed literals keep their
declared type.

#### Type rules

The pass applies the IEC 61131-3 implicit-conversion rules. Only conversions
that cannot lose information are implicit, and they are recorded as
`conversion` annotations:

- a narrower integer to a wider integer of the same signedness (`INT` → `DINT`);
- an unsigned integer to a strictly wider signed integer (`USINT` → `INT`);
- a bit string to a wider bit string, `BOOL` to any bit string, and a bit
  string to an unsigned integer of the same or wider width (`WORD` → `UINT`);
- `REAL` → `LREAL`, and an integer to a real type that represents every value
  of it (`INT` → `REAL`, `DINT` → `LREAL`);
- `STRING` → `WSTRING`.

Everything else is a `validator`-phase **error**, `code` is empty, and no
option downgrades it:

- assignment of a wider or real value to a narrower or integer target
  (`OUT := R;` with `R: LREAL`, `OUT: DINT` — use `LREAL_TO_DINT(R)`);
- arithmetic or comparison mixing signed and unsigned integers;
- comparison of incompatible types (`flag < 3` with `flag: BOOL`);
- `MOD` on non-integers; `AND`/`OR`/`XOR`/`NOT` on operands that are neither
  `BOOL` nor bit strings;
- non-`BOOL` conditions in `IF`, `ELSIF`, `WHILE`, and `REPEAT ... UNTIL`;
- non-integer array indices, and constant indices outside `0..arraySize-1`;
- literals outside the range of their type (`SINT#200`, `u := -1` with `u: UINT`);
- calls to unknown standard functions, calls with the wrong number of
  arguments, and arguments that do not satisfy a function's parameter classes.

Undeclared identifiers keep their previous severity (a warning in algorithm
mode, an error in expression mode), and an expression containing an
unresolved name is typed as `null` without further diagnostics, so one missing
name never cascades.

#### Typed literals

`<TYPE>#<value>` is accepted for every elementary type keyword: `BOOL`, the
integer types, the bit-string types, `REAL`/`LREAL`, `TIME`, `DATE`,
`TIME_OF_DAY`/`TOD`, `DATE_AND_TIME`/`DT`, `STRING`, and `WSTRING`. The value
follows the ordinary literal rules for the type: an optional sign and base
prefix for integers (`DINT#-5`, `WORD#16#FF`, `BYTE#2#1010`), decimal and
exponent for reals (`LREAL#1.5e3`), `TRUE`/`FALSE` (`BOOL#TRUE`), a quoted
string (`STRING#'a'`), and temporal text (`TIME#1s`, `DT#2024-01-01-00:00:00`).
The parser produces a `TypedLiteral` node whose `value` is the fully parsed
inner literal, and the generated code contains the value (`DINT#1` → `1`,
`WORD#16#FF` → `255`, `BOOL#TRUE` → `true`). Every integer literal, typed or
not, carries an exact `bigValue` (`bigint`) next to `value` (`number`), so
`9007199254740993` is preserved exactly.

#### 64-bit integers

`LINT`, `ULINT`, and `LWORD` values are never truncated to 32 bits. Their
JavaScript representation follows the `int64` option of `compile`,
`compileAlgorithm`, and `compileExpression`:

- `'number'` (default): JavaScript numbers, truncated toward zero with
  `Math.trunc` and no width wrap. Values are exact up to ±2^53; larger
  literals round to the nearest double, and bitwise operators on `LWORD`
  act on the low 32 bits only.
- `'bigint'`: `bigint` values wrapped at 64 bits with `BigInt.asIntN` /
  `BigInt.asUintN`, 64-bit literals emitted as `123n`, and narrower operands
  cast with `BigInt(...)` where they meet a 64-bit value. The host must supply
  `bigint` scope values for variables of those types (and 64-bit-aware
  implementations of any standard functions applied to them).

```javascript
compileAlgorithm('L := L + 1;', [{ name: 'L', type: 'LINT', direction: 'internal' }]).code;
// '__s["L"] = Math.trunc(__s["L"] + 1);\n'

compileAlgorithm('L := L + 1;', [{ name: 'L', type: 'LINT', direction: 'internal' }], { int64: 'bigint' }).code;
// '__s["L"] = BigInt.asIntN(64, __s["L"] + 1n);\n'
```

### Error Object

All error-producing functions return `STError` objects:

```typescript
{
  phase: 'lexer' | 'parser' | 'validator' | 'codegen';
  severity: 'error' | 'warning';
  message: string;
  line: number;   // 1-based
  column: number; // 0-based
  code?: string;  // Optional error code
}
```

## Supported ST Constructs

### Program Organization Units (POUs)

| ST Construct | JavaScript Output |
|---|---|
| `FUNCTION_BLOCK Foo` | `class Foo { constructor() {...} call(...) {...} }` |
| `FUNCTION Bar: INT` | `function Bar(...) { let _result = 0; ...; return _result; }` |
| `PROGRAM Main` | Module with `run()` function and exported variables |

### Variable Declarations

| ST | Description |
|---|---|
| `VAR` | Local variables (class members in FB, locals in FUNCTION) |
| `VAR_INPUT` | Input parameters (passed to `call()` or function) |
| `VAR_OUTPUT` | Output variables (class members in FB) |
| `VAR_IN_OUT` | In-out parameters |
| `VAR_GLOBAL` | Global variable declarations |
| `CONSTANT` | Constant modifier |
| `RETAIN` | Retain modifier (noted in comments) |

### Data Types

Every value written to an integer-typed variable, loop variable, or function
result is wrapped at the declared width, so arithmetic follows IEC 61131-3
integer semantics (`127 + 1` stored in a `SINT` is `-128`). Division of two
integer operands truncates toward zero (`Math.trunc(a / b)`).

| ST Type | JavaScript | Width | Generated wrap |
|---|---|---|---|
| `BOOL` | `boolean` | — | — |
| `SINT` | `number` | 8-bit signed | `((x) << 24) >> 24` |
| `USINT`, `BYTE` | `number` | 8-bit unsigned | `(x) & 0xFF` |
| `INT` | `number` | 16-bit signed | `((x) << 16) >> 16` |
| `UINT`, `WORD` | `number` | 16-bit unsigned | `(x) & 0xFFFF` |
| `DINT` | `number` | 32-bit signed | `(x) \| 0` |
| `UDINT`, `DWORD` | `number` | 32-bit unsigned | `(x) >>> 0` |
| `LINT`, `ULINT`, `LWORD` | `number` or `bigint` | 64-bit | `Math.trunc(x)` (`int64: 'number'`), `BigInt.asIntN(64, x)` / `BigInt.asUintN(64, x)` (`int64: 'bigint'`) |
| `REAL`, `LREAL` | `number` | IEEE 754 double | — |
| `STRING`, `WSTRING` | `string` | — | — |
| `TIME` | `number` | milliseconds | — |
| `DATE`, `TIME_OF_DAY`, `DATE_AND_TIME` | `number` | placeholder `0` | — |
| `ARRAY[lo..hi] OF T` | `Array` | — | element writes wrap as `T` |
| `STRUCT ... END_STRUCT` | `class` | — | JS class with constructor |
| User-defined types | `class` | — | `new TypeName()` |

`AND`, `OR`, `XOR`, and `NOT` are boolean on `BOOL` operands and bitwise
(`&`, `|`, `^`, `~` masked to the width) on bit-string operands.

### Literals

| ST | Examples |
|---|---|
| Integer (decimal, `2#`, `8#`, `16#`) | `42`, `2#1010`, `8#77`, `16#FF` |
| Real | `3.14`, `1.5e-3` |
| Boolean | `TRUE`, `FALSE` |
| String | `'hello'`, `"wide"`, `'line$nbreak'` |
| Time | `T#1h30m`, `TIME#500ms` |
| Date and time of day | `D#2024-01-01`, `DATE#2024-01-01`, `TOD#12:30:00`, `DT#2024-01-01-12:30:00` |
| Typed | `DINT#1`, `INT#-5`, `WORD#16#FF`, `REAL#2.5`, `BOOL#TRUE`, `STRING#'a'` |

### Control Flow

```st
(* IF/ELSIF/ELSE *)
IF x > 0 THEN
  y := 1;
ELSIF x < 0 THEN
  y := -1;
ELSE
  y := 0;
END_IF

(* CASE *)
CASE state OF
  0: output := 10;
  1, 2: output := 20;
  3..5: output := 30;
  ELSE output := 0;
END_CASE

(* FOR loop *)
FOR i := 0 TO 9 BY 1 DO
  sum := sum + arr[i];
END_FOR

(* WHILE loop *)
WHILE x > 0 DO
  x := x - 1;
END_WHILE

(* REPEAT/UNTIL *)
REPEAT
  x := x + 1;
UNTIL x >= 10
END_REPEAT
```

### Standard Function Blocks

The following standard function blocks are available in the runtime:

| FB | Description |
|---|---|
| `TON` | Timer On-Delay |
| `TOF` | Timer Off-Delay |
| `TP` | Timer Pulse |
| `RS` | Reset-dominant SR latch |
| `SR` | Set-dominant SR latch |
| `CTU` | Counter Up |
| `CTD` | Counter Down |
| `CTUD` | Counter Up/Down |

Usage in compiled code:
```javascript
// In compiled output
const { TON, TOF, TP } = require('st2js/src/runtime/TimerBlocks');
```

### Standard Library Functions

Math: `ABS` (`ANY_NUM`), `SQRT`, `LN`, `LOG`, `EXP`, `SIN`, `COS`, `TAN`, `ASIN`, `ACOS`, `ATAN`, `ATAN2`, `EXPT` (`ANY_REAL`), `TRUNC`
Numeric: `MAX`, `MIN`, `LIMIT`, `SEL`, `MUX`
String: `LEN`, `LEFT`, `RIGHT`, `MID`, `CONCAT`, `INSERT`, `DELETE`, `REPLACE`, `FIND`
Bit: `SHL`, `SHR`, `ROL`, `ROR` (`ANY_BIT`)
Type conversions: `<FROM>_TO_<TO>` for every pair of elementary types (`INT_TO_REAL`, `REAL_TO_DINT`, `LREAL_TO_DINT`, `TIME_TO_DINT`, ...)

Calls are checked against each function's signature (argument count and
parameter classes) and typed by its result rule, e.g. `ABS(v)` has `v`'s type,
`LEN(s)` is `INT`, and `MAX(i, d)` has the common type of its arguments.
Generated code calls the functions by name; `src/runtime/StandardFunctions.js`
ships implementations for a subset of the conversions, and hosts supply the
rest.

## Using Compiled Output

When a PROGRAM is compiled, it exports a `run()` function and getters for all variables:

```javascript
// compiled.js
'use strict';
const { TON } = require('st2js/src/runtime/TimerBlocks');

let Counter = new MyCounter();
let Cycles = 0;

function run() { ... }
module.exports = { run, get Counter() { return Counter; }, get Cycles() { return Cycles; } };
```

```javascript
// your app
const compiled = require('./compiled');
compiled.run(); // execute one PLC scan cycle
console.log(compiled.Cycles);
```

## Building the Parser

The module uses a built-in hand-written parser that requires no additional dependencies.

If you want to regenerate the ANTLR4 grammar (requires Java 11+):
```bash
npm run generate-parser
```

## Running Tests

```bash
npm test          # Run all tests with coverage
npm test:unit     # Run unit tests only
npm test:integration  # Run integration tests only
```

## Known Limitations

- **64-bit integers** in the default `int64: 'number'` mode are exact only up to ±2^53, and bitwise operators on `LWORD` act on the low 32 bits; use `int64: 'bigint'` for full 64-bit semantics
- **Intermediate results** are wrapped only when stored (assignment, loop variable, function result), not after every operation
- **REAL division** does not enforce PLC-style saturation semantics
- **TIME arithmetic** uses JavaScript `Date.now()` for timers; accuracy depends on JS event loop
- **STRING** functions operate on JS UTF-16 strings, not null-terminated fixed-length arrays
- **Pointers** and `%I`, `%Q`, `%M` physical address prefixes are not supported
- **SFC** (Sequential Function Chart) and **LD** (Ladder Diagram) are not supported
- **Tasks** and **PLC program scheduling** are not modeled
- ANTLR4 parser generation requires Java 11+ (the built-in parser is used by default)

## License

MIT
