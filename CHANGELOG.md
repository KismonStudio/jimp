# Changelog

All notable changes to JIMP are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `.jbc` bytecode inspector with human-readable disassembly and JSON output.
- Inspector validation for instruction bounds, UTF-8 operands, termination, and trailing data.
- Formal JIMP v1 source-syntax specifications in English and Portuguese.
- Compiler conformance tests for valid and excluded v1 syntax.
- Automated compiler-to-runtime integration tests for valid and corrupted bytecode.
- Cross-platform `npm run check` command for all local quality gates.
- English and Portuguese target specifications for portable VM values, registers, module sections, typed host imports, and generic instructions.
- Schema-defined and generator-validated portable ISA source with deterministic JavaScript, Rust, and bilingual documentation generation.
- Portable `.jbc` 2.0 module encoder and decoder with a section directory, scalar constant pool, typed host-import table, function metadata, and ISA-driven code encoding.
- Portable-container validation for bounds, section overlap, required sections, string references, signatures, and entry functions.
- Rust portable-container decoder and typed host-import resolver with numeric handles, capability allowlists, availability checks, and signature validation.
- Cross-language JavaScript-to-Rust validation for portable `.jbc` 2.0 modules.
- ISA-driven portable instruction verification in JavaScript and Rust, including register, constant, import, type, operand-boundary, and termination checks.
- Generic Rust register-machine execution for `LOAD_CONST`, `MOVE`, `HOST_CALL`, and `HALT`.
- Source-language scalar literals for signed `i64`, finite `f64`, boolean, and `null` values.
- Exact signed-i64 range validation and finite IEEE 754 binary64 parsing diagnostics.
- A dedicated source parser that produces typed statements before portable bytecode lowering.
- Lexically scoped immutable `let` and mutable `var` declarations with required expression initializers.
- Semantic analysis for declaration-before-use, duplicate names, reserved names, and immutable reassignment.
- Persistent VM register allocation for variables plus an isolated temporary register for discarded values and host calls.
- Precedence-aware arithmetic, comparison, equality, unary, and short-circuit boolean expressions.
- Generic typed expression opcodes generated for JavaScript and Rust from the machine-readable ISA.
- Flow-sensitive expression type analysis with same-type numeric rules and no implicit conversions.
- Checked `I64` arithmetic, IEEE 754 `F64` operations, and runtime diagnostics for overflow and zero divisors.
- Temporary-register reuse while lowering expression trees.
- Braced, nestable `if`/`else` blocks with mandatory `BOOL` conditions and block-local declarations.
- Generic forward `JUMP`, `JUMP_IF_FALSE`, and `JUMP_IF_TRUE` instructions with function-relative targets.
- Control-flow verification for instruction boundaries, forward-only targets, reachability, and register types on every incoming path.
- Conditional execution and short-circuit coverage across the JavaScript compiler and Rust runtime.
- Flow-sensitive conditional type joins that allow mutable variables to converge to a new type when all paths agree.
- Compiler and integration coverage for convergent, divergent, and implicit no-`else` type paths.

### Fixed

- Runtime now rejects bytecode whose declared instruction count continues after `HALT`.

### Changed

- Runtime decoding and verification now complete before VM execution begins.
- Console effects are isolated behind a host interface and are unavailable to the bytecode decoder.
- Runtime code is separated into portable decoding, VM, and host modules.
- The active compiler and runtime now use portable `.jbc` format `2.2`; legacy format `1` and portable formats `2.0` and `2.1` are no longer accepted.
- Source-level `print` is lowered to `LOAD_CONST` plus the typed `std.console.write` host import instead of a hardcoded VM opcode.
- Host effects are dispatched through resolved numeric capability handles and runtime-checked value arrays.
- The bytecode inspector now disassembles the portable module structure and generic ISA instructions.
- `print` now accepts any expression statically resolved as `STRING` while remaining a compiler lowering to host calls.
- Rust portable verification now separates structural instruction decoding from control-flow type propagation, avoiding dependence on physical branch layout.

## [0.1.0] - 2026-07-17

### Added

- Initial JavaScript compiler and Rust runtime project structure.
- Minimal `print "text";` source language support.
- Binary JIMP bytecode v1 with `JIMP` magic number, versioning, `PRINT`, and `HALT` instructions.
- Bytecode validation for headers, versions, operand bounds, UTF-8 strings, termination, and trailing data.
- Console output support through the initial runtime host.
- Compiler and runtime unit tests.
- End-to-end example at `examples/hello.jimp`.
- English and Portuguese bytecode specifications, plus English implementation-status documentation.
