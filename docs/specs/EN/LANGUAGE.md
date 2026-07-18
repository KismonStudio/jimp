# JIMP Language Syntax v1

[Portuguese version](../PT/LANGUAGE.md)

## Status

This document defines the syntax accepted by the JIMP v1 prototype compiler. It is intentionally minimal and does not specify the future core language.

The keywords, grammar, and examples in this document are normative. Explanatory prose is informative unless it uses the terms **must**, **must not**, **required**, or **invalid**.

## Source encoding and lines

- A source file uses the `.jimp` extension and must be encoded as UTF-8.
- A program consists of zero or more logical lines.
- LF (`U+000A`) and CRLF (`U+000D U+000A`) line endings are supported.
- Leading and trailing whitespace on each logical line is ignored.
- An empty program is valid and produces a program containing only the terminating bytecode instruction.
- Each non-empty, non-comment logical line must contain exactly one complete statement.

## Lexical elements

JIMP v1 has one case-sensitive keyword:

```text
print
```

`PRINT`, `Print`, and other case variations are not keywords.

Whitespace separates `print` from its string literal. Whitespace may also appear before the statement, after the string literal, and around the optional semicolon.

## Comments

A comment begins with `//` after optional leading whitespace and continues to the end of its logical line.

```jimp
// This is a comment.
    // Leading whitespace is allowed.
```

Comments must occupy their own logical line. Inline comments are not supported in v1:

```jimp
print "Hello"; // Invalid in v1.
```

Comment markers inside a string literal are ordinary string content.

## String literals

A string literal begins and ends with a double quote (`"`). It may contain UTF-8 text except for an unescaped double quote, an unescaped backslash, or a raw line ending.

The following escape sequences are supported:

| Escape | Value |
| --- | --- |
| `\\` | Backslash |
| `\"` | Double quote |
| `\n` | Line feed (`U+000A`) |
| `\r` | Carriage return (`U+000D`) |
| `\t` | Horizontal tab (`U+0009`) |

All other escape sequences are invalid. Multiline string literals are not supported.

## Statements

### `print`

The `print` statement writes its decoded string value followed by a line feed through the console host.

```jimp
print "Hello, JIMP!";
print "The semicolon is optional"
print "Escapes: \\"quoted\\" text and a newline\n";
```

At least one whitespace character is required between `print` and the opening double quote.

## Grammar

The grammar uses ISO/IEC 14977-style EBNF. `source-character` denotes a Unicode character decoded from the UTF-8 source. `line-ending` and end-of-file delimit logical lines and are handled before statement recognition.

```ebnf
program          = { logical-line } ;

logical-line     = whitespace,
                   [ comment | print-statement ],
                   whitespace,
                   ( line-ending | end-of-file ) ;

comment          = "//", { comment-character } ;

print-statement  = "print", required-whitespace,
                   string-literal, whitespace,
                   [ ";" ] ;

string-literal   = '"', { string-character | escape-sequence }, '"' ;

escape-sequence  = "\\", ( "\\" | '"' | "n" | "r" | "t" ) ;

whitespace       = { whitespace-character } ;
required-whitespace = whitespace-character, whitespace ;

string-character = source-character
                   - ( '"' | "\\" | "\r" | "\n" ) ;

comment-character = source-character - ( "\r" | "\n" ) ;
line-ending      = "\n" | "\r", "\n" ;
```

`whitespace-character` is any non-line-terminating whitespace character recognized by the compiler implementation.

## Invalid programs

The following inputs are invalid in v1:

```jimp
PRINT "Keywords are case-sensitive";
print"Whitespace is required";
print "Missing closing quote;
print "Unsupported escape: \u0041";
print "One"; print "Two";
let value = "Not part of v1";
```

The compiler must report the logical source line containing invalid syntax and must not emit bytecode for that source file.

## Out of scope

JIMP v1 does not yet define identifiers, variables, numeric or boolean values, expressions, blocks, control flow, functions, modules, imports, or a general Host ABI. Those features require separate specifications before implementation.
