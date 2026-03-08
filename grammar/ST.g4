/**
 * ANTLR4 Grammar for IEC 61131-3 Structured Text
 *
 * This grammar documents the formal syntax of Structured Text as supported
 * by the st2js transpiler. The hand-written lexer (src/lexer/Lexer.js) is
 * what is actually used at runtime; this file serves as a reference.
 */
grammar ST;

// ─── Top-Level ───────────────────────────────────────────────────────────────

compilationUnit
    : ( functionDeclaration
      | functionBlockDeclaration
      | programDeclaration
      | typeDeclaration
      )*
      EOF
    ;

// ─── Program Organization Units ──────────────────────────────────────────────

functionDeclaration
    : FUNCTION identifier ( COLON dataType )? varSection* statementList END_FUNCTION
    ;

functionBlockDeclaration
    : FUNCTION_BLOCK identifier varSection* statementList END_FUNCTION_BLOCK
    ;

programDeclaration
    : PROGRAM identifier varSection* statementList END_PROGRAM
    ;

// ─── Type Declarations ──────────────────────────────────────────────────────

typeDeclaration
    : TYPE typeDefinition+ END_TYPE
    ;

typeDefinition
    : identifier COLON typeSpec SEMICOLON
    ;

typeSpec
    : structSpec
    | enumSpec
    | arraySpec
    | subrangeSpec
    | dataType
    ;

structSpec
    : STRUCT structField+ END_STRUCT
    ;

structField
    : identifier COLON dataType ( ASSIGN expression )? SEMICOLON
    ;

enumSpec
    : LPAREN enumValue ( COMMA enumValue )* RPAREN ( dataType )?
    ;

enumValue
    : identifier ( ASSIGN expression )?
    ;

subrangeSpec
    : dataType LPAREN expression RANGE expression RPAREN
    ;

// ─── Variable Declarations ──────────────────────────────────────────────────

varSection
    : varKeyword varModifier* varDeclaration* END_VAR
    ;

varKeyword
    : VAR
    | VAR_INPUT
    | VAR_OUTPUT
    | VAR_IN_OUT
    | VAR_GLOBAL
    | VAR_TEMP
    | VAR_EXTERNAL
    ;

varModifier
    : CONSTANT
    | RETAIN
    | PERSISTENT
    ;

varDeclaration
    : identifierList COLON dataType ( ASSIGN expression )? ( AT directVariable )? SEMICOLON
    ;

identifierList
    : identifier ( COMMA identifier )*
    ;

directVariable
    : '%' IDENTIFIER
    ;

// ─── Data Types ─────────────────────────────────────────────────────────────

dataType
    : primitiveType
    | arrayType
    | stringType
    | identifier  // user-defined type
    ;

primitiveType
    : BOOL | BYTE | WORD | DWORD | LWORD
    | SINT | INT | DINT | LINT
    | USINT | UINT | UDINT | ULINT
    | REAL | LREAL
    | TIME | DATE | TIME_OF_DAY | DATE_AND_TIME
    | ANY | ANY_NUM | ANY_INT | ANY_REAL | ANY_BIT | ANY_STRING | ANY_DATE
    ;

arrayType
    : ARRAY LBRACKET subrange ( COMMA subrange )* RBRACKET OF dataType
    ;

subrange
    : expression RANGE expression
    ;

stringType
    : ( STRING_TYPE | WSTRING_TYPE ) ( LBRACKET expression RBRACKET )?
    ;

arraySpec
    : ARRAY LBRACKET subrange ( COMMA subrange )* RBRACKET OF dataType
    ;

// ─── Statements ─────────────────────────────────────────────────────────────

statementList
    : ( statement SEMICOLON )*
    ;

statement
    : assignmentStatement
    | ifStatement
    | caseStatement
    | forStatement
    | whileStatement
    | repeatStatement
    | returnStatement
    | exitStatement
    | continueStatement
    | functionCallStatement
    | /* empty */
    ;

assignmentStatement
    : variable ASSIGN expression
    ;

ifStatement
    : IF expression THEN statementList
      ( ELSIF expression THEN statementList )*
      ( ELSE statementList )?
      END_IF
    ;

caseStatement
    : CASE expression OF
      caseClause+
      ( ELSE statementList )?
      END_CASE
    ;

caseClause
    : caseLabel ( COMMA caseLabel )* COLON statementList
    ;

caseLabel
    : expression ( RANGE expression )?
    ;

forStatement
    : FOR identifier ASSIGN expression TO expression ( BY expression )?
      DO statementList END_FOR
    ;

whileStatement
    : WHILE expression DO statementList END_WHILE
    ;

repeatStatement
    : REPEAT statementList UNTIL expression END_REPEAT
    ;

returnStatement
    : RETURN
    ;

exitStatement
    : EXIT
    ;

continueStatement
    : CONTINUE
    ;

functionCallStatement
    : functionCall
    ;

// ─── Expressions ────────────────────────────────────────────────────────────

expression
    : orExpression
    ;

orExpression
    : xorExpression ( OR xorExpression )*
    ;

xorExpression
    : andExpression ( XOR andExpression )*
    ;

andExpression
    : comparison ( ( AND | AMP ) comparison )*
    ;

comparison
    : addExpression ( ( EQ | NE | LT | LE | GT | GE ) addExpression )?
    ;

addExpression
    : mulExpression ( ( PLUS | MINUS ) mulExpression )*
    ;

mulExpression
    : powerExpression ( ( STAR | SLASH | MOD ) powerExpression )*
    ;

powerExpression
    : unaryExpression ( POWER unaryExpression )*
    ;

unaryExpression
    : ( NOT | MINUS | PLUS )? primaryExpression
    ;

primaryExpression
    : literal
    | functionCall
    | variable
    | LPAREN expression RPAREN
    ;

variable
    : identifier ( DOT identifier | LBRACKET expression ( COMMA expression )* RBRACKET )*
    ;

functionCall
    : identifier LPAREN argumentList? RPAREN
    ;

argumentList
    : argument ( COMMA argument )*
    ;

argument
    : ( identifier ASSIGN )? expression   // named or positional
    ;

// ─── Literals ───────────────────────────────────────────────────────────────

literal
    : INTEGER_LITERAL
    | REAL_LITERAL
    | BOOL_LITERAL
    | STRING_LITERAL
    | TIME_LITERAL
    | DATE_LITERAL
    | typedLiteral
    ;

typedLiteral
    : ( primitiveType | identifier ) HASH literal
    ;

identifier
    : IDENTIFIER
    ;

// ═══════════════════════════════════════════════════════════════════════════════
// LEXER RULES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Keywords - POU ─────────────────────────────────────────────────────────

FUNCTION_BLOCK  : [Ff][Uu][Nn][Cc][Tt][Ii][Oo][Nn] '_' [Bb][Ll][Oo][Cc][Kk] ;
END_FUNCTION_BLOCK : [Ee][Nn][Dd] '_' [Ff][Uu][Nn][Cc][Tt][Ii][Oo][Nn] '_' [Bb][Ll][Oo][Cc][Kk] ;
FUNCTION        : [Ff][Uu][Nn][Cc][Tt][Ii][Oo][Nn] ;
END_FUNCTION    : [Ee][Nn][Dd] '_' [Ff][Uu][Nn][Cc][Tt][Ii][Oo][Nn] ;
PROGRAM         : [Pp][Rr][Oo][Gg][Rr][Aa][Mm] ;
END_PROGRAM     : [Ee][Nn][Dd] '_' [Pp][Rr][Oo][Gg][Rr][Aa][Mm] ;

// ─── Keywords - Variables ───────────────────────────────────────────────────

VAR_INPUT       : [Vv][Aa][Rr] '_' [Ii][Nn][Pp][Uu][Tt] ;
VAR_OUTPUT      : [Vv][Aa][Rr] '_' [Oo][Uu][Tt][Pp][Uu][Tt] ;
VAR_IN_OUT      : [Vv][Aa][Rr] '_' [Ii][Nn] '_' [Oo][Uu][Tt] ;
VAR_GLOBAL      : [Vv][Aa][Rr] '_' [Gg][Ll][Oo][Bb][Aa][Ll] ;
VAR_TEMP        : [Vv][Aa][Rr] '_' [Tt][Ee][Mm][Pp] ;
VAR_EXTERNAL    : [Vv][Aa][Rr] '_' [Ee][Xx][Tt][Ee][Rr][Nn][Aa][Ll] ;
VAR             : [Vv][Aa][Rr] ;
END_VAR         : [Ee][Nn][Dd] '_' [Vv][Aa][Rr] ;
CONSTANT        : [Cc][Oo][Nn][Ss][Tt][Aa][Nn][Tt] ;
RETAIN          : [Rr][Ee][Tt][Aa][Ii][Nn] ;
PERSISTENT      : [Pp][Ee][Rr][Ss][Ii][Ss][Tt][Ee][Nn][Tt] ;
AT              : [Aa][Tt] ;

// ─── Keywords - Types ───────────────────────────────────────────────────────

TYPE            : [Tt][Yy][Pp][Ee] ;
END_TYPE        : [Ee][Nn][Dd] '_' [Tt][Yy][Pp][Ee] ;
STRUCT          : [Ss][Tt][Rr][Uu][Cc][Tt] ;
END_STRUCT      : [Ee][Nn][Dd] '_' [Ss][Tt][Rr][Uu][Cc][Tt] ;
ARRAY           : [Aa][Rr][Rr][Aa][Yy] ;
OF              : [Oo][Ff] ;
STRING_TYPE     : [Ss][Tt][Rr][Ii][Nn][Gg] ;
WSTRING_TYPE    : [Ww][Ss][Tt][Rr][Ii][Nn][Gg] ;

// ─── Primitive Types ────────────────────────────────────────────────────────

BOOL            : [Bb][Oo][Oo][Ll] ;
BYTE            : [Bb][Yy][Tt][Ee] ;
WORD            : [Ww][Oo][Rr][Dd] ;
DWORD           : [Dd][Ww][Oo][Rr][Dd] ;
LWORD           : [Ll][Ww][Oo][Rr][Dd] ;
SINT            : [Ss][Ii][Nn][Tt] ;
INT             : [Ii][Nn][Tt] ;
DINT            : [Dd][Ii][Nn][Tt] ;
LINT            : [Ll][Ii][Nn][Tt] ;
USINT           : [Uu][Ss][Ii][Nn][Tt] ;
UINT            : [Uu][Ii][Nn][Tt] ;
UDINT           : [Uu][Dd][Ii][Nn][Tt] ;
ULINT           : [Uu][Ll][Ii][Nn][Tt] ;
REAL            : [Rr][Ee][Aa][Ll] ;
LREAL           : [Ll][Rr][Ee][Aa][Ll] ;
TIME            : [Tt][Ii][Mm][Ee] ;
DATE            : [Dd][Aa][Tt][Ee] ;
TIME_OF_DAY     : [Tt][Ii][Mm][Ee] '_' [Oo][Ff] '_' [Dd][Aa][Yy]
                | [Tt][Oo][Dd]
                ;
DATE_AND_TIME   : [Dd][Aa][Tt][Ee] '_' [Aa][Nn][Dd] '_' [Tt][Ii][Mm][Ee]
                | [Dd][Tt]
                ;
ANY             : [Aa][Nn][Yy] ;
ANY_NUM         : [Aa][Nn][Yy] '_' [Nn][Uu][Mm] ;
ANY_INT         : [Aa][Nn][Yy] '_' [Ii][Nn][Tt] ;
ANY_REAL        : [Aa][Nn][Yy] '_' [Rr][Ee][Aa][Ll] ;
ANY_BIT         : [Aa][Nn][Yy] '_' [Bb][Ii][Tt] ;
ANY_STRING      : [Aa][Nn][Yy] '_' [Ss][Tt][Rr][Ii][Nn][Gg] ;
ANY_DATE        : [Aa][Nn][Yy] '_' [Dd][Aa][Tt][Ee] ;

// ─── Keywords - Control Flow ────────────────────────────────────────────────

IF              : [Ii][Ff] ;
THEN            : [Tt][Hh][Ee][Nn] ;
ELSIF           : [Ee][Ll][Ss][Ii][Ff] ;
ELSE            : [Ee][Ll][Ss][Ee] ;
END_IF          : [Ee][Nn][Dd] '_' [Ii][Ff] ;
CASE            : [Cc][Aa][Ss][Ee] ;
END_CASE        : [Ee][Nn][Dd] '_' [Cc][Aa][Ss][Ee] ;
FOR             : [Ff][Oo][Rr] ;
TO              : [Tt][Oo] ;
BY              : [Bb][Yy] ;
DO              : [Dd][Oo] ;
END_FOR         : [Ee][Nn][Dd] '_' [Ff][Oo][Rr] ;
WHILE           : [Ww][Hh][Ii][Ll][Ee] ;
END_WHILE       : [Ee][Nn][Dd] '_' [Ww][Hh][Ii][Ll][Ee] ;
REPEAT          : [Rr][Ee][Pp][Ee][Aa][Tt] ;
UNTIL           : [Uu][Nn][Tt][Ii][Ll] ;
END_REPEAT      : [Ee][Nn][Dd] '_' [Rr][Ee][Pp][Ee][Aa][Tt] ;
RETURN          : [Rr][Ee][Tt][Uu][Rr][Nn] ;
EXIT            : [Ee][Xx][Ii][Tt] ;
CONTINUE        : [Cc][Oo][Nn][Tt][Ii][Nn][Uu][Ee] ;

// ─── Keyword Operators ──────────────────────────────────────────────────────

MOD             : [Mm][Oo][Dd] ;
AND             : [Aa][Nn][Dd] ;
OR              : [Oo][Rr] ;
XOR             : [Xx][Oo][Rr] ;
NOT             : [Nn][Oo][Tt] ;

// ─── Boolean Literals ───────────────────────────────────────────────────────

BOOL_LITERAL    : [Tt][Rr][Uu][Ee] | [Ff][Aa][Ll][Ss][Ee] ;

// ─── Time / Date Literals ───────────────────────────────────────────────────

TIME_LITERAL    : ( [Tt] '#' | [Tt][Ii][Mm][Ee] '#' ) TIME_COMPONENT+ ;
fragment TIME_COMPONENT : [0-9]+ ('.' [0-9]+)? [dhmsun]+ ;

DATE_LITERAL    : ( [Dd] '#' | [Dd][Aa][Tt][Ee] '#' ) [0-9][0-9][0-9][0-9] '-' [0-9][0-9] '-' [0-9][0-9] ;

// ─── Numeric Literals ───────────────────────────────────────────────────────

REAL_LITERAL    : [0-9]+ '.' [0-9]+ ( [eE] [+-]? [0-9]+ )?
                | [0-9]+ [eE] [+-]? [0-9]+
                ;

INTEGER_LITERAL : [0-9]+
                | '16#' [0-9a-fA-F]+
                | '8#' [0-7]+
                | '2#' [01]+
                ;

// ─── String Literals ────────────────────────────────────────────────────────

STRING_LITERAL  : '\'' (~['\r\n] | '$$' | '$\'' | '$L' | '$N' | '$R' | '$T')* '\''
                | '"' (~["\r\n] | '$$' | '$"' | '$L' | '$N' | '$R' | '$T')* '"'
                ;

// ─── Identifiers ────────────────────────────────────────────────────────────

IDENTIFIER      : [a-zA-Z_] [a-zA-Z0-9_]* ;

// ─── Operators and Punctuation ──────────────────────────────────────────────

ASSIGN          : ':=' ;
POWER           : '**' ;
NE              : '<>' ;
LE              : '<=' ;
GE              : '>=' ;
RANGE           : '..' ;
EQ              : '=' ;
LT              : '<' ;
GT              : '>' ;
PLUS            : '+' ;
MINUS           : '-' ;
STAR            : '*' ;
SLASH           : '/' ;
AMP             : '&' ;
HASH            : '#' ;
LPAREN          : '(' ;
RPAREN          : ')' ;
LBRACKET        : '[' ;
RBRACKET        : ']' ;
COMMA           : ',' ;
SEMICOLON       : ';' ;
COLON           : ':' ;
DOT             : '.' ;

// ─── Whitespace and Comments ────────────────────────────────────────────────

WS              : [ \t\r\n]+ -> skip ;
LINE_COMMENT    : '//' ~[\r\n]* -> skip ;
BLOCK_COMMENT   : '(*' .*? '*)' -> skip ;
