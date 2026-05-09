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
      this.Count = (this.Count + 1) | 0;
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

Performs semantic validation on a parsed AST.

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
  Integer types receive the same `| 0` 32-bit truncation as POU-mode codegen.

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

| ST Type | JavaScript | Notes |
|---|---|---|
| `BOOL` | `boolean` | `true`/`false` |
| `SINT`, `INT`, `DINT`, `LINT` | `number` | Integer with `\| 0` clamping |
| `USINT`, `UINT`, `UDINT`, `ULINT` | `number` | Unsigned integer |
| `REAL`, `LREAL` | `number` | IEEE 754 double |
| `STRING`, `WSTRING` | `string` | JS string |
| `TIME` | `number` | Milliseconds |
| `ARRAY[lo..hi] OF T` | `Array` | JS Array |
| `STRUCT ... END_STRUCT` | `class` | JS class with constructor |
| User-defined types | `class` | `new TypeName()` |

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

Math: `ABS`, `SQRT`, `LN`, `LOG`, `EXP`, `SIN`, `COS`, `TAN`, `ASIN`, `ACOS`, `ATAN`, `ATAN2`
Numeric: `MAX`, `MIN`, `LIMIT`, `SEL`, `MUX`
String: `LEN`, `LEFT`, `RIGHT`, `MID`, `CONCAT`, `INSERT`, `DELETE`, `REPLACE`, `FIND`
Bit: `SHL`, `SHR`, `ROL`, `ROR`
Type conversions: `INT_TO_REAL`, `REAL_TO_INT`, `BOOL_TO_INT`, etc.

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

- **REAL division** does not enforce PLC-style saturation semantics
- **TIME arithmetic** uses JavaScript `Date.now()` for timers; accuracy depends on JS event loop
- **STRING** functions operate on JS UTF-16 strings, not null-terminated fixed-length arrays
- **Pointers** and `%I`, `%Q`, `%M` physical address prefixes are not supported
- **SFC** (Sequential Function Chart) and **LD** (Ladder Diagram) are not supported
- **Tasks** and **PLC program scheduling** are not modeled
- ANTLR4 parser generation requires Java 11+ (the built-in parser is used by default)

## License

MIT
