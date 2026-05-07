// ESM wrapper for CommonJS module
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  parse, validate, compile, compileSync,
  parseAlgorithm, compileAlgorithm,
  parseExpression, compileExpression,
} = require('./index.js');
export {
  parse, validate, compile, compileSync,
  parseAlgorithm, compileAlgorithm,
  parseExpression, compileExpression,
};
export default {
  parse, validate, compile, compileSync,
  parseAlgorithm, compileAlgorithm,
  parseExpression, compileExpression,
};
