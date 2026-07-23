# AUREON JSON Standard Module v1

[Portuguese version](../PT/JSON.md)

## Status and API

P7.6 implements `std:json` without a JSON keyword, source intrinsic, bytecode type, or JSON opcode.

- `parse(source: STRING): JsonResult` validates and canonicalizes input.
- `stringify(document: JsonDocument): StringResult` validates and serializes a document.
- `JsonDocument { text: STRING }` stores compact canonical UTF-8 JSON.
- `JsonResult { ok: BOOL, value: JsonDocument, error: STRING }` exposes failures as data.

On parse failure, `ok` is false, `value.text` is the safe fallback `null`, and `error` is deterministic. No language exception is raised.

## Data and canonicalization

The parser accepts the JSON null, boolean, number, string, array, and object grammar. AUREON scalar conversion is deliberately not implicit: JSON numbers remain exact validated number lexemes inside `JsonDocument`, avoiding I64 overflow and F64 precision loss.

Canonical output removes insignificant whitespace, preserves number lexemes and object member order, emits one comma or colon where required, and deterministically escapes quotes, reverse solidus, and control characters. Valid Unicode escapes are decoded to scalar values; surrogate pairs are combined and lone surrogates are rejected.

Duplicate object keys are rejected after escape decoding. Array order is preserved. Object keys are not sorted because source order is an observable part of this v1 document representation.

## Resource limits

The reference implementation rejects inputs over `MAX_JSON_INPUT_BYTES`, outputs over `MAX_JSON_OUTPUT_BYTES`, nesting beyond `MAX_JSON_DEPTH`, and documents exceeding `MAX_JSON_VALUES`. Limit failures are returned through `JsonResult` or `StringResult` and do not perform an external host effect.

## Host bridge and portability

The public wrapper is ordinary portable AUREON. Its scalar support module declares the pure, total capabilities `std.json.validate`, `std.json.canonicalize`, and `std.json.diagnostic` as catalog data; calls lower to generic typed `HOST_CALL`. Invalid input never makes these support calls fail: they return false, an empty fallback, or a diagnostic.

A complete JSON tree cannot yet be implemented as canonical portable source because AUREON v1 has no recursive sum types, parametric variants, or numeric-text conversion primitives. This limitation is explicit rather than hidden behind domain opcodes. Conforming hosts that provide `std:json` must implement the exact semantics and limits above; hosts may reject the module during capability resolution when support is unavailable.
