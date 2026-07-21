# JIMP Language Syntax v1

[Portuguese version](../PT/LANGUAGE.md)

## Status

This document defines the core source-language syntax and semantics implemented through P5.5, including named imports, aliases, exported functions, secure static project graphs, and catalog-backed `std:` modules. The language and portable format remain pre-stable.

The keywords, grammar, type rules, and examples are normative. Explanatory prose is informative unless it uses **must**, **must not**, **required**, or **invalid**.

## Source encoding and lines

- Source files use the `.jimp` extension and UTF-8 encoding.
- LF and CRLF line endings are supported.
- Each non-empty logical line contains one complete simple statement or block delimiter.
- Leading and trailing whitespace is ignored.
- A semicolon at the end of a simple statement is optional.
- An empty program is valid.

Comments begin with `//` after optional leading whitespace and occupy the rest of their logical line. Inline comments are not supported. Comment markers inside strings are ordinary content.

## Reserved words and identifiers

Reserved words are case-sensitive:

```text
as break continue else export false from function if import let null print return true var while
```

Identifiers begin with an ASCII letter or underscore and continue with ASCII letters, digits, or underscores. They are case-sensitive.

## Types and literals

The value types are `NULL`, `BOOL`, `I64`, `F64`, and `STRING`. `VOID` is permitted only as a function return type and never denotes a runtime value.

- Strings use double quotes and support `\\`, `\"`, `\n`, `\r`, and `\t`.
- Integers use base-ten digits with an optional leading minus sign and must fit signed `i64`.
- Floating-point literals have a fractional part, an exponent, or both. They are rounded to finite IEEE 754 binary64 values.
- Boolean literals are `true` and `false`; the null literal is `null`.

Numeric separators, hexadecimal notation, a leading plus sign, `NaN`, infinity literals, and implicit conversions are not supported.

## Variables and lexical scope

Both declaration forms require an initializer:

```jimp
let immutableValue = 42;
var mutableValue = immutableValue + 1;
mutableValue = mutableValue * 2;
```

- `let` creates an immutable variable; `var` creates a mutable variable.
- Names must be declared before use and may not be duplicated in one scope.
- Nested blocks may shadow outer variables.
- A mutable variable's current type is tracked in source order.
- Conditional paths must converge on the same type for every outer variable that remains reachable.
- An outer variable assigned in a loop must preserve the type it had when the loop was entered.
- Variables declared inside a block are unavailable after the block closes.
- A variable name may not conflict with a function name.

## Expressions

Primary expressions are literals, variable references, function calls, and parenthesized expressions. Function arguments and binary operands are evaluated from left to right.

From highest to lowest precedence:

| Precedence | Operators | Operand types | Result |
| ---: | --- | --- | --- |
| 8 | function call | exact declared parameter types | declared return type |
| 7 | unary `-` | `I64` or `F64` | operand type |
| 7 | unary `!` | `BOOL` | `BOOL` |
| 6 | `*`, `/`, `%` | same numeric type | operand type |
| 5 | `+`, `-` | same numeric type | operand type |
| 4 | `<`, `<=`, `>`, `>=` | same numeric type | `BOOL` |
| 3 | `==`, `!=` | same non-`VOID` value type | `BOOL` |
| 2 | `&&` | `BOOL`, `BOOL` | `BOOL` |
| 1 | `||` | `BOOL`, `BOOL` | `BOOL` |

`&&` and `||` short-circuit. Checked `I64` arithmetic reports overflow and zero-divisor errors at runtime. `F64` operations follow IEEE 754 binary64 behavior.

A `VOID` call may be used as an expression statement, but its result cannot initialize or assign a variable, be printed, returned as a value, or participate in another expression.

## Functions

Functions are named, declared at program scope, and require explicit parameter and return types:

```jimp
function add(left: I64, right: I64): I64 {
  return left + right;
}

let answer = add(20, 22);
```

- Parameter types may be `BOOL`, `I64`, `F64`, or `STRING`.
- Return types may additionally be `NULL` or `VOID`.
- Parameter names are unique within a function and parameters are immutable.
- Calls must provide the exact number and types of arguments; no conversion is performed.
- Calls may precede declarations, and direct or mutual recursion is valid.
- A function has isolated lexical scope and cannot capture variables from program entry or another function.
- A non-`VOID` function must return its declared type on every statically reachable path.
- A `VOID` function may use `return;`; reaching the end performs an implicit empty return.
- `return` is invalid outside a function. Returning a value from `VOID`, or omitting it from a value-returning function, is invalid.

Functions are not first-class values. Calls target a declared identifier directly.

## Conditional and loop statements

`if` and `while` require `BOOL` conditions and braced blocks:

```jimp
var count = 0;
while count < 10 {
  count = count + 1;
  if count == 2 {
    continue;
  }
  if count == 4 {
    break;
  }
}
```

- `if` may have an `else`; blocks may be empty or nested.
- `while` evaluates its condition before every iteration.
- `break` exits the innermost loop; `continue` starts its next condition evaluation.
- `break` and `continue` are invalid outside a loop.
- A statement after an unconditional `return`, `break`, or `continue` in the same block is unreachable and invalid.
- A `while` is not assumed to execute or terminate when checking function returns.

The opening brace terminates its logical line. A closing brace occupies its own logical line, except that `} else {` is accepted. Standalone blocks and `else if` are not defined.

## Other statements

`print expression` requires `STRING` and writes the value followed by a line feed through the console host. It is a source-level construct lowered by the compiler, not a VM opcode.

Any expression may be used as a statement; its result is discarded.

## Grammar

The grammar uses ISO/IEC 14977-style EBNF. Lexical whitespace may surround operators and punctuation.

```ebnf
program          = { trivia-line | top-level-item } ;
top-level-item   = statement | function-declaration ;

function-declaration = function-header, line-ending, block-body,
                       close-brace-line ;
function-header  = whitespace, "function", required-whitespace,
                   identifier, whitespace, "(", whitespace,
                   [ parameter-list ], whitespace, ")", whitespace,
                   ":", whitespace, return-type, whitespace, "{" ;
parameter-list   = parameter, { whitespace, ",", whitespace, parameter } ;
parameter        = identifier, whitespace, ":", whitespace, parameter-type ;
parameter-type   = "BOOL" | "I64" | "F64" | "STRING" ;
return-type      = "NULL" | parameter-type | "VOID" ;

statement        = statement-line | if-statement | while-statement ;
statement-line   = whitespace, simple-statement, whitespace, line-boundary ;
simple-statement = print-statement | variable-declaration
                   | variable-assignment | return-statement
                   | break-statement | continue-statement
                   | expression-statement ;

if-statement     = if-header, line-ending, block-body,
                   ( close-brace-line,
                     [ { trivia-line }, else-header, line-ending,
                       block-body, close-brace-line ]
                   | close-else-header, line-ending,
                     block-body, close-brace-line ) ;
while-statement  = while-header, line-ending, block-body, close-brace-line ;
if-header        = whitespace, "if", required-whitespace,
                   expression, whitespace, "{" ;
else-header      = whitespace, "else", whitespace, "{" ;
while-header     = whitespace, "while", required-whitespace,
                   expression, whitespace, "{" ;
close-brace-line = whitespace, "}", whitespace, line-boundary ;
close-else-header = whitespace, "}", whitespace, "else",
                    whitespace, "{" ;
block-body       = { trivia-line | statement } ;

print-statement  = "print", required-whitespace, expression, [ ";" ] ;
variable-declaration = ( "let" | "var" ), required-whitespace,
                       identifier, whitespace, "=", whitespace,
                       expression, [ ";" ] ;
variable-assignment = identifier, whitespace, "=", whitespace,
                      expression, [ ";" ] ;
return-statement = "return", [ required-whitespace, expression ], [ ";" ] ;
break-statement  = "break", [ ";" ] ;
continue-statement = "continue", [ ";" ] ;
expression-statement = expression, [ ";" ] ;

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
primary-expression = value-literal | function-call | identifier
                     | "(", whitespace, expression, whitespace, ")" ;
function-call    = identifier, whitespace, "(", whitespace,
                   [ argument-list ], whitespace, ")" ;
argument-list    = expression, { whitespace, ",", whitespace, expression } ;

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
trivia-line      = whitespace, [ "//", { comment-character } ],
                   whitespace, line-boundary ;
whitespace       = { whitespace-character } ;
required-whitespace = whitespace-character, whitespace ;
line-ending      = "\n" | "\r", "\n" ;
line-boundary    = line-ending | end-of-file ;
```

`ASCII-letter` means `A` through `Z` or `a` through `z`. `string-character` excludes raw line endings, unescaped quotes, and unescaped backslashes. `comment-character` excludes line endings. `whitespace-character` is any compiler-recognized non-line-terminating whitespace character. `end-of-file` is the terminal source boundary.

## Invalid examples

```jimp
break;
return 1;
function missing(value: I64): I64 {
  if value == 0 {
    return 0;
  }
}
function invalid(value: NULL): VOID {
}
var changing = 1;
while true {
  changing = false;
}
```

The compiler must report the logical source line containing invalid syntax or semantics and must not emit bytecode.

## Out of scope

The current compiler does not yet implement standalone blocks, `else if`, closures, first-class functions, default or variadic parameters, heap values, or exceptions. Static project graphs, imported calls, the initial [standard library](STDLIB.md), and explicit [target profiles](TARGETS.md) are implemented.
