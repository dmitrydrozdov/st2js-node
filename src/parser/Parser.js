'use strict';

/**
 * @fileoverview Recursive descent parser for IEC 61131-3 Structured Text.
 * Converts a token stream into a Concrete Syntax Tree (raw parse nodes)
 * which ASTBuilder then refines into a clean AST.
 */

const { TokenType, makeError } = require('../types');

class Parser {
  /**
   * @param {import('../types').Token[]} tokens
   * @param {string} source
   */
  constructor(tokens, source) {
    this.tokens = tokens;
    this.source = source;
    this.pos = 0;
    this.errors = /** @type {import('../types').STError[]} */ ([]);
  }

  // ─── Token helpers ─────────────────────────────────────────────────────────

  peek(offset = 0) {
    const idx = this.pos + offset;
    return idx < this.tokens.length ? this.tokens[idx] : this.tokens[this.tokens.length - 1];
  }

  current() { return this.peek(0); }

  advance() {
    const tok = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) this.pos++;
    return tok;
  }

  check(type) { return this.current().type === type; }

  checkAny(...types) { return types.includes(this.current().type); }

  match(...types) {
    if (types.includes(this.current().type)) {
      return this.advance();
    }
    return null;
  }

  expect(type, message) {
    if (this.current().type === type) return this.advance();
    const tok = this.current();
    this.error(message || `Expected ${type} but got '${tok.value}'`, tok);
    // Return a synthetic token to allow parser to continue
    return { type, value: '', line: tok.line, column: tok.column, start: tok.start, end: tok.start };
  }

  error(message, tok) {
    tok = tok || this.current();
    this.errors.push(makeError('parser', message, tok.line, tok.column));
  }

  isEOF() { return this.current().type === TokenType.EOF; }

  // Skip to next semicolon or keyword to recover from errors
  synchronize(...stopTokens) {
    const stops = new Set([
      TokenType.SEMICOLON,
      TokenType.END_FUNCTION, TokenType.END_FUNCTION_BLOCK, TokenType.END_PROGRAM,
      TokenType.END_VAR, TokenType.END_IF, TokenType.END_FOR,
      TokenType.END_WHILE, TokenType.END_REPEAT, TokenType.END_CASE,
      TokenType.END_TYPE, TokenType.END_STRUCT,
      TokenType.EOF,
      ...stopTokens,
    ]);
    while (!stops.has(this.current().type)) this.advance();
  }

  loc(startTok, endTok) {
    endTok = endTok || startTok;
    return {
      start: startTok.start,
      end: endTok.end,
      line: startTok.line,
      column: startTok.column,
      endLine: endTok.line,
      endColumn: endTok.column + (endTok.value ? endTok.value.length : 0),
    };
  }

  // ─── Top-level ─────────────────────────────────────────────────────────────

  parse() {
    const declarations = [];
    const start = this.current();

    while (!this.isEOF()) {
      try {
        if (this.check(TokenType.FUNCTION_BLOCK)) {
          declarations.push(this.parseFunctionBlock());
        } else if (this.check(TokenType.FUNCTION)) {
          declarations.push(this.parseFunction());
        } else if (this.check(TokenType.PROGRAM)) {
          declarations.push(this.parseProgram());
        } else if (this.check(TokenType.TYPE)) {
          declarations.push(this.parseTypeDeclaration());
        } else if (this.check(TokenType.VAR_GLOBAL)) {
          declarations.push(this.parseVarSection());
        } else {
          this.error(`Unexpected token '${this.current().value}' at top level`);
          this.advance();
        }
      } catch (e) {
        this.errors.push(makeError('parser', e.message, this.current().line, this.current().column));
        this.synchronize();
      }
    }

    return {
      type: 'ProgramFile',
      declarations,
      loc: this.loc(start, this.current()),
    };
  }

  // ─── Program Organization Units ────────────────────────────────────────────

  parseFunctionBlock() {
    const kwTok = this.expect(TokenType.FUNCTION_BLOCK);
    const nameTok = this.expect(TokenType.IDENTIFIER, 'Expected function block name');
    const varSections = [];
    const body = [];

    while (!this.checkAny(TokenType.END_FUNCTION_BLOCK, TokenType.EOF)) {
      if (this.checkAny(TokenType.VAR, TokenType.VAR_INPUT, TokenType.VAR_OUTPUT,
          TokenType.VAR_IN_OUT, TokenType.VAR_TEMP, TokenType.VAR_EXTERNAL)) {
        varSections.push(this.parseVarSection());
      } else {
        const stmt = this.parseStatement();
        if (stmt) body.push(stmt);
      }
    }

    const endTok = this.expect(TokenType.END_FUNCTION_BLOCK);
    return {
      type: 'FunctionBlockDeclaration',
      name: nameTok.value,
      varSections,
      body,
      loc: this.loc(kwTok, endTok),
    };
  }

  parseFunction() {
    const kwTok = this.expect(TokenType.FUNCTION);
    const nameTok = this.expect(TokenType.IDENTIFIER, 'Expected function name');
    let returnType = null;

    if (this.match(TokenType.COLON)) {
      returnType = this.parseTypeRef();
    }

    const varSections = [];
    const body = [];

    while (!this.checkAny(TokenType.END_FUNCTION, TokenType.EOF)) {
      if (this.checkAny(TokenType.VAR, TokenType.VAR_INPUT, TokenType.VAR_OUTPUT,
          TokenType.VAR_IN_OUT, TokenType.VAR_TEMP)) {
        varSections.push(this.parseVarSection());
      } else {
        const stmt = this.parseStatement();
        if (stmt) body.push(stmt);
      }
    }

    const endTok = this.expect(TokenType.END_FUNCTION);
    return {
      type: 'FunctionDeclaration',
      name: nameTok.value,
      returnType,
      varSections,
      body,
      loc: this.loc(kwTok, endTok),
    };
  }

  parseProgram() {
    const kwTok = this.expect(TokenType.PROGRAM);
    const nameTok = this.expect(TokenType.IDENTIFIER, 'Expected program name');
    const varSections = [];
    const body = [];

    while (!this.checkAny(TokenType.END_PROGRAM, TokenType.EOF)) {
      if (this.checkAny(TokenType.VAR, TokenType.VAR_INPUT, TokenType.VAR_OUTPUT,
          TokenType.VAR_IN_OUT, TokenType.VAR_GLOBAL, TokenType.VAR_TEMP, TokenType.VAR_EXTERNAL)) {
        varSections.push(this.parseVarSection());
      } else {
        const stmt = this.parseStatement();
        if (stmt) body.push(stmt);
      }
    }

    const endTok = this.expect(TokenType.END_PROGRAM);
    return {
      type: 'ProgramDeclaration',
      name: nameTok.value,
      varSections,
      body,
      loc: this.loc(kwTok, endTok),
    };
  }

  // ─── Variable Sections ─────────────────────────────────────────────────────

  parseVarSection() {
    const kwTok = this.current();
    const kind = kwTok.type; // VAR, VAR_INPUT, etc.
    this.advance();

    const modifiers = [];
    // Optional modifiers: CONSTANT, RETAIN, PERSISTENT
    while (this.checkAny(TokenType.CONSTANT, TokenType.RETAIN, TokenType.PERSISTENT)) {
      modifiers.push(this.advance().value.toUpperCase());
    }

    const declarations = [];
    while (!this.checkAny(TokenType.END_VAR, TokenType.EOF)) {
      try {
        const decls = this.parseVarDeclaration();
        declarations.push(...decls);
      } catch (e) {
        this.errors.push(makeError('parser', e.message, this.current().line, this.current().column));
        this.synchronize(TokenType.END_VAR);
      }
    }

    const endTok = this.expect(TokenType.END_VAR);
    return {
      type: 'VarSection',
      kind,
      modifiers,
      declarations,
      loc: this.loc(kwTok, endTok),
    };
  }

  parseVarDeclaration() {
    // name1, name2, ... : Type [:= InitValue];
    const names = [];
    const startTok = this.current();
    names.push(this.expect(TokenType.IDENTIFIER, 'Expected variable name').value);

    while (this.match(TokenType.COMMA)) {
      names.push(this.expect(TokenType.IDENTIFIER, 'Expected variable name').value);
    }

    this.expect(TokenType.COLON, `Expected ':' after variable name`);
    const varType = this.parseTypeRef();

    let initialValue = null;
    if (this.match(TokenType.ASSIGN)) {
      initialValue = this.parseExpression();
    }

    this.expect(TokenType.SEMICOLON, "Expected ';' after variable declaration");

    return names.map(name => ({
      type: 'VarDeclaration',
      name,
      varType,
      initialValue,
      loc: this.loc(startTok, this.peek(-1)),
    }));
  }

  // ─── Type References ───────────────────────────────────────────────────────

  parseTypeRef() {
    const tok = this.current();

    // ARRAY [lo..hi] OF Type
    if (this.check(TokenType.ARRAY)) {
      return this.parseArrayType();
    }

    // STRUCT ... END_STRUCT (inline struct)
    if (this.check(TokenType.STRUCT)) {
      return this.parseStructType();
    }

    // STRING[N] or WSTRING[N]
    if (this.checkAny(TokenType.STRING_TYPE, TokenType.WSTRING_TYPE)) {
      return this.parseStringType();
    }

    // Primitive types
    if (this.isPrimitiveType(tok.type)) {
      this.advance();
      return {
        type: 'PrimitiveType',
        name: tok.value.toUpperCase(),
        loc: this.loc(tok),
      };
    }

    // User-defined types (identifiers) - preserve original case
    if (tok.type === TokenType.IDENTIFIER) {
      this.advance();
      return {
        type: 'PrimitiveType',
        name: tok.value, // preserve original casing for user-defined types
        loc: this.loc(tok),
      };
    }

    this.error(`Expected type name, got '${tok.value}'`);
    this.advance();
    return { type: 'PrimitiveType', name: 'ANY', loc: this.loc(tok) };
  }

  parseArrayType() {
    const startTok = this.expect(TokenType.ARRAY);
    this.expect(TokenType.LBRACKET);
    const dimensions = [this.parseSubrange()];
    while (this.match(TokenType.COMMA)) {
      dimensions.push(this.parseSubrange());
    }
    this.expect(TokenType.RBRACKET);
    this.expect(TokenType.OF);
    const elementType = this.parseTypeRef();
    return {
      type: 'ArrayType',
      dimensions,
      elementType,
      loc: this.loc(startTok, this.peek(-1)),
    };
  }

  parseSubrange() {
    const lo = this.parseExpression();
    this.expect(TokenType.RANGE, "Expected '..' in array dimension");
    const hi = this.parseExpression();
    return { lo, hi };
  }

  parseStructType() {
    const startTok = this.expect(TokenType.STRUCT);
    const fields = [];

    while (!this.checkAny(TokenType.END_STRUCT, TokenType.EOF)) {
      const decls = this.parseVarDeclaration();
      fields.push(...decls);
    }

    const endTok = this.expect(TokenType.END_STRUCT);
    return {
      type: 'StructType',
      fields,
      loc: this.loc(startTok, endTok),
    };
  }

  parseStringType() {
    const startTok = this.advance(); // STRING or WSTRING
    const kind = startTok.value.toUpperCase();
    let maxLength = 255;

    if (this.match(TokenType.LBRACKET)) {
      const lenTok = this.expect(TokenType.INTEGER_LITERAL, 'Expected string length');
      maxLength = parseInt(lenTok.value, 10);
      this.expect(TokenType.RBRACKET);
    }

    return {
      type: 'StringType',
      kind,
      maxLength,
      loc: this.loc(startTok, this.peek(-1)),
    };
  }

  isPrimitiveType(tokenType) {
    return [
      TokenType.BOOL, TokenType.BYTE, TokenType.WORD, TokenType.DWORD, TokenType.LWORD,
      TokenType.SINT, TokenType.INT, TokenType.DINT, TokenType.LINT,
      TokenType.USINT, TokenType.UINT, TokenType.UDINT, TokenType.ULINT,
      TokenType.REAL, TokenType.LREAL,
      TokenType.TIME, TokenType.DATE, TokenType.TIME_OF_DAY, TokenType.DATE_AND_TIME,
      TokenType.STRING_TYPE, TokenType.WSTRING_TYPE,
      TokenType.ANY, TokenType.ANY_NUM, TokenType.ANY_INT, TokenType.ANY_REAL,
      TokenType.ANY_BIT, TokenType.ANY_STRING, TokenType.ANY_DATE,
    ].includes(tokenType);
  }

  // ─── Type Declarations ─────────────────────────────────────────────────────

  parseTypeDeclaration() {
    const startTok = this.expect(TokenType.TYPE);
    const declarations = [];

    while (!this.checkAny(TokenType.END_TYPE, TokenType.EOF)) {
      const nameTok = this.expect(TokenType.IDENTIFIER, 'Expected type name');
      this.expect(TokenType.COLON);

      let typeDef;
      if (this.check(TokenType.STRUCT)) {
        typeDef = this.parseStructType();
      } else if (this.check(TokenType.ARRAY)) {
        typeDef = this.parseArrayType();
      } else if (this.check(TokenType.LPAREN)) {
        typeDef = this.parseEnumType();
      } else {
        // Subrange or alias
        const baseType = this.parseTypeRef();
        let range = null;
        if (this.match(TokenType.LPAREN)) {
          const lo = this.parseExpression();
          this.expect(TokenType.RANGE);
          const hi = this.parseExpression();
          this.expect(TokenType.RPAREN);
          range = { lo, hi };
        }
        typeDef = range ? { type: 'SubrangeType', baseType, range, loc: baseType.loc } : baseType;
      }

      let initialValue = null;
      if (this.match(TokenType.ASSIGN)) {
        initialValue = this.parseExpression();
      }

      this.expect(TokenType.SEMICOLON);
      declarations.push({
        type: 'TypeAliasDeclaration',
        name: nameTok.value,
        typeDef,
        initialValue,
        loc: this.loc(nameTok),
      });
    }

    const endTok = this.expect(TokenType.END_TYPE);
    return {
      type: 'TypeDeclaration',
      declarations,
      loc: this.loc(startTok, endTok),
    };
  }

  parseEnumType() {
    const startTok = this.expect(TokenType.LPAREN);
    const values = [];

    do {
      const nameTok = this.expect(TokenType.IDENTIFIER, 'Expected enum value name');
      let value = null;
      if (this.match(TokenType.ASSIGN)) {
        value = this.parseExpression();
      }
      values.push({ name: nameTok.value, value });
    } while (this.match(TokenType.COMMA));

    const endTok = this.expect(TokenType.RPAREN);
    return {
      type: 'EnumType',
      values,
      loc: this.loc(startTok, endTok),
    };
  }

  // ─── Statements ────────────────────────────────────────────────────────────

  parseStatement() {
    const tok = this.current();

    try {
      if (this.check(TokenType.SEMICOLON)) {
        this.advance();
        return null; // empty statement
      }

      if (this.check(TokenType.IF)) return this.parseIfStatement();
      if (this.check(TokenType.CASE)) return this.parseCaseStatement();
      if (this.check(TokenType.FOR)) return this.parseForStatement();
      if (this.check(TokenType.WHILE)) return this.parseWhileStatement();
      if (this.check(TokenType.REPEAT)) return this.parseRepeatStatement();
      if (this.check(TokenType.RETURN)) return this.parseReturnStatement();
      if (this.check(TokenType.EXIT)) return this.parseExitStatement();
      if (this.check(TokenType.CONTINUE)) return this.parseContinueStatement();

      // Assignment or function call
      if (this.check(TokenType.IDENTIFIER)) {
        return this.parseAssignmentOrCall();
      }

      this.error(`Unexpected token in statement: '${tok.value}'`);
      this.advance();
      return null;
    } catch (e) {
      this.errors.push(makeError('parser', e.message, tok.line, tok.column));
      this.synchronize();
      return null;
    }
  }

  /**
   * Public entry point: parse a bare statement list (algorithm body) until EOF.
   * Returns a StatementList CST node. Does not require a surrounding POU.
   */
  parseStatementList() {
    const start = this.current();
    const statements = this._parseStatementsUntil([]);
    return {
      type: 'StatementList',
      statements,
      loc: this.loc(start, this.current()),
    };
  }

  _parseStatementsUntil(stopTypes = []) {
    const stmts = [];
    const stop = new Set([...stopTypes, TokenType.EOF]);
    while (!stop.has(this.current().type)) {
      const stmt = this.parseStatement();
      if (stmt) stmts.push(stmt);
    }
    return stmts;
  }

  parseIfStatement() {
    const startTok = this.expect(TokenType.IF);
    const condition = this.parseExpression();
    this.expect(TokenType.THEN);
    const consequent = this._parseStatementsUntil([
      TokenType.ELSIF, TokenType.ELSE, TokenType.END_IF
    ]);

    const elsifClauses = [];
    while (this.check(TokenType.ELSIF)) {
      const elsifTok = this.advance();
      const elsifCond = this.parseExpression();
      this.expect(TokenType.THEN);
      const elsifBody = this._parseStatementsUntil([
        TokenType.ELSIF, TokenType.ELSE, TokenType.END_IF
      ]);
      elsifClauses.push({
        type: 'ElsifClause',
        condition: elsifCond,
        body: elsifBody,
        loc: this.loc(elsifTok),
      });
    }

    let elseClause = null;
    if (this.check(TokenType.ELSE)) {
      const elseTok = this.advance();
      const elseBody = this._parseStatementsUntil([TokenType.END_IF]);
      elseClause = {
        type: 'ElseClause',
        body: elseBody,
        loc: this.loc(elseTok),
      };
    }

    const endTok = this.expect(TokenType.END_IF);
    this.match(TokenType.SEMICOLON);

    return {
      type: 'IfStatement',
      condition,
      consequent,
      elsifClauses,
      elseClause,
      loc: this.loc(startTok, endTok),
    };
  }

  parseCaseStatement() {
    const startTok = this.expect(TokenType.CASE);
    const discriminant = this.parseExpression();
    this.expect(TokenType.OF);

    const clauses = [];
    while (!this.checkAny(TokenType.ELSE, TokenType.END_CASE, TokenType.EOF)) {
      clauses.push(this.parseCaseClause());
    }

    let elseClause = null;
    if (this.check(TokenType.ELSE)) {
      const elseTok = this.advance();
      const elseBody = this.parseCaseBody();
      elseClause = {
        type: 'ElseClause',
        body: elseBody,
        loc: this.loc(elseTok),
      };
    }

    const endTok = this.expect(TokenType.END_CASE);
    this.match(TokenType.SEMICOLON);

    return {
      type: 'CaseStatement',
      discriminant,
      clauses,
      elseClause,
      loc: this.loc(startTok, endTok),
    };
  }

  /**
   * Returns true if current position looks like the start of a new CASE label.
   * A case label is: (integer | identifier | '-' integer) (','|'..'|':')
   */
  _isAtCaseLabel() {
    const t0 = this.current();
    const t1 = this.peek(1);
    // Simple: integer or identifier followed by colon, comma, or range
    if (t0.type === TokenType.INTEGER_LITERAL || t0.type === TokenType.IDENTIFIER) {
      return t1.type === TokenType.COLON || t1.type === TokenType.COMMA || t1.type === TokenType.RANGE;
    }
    // Negative integer: '-' integer ':'
    if (t0.type === TokenType.MINUS && t1.type === TokenType.INTEGER_LITERAL) {
      const t2 = this.peek(2);
      return t2.type === TokenType.COLON || t2.type === TokenType.COMMA;
    }
    return false;
  }

  parseCaseClause() {
    const startTok = this.current();
    const values = [this.parseCaseValue()];
    while (this.match(TokenType.COMMA)) {
      values.push(this.parseCaseValue());
    }
    this.expect(TokenType.COLON);
    const body = this.parseCaseBody();
    return {
      type: 'CaseClause',
      values,
      body,
      loc: this.loc(startTok, this.peek(-1)),
    };
  }

  /** Parse the body of a CASE clause, stopping at the next label, ELSE, or END_CASE */
  parseCaseBody() {
    const stmts = [];
    while (!this.checkAny(TokenType.ELSE, TokenType.END_CASE, TokenType.EOF)) {
      if (this._isAtCaseLabel()) break;
      const stmt = this.parseStatement();
      if (stmt) stmts.push(stmt);
    }
    return stmts;
  }

  parseCaseValue() {
    // Can be: integer literal, identifier (enum), or range lo..hi
    const start = this.current();
    let val;

    if (this.checkAny(TokenType.INTEGER_LITERAL, TokenType.IDENTIFIER, TokenType.MINUS)) {
      // Handle negative numbers in case
      if (this.check(TokenType.MINUS)) {
        const minusTok = this.advance();
        const numTok = this.expect(TokenType.INTEGER_LITERAL);
        val = {
          type: 'IntegerLiteral',
          value: -parseInt(numTok.value, 10),
          raw: '-' + numTok.value,
          loc: this.loc(minusTok, numTok),
        };
      } else {
        val = this.advance();
        val = val.type === TokenType.INTEGER_LITERAL
          ? { type: 'IntegerLiteral', value: parseInt(val.value, 10), raw: val.value, loc: this.loc(val) }
          : { type: 'IdentifierRef', name: val.value, loc: this.loc(val) };
      }

      if (this.check(TokenType.RANGE)) {
        this.advance(); // consume ..
        const hi = this.current();
        this.advance();
        const hiVal = { type: 'IntegerLiteral', value: parseInt(hi.value, 10), raw: hi.value, loc: this.loc(hi) };
        return { type: 'RangeLiteral', lo: val, hi: hiVal, loc: this.loc(start, hi) };
      }
      return val;
    }

    this.error(`Expected case value, got '${start.value}'`);
    this.advance();
    return { type: 'IntegerLiteral', value: 0, raw: '0', loc: this.loc(start) };
  }

  parseForStatement() {
    const startTok = this.expect(TokenType.FOR);
    const varTok = this.expect(TokenType.IDENTIFIER, 'Expected loop variable');
    this.expect(TokenType.ASSIGN);
    const from = this.parseExpression();
    this.expect(TokenType.TO);
    const to = this.parseExpression();

    let by = null;
    if (this.match(TokenType.BY)) {
      by = this.parseExpression();
    }

    this.expect(TokenType.DO);
    const body = this._parseStatementsUntil([TokenType.END_FOR]);
    const endTok = this.expect(TokenType.END_FOR);
    this.match(TokenType.SEMICOLON);

    return {
      type: 'ForStatement',
      variable: { type: 'IdentifierRef', name: varTok.value, loc: this.loc(varTok) },
      from,
      to,
      by,
      body,
      loc: this.loc(startTok, endTok),
    };
  }

  parseWhileStatement() {
    const startTok = this.expect(TokenType.WHILE);
    const condition = this.parseExpression();
    this.expect(TokenType.DO);
    const body = this._parseStatementsUntil([TokenType.END_WHILE]);
    const endTok = this.expect(TokenType.END_WHILE);
    this.match(TokenType.SEMICOLON);

    return {
      type: 'WhileStatement',
      condition,
      body,
      loc: this.loc(startTok, endTok),
    };
  }

  parseRepeatStatement() {
    const startTok = this.expect(TokenType.REPEAT);
    const body = this._parseStatementsUntil([TokenType.UNTIL]);
    this.expect(TokenType.UNTIL);
    const condition = this.parseExpression();
    this.match(TokenType.SEMICOLON);

    return {
      type: 'RepeatStatement',
      body,
      condition,
      loc: this.loc(startTok, this.peek(-1)),
    };
  }

  parseReturnStatement() {
    const tok = this.expect(TokenType.RETURN);
    this.match(TokenType.SEMICOLON);
    return { type: 'ReturnStatement', loc: this.loc(tok) };
  }

  parseExitStatement() {
    const tok = this.expect(TokenType.EXIT);
    this.match(TokenType.SEMICOLON);
    return { type: 'ExitStatement', loc: this.loc(tok) };
  }

  parseContinueStatement() {
    const tok = this.expect(TokenType.CONTINUE);
    this.match(TokenType.SEMICOLON);
    return { type: 'ContinueStatement', loc: this.loc(tok) };
  }

  parseAssignmentOrCall() {
    // Parse left-hand side (could be a.b, a[i], a[i].b, etc.)
    const startTok = this.current();
    const lhs = this.parsePrimary();

    // Assignment
    if (this.match(TokenType.ASSIGN)) {
      const rhs = this.parseExpression();
      this.match(TokenType.SEMICOLON);
      return {
        type: 'Assignment',
        target: lhs,
        value: rhs,
        loc: this.loc(startTok, this.peek(-1)),
      };
    }

    // Function call statement (call without assignment)
    if (lhs.type === 'FunctionCall') {
      this.match(TokenType.SEMICOLON);
      return {
        type: 'FunctionCallStatement',
        call: lhs,
        loc: lhs.loc,
      };
    }

    this.error(`Expected ':=' or function call`);
    this.match(TokenType.SEMICOLON);
    return null;
  }

  // ─── Expressions ───────────────────────────────────────────────────────────

  parseExpression() {
    return this.parseOr();
  }

  parseOr() {
    let left = this.parseXor();
    while (this.checkAny(TokenType.OR)) {
      const op = this.advance().value.toUpperCase();
      const right = this.parseXor();
      left = { type: 'BinaryExpr', operator: op, left, right, loc: this.loc(left.loc ? { start: left.loc.start, line: left.loc.line, column: left.loc.column } : this.peek(-1)) };
    }
    return left;
  }

  parseXor() {
    let left = this.parseAnd();
    while (this.check(TokenType.XOR)) {
      const op = this.advance().value.toUpperCase();
      const right = this.parseAnd();
      left = { type: 'BinaryExpr', operator: op, left, right, loc: this.combineLoc(left, right) };
    }
    return left;
  }

  parseAnd() {
    let left = this.parseComparison();
    while (this.checkAny(TokenType.AND, TokenType.AMP)) {
      const op = this.advance();
      const right = this.parseComparison();
      left = { type: 'BinaryExpr', operator: 'AND', left, right, loc: this.combineLoc(left, right) };
    }
    return left;
  }

  parseComparison() {
    let left = this.parseAddSub();
    while (this.checkAny(TokenType.EQ, TokenType.NE, TokenType.LT, TokenType.LE, TokenType.GT, TokenType.GE)) {
      const op = this.advance().value;
      const right = this.parseAddSub();
      left = { type: 'BinaryExpr', operator: op, left, right, loc: this.combineLoc(left, right) };
    }
    return left;
  }

  parseAddSub() {
    let left = this.parseMulDiv();
    while (this.checkAny(TokenType.PLUS, TokenType.MINUS)) {
      const op = this.advance().value;
      const right = this.parseMulDiv();
      left = { type: 'BinaryExpr', operator: op, left, right, loc: this.combineLoc(left, right) };
    }
    return left;
  }

  parseMulDiv() {
    let left = this.parseUnary();
    while (this.checkAny(TokenType.STAR, TokenType.SLASH, TokenType.MOD)) {
      const opTok = this.advance();
      const op = opTok.type === TokenType.MOD ? 'MOD' : opTok.value;
      const right = this.parseUnary();
      left = { type: 'BinaryExpr', operator: op, left, right, loc: this.combineLoc(left, right) };
    }
    return left;
  }

  parseUnary() {
    if (this.check(TokenType.MINUS)) {
      const tok = this.advance();
      const operand = this.parsePower();
      return { type: 'UnaryExpr', operator: '-', operand, loc: this.loc(tok, this.peek(-1)) };
    }
    if (this.check(TokenType.NOT)) {
      const tok = this.advance();
      const operand = this.parsePower();
      return { type: 'UnaryExpr', operator: 'NOT', operand, loc: this.loc(tok, this.peek(-1)) };
    }
    if (this.check(TokenType.PLUS)) {
      this.advance(); // consume unary plus
      return this.parsePower();
    }
    return this.parsePower();
  }

  parsePower() {
    let base = this.parsePrimary();
    while (this.check(TokenType.POWER)) {
      this.advance();
      const exp = this.parseUnary(); // right-associative
      base = { type: 'BinaryExpr', operator: '**', left: base, right: exp, loc: this.combineLoc(base, exp) };
    }
    return base;
  }

  parsePrimary() {
    const tok = this.current();

    // Parenthesized expression
    if (this.check(TokenType.LPAREN)) {
      this.advance();
      const expr = this.parseExpression();
      this.expect(TokenType.RPAREN);
      return expr;
    }

    // Literals
    if (this.check(TokenType.INTEGER_LITERAL)) {
      this.advance();
      return { type: 'IntegerLiteral', value: parseIntLiteral(tok.value), raw: tok.value, loc: this.loc(tok) };
    }
    if (this.check(TokenType.REAL_LITERAL)) {
      this.advance();
      return { type: 'RealLiteral', value: parseFloat(tok.value.replace(/_/g, '')), raw: tok.value, loc: this.loc(tok) };
    }
    if (this.check(TokenType.BOOL_LITERAL)) {
      this.advance();
      return { type: 'BoolLiteral', value: tok.value.toUpperCase() === 'TRUE', raw: tok.value, loc: this.loc(tok) };
    }
    if (this.check(TokenType.STRING_LITERAL)) {
      this.advance();
      return { type: 'StringLiteral', value: unescapeString(tok.value), raw: tok.value, loc: this.loc(tok) };
    }
    if (this.check(TokenType.TIME_LITERAL)) {
      this.advance();
      return { type: 'TimeLiteral', value: tok.value, ms: parseTimeLiteral(tok.value), loc: this.loc(tok) };
    }
    if (this.check(TokenType.DATE_LITERAL)) {
      this.advance();
      return { type: 'DateLiteral', value: tok.value, loc: this.loc(tok) };
    }

    // Identifier, function call, member access, array access
    if (this.check(TokenType.IDENTIFIER)) {
      return this.parseIdentifierOrCall();
    }

    // Typed literals like INT#42, REAL#3.14
    if (this.isPrimitiveType(tok.type) || this.checkAny(TokenType.STRING_TYPE, TokenType.WSTRING_TYPE)) {
      this.advance();
      if (this.check(TokenType.HASH)) {
        this.advance();
        const valTok = this.current();
        const valExpr = this.parsePrimary();
        return {
          type: 'TypedLiteral',
          typeName: tok.value.toUpperCase(),
          value: valExpr,
          loc: this.loc(tok, this.peek(-1)),
        };
      }
      // It was just a type name used as an expression (rare but valid in some contexts)
      return { type: 'IdentifierRef', name: tok.value.toUpperCase(), loc: this.loc(tok) };
    }

    this.error(`Unexpected token in expression: '${tok.value}'`);
    this.advance();
    return { type: 'IntegerLiteral', value: 0, raw: '0', loc: this.loc(tok) };
  }

  parseIdentifierOrCall() {
    const nameTok = this.advance();
    let node = { type: 'IdentifierRef', name: nameTok.value, loc: this.loc(nameTok) };

    // Check for typed literal: IDENT#value (e.g., MyEnum#Value)
    if (this.check(TokenType.HASH)) {
      this.advance();
      const valTok = this.current();
      const valExpr = this.parsePrimary();
      return {
        type: 'TypedLiteral',
        typeName: nameTok.value,
        value: valExpr,
        loc: this.loc(nameTok, this.peek(-1)),
      };
    }

    // Function call
    if (this.check(TokenType.LPAREN)) {
      this.advance(); // (
      const args = this.parseArgList();
      const rParen = this.expect(TokenType.RPAREN);
      node = {
        type: 'FunctionCall',
        callee: nameTok.value,
        args,
        loc: this.loc(nameTok, rParen),
      };
    }

    // Postfix: member access and array subscript
    while (true) {
      if (this.check(TokenType.DOT)) {
        this.advance();
        const memberTok = this.expect(TokenType.IDENTIFIER, 'Expected member name');
        node = {
          type: 'MemberAccess',
          object: node,
          member: memberTok.value,
          loc: this.loc({ start: node.loc.start, line: node.loc.line, column: node.loc.column }, memberTok),
        };
        // Another function call after member access (e.g., fb.method())
        if (this.check(TokenType.LPAREN)) {
          this.advance();
          const args = this.parseArgList();
          const rParen = this.expect(TokenType.RPAREN);
          node = {
            type: 'FunctionCall',
            callee: node,
            args,
            loc: this.loc({ start: node.loc.start, line: node.loc.line, column: node.loc.column }, rParen),
          };
        }
      } else if (this.check(TokenType.LBRACKET)) {
        this.advance();
        const indices = [this.parseExpression()];
        while (this.match(TokenType.COMMA)) {
          indices.push(this.parseExpression());
        }
        const rBracket = this.expect(TokenType.RBRACKET);
        node = {
          type: 'ArrayAccess',
          array: node,
          indices,
          loc: this.loc({ start: node.loc.start, line: node.loc.line, column: node.loc.column }, rBracket),
        };
      } else {
        break;
      }
    }

    return node;
  }

  parseArgList() {
    const args = [];
    if (this.check(TokenType.RPAREN)) return args;

    // Check for named argument: name := value OR name => value (output binding)
    do {
      if (this.check(TokenType.IDENTIFIER) &&
          this.peek(1).type === TokenType.ASSIGN) {
        // named input: name := expr
        const nameTok = this.advance();
        this.advance(); // :=
        const value = this.parseExpression();
        args.push({ type: 'NamedArgument', name: nameTok.value, value, dir: 'IN', loc: this.loc(nameTok) });
      } else if (this.check(TokenType.IDENTIFIER) &&
          this.peek(1).type === TokenType.ASSIGN && false) {
        // This branch is never hit, but we keep for clarity
      } else if (this.check(TokenType.NOT) && this.peek(1).type === TokenType.IDENTIFIER) {
        // Negated named argument: NOT name
        const notTok = this.advance();
        const nameTok = this.advance();
        args.push({ type: 'NamedArgument', name: nameTok.value, value: null, negated: true, dir: 'IN', loc: this.loc(notTok) });
      } else {
        const expr = this.parseExpression();
        args.push(expr);
      }
    } while (this.match(TokenType.COMMA));

    return args;
  }

  combineLoc(left, right) {
    const leftLoc = left.loc || { start: 0, line: 1, column: 0, end: 0 };
    const rightLoc = right.loc || leftLoc;
    return {
      start: leftLoc.start,
      end: rightLoc.end || rightLoc.start,
      line: leftLoc.line,
      column: leftLoc.column,
      endLine: rightLoc.endLine || rightLoc.line,
      endColumn: rightLoc.endColumn || rightLoc.column,
    };
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseIntLiteral(raw) {
  // Handle ST number bases: 16#FF, 8#77, 2#1010
  const clean = raw.replace(/_/g, '');
  if (clean.startsWith('16#') || clean.startsWith('16#')) return parseInt(clean.slice(3), 16);
  if (clean.startsWith('8#')) return parseInt(clean.slice(2), 8);
  if (clean.startsWith('2#')) return parseInt(clean.slice(2), 2);
  return parseInt(clean, 10);
}

function parseTimeLiteral(raw) {
  // T#1h30m20s500ms -> milliseconds
  const s = raw.replace(/^(T|TIME)#/i, '');
  let ms = 0;
  const pattern = /(\d+(?:\.\d+)?)(d|h|m(?!s)|s|ms|us|ns)/gi;
  let match;
  while ((match = pattern.exec(s)) !== null) {
    const val = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    switch (unit) {
      case 'd': ms += val * 86400000; break;
      case 'h': ms += val * 3600000; break;
      case 'm': ms += val * 60000; break;
      case 's': ms += val * 1000; break;
      case 'ms': ms += val; break;
      case 'us': ms += val / 1000; break;
      case 'ns': ms += val / 1000000; break;
    }
  }
  return ms;
}

function unescapeString(raw) {
  // Remove surrounding quotes and handle escape sequences
  const inner = raw.slice(1, -1);
  return inner.replace(/\$\$/g, '$')
    .replace(/\$n/gi, '\n')
    .replace(/\$r/gi, '\r')
    .replace(/\$t/gi, '\t')
    .replace(/\$l/gi, '\n')
    .replace(/\$p/gi, '\n')
    .replace(/\$([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

module.exports = Parser;
