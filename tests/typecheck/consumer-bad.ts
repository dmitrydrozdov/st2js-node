// Negative type-check test: strict TypeScript must reject a malformed
// `direction` value. Invoke from the run script as:
//   tsc -p tests/typecheck/tsconfig.bad.json
// and expect at least one diagnostic.

import { compileAlgorithm, VariableDescriptor } from '../../index';

const badVars: VariableDescriptor[] = [
  // @ts-expect-error 'inout' is not a valid direction literal
  { name: 'X', type: 'INT', direction: 'inout' },
];

void compileAlgorithm('X := 1;', badVars);
