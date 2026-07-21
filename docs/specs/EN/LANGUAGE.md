# JIMP Language Syntax v1

[Portuguese version](../PT/LANGUAGE.md)

## Status

This document defines the complete P2 syntax and semantics accepted by the JIMP compiler through P2.5. The language remains pre-stable.

The keywords, grammar, operator rules, and examples are normative. Explanatory prose is informative unless it uses **must**, **must not**, **required**, or **invalid**.

## Source encoding and lines

- Source files use the `.jimp` extension and UTF-8 encoding.
- LF and CRLF line endings are supported.
- Each non-empty, non-comment logical line contains one complete simple statement or one conditional block delimiter.
- Leading and trailing whitespace is ignored.
- A semicolon at the end of a statement is optional.
- An empty program is valid.

Comments begin with `//` after optional leading whitespace and occupy the rest of their logical line. Inline comments are not supported yet. Comment markers inside strings are ordinary content.

## Reserved words and identifiers

Reserved words are case-sensitive:

```text
if else print true false null let var
```

Identifiers begin with an ASCII letter or underscore and continue with ASCII letters, digits, or underscores. They are case-sensitive, and reserved words cannot be variable names.

## Literals

### Strings

Strings are delimited by double quotes. They support `\\`, `\"`, `\n`, `\r`, and `\t`. An unescaped quote, unescaped backslash, raw line ending, unsupported escape, or missing closing quote is invalid.

### Integers

Integer literals use base-ten digits with an optional leading minus sign. Leading zeroes are forbidden except for `0`. Values must fit signed `i64`, from `-9223372036854775808` through `9223372036854775807`.

### Floating point

Floating-point literals have an integer part followed by a fractional part, an exponent, or both. A fractional part requires digits after the decimal point. An exponent begins with `e` or `E`, may have a sign, and requires digits. Source literals are rounded to IEEE 754 binary64 and must be finite.

### Boolean and null

Boolean literals are `true` and `false`. The null literal is `null`.

Numeric separators, hexadecimal notation, a leading plus sign, `NaN`, and infinity literals are not supported.

## Variables

Variables use lexical block scope. Names must be declared before use and cannot be declared more than once in the same scope. A nested block may shadow a name from an outer scope. Both declaration forms require an initializer:

```jimp
let immutableValue = 42;
var mutableValue = immutableValue + 1;
mutableValue = mutableValue * 2;
```

- `let` creates an immutable variable and cannot be assigned again.
- `var` creates a mutable variable.
- Initializers and assignments accept expressions.
- A mutable variable's current type is tracked in source order and may change after an unconditional assignment.
- Assignments inside a conditional may update an outer variable. After the conditional, every path must converge on the same type.
- For `if` without `else`, the implicit false path retains the incoming type, so the taken path must finish with that same type.
- For `if` with `else`, both explicit paths may converge on a new type even when it differs from the incoming type.
- A declaration inside an `if` or `else` block is unavailable after that block closes.
- Unused declarations are valid.

## Expressions

Primary expressions are literals, variable references, and parenthesized expressions. Operators are left-associative within the same precedence level.

From highest to lowest precedence:

| Precedence | Operators | Operand types | Result |
| ---: | --- | --- | --- |
| 7 | unary `-` | `I64` or `F64` | operand type |
| 7 | unary `!` | `BOOL` | `BOOL` |
| 6 | `*`, `/`, `%` | same numeric type | operand type |
| 5 | `+`, `-` | same numeric type | operand type |
| 4 | `<`, `<=`, `>`, `>=` | same numeric type | `BOOL` |
| 3 | `==`, `!=` | same value type | `BOOL` |
| 2 | `&&` | `BOOL`, `BOOL` | `BOOL` |
| 1 | `||` | `BOOL`, `BOOL` | `BOOL` |

There are no implicit conversions. In particular, mixed `I64`/`F64` arithmetic is invalid, and strings do not support arithmetic or ordered comparison.

`I64` addition, subtraction, multiplication, division, remainder, and negation are checked. Overflow, division by zero, and remainder by zero are runtime errors. `I64` division truncates toward zero. `F64` operations follow IEEE 754 binary64 behavior, so execution may produce non-finite results even though source literals must be finite.

Equality supports `NULL`, `BOOL`, `I64`, `F64`, and `STRING` values when both operands have the same type. IEEE 754 equality rules apply to `F64`, including `NaN != NaN` and `-0.0 == 0.0`.

Operands are evaluated from left to right. `&&` and `||` use short-circuit evaluation: `false && right` does not evaluate `right`, and `true || right` does not evaluate `right`.

## Statements

### `print`

`print` requires a `STRING` expression and writes its value followed by a line feed through the console host.

```jimp
let message = "Hello, JIMP!";
print message;
```

### Declaration and assignment

`let` and `var` declare initialized variables. Assignment replaces the current value of an existing `var`.

### `if` and `else`

`if` requires a `BOOL` expression and a braced block. An optional `else` block executes when the condition is false. Blocks may be empty or nested.

```jimp
if score >= 70 {
  print "Approved";
} else {
  print "Not approved";
}
```

The opening brace must terminate the `if` or `else` logical line. A closing brace occupies its own logical line, except that `} else {` is also accepted. Standalone blocks and `else if` are not defined in P2.

### Expression statement

Any expression may be used as a statement. It is evaluated and its result is discarded.

## Grammar

The grammar uses ISO/IEC 14977-style EBNF. Lexical whitespace may surround operators and punctuation.

```ebnf
program          = { trivia-line | statement-line | if-statement } ;

trivia-line      = whitespace, [ comment ], whitespace, line-boundary ;
statement-line   = whitespace, simple-statement, whitespace, line-boundary ;
simple-statement = print-statement | variable-declaration
                   | variable-assignment | expression-statement ;

if-statement     = if-header, line-ending, block-body,
                   ( close-brace-line,
                     [ { trivia-line }, else-header, line-ending,
                       block-body, close-brace-line ]
                   | close-else-header, line-ending,
                     block-body, close-brace-line ) ;
if-header        = whitespace, "if", required-whitespace,
                   expression, whitespace, "{", whitespace ;
else-header      = whitespace, "else", whitespace, "{", whitespace ;
close-brace-line = whitespace, "}", whitespace, line-boundary ;
close-else-header = whitespace, "}", whitespace, "else",
                    whitespace, "{", whitespace ;
block-body       = { trivia-line | statement-line | if-statement } ;

comment          = "//", { comment-character } ;

print-statement  = "print", required-whitespace,
                   expression, whitespace, [ ";" ] ;

variable-declaration = ( "let" | "var" ), required-whitespace,
                       identifier, whitespace, "=", whitespace,
                       expression, whitespace, [ ";" ] ;

variable-assignment = identifier, whitespace, "=", whitespace,
                      expression, whitespace, [ ";" ] ;

expression-statement = expression, whitespace, [ ";" ] ;

expression       = logical-or-expression ;
logical-or-expression = logical-and-expression,
                        { whitespace, "||", whitespace, logical-and-expression } ;
logical-and-expression = equality-expression,
                         { whitespace, "&&", whitespace, equality-expression } ;
equality-expression = comparison-expression,
                      { whitespace, ( "==" | "!=" ), whitespace, comparison-expression } ;
comparison-expression = additive-expression,
                        { whitespace, ( "<" | "<=" | ">" | ">=" ),
                          whitespace, additive-expression } ;
additive-expression = multiplicative-expression,
                      { whitespace, ( "+" | "-" ), whitespace,
                        multiplicative-expression } ;
multiplicative-expression = unary-expression,
                            { whitespace, ( "*" | "/" | "%" ),
                              whitespace, unary-expression } ;
unary-expression = { ( "!" | "-" ), whitespace }, primary-expression ;
primary-expression = value-literal | identifier
                     | "(", whitespace, expression, whitespace, ")" ;

value-literal    = string-literal | integer-literal | float-literal
                   | "true" | "false" | "null" ;
integer-literal  = [ "-" ], unsigned-integer ;
float-literal    = [ "-" ], unsigned-integer,
                   ( fractional-part, [ exponent-part ] | exponent-part ) ;
unsigned-integer = "0" | nonzero-digit, { digit } ;
fractional-part  = ".", digit, { digit } ;
exponent-part    = ( "e" | "E" ), [ "+" | "-" ], digit, { digit } ;

identifier       = identifier-start, { identifier-start | digit } ;
identifier-start = ASCII-letter | "_" ;
digit            = "0" | "1" | "2" | "3" | "4"
                   | "5" | "6" | "7" | "8" | "9" ;
nonzero-digit    = "1" | "2" | "3" | "4" | "5"
                   | "6" | "7" | "8" | "9" ;

string-literal   = '"', { string-character | escape-sequence }, '"' ;
escape-sequence  = "\\", ( "\\" | '"' | "n" | "r" | "t" ) ;
whitespace       = { whitespace-character } ;
required-whitespace = whitespace-character, whitespace ;
comment-character = source-character - ( "\r" | "\n" ) ;
line-ending      = "\n" | "\r", "\n" ;
line-boundary    = line-ending | end-of-file ;
```

`ASCII-letter` means `A` through `Z` or `a` through `z`. `source-character` is a Unicode character decoded from UTF-8. `whitespace-character` is any compiler-recognized non-line-terminating whitespace character. `end-of-file` is the terminal source boundary.

## Invalid examples

```jimp
let missingInitializer;
let duplicate = 1;
let duplicate = 2;
duplicate = 3;
unknown + 1;
1 + true;
1 + 1.0;
"a" < "b";
print 42;
01;
.5;
9223372036854775808;
1e309;
if 1 {
}
if true
  print "missing braces";
}
if true {
  let local = 1;
}
local;
var divergent = 1;
if true {
  divergent = "text";
} else {
  divergent = false;
}
```

The compiler must report the logical source line containing invalid syntax or semantics and must not emit bytecode.

## Out of scope

JIMP does not yet define standalone blocks, `else if`, loops, backward branches, functions, modules, source-level imports, or a general standard library.
