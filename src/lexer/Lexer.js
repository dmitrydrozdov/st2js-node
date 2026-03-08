'use strict';

const { TokenType, makeError } = require('../types');

// ─── Keyword Map (uppercase → TokenType) ─────────────────────────────────────
// Order matters: longer compound keywords must be checked before shorter ones.
// The lexer matches identifiers first, then looks up in this map.

const KEYWORDS = new Map([
  // Compound keywords (with underscores)
  ['END_FUNCTION_BLOCK', TokenType.END_FUNCTION_BLOCK],
  ['FUNCTION_BLOCK', TokenType.FUNCTION_BLOCK],
  ['END_FUNCTION', TokenType.END_FUNCTION],
  ['END_PROGRAM', TokenType.END_PROGRAM],
  ['VAR_INPUT', TokenType.VAR_INPUT],
  ['VAR_OUTPUT', TokenType.VAR_OUTPUT],
  ['VAR_IN_OUT', TokenType.VAR_IN_OUT],
  ['VAR_GLOBAL', TokenType.VAR_GLOBAL],
  ['VAR_TEMP', TokenType.VAR_TEMP],
  ['VAR_EXTERNAL', TokenType.VAR_EXTERNAL],
  ['END_VAR', TokenType.END_VAR],
  ['END_TYPE', TokenType.END_TYPE],
  ['END_STRUCT', TokenType.END_STRUCT],
  ['END_IF', TokenType.END_IF],
  ['END_CASE', TokenType.END_CASE],
  ['END_FOR', TokenType.END_FOR],
  ['END_WHILE', TokenType.END_WHILE],
  ['END_REPEAT', TokenType.END_REPEAT],
  ['TIME_OF_DAY', TokenType.TIME_OF_DAY],
  ['DATE_AND_TIME', TokenType.DATE_AND_TIME],
  ['ANY_NUM', TokenType.ANY_NUM],
  ['ANY_INT', TokenType.ANY_INT],
  ['ANY_REAL', TokenType.ANY_REAL],
  ['ANY_BIT', TokenType.ANY_BIT],
  ['ANY_STRING', TokenType.ANY_STRING],
  ['ANY_DATE', TokenType.ANY_DATE],

  // Simple keywords
  ['FUNCTION', TokenType.FUNCTION],
  ['PROGRAM', TokenType.PROGRAM],
  ['VAR', TokenType.VAR],
  ['CONSTANT', TokenType.CONSTANT],
  ['RETAIN', TokenType.RETAIN],
  ['PERSISTENT', TokenType.PERSISTENT],
  ['AT', TokenType.AT],
  ['TYPE', TokenType.TYPE],
  ['STRUCT', TokenType.STRUCT],
  ['ARRAY', TokenType.ARRAY],
  ['OF', TokenType.OF],
  ['STRING', TokenType.STRING_TYPE],
  ['WSTRING', TokenType.WSTRING_TYPE],

  // Primitive types
  ['BOOL', TokenType.BOOL],
  ['BYTE', TokenType.BYTE],
  ['WORD', TokenType.WORD],
  ['DWORD', TokenType.DWORD],
  ['LWORD', TokenType.LWORD],
  ['SINT', TokenType.SINT],
  ['INT', TokenType.INT],
  ['DINT', TokenType.DINT],
  ['LINT', TokenType.LINT],
  ['USINT', TokenType.USINT],
  ['UINT', TokenType.UINT],
  ['UDINT', TokenType.UDINT],
  ['ULINT', TokenType.ULINT],
  ['REAL', TokenType.REAL],
  ['LREAL', TokenType.LREAL],
  ['TIME', TokenType.TIME],
  ['DATE', TokenType.DATE],
  ['TOD', TokenType.TIME_OF_DAY],
  ['DT', TokenType.DATE_AND_TIME],
  ['ANY', TokenType.ANY],

  // Control flow
  ['IF', TokenType.IF],
  ['THEN', TokenType.THEN],
  ['ELSIF', TokenType.ELSIF],
  ['ELSE', TokenType.ELSE],
  ['CASE', TokenType.CASE],
  ['FOR', TokenType.FOR],
  ['TO', TokenType.TO],
  ['BY', TokenType.BY],
  ['DO', TokenType.DO],
  ['WHILE', TokenType.WHILE],
  ['REPEAT', TokenType.REPEAT],
  ['UNTIL', TokenType.UNTIL],
  ['RETURN', TokenType.RETURN],
  ['EXIT', TokenType.EXIT],
  ['CONTINUE', TokenType.CONTINUE],

  // Keyword operators
  ['MOD', TokenType.MOD],
  ['AND', TokenType.AND],
  ['OR', TokenType.OR],
  ['XOR', TokenType.XOR],
  ['NOT', TokenType.NOT],

  // Boolean literals
  ['TRUE', TokenType.BOOL_LITERAL],
  ['FALSE', TokenType.BOOL_LITERAL],
]);

// Characters that are valid identifier starts
function isIdStart(ch) {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

// Characters that are valid inside identifiers
function isIdPart(ch) {
  return isIdStart(ch) || (ch >= '0' && ch <= '9');
}

function isDigit(ch) {
  return ch >= '0' && ch <= '9';
}

function isHexDigit(ch) {
  return isDigit(ch) || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
}

function isWhitespace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n';
}

// ─── Lexer ───────────────────────────────────────────────────────────────────

class Lexer {
  constructor(source) {
    this.source = source;
    this.pos = 0;
    this.line = 1;
    this.column = 0;
    this.errors = [];
  }

  tokenize() {
    const tokens = [];
    while (this.pos < this.source.length) {
      this.skipWhitespaceAndComments();
      if (this.pos >= this.source.length) break;

      const token = this.nextToken();
      if (token) {
        tokens.push(token);
      }
    }
    tokens.push(this.makeToken(TokenType.EOF, '', this.pos, this.pos));
    return tokens;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  peek(offset = 0) {
    return this.source[this.pos + offset];
  }

  advance() {
    const ch = this.source[this.pos];
    this.pos++;
    if (ch === '\n') {
      this.line++;
      this.column = 0;
    } else {
      this.column++;
    }
    return ch;
  }

  makeToken(type, value, start, end) {
    // Compute line/column at the start position
    let line = 1;
    let col = 0;
    for (let i = 0; i < start; i++) {
      if (this.source[i] === '\n') {
        line++;
        col = 0;
      } else {
        col++;
      }
    }
    return { type, value, line, column: col, start, end };
  }

  addError(message, line, column) {
    this.errors.push(makeError('lexer', message, line, column));
  }

  // ─── Whitespace / Comments ──────────────────────────────────────────────────

  skipWhitespaceAndComments() {
    while (this.pos < this.source.length) {
      const ch = this.peek();

      // Whitespace
      if (isWhitespace(ch)) {
        this.advance();
        continue;
      }

      // Line comment: //
      if (ch === '/' && this.peek(1) === '/') {
        this.advance(); // /
        this.advance(); // /
        while (this.pos < this.source.length && this.peek() !== '\n') {
          this.advance();
        }
        continue;
      }

      // Block comment: (* ... *)
      if (ch === '(' && this.peek(1) === '*') {
        const startLine = this.line;
        const startCol = this.column;
        this.advance(); // (
        this.advance(); // *
        let depth = 1;
        while (this.pos < this.source.length && depth > 0) {
          if (this.peek() === '(' && this.peek(1) === '*') {
            depth++;
            this.advance();
            this.advance();
          } else if (this.peek() === '*' && this.peek(1) === ')') {
            depth--;
            this.advance();
            this.advance();
          } else {
            this.advance();
          }
        }
        if (depth > 0) {
          this.addError('Unterminated block comment', startLine, startCol);
        }
        continue;
      }

      break;
    }
  }

  // ─── Main Dispatch ─────────────────────────────────────────────────────────

  nextToken() {
    const ch = this.peek();
    const start = this.pos;

    // Identifier or keyword (also handles compound keywords with underscores)
    if (isIdStart(ch)) {
      return this.readIdentifierOrKeyword();
    }

    // Number literal (or base prefix like 16#FF)
    if (isDigit(ch)) {
      return this.readNumber();
    }

    // String literal
    if (ch === '\'' || ch === '"') {
      return this.readString();
    }

    // Operators and punctuation
    return this.readOperator();
  }

  // ─── Identifier / Keyword ──────────────────────────────────────────────────

  readIdentifierOrKeyword() {
    const start = this.pos;
    // Read the base identifier part
    while (this.pos < this.source.length && isIdPart(this.peek())) {
      this.advance();
    }

    // Check for compound keywords: if current word could be a prefix, try consuming _NEXT
    let raw = this.source.slice(start, this.pos);
    let upper = raw.toUpperCase();

    // Try to extend with underscore-separated parts for compound keywords
    // e.g., END_FUNCTION_BLOCK, VAR_IN_OUT, DATE_AND_TIME, etc.
    while (this.pos < this.source.length && this.peek() === '_') {
      const savedPos = this.pos;
      const savedLine = this.line;
      const savedCol = this.column;

      this.advance(); // consume _
      const partStart = this.pos;

      if (this.pos < this.source.length && isIdStart(this.peek())) {
        while (this.pos < this.source.length && isIdPart(this.peek())) {
          this.advance();
        }
        const candidate = this.source.slice(start, this.pos).toUpperCase();
        // Check if this extended form is a known keyword
        if (KEYWORDS.has(candidate)) {
          raw = this.source.slice(start, this.pos);
          upper = candidate;
          continue; // try extending further (e.g., END_FUNCTION -> END_FUNCTION_BLOCK)
        }
      }

      // Not a valid compound keyword extension; roll back
      this.pos = savedPos;
      this.line = savedLine;
      this.column = savedCol;
      break;
    }

    // Check for time/date literal prefix: T#, TIME#, D#, DATE#
    if (this.pos < this.source.length && this.peek() === '#') {
      if (upper === 'T' || upper === 'TIME') {
        return this.readTimeLiteral(start);
      }
      if (upper === 'D' || upper === 'DATE') {
        return this.readDateLiteral(start);
      }
      // Typed literal: INT#42, REAL#3.14, etc.
      if (KEYWORDS.has(upper) && this.isTypeName(upper)) {
        return this.readTypedLiteral(start, upper);
      }
    }

    // Keyword lookup
    const kwType = KEYWORDS.get(upper);
    if (kwType) {
      return this.makeToken(kwType, raw, start, this.pos);
    }

    return this.makeToken(TokenType.IDENTIFIER, raw, start, this.pos);
  }

  isTypeName(upper) {
    switch (upper) {
      case 'BOOL': case 'BYTE': case 'WORD': case 'DWORD': case 'LWORD':
      case 'SINT': case 'INT': case 'DINT': case 'LINT':
      case 'USINT': case 'UINT': case 'UDINT': case 'ULINT':
      case 'REAL': case 'LREAL':
        return true;
      default:
        return false;
    }
  }

  // ─── Time Literal ──────────────────────────────────────────────────────────

  readTimeLiteral(start) {
    this.advance(); // consume #
    // Read the time value: digits, '.', letters (h, m, s, ms, us, ns, d)
    while (this.pos < this.source.length) {
      const ch = this.peek();
      if (isDigit(ch) || ch === '.' || ch === '_' ||
          (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) {
        this.advance();
      } else {
        break;
      }
    }
    const raw = this.source.slice(start, this.pos);
    return this.makeToken(TokenType.TIME_LITERAL, raw, start, this.pos);
  }

  // ─── Date Literal ──────────────────────────────────────────────────────────

  readDateLiteral(start) {
    this.advance(); // consume #
    // Read the date value: digits and hyphens (YYYY-MM-DD)
    while (this.pos < this.source.length) {
      const ch = this.peek();
      if (isDigit(ch) || ch === '-') {
        this.advance();
      } else {
        break;
      }
    }
    const raw = this.source.slice(start, this.pos);
    return this.makeToken(TokenType.DATE_LITERAL, raw, start, this.pos);
  }

  // ─── Typed Literal ────────────────────────────────────────────────────────

  readTypedLiteral(start, typeName) {
    this.advance(); // consume #
    // Read the literal value after the hash - could be a number, bool, or sign + number
    const valStart = this.pos;
    const ch = this.peek();

    if (ch === '+' || ch === '-') {
      this.advance();
    }

    if (this.pos < this.source.length && isDigit(this.peek())) {
      while (this.pos < this.source.length && isDigit(this.peek())) {
        this.advance();
      }
      // Check for real part
      if (this.pos < this.source.length && this.peek() === '.' && this.pos + 1 < this.source.length && isDigit(this.peek(1))) {
        this.advance(); // .
        while (this.pos < this.source.length && isDigit(this.peek())) {
          this.advance();
        }
      }
      // Check for exponent
      if (this.pos < this.source.length && (this.peek() === 'e' || this.peek() === 'E')) {
        this.advance();
        if (this.pos < this.source.length && (this.peek() === '+' || this.peek() === '-')) {
          this.advance();
        }
        while (this.pos < this.source.length && isDigit(this.peek())) {
          this.advance();
        }
      }
    } else if (this.pos < this.source.length && isIdStart(this.peek())) {
      // Could be TRUE/FALSE for BOOL#TRUE
      while (this.pos < this.source.length && isIdPart(this.peek())) {
        this.advance();
      }
    }

    // Also handle hex: 16#FF typed as BYTE#16#FF — consume base prefix and digits
    if (this.pos < this.source.length && this.peek() === '#') {
      this.advance(); // second #
      while (this.pos < this.source.length && isHexDigit(this.peek())) {
        this.advance();
      }
    }

    const raw = this.source.slice(start, this.pos);
    return this.makeToken(TokenType.INTEGER_LITERAL, raw, start, this.pos);
  }

  // ─── Number ─────────────────────────────────────────────────────────────────

  readNumber() {
    const start = this.pos;

    // Read leading digits
    while (this.pos < this.source.length && isDigit(this.peek())) {
      this.advance();
    }

    // Check for base prefix: 16#, 8#, 2#
    if (this.pos < this.source.length && this.peek() === '#') {
      const prefix = this.source.slice(start, this.pos);
      if (prefix === '16' || prefix === '8' || prefix === '2') {
        this.advance(); // consume #
        const digitStart = this.pos;
        if (prefix === '16') {
          while (this.pos < this.source.length && isHexDigit(this.peek())) {
            this.advance();
          }
        } else if (prefix === '8') {
          while (this.pos < this.source.length && this.peek() >= '0' && this.peek() <= '7') {
            this.advance();
          }
        } else {
          while (this.pos < this.source.length && (this.peek() === '0' || this.peek() === '1')) {
            this.advance();
          }
        }
        if (this.pos === digitStart) {
          const tok = this.makeToken(TokenType.INTEGER_LITERAL, this.source.slice(start, this.pos), start, this.pos);
          this.addError(`Expected digits after base prefix '${prefix}#'`, tok.line, tok.column);
          return tok;
        }
        return this.makeToken(TokenType.INTEGER_LITERAL, this.source.slice(start, this.pos), start, this.pos);
      }
      // Not a recognized base prefix — just return the integer part
      // The # will be handled separately as a HASH token
    }

    // Check for real literal: decimal point
    if (this.pos < this.source.length && this.peek() === '.') {
      // Distinguish '..' (range) from '.' (decimal point)
      if (this.pos + 1 < this.source.length && this.peek(1) === '.') {
        // It's a range operator, return integer
        return this.makeToken(TokenType.INTEGER_LITERAL, this.source.slice(start, this.pos), start, this.pos);
      }
      if (this.pos + 1 < this.source.length && isDigit(this.peek(1))) {
        this.advance(); // consume .
        while (this.pos < this.source.length && isDigit(this.peek())) {
          this.advance();
        }
        // Check for exponent
        if (this.pos < this.source.length && (this.peek() === 'e' || this.peek() === 'E')) {
          this.advance();
          if (this.pos < this.source.length && (this.peek() === '+' || this.peek() === '-')) {
            this.advance();
          }
          while (this.pos < this.source.length && isDigit(this.peek())) {
            this.advance();
          }
        }
        return this.makeToken(TokenType.REAL_LITERAL, this.source.slice(start, this.pos), start, this.pos);
      }
    }

    // Check for exponent without decimal point: 1e5, 1E-3
    if (this.pos < this.source.length && (this.peek() === 'e' || this.peek() === 'E')) {
      const savedPos = this.pos;
      const savedLine = this.line;
      const savedCol = this.column;
      this.advance(); // e/E
      if (this.pos < this.source.length && (this.peek() === '+' || this.peek() === '-')) {
        this.advance();
      }
      if (this.pos < this.source.length && isDigit(this.peek())) {
        while (this.pos < this.source.length && isDigit(this.peek())) {
          this.advance();
        }
        return this.makeToken(TokenType.REAL_LITERAL, this.source.slice(start, this.pos), start, this.pos);
      }
      // Not a valid exponent — rollback
      this.pos = savedPos;
      this.line = savedLine;
      this.column = savedCol;
    }

    return this.makeToken(TokenType.INTEGER_LITERAL, this.source.slice(start, this.pos), start, this.pos);
  }

  // ─── String ────────────────────────────────────────────────────────────────

  readString() {
    const start = this.pos;
    const startLine = this.line;
    const startCol = this.column;
    const quote = this.advance(); // opening quote

    while (this.pos < this.source.length) {
      const ch = this.peek();
      if (ch === quote) {
        this.advance();
        return this.makeToken(TokenType.STRING_LITERAL, this.source.slice(start, this.pos), start, this.pos);
      }
      if (ch === '$') {
        // ST escape character
        this.advance();
        if (this.pos < this.source.length) {
          this.advance(); // consume escaped char
        }
        continue;
      }
      if (ch === '\n' || ch === '\r') {
        this.addError('Unterminated string literal', startLine, startCol);
        return this.makeToken(TokenType.STRING_LITERAL, this.source.slice(start, this.pos), start, this.pos);
      }
      this.advance();
    }

    this.addError('Unterminated string literal', startLine, startCol);
    return this.makeToken(TokenType.STRING_LITERAL, this.source.slice(start, this.pos), start, this.pos);
  }

  // ─── Operators / Punctuation ───────────────────────────────────────────────

  readOperator() {
    const start = this.pos;
    const ch = this.advance();

    switch (ch) {
      case ':':
        if (this.pos < this.source.length && this.peek() === '=') {
          this.advance();
          return this.makeToken(TokenType.ASSIGN, ':=', start, this.pos);
        }
        return this.makeToken(TokenType.COLON, ':', start, this.pos);

      case '*':
        if (this.pos < this.source.length && this.peek() === '*') {
          this.advance();
          return this.makeToken(TokenType.POWER, '**', start, this.pos);
        }
        return this.makeToken(TokenType.STAR, '*', start, this.pos);

      case '<':
        if (this.pos < this.source.length && this.peek() === '>') {
          this.advance();
          return this.makeToken(TokenType.NE, '<>', start, this.pos);
        }
        if (this.pos < this.source.length && this.peek() === '=') {
          this.advance();
          return this.makeToken(TokenType.LE, '<=', start, this.pos);
        }
        return this.makeToken(TokenType.LT, '<', start, this.pos);

      case '>':
        if (this.pos < this.source.length && this.peek() === '=') {
          this.advance();
          return this.makeToken(TokenType.GE, '>=', start, this.pos);
        }
        return this.makeToken(TokenType.GT, '>', start, this.pos);

      case '.':
        if (this.pos < this.source.length && this.peek() === '.') {
          this.advance();
          return this.makeToken(TokenType.RANGE, '..', start, this.pos);
        }
        return this.makeToken(TokenType.DOT, '.', start, this.pos);

      case '=':
        return this.makeToken(TokenType.EQ, '=', start, this.pos);
      case '+':
        return this.makeToken(TokenType.PLUS, '+', start, this.pos);
      case '-':
        return this.makeToken(TokenType.MINUS, '-', start, this.pos);
      case '/':
        return this.makeToken(TokenType.SLASH, '/', start, this.pos);
      case '&':
        return this.makeToken(TokenType.AMP, '&', start, this.pos);
      case '#':
        return this.makeToken(TokenType.HASH, '#', start, this.pos);
      case '(':
        return this.makeToken(TokenType.LPAREN, '(', start, this.pos);
      case ')':
        return this.makeToken(TokenType.RPAREN, ')', start, this.pos);
      case '[':
        return this.makeToken(TokenType.LBRACKET, '[', start, this.pos);
      case ']':
        return this.makeToken(TokenType.RBRACKET, ']', start, this.pos);
      case ',':
        return this.makeToken(TokenType.COMMA, ',', start, this.pos);
      case ';':
        return this.makeToken(TokenType.SEMICOLON, ';', start, this.pos);

      default: {
        const line = this.line;
        const col = this.column - 1;
        this.addError(`Unexpected character '${ch}'`, line, col);
        return null;
      }
    }
  }
}

module.exports = Lexer;
