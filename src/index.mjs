// ESM wrapper for CommonJS module
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  parse, validate, compile, compileSync,
  parseAlgorithm, compileAlgorithm, analyzeAlgorithm,
  parseExpression, compileExpression, analyzeExpression,
} = require('./index.js');
export {
  parse, validate, compile, compileSync,
  parseAlgorithm, compileAlgorithm, analyzeAlgorithm,
  parseExpression, compileExpression, analyzeExpression,
};
export default {
  parse, validate, compile, compileSync,
  parseAlgorithm, compileAlgorithm, analyzeAlgorithm,
  parseExpression, compileExpression, analyzeExpression,
};
