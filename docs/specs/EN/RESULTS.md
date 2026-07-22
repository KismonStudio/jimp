# JIMP Recoverable Results v1

[Portuguese version](../PT/RESULTS.md)

## Status and boundary

This document specifies the recoverable-result convention implemented by P7.5. A recoverable failure is an ordinary nominal record value. It is not an exception, implicit `NULL`, hidden host-language exception, VM control transfer, or new bytecode value type.

## Result contract

A result record contains these fields in order:

- `ok: BOOL` identifies the active outcome;
- `value: T` carries the successful value or a documented safe fallback;
- `error: STRING` is empty on success and carries a deterministic message on failure.

Constructors must initialize every field. A function returning a result must not terminate execution for a documented normal failure. Callers inspect `ok` explicitly before treating `value` as successful. The fallback remains type-correct so reading either branch cannot cause type confusion.

`std:result` exports `StringResult`, `stringSuccess`, and `stringFailure`. Other modules may define nominal result records for exact aggregate types, such as `I64ArrayResult` and `JsonResult`. Distinct result records are not structurally interchangeable.

## Text primitives

STRING indexing and ranges count Unicode scalar values, not UTF-8 bytes or grapheme clusters:

```jimp
let value = "Olá"
let scalar = value[2]
let prefix = value[0:2]
let joined = prefix + scalar
let count = value.length
```

`value[index]` returns one-scalar STRING. `value[start:end]` uses a half-open range. Direct invalid index or range access is a deterministic execution failure. `std:text.at` and `std:text.slice` check bounds first and return `StringResult`, while `length` and `concat` are total.

## Collection primitives

Arrays retain the P7.3 length, indexing, and immutable update semantics. `std:collections/i64` adds portable `contains`, `indexOf`, and recoverable `replace`. A failed replacement returns `I64ArrayResult { ok: false, value: original, error: ... }`; no partial update occurs.

## Portable representation and limits

Result and collection values lower to the existing immutable generic heap. The VM does not know `Result`, text-module function names, or collection-module function names. Format 2.9 adds only independently verified STRING length, scalar load, half-open slice, and concatenation instructions. Produced strings remain subject to active-register logical value-memory and execution-step budgets.
