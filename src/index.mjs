// ESM wrapper for CommonJS module
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { parse, validate, compile, compileSync } = require('./index.js');
export { parse, validate, compile, compileSync };
export default { parse, validate, compile, compileSync };
