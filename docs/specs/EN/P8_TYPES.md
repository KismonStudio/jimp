# P8 Type-System and Binary-Data Roadmap

[Portuguese version](../PT/P8_TYPES.md)

## Status

This document is the approved implementation roadmap for P8. It is not an implemented language contract. Syntax, bytecode encodings, and public APIs remain unavailable until their individual specification-first tasks are completed and pass the full quality gate.

P8 provides the type-system and value-model prerequisites for structured JSON, binary data, and later asynchronous I/O. It must preserve immutable value semantics, exact static typing, deterministic resource accounting, independent JavaScript/Rust verification, and the rule that standard-library API names never become VM instructions.

## P8.1 — Tagged variants

Specify and implement nominal tagged variants capable of carrying differently typed payloads. The design must define declaration and construction syntax, module visibility, nominal identity, equality, nesting, function contracts, control-flow joins, and representation in portable bytecode.

Acceptance requires valid cross-module construction and transport, deterministic rejection of unknown or duplicate alternatives, exact payload types, independently verified lowering, and no exposed storage identity or native pointer.

## P8.2 — Exhaustive pattern matching

Specify and implement pattern matching over tagged variants. Matching must be statically exhaustive unless an explicit catch-all form is approved. The contract must define binding scope, alternative ordering, unreachable patterns, nested patterns, guards if any, result-type joins, and left-to-right evaluation.

Acceptance requires the compiler to reject missing, duplicate, impossible, type-incompatible, and unreachable alternatives before bytecode emission. Lowering must use generic control flow and value access rather than an opcode for `match` or any public variant name.

## P8.3 — Parametric types and functions

Specify and implement compile-time generics for records, variants, and functions. The first required public abstractions are `Option<T>` and `Result<T, E>`. The design must choose and document monomorphization or another statically verifiable representation, generic constraints, inference boundaries, module export identity, recursion rules, diagnostic presentation, and code-size limits.

There is no runtime reflection or erased unchecked cast. Every instantiated call and value must have an exact verified contract. Existing nominal P7 result records remain supported until a documented compatibility and migration policy is delivered.

## P8.4 — Bounded recursive immutable values

Specify recursive type declarations and finite immutable runtime values without permitting cyclic object graphs. The compiler must reject invalid infinite-size declarations or require an approved indirection through a tagged alternative. The runtime must enforce depth, allocation, traversal, equality, and serialization budgets without relying on the native call stack for untrusted depth.

Acceptance requires construction, matching, equality, and function transport for finite recursive values; deterministic rejection or bounded failure for excessive depth; and proof through tests that bytecode cannot manufacture a cycle or forge a heap reference.

## P8.5 — Immutable `BYTES`

Specify and implement `BYTES` as an immutable, resource-charged sequence of octets distinct from STRING and `[I64]`. The approved surface must cover literals or constructors, length, indexed load, half-open slicing, concatenation, equality, UTF-8 encode/decode with typed failures, function and module contracts, and inspector output.

Bounds use I64 indices. Invalid direct access fails deterministically, while standard-library helpers expose recoverable results. Bytecode adds only generic binary-value primitives required by the value model; file formats, HTTP bodies, compression, images, and other domains remain standard-library or host concerns.

## P8.6 — Structured `JsonValue`

Evolve `std:json` from the P7 text-backed `JsonDocument` boundary to a typed recursive JSON value built from variants, immutable collections, and exact number text. The contract must preserve the existing duplicate-key, ordering, Unicode, canonicalization, number-lexeme, diagnostic, and resource-limit decisions.

Migration must retain a documented path for `JsonDocument`. Parsing, serialization, and conversion remain catalog-defined APIs; JSON does not become a keyword, source intrinsic, bytecode type, or opcode.

## P8.7 — Compatibility and conformance

Publish bilingual normative specifications, generated artifacts where applicable, compatibility consequences, positive and negative conformance fixtures, malformed-bytecode cases, resource-limit tests, and package/install coverage for the complete P8 surface.

P8 is complete only when tagged variants, exhaustive matching, generics, recursive values, `BYTES`, and structured JSON work across source modules and the independently validating runtime under deterministic limits.

## Delivery order and constraints

The required order is P8.1, P8.2, P8.3, P8.4, P8.5, P8.6, then P8.7. A task may refine a previous design, but implementation must not skip an unmet prerequisite. Format changes remain exact and pre-stable; a new bytecode minor is introduced only when portable representation or instruction changes require it.

P8 does not add asynchronous execution, filesystem or network authority, a package registry, runtime type reflection, exceptions, implicit nullability, or domain-specific VM instructions.
