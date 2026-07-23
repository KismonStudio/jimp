# AUREON Language Syntax v1

[Portuguese version](../PT/LANGUAGE.md)

## Status

This document defines the core source-language syntax and semantics implemented through P8.4, including Unicode-scalar STRING operations, typed arrays, nominal and generic records, tagged variants, exhaustive matching, generic functions, bounded recursive immutable values, named imports and exports, secure static project graphs, and catalog-backed `std:` modules. The language and portable format remain pre-stable.

The keywords, grammar, type rules, and examples are normative. Explanatory prose is informative unless it uses **must**, **must not**, **required**, or **invalid**.

## Source encoding and lines

- Source files use the `.aur` extension and UTF-8 encoding.
- LF and CRLF line endings are supported.
- Each non-empty logical line contains one complete simple statement or block delimiter.
- Leading and trailing whitespace is ignored.
- A semicolon at the end of a simple statement is optional.
- An empty program is valid.

Comments begin with `//` after optional leading whitespace and occupy the rest of their logical line. Inline comments are not supported. Comment markers inside strings are ordinary content.

## Reserved words and identifiers

Reserved words are case-sensitive:

```text
as break continue else export false from function if import let match null print record return true var variant while with
```

Identifiers begin with an ASCII letter or underscore and continue with ASCII letters, digits, or underscores. They are case-sensitive.

## Types and literals

The scalar value types are `NULL`, `BOOL`, `I64`, `F64`, and `STRING`. An array type is written `[T]`; its element type cannot be `NULL` or `VOID`. Record and variant types use the name of a visible nominal declaration and must provide all declared generic arguments, such as `Box<I64>` or `Option<STRING>`. Aggregate and generic types may be nested. `VOID` is permitted only as a function return type and never denotes a runtime value.

- Strings use double quotes and support `\\`, `\"`, `\n`, `\r`, and `\t`.
- Integers use base-ten digits with an optional leading minus sign and must fit signed `i64`.
- Floating-point literals have a fractional part, an exponent, or both. They are rounded to finite IEEE 754 binary64 values.
- Boolean literals are `true` and `false`; the null literal is `null`.

Numeric separators, hexadecimal notation, a leading plus sign, `NaN`, infinity literals, and implicit conversions are not supported.

## Variables and lexical scope

Both declaration forms require an initializer:

```aureon
let immutableValue = 42;
var mutableValue: I64 = immutableValue + 1;
mutableValue = mutableValue * 2;
```

- `let` creates an immutable variable; `var` creates a mutable variable.
- Either form may include an optional exact `: Type` annotation before `=`. Empty array literals require such a contextual type or another exact aggregate context.
- Names must be declared before use and may not be duplicated in one scope.
- Nested blocks may shadow outer variables.
- A mutable variable's current type is tracked in source order.
- Conditional paths must converge on the same type for every outer variable that remains reachable.
- An outer variable assigned in a loop must preserve the type it had when the loop was entered.
- Variables declared inside a block are unavailable after the block closes.
- A variable name may not conflict with a function name.
- A variable or parameter name may not conflict with a visible record name.

## Expressions

Primary expressions are scalar and array literals, record literals, variable references, function calls, and parenthesized expressions. Postfix indexed access, STRING slicing, `.length`, and record-field access bind more tightly than unary operators. Functional updates with `with` have the lowest precedence. Function arguments, literal members, update operands, and binary operands are evaluated from left to right.

From highest to lowest precedence:

| Precedence | Operators | Operand types | Result |
| ---: | --- | --- | --- |
| 9 | call, indexed access, STRING slice, `.length`, field access | exact call contract; array or STRING plus `I64`; STRING plus two `I64`; array, STRING, or record | declared return, element or one-scalar STRING, STRING, `I64`, or field type |
| 8 | array and record literals | exact homogeneous/contextual elements or complete declared fields | aggregate type |
| 7 | unary `-` | `I64` or `F64` | operand type |
| 7 | unary `!` | `BOOL` | `BOOL` |
| 6 | `*`, `/`, `%` | same numeric type | operand type |
| 5 | `+`, `-` | same numeric type; `+` also accepts two STRING values | operand type |
| 4 | `<`, `<=`, `>`, `>=` | same numeric type | `BOOL` |
| 3 | `==`, `!=` | same non-`VOID` value type | `BOOL` |
| 2 | `&&` | `BOOL`, `BOOL` | `BOOL` |
| 1 | `||` | `BOOL`, `BOOL` | `BOOL` |
| 0 | `with [index] = value`, `with { field: value, ... }` | exact array element or record field types | base aggregate type |

`&&` and `||` short-circuit. Checked `I64` arithmetic reports overflow and zero-divisor errors at runtime. `F64` operations follow IEEE 754 binary64 behavior.

A `VOID` call may be used as an expression statement, but its result cannot initialize or assign a variable, be printed, returned as a value, or participate in another expression.

Arrays and records have immutable value semantics. Indexed or field assignment is invalid; a `with` expression returns a new value and leaves the original unchanged. `==` and `!=` compare same-typed aggregates structurally. See [AGGREGATES.md](AGGREGATES.md) for exact initialization, nominal identity, module visibility, bounds failures, and sandbox behavior.

STRING length, indexing, and slicing count Unicode scalar values rather than UTF-8 bytes. `value[index]` returns a one-scalar STRING, `value[start:end]` uses a half-open range, and STRING `+` concatenates. Invalid direct indices and ranges fail execution deterministically; the portable [`std:text`](STDLIB.md) helpers expose recoverable alternatives described by [RESULTS.md](RESULTS.md). Typed JSON document processing is provided by [`std:json`](JSON.md), not by source syntax.

Records are declared at module scope, with one typed field per logical line:

```aureon
record Point {
  x: I64,
  y: I64,
}

let origin = Point { y: 0, x: 0 }
let moved = origin with { x: 4 }
```

Generic records, tagged variants, exhaustive matching, and bounded recursive values are defined normatively in [VARIANTS_AND_GENERICS.md](VARIANTS_AND_GENERICS.md). For example:

```aureon
variant Option<T> {
  None,
  Some(value: T),
}

let option: Option<I64> = Option::Some(42);
let value = match(option) { Some(item) => item, None => 0 };
```

## Functions

Functions are named, declared at program scope, and require explicit parameter and return types. A function may declare inferred invariant type parameters after its name:

```aureon
function add(left: I64, right: I64): I64 {
  return left + right;
}

let answer = add(20, 22);

function identity<T>(value: T): T {
  return value;
}
```

- Parameter types may be `BOOL`, `I64`, `F64`, `STRING`, or any visible aggregate type.
- Return types may additionally be `NULL`, `VOID`, or any visible aggregate type.
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

```aureon
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
top-level-item   = statement | function-declaration | record-declaration
                   | variant-declaration ;

record-declaration = record-header, line-ending,
                     { trivia-line | record-field-line }, close-brace-line ;
record-header    = whitespace, "record", required-whitespace,
                   identifier, [ generic-parameters ], whitespace, "{" ;
record-field-line = whitespace, identifier, whitespace, ":", whitespace,
                    value-type, [ whitespace, "," ], whitespace, line-boundary ;

variant-declaration = variant-header, line-ending,
                      { trivia-line | variant-alternative-line }, close-brace-line ;
variant-header   = whitespace, "variant", required-whitespace,
                   identifier, [ generic-parameters ], whitespace, "{" ;
variant-alternative-line = whitespace, identifier,
                           [ whitespace, "(", whitespace, [ parameter-list ],
                             whitespace, ")" ], [ whitespace, "," ],
                           whitespace, line-boundary ;
generic-parameters = whitespace, "<", whitespace, identifier,
                     { whitespace, ",", whitespace, identifier },
                     whitespace, ">" ;

function-declaration = function-header, line-ending, block-body,
                       close-brace-line ;
function-header  = whitespace, "function", required-whitespace,
                   identifier, [ generic-parameters ], whitespace, "(", whitespace,
                   [ parameter-list ], whitespace, ")", whitespace,
                   ":", whitespace, return-type, whitespace, "{" ;
parameter-list   = parameter, { whitespace, ",", whitespace, parameter } ;
parameter        = identifier, whitespace, ":", whitespace, parameter-type ;
parameter-type   = "BOOL" | "I64" | "F64" | "STRING" | aggregate-type ;
return-type      = "NULL" | parameter-type | "VOID" ;
value-type       = "NULL" | "BOOL" | "I64" | "F64" | "STRING" | aggregate-type ;
type-argument    = "NULL" | parameter-type ;
aggregate-type   = identifier, [ whitespace, "<", whitespace, type-argument,
                   { whitespace, ",", whitespace, type-argument }, whitespace, ">" ]
                   | "[", whitespace, parameter-type, whitespace, "]" ;

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
                       identifier, [ whitespace, ":", whitespace, value-type ],
                       whitespace, "=", whitespace,
                       expression, [ ";" ] ;
variable-assignment = identifier, whitespace, "=", whitespace,
                      expression, [ ";" ] ;
return-statement = "return", [ required-whitespace, expression ], [ ";" ] ;
break-statement  = "break", [ ";" ] ;
continue-statement = "continue", [ ";" ] ;
expression-statement = expression, [ ";" ] ;

expression       = update-expression ;
update-expression = logical-or-expression,
                    { required-whitespace, "with", required-whitespace,
                      ( "[", whitespace, expression, whitespace, "]",
                        whitespace, "=", whitespace, expression
                      | "{", whitespace, field-initializer-list,
                        whitespace, "}" ) } ;
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
unary-expression = { ( "!" | "-" ), whitespace }, postfix-expression ;
postfix-expression = primary-expression,
                     { whitespace,
                       ( "[", whitespace, expression,
                         [ whitespace, ":", whitespace, expression ],
                         whitespace, "]"
                       | ".", identifier ) } ;
primary-expression = value-literal | array-literal | record-literal
                     | variant-literal | match-expression
                     | function-call | identifier
                     | "(", whitespace, expression, whitespace, ")" ;
function-call    = identifier, whitespace, "(", whitespace,
                   [ argument-list ], whitespace, ")" ;
variant-literal  = identifier, whitespace, "::", whitespace, identifier,
                   whitespace, "(", whitespace, [ argument-list ], whitespace, ")" ;
match-expression = "match", whitespace, "(", whitespace, expression, whitespace,
                   ")", whitespace, "{", whitespace, match-arm,
                   { whitespace, ",", whitespace, match-arm },
                   [ whitespace, "," ], whitespace, "}" ;
match-arm        = identifier, [ whitespace, "(", whitespace,
                   [ identifier, { whitespace, ",", whitespace, identifier } ],
                   whitespace, ")" ], whitespace, "=>", whitespace, expression ;
argument-list    = expression, { whitespace, ",", whitespace, expression } ;
array-literal    = "[", whitespace,
                   [ expression, { whitespace, ",", whitespace, expression },
                     [ whitespace, "," ] ], whitespace, "]" ;
record-literal   = identifier, whitespace, "{", whitespace,
                   field-initializer-list, whitespace, "}" ;
field-initializer-list = [ field-initializer,
                           { whitespace, ",", whitespace, field-initializer },
                           [ whitespace, "," ] ] ;
field-initializer = identifier, whitespace, ":", whitespace, expression ;

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

```aureon
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
let unknown = [];
let mixed = [1, "two"];
origin.x = 4;
```

The compiler must report the logical source line containing invalid syntax or semantics and must not emit bytecode.

## Out of scope

The current compiler does not yet implement standalone blocks, `else if`, closures, first-class functions, default or variadic parameters, in-place aggregate mutation, exceptions, or file/network authority. Typed [arrays and records](AGGREGATES.md), recoverable [result records](RESULTS.md), the portable [heap](HEAP.md), static project graphs, imported calls, the current [standard library](STDLIB.md), and explicit [target profiles](TARGETS.md) are implemented. Future external I/O follows the separately reviewed [capability design](IO_CAPABILITIES.md).
