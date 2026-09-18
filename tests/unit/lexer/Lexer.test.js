'use strict';

const Lexer = require('../../../src/lexer/Lexer');
const { TokenType } = require('../../../src/types');

function tokenize(src) {
  const lexer = new Lexer(src);
  const tokens = lexer.tokenize();
  return { tokens, errors: lexer.errors };
}

function tokenTypes(src) {
  return tokenize(src).tokens.map(t => t.type);
}

function tokenValues(src) {
  return tokenize(src).tokens.map(t => t.value);
}

describe('Lexer', () => {
  describe('keywords (case-insensitive)', () => {
    test('recognizes IF keyword', () => {
      expect(tokenTypes('IF')).toEqual([TokenType.IF, TokenType.EOF]);
    });

    test('recognizes lowercase keywords', () => {
      expect(tokenTypes('if')[0]).toBe(TokenType.IF);
      expect(tokenTypes('then')[0]).toBe(TokenType.THEN);
      expect(tokenTypes('end_if')[0]).toBe(TokenType.END_IF);
    });

    test('recognizes mixed case keywords', () => {
      expect(tokenTypes('Function_Block')[0]).toBe(TokenType.FUNCTION_BLOCK);
      expect(tokenTypes('End_Function_Block')[0]).toBe(TokenType.END_FUNCTION_BLOCK);
    });

    test('recognizes compound keywords', () => {
      expect(tokenTypes('VAR_INPUT')[0]).toBe(TokenType.VAR_INPUT);
      expect(tokenTypes('VAR_OUTPUT')[0]).toBe(TokenType.VAR_OUTPUT);
      expect(tokenTypes('VAR_IN_OUT')[0]).toBe(TokenType.VAR_IN_OUT);
      expect(tokenTypes('END_FUNCTION')[0]).toBe(TokenType.END_FUNCTION);
    });
  });

  describe('integer literals', () => {
    test('decimal integer', () => {
      const { tokens } = tokenize('42');
      expect(tokens[0].type).toBe(TokenType.INTEGER_LITERAL);
      expect(tokens[0].value).toBe('42');
    });

    test('hex literal 16#FF', () => {
      const { tokens } = tokenize('16#FF');
      expect(tokens[0].type).toBe(TokenType.INTEGER_LITERAL);
      expect(tokens[0].value).toBe('16#FF');
    });

    test('binary literal 2#1010', () => {
      const { tokens } = tokenize('2#1010');
      expect(tokens[0].type).toBe(TokenType.INTEGER_LITERAL);
      expect(tokens[0].value).toBe('2#1010');
    });

    test('octal literal 8#77', () => {
      const { tokens } = tokenize('8#77');
      expect(tokens[0].type).toBe(TokenType.INTEGER_LITERAL);
      expect(tokens[0].value).toBe('8#77');
    });
  });

  describe('real literals', () => {
    test('simple real', () => {
      const { tokens } = tokenize('1.5');
      expect(tokens[0].type).toBe(TokenType.REAL_LITERAL);
      expect(tokens[0].value).toBe('1.5');
    });

    test('real with exponent', () => {
      const { tokens } = tokenize('1.5e10');
      expect(tokens[0].type).toBe(TokenType.REAL_LITERAL);
      expect(tokens[0].value).toBe('1.5e10');
    });

    test('real with negative exponent', () => {
      const { tokens } = tokenize('1.5E-3');
      expect(tokens[0].type).toBe(TokenType.REAL_LITERAL);
      expect(tokens[0].value).toBe('1.5E-3');
    });
  });

  describe('bool literals', () => {
    test('TRUE', () => {
      const { tokens } = tokenize('TRUE');
      expect(tokens[0].type).toBe(TokenType.BOOL_LITERAL);
      expect(tokens[0].value).toBe('TRUE');
    });

    test('FALSE', () => {
      const { tokens } = tokenize('FALSE');
      expect(tokens[0].type).toBe(TokenType.BOOL_LITERAL);
    });
  });

  describe('string literals', () => {
    test('single-quoted string', () => {
      const { tokens } = tokenize("'hello'");
      expect(tokens[0].type).toBe(TokenType.STRING_LITERAL);
      expect(tokens[0].value).toBe("'hello'");
    });

    test('double-quoted string', () => {
      const { tokens } = tokenize('"world"');
      expect(tokens[0].type).toBe(TokenType.STRING_LITERAL);
      expect(tokens[0].value).toBe('"world"');
    });
  });

  describe('time literals', () => {
    test('T#1s', () => {
      const { tokens } = tokenize('T#1s');
      expect(tokens[0].type).toBe(TokenType.TIME_LITERAL);
      expect(tokens[0].value).toBe('T#1s');
    });

    test('T#500ms', () => {
      const { tokens } = tokenize('T#500ms');
      expect(tokens[0].type).toBe(TokenType.TIME_LITERAL);
      expect(tokens[0].value).toBe('T#500ms');
    });

    test('TIME#1h30m is a typed literal of type TIME', () => {
      const { tokens } = tokenize('TIME#1h30m');
      expect(tokens[0].type).toBe(TokenType.TYPED_LITERAL);
      expect(tokens[0].value).toBe('TIME#1h30m');
      expect(tokens[0].typeName).toBe('TIME');
      expect(tokens[0].valueText).toBe('1h30m');
    });
  });

  describe('operators and punctuation', () => {
    test(':= assign vs : colon', () => {
      expect(tokenTypes(':=')[0]).toBe(TokenType.ASSIGN);
      expect(tokenTypes(':')[0]).toBe(TokenType.COLON);
    });

    test('<> not-equal', () => {
      expect(tokenTypes('<>')[0]).toBe(TokenType.NE);
    });

    test('<= and >=', () => {
      expect(tokenTypes('<=')[0]).toBe(TokenType.LE);
      expect(tokenTypes('>=')[0]).toBe(TokenType.GE);
    });

    test('.. range vs . dot', () => {
      expect(tokenTypes('..')[0]).toBe(TokenType.RANGE);
      expect(tokenTypes('.')[0]).toBe(TokenType.DOT);
    });

    test('** power vs * multiply', () => {
      expect(tokenTypes('**')[0]).toBe(TokenType.POWER);
      expect(tokenTypes('*')[0]).toBe(TokenType.STAR);
    });
  });

  describe('comments', () => {
    test('block comment (* ... *)', () => {
      const { tokens } = tokenize('(* this is a comment *) 42');
      expect(tokens[0].type).toBe(TokenType.INTEGER_LITERAL);
      expect(tokens[0].value).toBe('42');
    });

    test('line comment //', () => {
      const { tokens } = tokenize('// this is a comment\n42');
      expect(tokens[0].type).toBe(TokenType.INTEGER_LITERAL);
    });

    test('nested block comments', () => {
      const { tokens } = tokenize('(* outer (* inner *) still outer *) 42');
      expect(tokens[0].type).toBe(TokenType.INTEGER_LITERAL);
    });
  });

  describe('EOF and errors', () => {
    test('produces EOF as last token', () => {
      const { tokens } = tokenize('42');
      expect(tokens[tokens.length - 1].type).toBe(TokenType.EOF);
    });

    test('empty input produces only EOF', () => {
      const { tokens } = tokenize('');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe(TokenType.EOF);
    });

    test('stores errors for invalid characters', () => {
      const { errors } = tokenize('~');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].phase).toBe('lexer');
    });
  });

  describe('token positions', () => {
    test('tokens have line and column', () => {
      const { tokens } = tokenize('IF x THEN');
      expect(tokens[0].line).toBe(1);
      expect(tokens[0].column).toBe(0);
    });
  });

  describe('typed literals', () => {
    function typed(src) {
      const { tokens, errors } = tokenize(src);
      expect(errors).toHaveLength(0);
      expect(tokens).toHaveLength(2); // literal + EOF
      expect(tokens[0].type).toBe(TokenType.TYPED_LITERAL);
      expect(tokens[0].value).toBe(src);
      return tokens[0];
    }

    test('INT#42', () => {
      const tok = typed('INT#42');
      expect(tok.typeName).toBe('INT');
      expect(tok.valueText).toBe('42');
    });

    test.each([
      ['DINT#1', 'DINT', '1'],
      ['DINT#-5', 'DINT', '-5'],
      ['INT#+42', 'INT', '+42'],
      ['WORD#16#FF', 'WORD', '16#FF'],
      ['BYTE#2#1010', 'BYTE', '2#1010'],
      ['LWORD#16#FFFFFFFFFFFFFFFF', 'LWORD', '16#FFFFFFFFFFFFFFFF'],
      ['REAL#2.5', 'REAL', '2.5'],
      ['LREAL#1.5e3', 'LREAL', '1.5e3'],
      ['REAL#-1.5E-3', 'REAL', '-1.5E-3'],
      ['BOOL#TRUE', 'BOOL', 'TRUE'],
      ['BOOL#0', 'BOOL', '0'],
      ["STRING#'a'", 'STRING', "'a'"],
      ['WSTRING#"w"', 'WSTRING', '"w"'],
      ['TIME#1s', 'TIME', '1s'],
      ['TIME#-1h30m', 'TIME', '-1h30m'],
      ['DATE#2024-01-01', 'DATE', '2024-01-01'],
      ['TOD#12:30:00.500', 'TIME_OF_DAY', '12:30:00.500'],
      ['TIME_OF_DAY#12:30:00', 'TIME_OF_DAY', '12:30:00'],
      ['DT#2024-01-01-00:00:00', 'DATE_AND_TIME', '2024-01-01-00:00:00'],
      ['DATE_AND_TIME#2024-01-01-00:00:00', 'DATE_AND_TIME', '2024-01-01-00:00:00'],
      ['SINT#1', 'SINT', '1'], ['LINT#1', 'LINT', '1'], ['USINT#1', 'USINT', '1'],
      ['UINT#1', 'UINT', '1'], ['UDINT#1', 'UDINT', '1'], ['ULINT#1', 'ULINT', '1'],
      ['DWORD#1', 'DWORD', '1'],
    ])('%s lexes as TYPED_LITERAL %s with value text %s', (src, typeName, valueText) => {
      const tok = typed(src);
      expect(tok.typeName).toBe(typeName);
      expect(tok.valueText).toBe(valueText);
    });

    test('type keywords are case-insensitive and normalised', () => {
      const tok = typed('dint#7');
      expect(tok.typeName).toBe('DINT');
      expect(tok.valueText).toBe('7');
    });

    test('typed literal stops at the end of the value', () => {
      const types = tokenTypes('DINT#1 + 2');
      expect(types).toEqual([TokenType.TYPED_LITERAL, TokenType.PLUS, TokenType.INTEGER_LITERAL, TokenType.EOF]);
    });

    test('typed literals on both sides of a range', () => {
      const types = tokenTypes('DINT#1..DINT#9');
      expect(types).toEqual([TokenType.TYPED_LITERAL, TokenType.RANGE, TokenType.TYPED_LITERAL, TokenType.EOF]);
    });

    test('an integer typed literal does not swallow an exponent', () => {
      const types = tokenTypes('INT#1e5');
      expect(types[0]).toBe(TokenType.TYPED_LITERAL);
      expect(types[1]).toBe(TokenType.IDENTIFIER);
    });

    test('missing value after # is a lexer error', () => {
      const { tokens, errors } = tokenize('DINT#;');
      expect(tokens[0].type).toBe(TokenType.TYPED_LITERAL);
      expect(tokens[0].valueText).toBe('');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toMatch(/DINT/);
    });

    test('whitespace between type and # is not a typed literal', () => {
      const types = tokenTypes('INT # 42');
      expect(types).toEqual([TokenType.INT, TokenType.HASH, TokenType.INTEGER_LITERAL, TokenType.EOF]);
    });

    test('identifier-prefixed literal still lexes as IDENTIFIER HASH IDENTIFIER', () => {
      const types = tokenTypes('Colour#Red');
      expect(types).toEqual([TokenType.IDENTIFIER, TokenType.HASH, TokenType.IDENTIFIER, TokenType.EOF]);
    });

    test('T#1s and D#2024-01-01 still lex as before', () => {
      const t = tokenize('T#1s').tokens[0];
      expect(t.type).toBe(TokenType.TIME_LITERAL);
      expect(t.value).toBe('T#1s');
      const d = tokenize('D#2024-01-01').tokens[0];
      expect(d.type).toBe(TokenType.DATE_LITERAL);
      expect(d.value).toBe('D#2024-01-01');
    });
  });

  describe('date literals', () => {
    test('D#2024-01-01', () => {
      const { tokens } = tokenize('D#2024-01-01');
      expect(tokens[0].type).toBe(TokenType.DATE_LITERAL);
    });

    test('DATE#2024-01-01 is a typed literal of type DATE', () => {
      const { tokens } = tokenize('DATE#2024-01-01');
      expect(tokens[0].type).toBe(TokenType.TYPED_LITERAL);
      expect(tokens[0].typeName).toBe('DATE');
      expect(tokens[0].valueText).toBe('2024-01-01');
    });
  });

  describe('string escapes', () => {
    test('unterminated string produces error', () => {
      const { errors } = tokenize("'unterminated");
      expect(errors.length).toBeGreaterThan(0);
    });

    test('string with ST escape $n', () => {
      const { tokens } = tokenize("'hello$nworld'");
      expect(tokens[0].type).toBe(TokenType.STRING_LITERAL);
    });

    test('unterminated string at newline', () => {
      const { errors } = tokenize("'hello\n");
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('unterminated block comment', () => {
    test('produces error', () => {
      const { errors } = tokenize('(* unterminated');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('Unterminated block comment');
    });
  });

  describe('identifier vs compound keyword rollback', () => {
    test('identifiers with underscores work', () => {
      const { tokens } = tokenize('myVar_name');
      expect(tokens[0].type).toBe(TokenType.IDENTIFIER);
      expect(tokens[0].value).toBe('myVar_name');
    });
  });

  describe('number edge cases', () => {
    test('integer followed by range operator', () => {
      const types = tokenTypes('1..10');
      expect(types[0]).toBe(TokenType.INTEGER_LITERAL);
      expect(types[1]).toBe(TokenType.RANGE);
      expect(types[2]).toBe(TokenType.INTEGER_LITERAL);
    });

    test('integer with exponent (no decimal)', () => {
      const { tokens } = tokenize('1e5');
      expect(tokens[0].type).toBe(TokenType.REAL_LITERAL);
      expect(tokens[0].value).toBe('1e5');
    });

    test('base prefix with no digits produces error', () => {
      const { tokens, errors } = tokenize('16#;');
      expect(tokens[0].type).toBe(TokenType.INTEGER_LITERAL);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('all punctuation tokens', () => {
    test('( ) [ ] , ; # = + - /', () => {
      expect(tokenTypes('(')[0]).toBe(TokenType.LPAREN);
      expect(tokenTypes(')')[0]).toBe(TokenType.RPAREN);
      expect(tokenTypes('[')[0]).toBe(TokenType.LBRACKET);
      expect(tokenTypes(']')[0]).toBe(TokenType.RBRACKET);
      expect(tokenTypes(',')[0]).toBe(TokenType.COMMA);
      expect(tokenTypes(';')[0]).toBe(TokenType.SEMICOLON);
      expect(tokenTypes('#')[0]).toBe(TokenType.HASH);
      expect(tokenTypes('=')[0]).toBe(TokenType.EQ);
      expect(tokenTypes('+')[0]).toBe(TokenType.PLUS);
      expect(tokenTypes('-')[0]).toBe(TokenType.MINUS);
      expect(tokenTypes('/')[0]).toBe(TokenType.SLASH);
      expect(tokenTypes('&')[0]).toBe(TokenType.AMP);
    });
  });

  describe('more keyword coverage', () => {
    test('primitive type keywords', () => {
      expect(tokenTypes('BOOL')[0]).toBe(TokenType.BOOL);
      expect(tokenTypes('SINT')[0]).toBe(TokenType.SINT);
      expect(tokenTypes('DINT')[0]).toBe(TokenType.DINT);
      expect(tokenTypes('LINT')[0]).toBe(TokenType.LINT);
      expect(tokenTypes('REAL')[0]).toBe(TokenType.REAL);
      expect(tokenTypes('LREAL')[0]).toBe(TokenType.LREAL);
      expect(tokenTypes('BYTE')[0]).toBe(TokenType.BYTE);
      expect(tokenTypes('WORD')[0]).toBe(TokenType.WORD);
      expect(tokenTypes('DWORD')[0]).toBe(TokenType.DWORD);
      expect(tokenTypes('USINT')[0]).toBe(TokenType.USINT);
      expect(tokenTypes('UINT')[0]).toBe(TokenType.UINT);
      expect(tokenTypes('UDINT')[0]).toBe(TokenType.UDINT);
      expect(tokenTypes('ULINT')[0]).toBe(TokenType.ULINT);
      expect(tokenTypes('TIME')[0]).toBe(TokenType.TIME);
      expect(tokenTypes('DATE')[0]).toBe(TokenType.DATE);
    });

    test('control flow keywords', () => {
      expect(tokenTypes('FOR')[0]).toBe(TokenType.FOR);
      expect(tokenTypes('TO')[0]).toBe(TokenType.TO);
      expect(tokenTypes('BY')[0]).toBe(TokenType.BY);
      expect(tokenTypes('DO')[0]).toBe(TokenType.DO);
      expect(tokenTypes('WHILE')[0]).toBe(TokenType.WHILE);
      expect(tokenTypes('REPEAT')[0]).toBe(TokenType.REPEAT);
      expect(tokenTypes('UNTIL')[0]).toBe(TokenType.UNTIL);
      expect(tokenTypes('RETURN')[0]).toBe(TokenType.RETURN);
      expect(tokenTypes('EXIT')[0]).toBe(TokenType.EXIT);
      expect(tokenTypes('CONTINUE')[0]).toBe(TokenType.CONTINUE);
    });

    test('operator keywords', () => {
      expect(tokenTypes('MOD')[0]).toBe(TokenType.MOD);
      expect(tokenTypes('AND')[0]).toBe(TokenType.AND);
      expect(tokenTypes('OR')[0]).toBe(TokenType.OR);
      expect(tokenTypes('XOR')[0]).toBe(TokenType.XOR);
      expect(tokenTypes('NOT')[0]).toBe(TokenType.NOT);
    });

    test('ARRAY and STRUCT keywords', () => {
      expect(tokenTypes('ARRAY')[0]).toBe(TokenType.ARRAY);
      expect(tokenTypes('OF')[0]).toBe(TokenType.OF);
      expect(tokenTypes('STRUCT')[0]).toBe(TokenType.STRUCT);
      expect(tokenTypes('END_STRUCT')[0]).toBe(TokenType.END_STRUCT);
      expect(tokenTypes('TYPE')[0]).toBe(TokenType.TYPE);
      expect(tokenTypes('END_TYPE')[0]).toBe(TokenType.END_TYPE);
    });

    test('STRING and WSTRING keywords', () => {
      expect(tokenTypes('STRING')[0]).toBe(TokenType.STRING_TYPE);
      expect(tokenTypes('WSTRING')[0]).toBe(TokenType.WSTRING_TYPE);
    });
  });
});
