# P8 Type-System and Binary-Data Roadmap

[Portuguese version](../PT/P8_TYPES.md)

## Status

P8.1 through P8.4 are implemented. Their normative source and representation contract is defined in [VARIANTS_AND_GENERICS.md](VARIANTS_AND_GENERICS.md). P8.5 through P8.7 remain planned and unavailable.

The implementation preserves immutable value semantics, exact static typing, deterministic resource accounting, cross-module nominal identity, and a VM whose instructions do not depend on public language or library names.

## P8.1 — Tagged variants — complete

Nominal `variant` declarations support ordered alternatives with typed payloads, construction through `Type::Alternative(...)`, exact equality, nesting, functions, and module exports. Variants lower to the existing immutable heap representation as an integer tag followed by payload slots.

## P8.2 — Exhaustive pattern matching — complete

`match(value) { Alternative(bindings) => expression, ... }` is statically exhaustive. The compiler rejects missing, duplicate, unknown, incorrectly bound, and result-type-incompatible arms. Bindings are immutable and arm-scoped; `_` discards one payload field. Lowering uses `HEAP_LOAD`, equality, and generic jumps.

Nested patterns, guards, and catch-all alternatives are deliberately deferred. Each match expression currently occupies one logical source line.

## P8.3 — Parametric types and functions — complete

Records, variants, and functions accept type parameters. Type arguments are inferred from exact argument or expected-result types. Unresolved type parameters are compile errors. A generic function is emitted once and uses verified uniform heap boxing at type-variable boundaries, avoiding monomorphized code growth and runtime casts or reflection.

The standard catalog exports `Option<T>` from `std:option` and `Result<T, E>` from `std:result`. Existing P7 result records remain supported. Indexed access and functional indexed update over a naked generic array element type are not yet supported.

## P8.4 — Bounded recursive immutable values — complete

Variants may refer recursively to their own instantiated nominal type, enabling finite structures such as `List<T>`. Values remain acyclic because bytecode can only allocate immutable objects from already verified values and cannot mutate heap slots or forge references. Existing heap allocation, slot, byte, depth, equality-visit, call-frame, and execution-step budgets bound construction and traversal.

Source complexity is additionally bounded by generated limits for type parameters, type nesting, nominal fields, variant alternatives, and match arms.

## P8.5 — Immutable `BYTES` — planned

Specify and implement an immutable, resource-charged octet sequence distinct from `STRING` and `[I64]`, including length, indexing, slicing, concatenation, equality, UTF-8 conversion, module contracts, and inspector output.

## P8.6 — Structured `JsonValue` — planned

Evolve `std:json` from the P7 text-backed `JsonDocument` boundary to a typed recursive JSON value while preserving duplicate-key, ordering, Unicode, canonicalization, number-lexeme, diagnostic, and resource-limit behavior.

## P8.7 — Compatibility and conformance — planned

Complete cross-platform conformance, malformed-bytecode, resource-limit, package-install, compatibility, and migration coverage for the entire P8 surface.

## Delivery constraints

P8.5, P8.6, and P8.7 remain unavailable until implemented. No bytecode version change was required for P8.1–P8.4 because their compiler lowering uses the existing verified immutable-heap and control-flow instructions in `.jbc` 2.9.

P8 does not add asynchronous execution, filesystem or network authority, packages, runtime reflection, exceptions, implicit nullability, or domain-specific VM instructions.
