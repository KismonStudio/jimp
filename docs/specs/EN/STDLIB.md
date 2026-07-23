# AUREON Standard Library v1

[Portuguese version](../PT/STDLIB.md)

> This file is generated from [`stdlib/v1.json`](../../../stdlib/v1.json). Do not edit it manually.

## Status

This document specifies the standard-library catalog and portable-source contract implemented through P8.3. The compiler resolves these embedded modules without project-filesystem lookup and statically links only used exports.

## Architecture

- Standard modules are resolved by the compiler from a selected toolchain catalog; they are never searched in the project filesystem.
- Portable exports are ordinary AUREON functions statically linked into the output module.
- Host-backed exports lower through typed Host ABI imports and generic `HOST_CALL`; the VM contains no console, math, JSON, network, or standard-library opcode.
- Importing a standard module includes only the transitively used exports and their dependencies.
- A compiled `.abc` does not require the standard-library source package at runtime.
- Portable implementations are the default; optional native replacements are a link-time optimization selected only for an explicitly compatible target.

## Current catalog

- `std:console`: Explicit console output through a typed Host ABI bridge and portable wrappers.
- `std:math/i64`: Deterministic helpers for signed 64-bit integers implemented in portable AUREON.
- `std:option`: Generic optional values with exhaustive pattern matching.
- `std:result`: Explicit nominal result values for recoverable string-producing operations.
- `std:text`: Portable Unicode-scalar text length, concatenation, indexed access, and slicing.
- `std:collections/i64`: Portable search and recoverable replacement helpers for immutable I64 arrays.
- `std:json/support`: Total scalar Host ABI primitives used by the typed std:json wrapper.
- `std:json`: Typed recoverable JSON parsing and deterministic serialization over validated documents.

| Module | Kind | Export signature | Default implementation | Optional native capability | Contract |
| --- | --- | --- | --- | --- | --- |
| `std:console` | Hybrid | `write(message: STRING): VOID` | Host ABI: `std.console.write` | — | Writes the message exactly and does not append a line feed. |
| `std:console` | Hybrid | `writeLine(message: STRING): VOID` | Portable AUREON: [`src/console.aur`](../../../stdlib/src/console.aur) | — | Writes the message followed by one line-feed character through write. |
| `std:math/i64` | Portable AUREON | `absolute(value: I64): I64` | Portable AUREON: [`src/math/i64.aur`](../../../stdlib/src/math/i64.aur) | `std.math.i64.absolute` | Returns the non-negative magnitude; the minimum I64 value follows checked-negation overflow behavior. |
| `std:math/i64` | Portable AUREON | `minimum(left: I64, right: I64): I64` | Portable AUREON: [`src/math/i64.aur`](../../../stdlib/src/math/i64.aur) | `std.math.i64.minimum` | Returns left when left is less than or equal to right; otherwise returns right. |
| `std:math/i64` | Portable AUREON | `maximum(left: I64, right: I64): I64` | Portable AUREON: [`src/math/i64.aur`](../../../stdlib/src/math/i64.aur) | `std.math.i64.maximum` | Returns left when left is greater than or equal to right; otherwise returns right. |
| `std:math/i64` | Portable AUREON | `sign(value: I64): I64` | Portable AUREON: [`src/math/i64.aur`](../../../stdlib/src/math/i64.aur) | `std.math.i64.sign` | Returns -1 for negative values, 0 for zero, and 1 for positive values. |
| `std:option` | Portable AUREON | `variant Option<T> { None(), Some(value: T) }` | Nominal portable type | — | Represents either no value or one value of type T. |
| `std:result` | Portable AUREON | `variant Result<T, E> { Ok(value: T), Error(error: E) }` | Nominal portable type | — | Represents either a successful value of type T or an error of type E. |
| `std:result` | Portable AUREON | `record StringResult { ok: BOOL, value: STRING, error: STRING }` | Nominal portable type | — | Carries an explicit success flag, string value, and deterministic error message. |
| `std:result` | Portable AUREON | `stringSuccess(value: STRING): StringResult` | Portable AUREON: [`src/result.aur`](../../../stdlib/src/result.aur) | — | Creates a successful StringResult. |
| `std:result` | Portable AUREON | `stringFailure(error: STRING): StringResult` | Portable AUREON: [`src/result.aur`](../../../stdlib/src/result.aur) | — | Creates a failed StringResult with an empty fallback value. |
| `std:text` | Portable AUREON | `length(value: STRING): I64` | Portable AUREON: [`src/text.aur`](../../../stdlib/src/text.aur) | — | Returns the Unicode scalar-value count. |
| `std:text` | Portable AUREON | `concat(left: STRING, right: STRING): STRING` | Portable AUREON: [`src/text.aur`](../../../stdlib/src/text.aur) | — | Concatenates two strings. |
| `std:text` | Portable AUREON | `at(value: STRING, index: I64): StringResult` | Portable AUREON: [`src/text.aur`](../../../stdlib/src/text.aur) | — | Returns one Unicode scalar value or an explicit bounds error. |
| `std:text` | Portable AUREON | `slice(value: STRING, start: I64, end: I64): StringResult` | Portable AUREON: [`src/text.aur`](../../../stdlib/src/text.aur) | — | Returns a half-open Unicode scalar range or an explicit bounds error. |
| `std:collections/i64` | Portable AUREON | `record I64ArrayResult { ok: BOOL, value: [I64], error: STRING }` | Nominal portable type | — | Carries an immutable I64 array or a recoverable error. |
| `std:collections/i64` | Portable AUREON | `contains(values: [I64], expected: I64): BOOL` | Portable AUREON: [`src/collections/i64.aur`](../../../stdlib/src/collections/i64.aur) | — | Returns whether the array contains the expected value. |
| `std:collections/i64` | Portable AUREON | `indexOf(values: [I64], expected: I64): I64` | Portable AUREON: [`src/collections/i64.aur`](../../../stdlib/src/collections/i64.aur) | — | Returns the first index or -1 when absent. |
| `std:collections/i64` | Portable AUREON | `replace(values: [I64], index: I64, replacement: I64): I64ArrayResult` | Portable AUREON: [`src/collections/i64.aur`](../../../stdlib/src/collections/i64.aur) | — | Returns an updated array or an explicit bounds error while preserving the input. |
| `std:json/support` | Host ABI bridge | `validate(source: STRING): BOOL` | Host ABI: `std.json.validate` | — | Returns whether the input is valid and within the JSON resource limits. |
| `std:json/support` | Host ABI bridge | `canonicalize(source: STRING): STRING` | Host ABI: `std.json.canonicalize` | — | Returns deterministic compact JSON, or an empty string for invalid input. |
| `std:json/support` | Host ABI bridge | `diagnostic(source: STRING): STRING` | Host ABI: `std.json.diagnostic` | — | Returns a deterministic validation diagnostic, or an empty string when valid. |
| `std:json` | Portable AUREON | `record JsonDocument { text: STRING }` | Nominal portable type | — | A JSON document represented by deterministic compact UTF-8 text. |
| `std:json` | Portable AUREON | `record JsonResult { ok: BOOL, value: JsonDocument, error: STRING }` | Nominal portable type | — | Carries a validated document or a recoverable deterministic parse error. |
| `std:json` | Portable AUREON | `parse(source: STRING): JsonResult` | Portable AUREON: [`src/json.aur`](../../../stdlib/src/json.aur) | — | Validates and canonicalizes JSON without throwing a language-level exception. |
| `std:json` | Portable AUREON | `stringify(document: JsonDocument): StringResult` | Portable AUREON: [`src/json.aur`](../../../stdlib/src/json.aur) | — | Serializes a document or reports an explicit validation error. |

## Resolution and versioning

The `std:` namespace is reserved by the source-module contract. Specifiers have no inline version. A compiler selects exactly one standard-library major profile through its toolchain or lock configuration and records that choice in reproducible build metadata. Unknown modules and exports are compile errors. Project files cannot shadow `std:` modules. Catalog major versions may remove or incompatibly change exports; compatible additions remain in the same major profile.

## Linking and behavior

Standard-library calls obey the same exact parameter and return typing as project-module calls. Portable implementations use existing language semantics and sandbox budgets. Host bridges declare their capability and signature as catalog data, so compiler lowering does not identify APIs by hardcoded function names. The linker deduplicates one implementation per selected export identity and emits ordinary functions, constants, typed host imports, and generic instructions.

## Portable fallback selection

- The linker selects the portable source by default and emits ordinary AUREON functions and `CALL` instructions.
- A native replacement may be selected only when an explicit target profile guarantees the catalog capability with the exact declared signature and semantics.
- Selection occurs before `.abc` emission. Exactly one implementation of each export is linked; unused alternatives and host imports are omitted.
- The runtime does not probe for an optional import, retry a failed host call, or switch implementations during execution.
- If a native-targeted `.abc` reaches a host without the promised capability, normal Host ABI resolution rejects the module before execution. It does not fall back dynamically.
- Build metadata must record the selected target profile. The default portable target remains independent of optional native capabilities.

## Native equivalence requirements

A native replacement must preserve the public signature, returned value, checked-I64 overflow behavior, deterministic error boundary, and absence of observable side effects of its portable source. It may use fewer execution steps, but it remains subject to Host ABI authorization and runtime policy. Native replacement is forbidden for an export whose behavior cannot be made observably equivalent, including inherently external effects such as console output. The standard-library major catalog pins this semantic contract.

## Security and capability policy

Importing a host-backed export does not grant authority. The resulting Host ABI import must still be available, signature-compatible, and allowed by runtime policy before execution. Portable functions receive no ambient authority. Unused host bridges must not appear in the linked `.abc`. The complete trust and effect boundary is defined by the [sandbox and security model](SECURITY.md).

## Deliberate exclusions

Files, networking, time, randomness, and asynchronous I/O are not exposed by the current catalog. Their future contracts require explicit capability, binary-value, cancellation, and deterministic-limit semantics described in [IO_CAPABILITIES.md](IO_CAPABILITIES.md). They must not be simulated through new VM opcodes.

## P4.2 design acceptance

The catalog remains the single reviewed source for the public standard-module surface, its generated EN/PT references are current, and the VM-independent lowering boundary is explicit. P7.5 adds portable result, text, and I64 collection modules. P7.6 adds the typed `std:json` wrapper and its data-defined pure Host ABI support bridge.

## P4.3 design acceptance

Every portable function export has catalog-linked canonical source whose syntax, semantics, allowed host imports, dependencies, and exact public signature pass generation checks. Nominal record and variant exports are validated from the same source contract. The compiler and linker consume that data without optional-import flags, runtime probes, or standard-library opcodes.
