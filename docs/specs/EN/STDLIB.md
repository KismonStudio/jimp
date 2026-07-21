# JIMP Standard Library v1

[Portuguese version](../PT/STDLIB.md)

> This file is generated from [`stdlib/v1.json`](../../../stdlib/v1.json). Do not edit it manually.

## Status

This document specifies the approved P4.2 catalog and the P4.3 portable-fallback contract. The modules are not yet shipped by the compiler or linker.

## Architecture

- Standard modules are resolved by the compiler from a selected toolchain catalog; they are never searched in the project filesystem.
- Portable exports are ordinary JIMP functions statically linked into the output module.
- Host-backed exports lower through typed Host ABI imports and generic `HOST_CALL`; the VM contains no console, math, JSON, network, or standard-library opcode.
- Importing a standard module includes only the transitively used exports and their dependencies.
- A compiled `.jbc` does not require the standard-library source package at runtime.
- Portable implementations are the default; optional native replacements are a link-time optimization selected only for an explicitly compatible target.

## Initial catalog

- `std:console`: Explicit console output through a typed Host ABI bridge and portable wrappers.
- `std:math/i64`: Deterministic helpers for signed 64-bit integers implemented in portable JIMP.

| Module | Kind | Export signature | Default implementation | Optional native capability | Contract |
| --- | --- | --- | --- | --- | --- |
| `std:console` | Hybrid | `write(message: STRING): VOID` | Host ABI: `std.console.write` | — | Writes the message exactly and does not append a line feed. |
| `std:console` | Hybrid | `writeLine(message: STRING): VOID` | Portable JIMP | — | Writes the message followed by one line-feed character through write. |
| `std:math/i64` | Portable JIMP | `absolute(value: I64): I64` | Portable JIMP: [`src/math/i64.jimp`](../../../stdlib/src/math/i64.jimp) | `std.math.i64.absolute` | Returns the non-negative magnitude; the minimum I64 value follows checked-negation overflow behavior. |
| `std:math/i64` | Portable JIMP | `minimum(left: I64, right: I64): I64` | Portable JIMP: [`src/math/i64.jimp`](../../../stdlib/src/math/i64.jimp) | `std.math.i64.minimum` | Returns left when left is less than or equal to right; otherwise returns right. |
| `std:math/i64` | Portable JIMP | `maximum(left: I64, right: I64): I64` | Portable JIMP: [`src/math/i64.jimp`](../../../stdlib/src/math/i64.jimp) | `std.math.i64.maximum` | Returns left when left is greater than or equal to right; otherwise returns right. |
| `std:math/i64` | Portable JIMP | `sign(value: I64): I64` | Portable JIMP: [`src/math/i64.jimp`](../../../stdlib/src/math/i64.jimp) | `std.math.i64.sign` | Returns -1 for negative values, 0 for zero, and 1 for positive values. |

## Resolution and versioning

The `std:` namespace is reserved by the source-module contract. Specifiers have no inline version. A compiler selects exactly one standard-library major profile through its toolchain or lock configuration and records that choice in reproducible build metadata. Unknown modules and exports are compile errors. Project files cannot shadow `std:` modules. Catalog major versions may remove or incompatibly change exports; compatible additions remain in the same major profile.

## Linking and behavior

Standard-library calls obey the same exact parameter and return typing as project-module calls. Portable implementations use existing language semantics and sandbox budgets. Host bridges declare their capability and signature as catalog data, so compiler lowering does not identify APIs by hardcoded function names. The linker deduplicates one implementation per selected export identity and emits ordinary functions, constants, typed host imports, and generic instructions.

## Portable fallback selection

- The linker selects the portable source by default and emits ordinary JIMP functions and `CALL` instructions.
- A native replacement may be selected only when an explicit target profile guarantees the catalog capability with the exact declared signature and semantics.
- Selection occurs before `.jbc` emission. Exactly one implementation of each export is linked; unused alternatives and host imports are omitted.
- The runtime does not probe for an optional import, retry a failed host call, or switch implementations during execution.
- If a native-targeted `.jbc` reaches a host without the promised capability, normal Host ABI resolution rejects the module before execution. It does not fall back dynamically.
- Build metadata must record the selected target profile. The default portable target remains independent of optional native capabilities.

## Native equivalence requirements

A native replacement must preserve the public signature, returned value, checked-I64 overflow behavior, deterministic error boundary, and absence of observable side effects of its portable source. It may use fewer execution steps, but it remains subject to Host ABI authorization and runtime policy. Native replacement is forbidden for an export whose behavior cannot be made observably equivalent, including inherently external effects such as console output. The standard-library major catalog pins this semantic contract.

## Security and capability policy

Importing a host-backed export does not grant authority. The resulting Host ABI import must still be available, signature-compatible, and allowed by runtime policy before execution. Portable functions receive no ambient authority. Unused host bridges must not appear in the linked `.jbc`. The complete trust and effect boundary is defined by the [sandbox and security model](SECURITY.md).

## Deliberate exclusions

JSON, fetch/networking, files, time, randomness, collections, and text-processing APIs are not in the first catalog. Their contracts require structured or binary values, explicit capability models, deterministic limits, or asynchronous behavior that the current language does not yet define. They must not be simulated through new VM opcodes.

## P4.2 design acceptance

P4.2 is complete because this catalog is the single reviewed source for the initial public module surface, its generated EN/PT references are current, and the VM-independent lowering boundary is explicit. Shipping implementations and linker support remain implementation work.

## P4.3 design acceptance

P4.3 is complete when every optional native capability has a catalog-linked portable source whose syntax, semantics, lack of host imports, and exact public signature pass generation checks; the default and native selection rules above are normative; and no optional-import flag, runtime probe, or standard-library opcode is added to the portable format. Compiler/linker consumption of this contract remains subsequent implementation work.
