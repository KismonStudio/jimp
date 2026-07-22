# Changelog

All notable changes to JIMP are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- P7.5 nominal recoverable result records plus portable `std:result`, Unicode-scalar `std:text`, and immutable `std:collections/i64` APIs.
- Portable `.jbc` 2.9 generic `STRING_LENGTH`, `STRING_LOAD`, `STRING_SLICE`, and `STRING_CONCAT` instructions with independent JavaScript/Rust verification and deterministic bounds failures.
- P7.6 typed `std:json` document/result API backed by data-defined, pure Host ABI support rather than a keyword or JSON-specific VM instruction.
- Deterministic JSON validation and compact canonicalization preserving numeric lexemes and object member order, rejecting duplicate decoded keys, and enforcing input, output, nesting, and value-count limits.
- A reviewed data example covering recoverable text, collection, and JSON behavior.
- Normative English and Portuguese specifications for recoverable results, JSON behavior, and the P7.7 capability prerequisites for future file and network APIs.
- Bilingual specification-first P8, P9, and P10 roadmaps for tagged variants, exhaustive matching, generics, bounded recursive values, `BYTES`, structured JSON, asynchronous capability integrations, files, HTTP, deterministic packages, lockfiles, verified caches, registry policy, and a versioned host-extension SDK.
- Typed immutable arrays with contextual empty literals, nesting, I64 indexed access, `.length`, functional indexed updates, function parameters and returns, deterministic bounds failures, and structural equality.
- Nominal records with module-scoped and exported declarations, exact field initialization, field access, functional multi-field updates, structural equality, and exact contracts across named imports and function boundaries.
- Portable `.jbc` 2.8 generic `HEAP_REPLACE` and resource-bounded `HEAP_EQUAL` instructions, independently verified and executed by JavaScript and Rust without exposing reference identity.
- A reviewed aggregate example covering observable value semantics for arrays and records.
- Normative English and Portuguese aggregate-value specifications covering typed arrays, nominal records, immutable value semantics, functional updates, aliasing, structural equality, exact control-flow joins, and acyclic ownership.
- Portable `.jbc` 2.7 generic heap foundation with opaque `HEAP_REF`, atomic immutable allocation, typed indexed access, length access, independent JavaScript/Rust verification, and inspector support.
- Deterministic cumulative sandbox limits for heap objects, slots, logical bytes, and nesting depth, with execution-local handles excluded from constants and the Host ABI.
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
- Generic `JUMP`, `JUMP_IF_FALSE`, and `JUMP_IF_TRUE` instructions with function-relative targets.
- Control-flow verification for instruction boundaries, reachability, and register types on every incoming path.
- Conditional execution and short-circuit coverage across the JavaScript compiler and Rust runtime.
- Flow-sensitive conditional type joins that allow mutable variables to converge to a new type when all paths agree.
- Compiler and integration coverage for convergent, divergent, and implicit no-`else` type paths.
- Top-level functions with explicit parameter and return types, forward calls, recursion, isolated scopes, and exact call-contract analysis.
- `return` statements with complete-path validation for value-returning functions and implicit returns for `VOID` functions.
- Generic typed `CALL` and `RETURN` instructions with independently verified call contracts in JavaScript and Rust.
- Rust VM call frames with argument transfer, return destinations, and recursive execution.
- `while` loops with nested `break` and `continue` support lowered to generic backward branches.
- Fixed-point control-flow type verification for cyclic instruction graphs.
- Runtime safeguards of 1,000,000 execution steps and 1024 simultaneous call frames.
- Function and loop examples plus end-to-end coverage for recursion, loop control, and limit failures.
- Machine-readable `jimp-reference-sandbox` v1 limits with generated JavaScript, Rust, English, and Portuguese artifacts.
- Pre-allocation limits for module size, sections, constants, UTF-8 strings, symbols, host imports, functions, parameters, code, decoded instructions, registers, and type-flow analysis.
- Runtime accounting for active registers and logical value memory across frames, string values, calls, and returns.
- Independent JavaScript and Rust tests for load, verification, stack, memory, and execution-step budgets.
- Machine-readable `jimp-error-v1` definitions with generated JavaScript, Rust, English, and Portuguese artifacts.
- Stable error codes for CLI usage, I/O, compilation, bytecode decoding and verification, host-import resolution, execution, and unexpected internal failures.
- Optional source-line and bytecode-offset locations in standard diagnostics.
- One-line JSON diagnostics through `--error-format=json` in the compiler, inspector, and runtime CLIs.
- End-to-end structured-error coverage across compiler and runtime phases.
- Optional `.jbc` debug section mapping global instruction offsets to one-based source lines.
- Compiler emission and inspector display of source-line mappings for every generated instruction.
- Independent JavaScript and Rust validation for debug-section flags, versions, ordering, source lines, and instruction boundaries.
- Runtime execution diagnostics enriched with the mapped source line of the failing instruction.
- End-to-end coverage carrying source locations from `.jimp` compilation into Rust JSON errors.
- English and Portuguese P4.1 target specifications for static source imports, named function exports, canonical project-root resolution, cycle rejection, and deterministic linking.
- Machine-readable P4.2 standard-library v1 catalog with generated English and Portuguese references.
- Initial `std:console` and `std:math/i64` API contracts separated into portable JIMP functions and declarative Host ABI bridges.
- Generated-artifact validation for the standard-library catalog in the project quality gate.
- Machine-readable P4.3 fallback policy with portable-by-default, link-time selection and target-guaranteed native replacements.
- Canonical portable JIMP implementations for `std:math/i64`, validated for syntax, semantics, exact catalog signatures, and absence of host imports during documentation generation.
- Optional `std.math.i64.*` Host ABI replacement contracts that preserve portable behavior without runtime capability probing or standard-library VM instructions.
- English and Portuguese P4.4 sandbox-security specifications covering the untrusted-bytecode threat model, pre-effect validation order, capability confinement, host requirements, deployment guidance, and explicit non-guarantees.
- P5.1 parsing for named function imports, local aliases, function exports, import placement, and entry-module restrictions.
- Semantic import bindings backed by resolver-supplied exact signatures and module-qualified identities, plus generated export tables for later static linking.
- Module-qualified compiler diagnostics and optional `moduleId` metadata in `jimp-error-v1` source locations.
- Secure project-root resolver with strict relative `.jimp` specifiers, UTF-8 source snapshots, real-path containment, physical and case-alias detection, source-order graph traversal, mutation checks, and cycle rejection.
- Deterministic static linker for module-qualified function identities, exact export contracts, topological function allocation, and cross-module lowering through generic `CALL`.
- Portable `.jbc` 2.6 debug metadata carrying portable module IDs with source lines, independently validated and reported by the inspector and Rust runtime.
- Compiler CLI support for compiling acyclic multi-file projects into one self-contained bytecode file.
- Embedded, generator-validated standard-library sources resolved exclusively through the reserved `std:` namespace.
- Standard-library tree shaking and deduplicated lowering of portable exports through generic `CALL` and catalog-declared host bridges through typed `HOST_CALL`.
- Canonical `std:console.writeLine` implementation and end-to-end imports for `std:console` and `std:math/i64`.
- Machine-readable target profiles with generated JavaScript, Rust, English, and Portuguese artifacts.
- Explicit compiler options for project root, standard-library major, and target profile, plus explicit runtime target selection.
- Optional `.jbc` 2.6 build metadata for the target profile, standard-library major, entry module, and sorted target guarantees.
- Independent Rust validation that build metadata matches the selected runtime target and cannot grant host authority.
- Native `std.math.i64.*` reference capabilities with portable/native semantic and checked-overflow parity coverage.
- Unified installable `jimp` CLI with `run`, `compile`, `check`, `inspect`, `init`, help, and version commands.
- Deterministic compile-before-run temporary lifecycle with target and structured-error forwarding to the independently validating Rust runtime.
- Package-controlled runtime discovery, explicit path/environment overrides, and an exact compiler/runtime version-protocol handshake.
- Source-distributed npm package contents, optimized runtime build command, and isolated pack/install/build/run compatibility coverage.
- Reviewed public examples for project modules, standard-library portable/native targets, structured failures, inspection, validation, and safe project initialization.
- English P6 toolchain guide documenting installation, command behavior, runtime discovery, compatibility, and the no-overwrite initialization policy.
- Windows and Linux quality/release workflows with locked runtime builds, platform-specific npm archives, SHA-256 checksums, artifact manifests, and generated release notes.
- Pinned Rust 1.94.1 toolchain for reproducible CI and release-candidate inputs.
- Public `jimp-conformance-v1` suite covering language, bytecode, Host ABI, standard-library, target-profile, diagnostics, sandbox, and compatibility contracts without compiler-internal imports.
- Published compatibility matrix for bytecode 2.9, runtime protocol 1, Host ABI and standard-library major 1, target profiles, and structured diagnostics.
- Source-buffer `jimp repl` sessions with explicit edit/run commands and fresh-VM execution through the normal compiler and runtime trust boundary.

### Fixed

- Canonicalized project-root aliases before deriving portable module IDs, preventing Windows short and long path forms from causing false project-root escape failures.
- Runtime now rejects bytecode whose declared instruction count continues after `HALT`.

### Changed

- The active compiler and runtime now use exact portable `.jbc` format `2.9`; legacy format 1 and portable formats `2.0` through `2.8` are no longer accepted.
- Standard-library generation now validates module-level canonical sources, nominal record exports, array and record type contracts, and transitive portable dependencies.
- The standalone runtime now exposes bounded pure JSON support capabilities in addition to console output; it still grants no filesystem or network authority.
- Extended the implementation roadmap with P6 milestones for a unified CLI, installable runtime discovery, tested examples, cross-platform releases, conformance, and a later REPL evaluation.
- Added a specification-first P7 roadmap for resource-bounded aggregate values, arrays, records, recoverable errors, collection/text APIs, `std:json`, and capability-gated file/network prerequisites without domain-specific VM instructions.
- Extended the implementation roadmap through P10 with explicit dependency ordering: expressive value types before asynchronous I/O, and asynchronous/data-driven host contracts before the package and extension ecosystem.
- Extended the implementation roadmap with P5 milestones for module parsing, secure graph resolution, deterministic linking, module-aware debug identity, standard-library delivery, and explicit native target profiles.
- Runtime decoding and verification now complete before VM execution begins.
- Console effects are isolated behind a host interface and are unavailable to the bytecode decoder.
- Runtime code is separated into portable decoding, VM, and host modules.
- Source-level `print` is lowered to `LOAD_CONST` plus the typed `std.console.write` host import instead of a hardcoded VM opcode.
- Host effects are dispatched through resolved numeric capability handles and runtime-checked value arrays.
- The bytecode inspector now disassembles the portable module structure and generic ISA instructions.
- `print` now accepts any expression statically resolved as `STRING` while remaining a compiler lowering to host calls.
- Rust portable verification now separates structural instruction decoding from control-flow type propagation, avoiding dependence on physical branch layout.
- Jump targets may now point backward, while every encoded instruction must remain reachable and type-safe on all incoming paths.
- Host-call arguments are borrowed directly and function returns move values between frames, avoiding redundant VM-side string copies.
- Compiler, inspector, and runtime CLI failures now share one human-readable error layout and consistent usage/error exit codes.

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
