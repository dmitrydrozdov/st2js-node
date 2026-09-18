// Negative type-check test: strict TypeScript must reject each of the
// constructs below. Invoke from the run script as:
//   tsc -p tests/typecheck/tsconfig.bad.json
// Each `@ts-expect-error` line fails the build if the error does NOT occur.

import { compileAlgorithm, analyzeAlgorithm, STNode, IntegerLiteral, VariableDescriptor } from '../../index';

const badVars: VariableDescriptor[] = [
  // @ts-expect-error 'inout' is not a valid direction literal
  { name: 'X', type: 'INT', direction: 'inout' },
];

void compileAlgorithm('X := 1;', badVars);

// @ts-expect-error 'int' is not a valid int64 mode
void compileAlgorithm('X := 1;', [], { int64: 'int' });

// @ts-expect-error arraySize must be a number
void compileAlgorithm('X := 1;', [{ name: 'X', type: 'INT', direction: 'input', arraySize: '4' }]);

const analysis = analyzeAlgorithm('X := 1;', [{ name: 'X', type: 'INT', direction: 'output' }]);

function inspect(node: STNode): void {
  // @ts-expect-error a misspelled node kind is not a member of STNode['type']
  if (node.type === 'IntegerLitteral') {
    return;
  }
  if (node.type === 'IntegerLiteral') {
    const lit: IntegerLiteral = node;
    // @ts-expect-error a missing annotation property is an error
    void lit.resolvedTyp;
    // @ts-expect-error bigValue is a bigint, not a number
    const asNumber: number = lit.bigValue;
    void asNumber;
  }
  if (node.type === 'Assignment') {
    // @ts-expect-error statements carry no resolvedType annotation
    void node.resolvedType;
  }
}

if (analysis.ast) inspect(analysis.ast);
