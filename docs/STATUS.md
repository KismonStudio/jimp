# JIMP Implementation Status

**Last updated:** July 22, 2026
**Development version:** 0.1.0

This document tracks the JIMP implementation. The conceptual project definition lives under `docs/specs`; this file records only executable work and the subsequent delivery plan.

## Current milestone: P8.1–P8.4 complete; P8.5–P10 planned

The project has a complete, tested path from source code to execution:

```text
.jimp source file
  -> JavaScript compiler
  -> portable .jbc 2.9 module with optional debug and build metadata
  -> complete verification, explicit target matching, and host-import resolution
  -> Rust runtime
  -> authorized host console and pure JSON support
```

Supported example:

```jimp
let base = 2 + 3 * 4;
var valid = base == 14;
valid = valid && !false;
var message = null;
if valid {
  message = "Hello, JIMP!";
} else {
  message = "Unexpected";
}
print message;

function factorial(value: I64): I64 {
  if value <= 1 {
    return 1;
  } else {
    return value * factorial(value - 1);
  }
}

var count = 0;
while count < 4 {
  count = count + 1;
}
factorial(count);
```

## Implemented

### Project structure and tooling

- [x] Repository split into a JavaScript compiler and Rust runtime.
- [x] `npm test` script for compiler tests.
- [x] Independent Cargo manifest for the runtime.
- [x] Minimal example at `examples/hello.jimp`.
- [x] Generated artifacts (`*.jbc` and `runtime/target/`) ignored by Git.
- [x] Installable `jimp` binary entry with unified run, compile, check, inspect, init, help, and version commands.
- [x] Source-distributed reference runtime with an optimized build command and controlled discovery.
- [x] Reviewed, publicly executable examples and a non-overwriting project template.
- [x] Windows and Linux quality/release workflows with a pinned Rust toolchain and locked dependencies.
- [x] Versioned platform archives with bundled runtimes, checksums, manifests, and generated release notes.
- [x] Public versioned conformance suite and exact compatibility matrix.
- [x] Source-buffer REPL that reuses the normal compiler/runtime pipeline.

### Compiler

- [x] CLI: `node compiler/src/cli.js compile <input.jimp> -o <output.jbc>`.
- [x] UTF-8 source-file reading.
- [x] `//` line comments.
- [x] `print` statement with a string literal.
- [x] Typed `i64`, `f64`, boolean, and `null` literal statements.
- [x] Exact signed-i64 parsing and finite-f64 validation.
- [x] Parser separated from portable bytecode lowering.
- [x] Lexically scoped immutable `let` and mutable `var` declarations.
- [x] Declaration-before-use, duplicate-declaration, and immutability analysis.
- [x] Persistent variable-register allocation with an isolated temporary register.
- [x] Precedence-aware arithmetic, comparison, equality, unary, and boolean expressions.
- [x] Flow-sensitive expression type analysis with no implicit conversions.
- [x] Reusable temporary-register allocation for expression trees.
- [x] Nested `if`/`else` parsing with mandatory braced blocks.
- [x] Lexical block scopes with shadowing and declaration-before-use analysis.
- [x] Mandatory `BOOL` conditional expressions and complete same-type convergence across control-flow joins.
- [x] Mutable variables may converge to a new type when every conditional path agrees.
- [x] Short-circuit lowering for `&&` and `||` through generic conditional jumps.
- [x] String escapes: `\\`, `\"`, `\n`, `\r`, and `\t`.
- [x] Syntax diagnostics with source line numbers.
- [x] Top-level typed functions with immutable parameters and explicit returns.
- [x] Forward and recursive calls with isolated function scopes.
- [x] `while`, `break`, and `continue` with nested-loop control flow.
- [x] Rejection of unreachable statements and incomplete non-`VOID` returns.
- [x] Loop-safe type analysis that preserves outer-variable types.
- [x] Early compiler diagnostics for function, parameter, variable-register, and symbol limits.
- [x] Portable `.jbc` 2.6 emission with optional module-and-line debug mappings.
- [x] `.jbc` inspection in readable and JSON formats.
- [x] Standard compiler and inspector diagnostics with stable phase codes, optional locations, and human or JSON output.

### Portable bytecode 2.6

- [x] Header with `JIMP` magic number, format version, entry function, and section directory.
- [x] Little-endian multibyte integer encoding.
- [x] Scalar constant pool, typed host imports, function metadata, and code sections.
- [x] Generic data movement, arithmetic, comparison, boolean, bidirectional-control-flow, function-call, host-call, return, and termination instructions.
- [x] Typed `CALL` and `RETURN` contracts generated from the ISA source of truth.
- [x] Fixed-point register-type verification across cyclic control-flow graphs.
- [x] Machine-readable sandbox profile with generated JavaScript, Rust, and bilingual references.
- [x] Optional, non-authoritative debug section mapping instruction offsets to portable module IDs and one-based source lines.
- [x] Validation that debug mappings are ordered and reference decoded instruction boundaries.
- [x] Pre-allocation limits for module sections, constants, strings, symbols, imports, functions, signatures, code, instructions, registers, and flow-analysis state.
- [x] Contract published in English and Portuguese under `docs/specs/EN` and `docs/specs/PT`.
- [x] Formal v1 source syntax published in English and Portuguese.
- [x] Machine-readable ISA source with generated JavaScript, Rust, and bilingual references.
- [x] Legacy `.jbc` format 1 documented as historical and no longer accepted.

### Runtime

- [x] File-based bytecode loading.
- [x] Magic number and version validation.
- [x] Read-boundary and incomplete-operand validation.
- [x] Rejection of unknown opcodes and invalid UTF-8 text.
- [x] Required `HALT` termination.
- [x] Rejection of trailing bytes after termination.
- [x] Console host implementation for the typed `std.console.write` capability.
- [x] Complete decode-and-verify phase before VM execution.
- [x] Host interface isolated from bytecode decoding.
- [x] Portable 2.6 container and optional module-aware debug-section decoding in Rust.
- [x] Typed host-import resolution to numeric handles with explicit capability policy.
- [x] ISA-driven operand decoding and generic register-machine execution.
- [x] Runtime type checks before every host invocation.
- [x] Checked `I64` arithmetic and IEEE 754 `F64` execution.
- [x] Independent Rust verification of typed expression operands.
- [x] Bidirectional jump-boundary, reachability, and path-sensitive register-type verification.
- [x] Structural instruction decoding separated from control-flow type propagation.
- [x] Program-counter execution for verified unconditional and conditional jumps.
- [x] Isolated call frames, typed argument transfer, return destinations, and recursion.
- [x] Deterministic limits for execution steps, simultaneous call frames, and active registers.
- [x] Logical runtime value-memory accounting across register writes, arguments, frames, and returns.
- [x] File-size rejection before the runtime CLI reads an oversized module.
- [x] Standard runtime diagnostics classified by I/O, decoding, verification, host resolution, and execution phase.
- [x] Machine-readable `jimp-error-v1` output through `--error-format=json` with consistent CLI exit codes.
- [x] Runtime execution errors enriched with the current mapped source line when available.

### Quality

- [x] Compiler unit tests for bytecode emission and syntax errors.
- [x] Runtime unit tests for valid bytecode and invalid magic numbers.
- [x] Manual end-to-end test compiling and executing `examples/hello.jimp`.
- [x] Bytecode inspector tests for decoding, formatting, count mismatches, and trailing data.
- [x] Automated compiler-to-runtime integration tests for valid and corrupted bytecode.
- [x] Cross-platform local validation command: `npm run check`.
- [x] End-to-end coverage for recursion, `VOID` calls, loops, `break`, `continue`, and execution-limit failures.
- [x] Cross-language sandbox-limit coverage for structural, verification, stack, and memory failures.
- [x] Generated cross-language error-code contract with English and Portuguese specifications.
- [x] End-to-end JSON error coverage for compiler, decode, verification, and execution failures.
- [x] Cross-language module-and-line coverage from compiler lowering through Rust runtime diagnostics.
- [x] Public-command coverage for compilation-before-runtime, temporary cleanup, runtime discovery, project initialization, every reviewed example, and structured failures.
- [x] Isolated npm pack/install/runtime-build/run coverage outside the repository, including version-handshake rejection.
- [x] Release-package installation and public conformance execution with no compiler-internal imports.
- [x] REPL integration coverage through the independent Rust runtime.

## Next tasks

### P0 — consolidate the v1 contract

1. [x] Write a formal v1 language-syntax specification.
   - Acceptance criterion: grammar, lexical rules, comments, and escapes are unambiguous.
2. [x] Separate decoding/verification from the runtime execution loop.
   - Acceptance criterion: malformed bytecode is fully rejected before it can create an observable host effect.
3. [x] Add automated compiler-to-runtime integration tests.
   - Acceptance criterion: valid programs and corrupted bytecode cases run in local CI.

### P1 — portable VM foundation

1. [x] Specify the v1 value, virtual-register, module-section, and generic instruction models.
2. [x] Create a machine-readable ISA definition as the source of truth for tooling.
3. [x] Implement the constant pool and host import table in `.jbc`.
4. [x] Implement typed host-import resolution and capability validation.
5. [x] Replace the temporary `PRINT` opcode with generic `LOAD_CONST` and `HOST_CALL` instructions.

Acceptance criterion: the same `.jbc` invokes a named console capability without the VM or instruction set containing a `PRINT` concept.

### P2 — core language

1. [x] Implement numeric, boolean, and `null` values.
2. [x] Implement immutable and mutable variables with declaration-and-use analysis.
3. [x] Implement arithmetic, comparison, and boolean expressions.
4. [x] Implement conditional branches and blocks (`if` / `else`).
5. [x] Complete semantic type checks across control-flow joins and lower the complete P2 language to generic VM instructions.

Acceptance criterion: a program can declare values, calculate an expression, and select a conditional path; the compiler rejects undeclared identifiers and type incompatibilities defined by the specification.

### P3 — structured execution

1. [x] Implement functions, parameters, returns, and a call stack.
2. [x] Implement loops and backward control-flow instructions.
3. [x] Define sandbox memory, stack, and execution limits.
4. [x] Create a standard error format for compiler and runtime.
5. [x] Add debug metadata mapping bytecode back to source lines.

### P4 — modules and standard library

1. [x] Specify imports, exports, and module resolution.
   - The approved target is static, function-only source modules linked into one `.jbc`; compiler implementation remains subsequent work.
2. [x] Design the first standard library independent from the VM.
   - The generated v1 catalog starts with portable `std:math/i64` helpers and a data-defined `std:console` Host ABI bridge; shipping implementations remain subsequent work.
3. [x] Define portable fallback implementations for optional native host capabilities.
   - Link-time selection defaults to compiler-validated portable JIMP sources; native Host ABI replacements require an explicit compatible target profile and never trigger runtime probing.
4. [x] Document the sandbox model and security guarantees.
   - The P4.4 contract defines the untrusted-bytecode threat model, pre-effect validation boundary, capability confinement, deterministic VM budgets, host obligations, deployment guidance, and explicit non-guarantees.

### P5 — module linker and standard-library delivery

1. [x] Implement source-module syntax and semantic symbols.
   - Parse the P4.1 `import`, `export`, `from`, and `as` grammar, enforce import placement and function-only exports, and represent imported and exported bindings without changing existing single-file behavior.
   - Acceptance criterion: parser and analyzer tests cover valid declarations, aliases, visibility, name conflicts, exact call signatures, reserved words, and module-qualified source diagnostics.
   - Implemented with resolver-supplied typed import descriptors and module-qualified `jimp-error-v1` source locations; direct single-source lowering remains available for embedders.
2. [x] Implement the secure project resolver and dependency graph loader.
   - Resolve relative `.jimp` specifiers from a canonical project root, snapshot UTF-8 sources, enforce real-path containment, detect physical and case aliases, and reject dependency cycles before semantic lowering.
   - Acceptance criterion: traversal, symlink escape, missing or non-regular files, invalid UTF-8, ambiguous identity, source mutation, and cycle tests emit no `.jbc`.
   - Implemented with strict no-fallback specifier validation, canonical real paths, source digests and file identities, deterministic source-order traversal, and pre-link mutation verification.
3. [x] Implement deterministic static linking and module-aware debug identity.
   - Bind imported functions to module-qualified export identities, assign functions in deterministic topological order, and lower cross-module calls to the existing generic `CALL` instruction.
   - Extend the pre-stable portable format to `2.6` with the minimum source-identity metadata required to report a portable module ID and line without introducing runtime module loading.
   - Acceptance criterion: JavaScript and Rust independently validate the new metadata; the inspector and runtime identify the originating module; identical source graphs produce identical linked bytes.
   - Implemented with one entry function, dependency-first declaration allocation, module-qualified linker symbols, generic `CALL` lowering, and format 2.6 debug source tables consumed independently by JavaScript and Rust.
4. [x] Integrate the standard-library catalog and portable implementations.
   - Resolve `std:` imports only from the selected catalog, complete any required canonical portable sources, link only transitively used exports, deduplicate implementations, and prevent project files from shadowing standard modules.
   - Acceptance criterion: a program imports and executes `std:math/i64` and `std:console` through ordinary `CALL` and typed Host ABI lowering; the default portable target emits no optional `std.math.i64.*` host import.
   - Implemented with an embedded generated catalog, canonical portable sources, reserved `std:` resolution, used-export traversal, implementation deduplication, generic `CALL`/`HOST_CALL` lowering, and no project-filesystem fallback.
5. [x] Add explicit native target profiles and complete cross-language hardening.
   - Add reproducible compiler options and build metadata for the project root, standard-library major profile, and target-guaranteed native capabilities; native replacement remains link-time only with no runtime probing.
   - Acceptance criterion: portable and native-selected implementations pass semantic parity tests; denied, unavailable, or incompatible capabilities fail before execution; graph, linker, sandbox, inspector, and Rust runtime integration cases run in the complete quality gate.
   - Implemented with generated `portable` and `reference-native-i64` profiles, reproducible CLI options and build metadata, independent runtime profile/signature validation, explicit capability policy, native/portable parity tests, and checked-I64 error parity.

P5 acceptance criterion: a multi-file entry program can import project functions and standard-library exports, compile reproducibly into one self-contained portable `.jbc`, execute in the Rust runtime, and report module-qualified failures. The VM gains no source resolver, dynamic module loader, hardcoded standard-library API, or native pointer mechanism.

### P6 — developer toolchain and distribution

P6 turns the validated compiler/runtime foundation into a toolchain that can be installed and used through one consistent command surface. It does not expand the language semantics or weaken the existing compiler/runtime trust boundary.

1. [x] Add a unified `jimp` command surface.
   - Provide `jimp run`, `jimp compile`, `jimp inspect`, and `jimp check` with consistent option parsing, exit codes, human diagnostics, and `--error-format=json` behavior.
   - `jimp run` must compile through the existing project resolver, execute the selected Rust runtime, forward standard-library and target-profile options explicitly, and clean up temporary output deterministically.
   - Acceptance criterion: a source project can be compiled, inspected, validated, or executed without invoking Node.js and Cargo commands separately; compilation failures never start the runtime.
   - Implemented with public `run`, `compile`, `check`, `inspect`, `init`, `--help`, and `--version` commands; deterministic temporary cleanup; runtime option forwarding; and end-to-end structured-error tests.
2. [x] Package the CLI and define runtime discovery.
   - Expose an installable CLI entry point, define the supported compiler/runtime version handshake, support an explicit runtime-path override, and reject missing or incompatible runtimes with an actionable diagnostic.
   - Installation must not perform an undeclared network download or silently select an arbitrary executable from the working directory.
   - Acceptance criterion: a clean supported environment can install the toolchain and run `jimp --version` and `jimp run examples/hello.jimp` from outside the repository.
   - Implemented with an npm `bin` entry, source-package allowlist, explicit runtime override, controlled discovery order, exact version/protocol handshake, release-runtime build script, and an isolated package/install/build/run integration test.
3. [x] Build a practical examples and project-start workflow.
   - Add reviewed examples for functions, loops, project modules, `std:console`, portable `std:math/i64`, native target selection, structured errors, and bytecode inspection.
   - Add a minimal project template or `jimp init` only after its generated layout and overwrite policy are specified.
   - Acceptance criterion: every documented example is executed by automated tests and uses only public commands and supported source syntax.
   - Implemented with reviewed scalar, control-flow, module, standard-library, native-target, inspection, validation, and structured-error examples plus a non-overwriting `jimp init` template whose partial output is rolled back on failure.
4. [x] Add cross-platform CI and release artifacts.
   - Run the complete quality gate on supported Windows and Linux versions, build runtime artifacts reproducibly, and publish versioned checksums and release notes.
   - Define which components require Node.js at development time and which artifacts are sufficient for execution.
   - Acceptance criterion: release candidates pass the same compiler, integration, generated-artifact, Rust format, lint, and runtime tests on every supported platform.
   - Implemented with Windows/Linux quality and tag-release workflows, locked release builds, platform npm archives bundling the matching runtime, SHA-256 checksums, machine-readable manifests, generated release notes, and explicit compiler/runtime artifact documentation.
5. [x] Establish a versioned conformance suite and compatibility matrix.
   - Separate language, bytecode, Host ABI, standard-library, target-profile, and diagnostic fixtures so alternate implementations can validate one contract at a time.
   - Include positive programs, required rejection cases, deterministic output, sandbox limits, malformed metadata, capability denial, and compiler/runtime version mismatches.
   - Acceptance criterion: a release artifact can run the conformance suite without repository-internal APIs, and the supported `.jbc`, standard-library, and target-profile versions are published explicitly.
   - Implemented with a public-CLI-only `jimp-conformance-v1` runner, contract-separated fixtures, deterministic repetitions, negative pre-effect checks, published exact compatibility versions, and packaged execution support.
6. [x] Evaluate an interactive REPL after the unified runner is stable.
   - Specify whether state persists as source declarations, linked modules, or runtime values before implementing the REPL.
   - Acceptance criterion: if approved, the REPL must use the same parser, analyzer, linker, runtime validation, capability policy, and error contracts as file execution.
   - Implemented as an explicit source-buffer session with `:run`, `:show`, `:undo`, `:clear`, `:help`, and exit commands; every run recompiles and executes through the existing project and runtime pipeline in a fresh VM, with no hidden runtime-value persistence.

P6 acceptance criterion: a user can install a versioned JIMP toolchain, execute a documented project with one command, inspect or validate its `.jbc`, receive consistent diagnostics, and reproduce the same behavior on every supported platform.

### P7 — aggregate data and expanded language capabilities

P7 expands the language only after P6 makes the current semantics easy to exercise and distribute. Every syntax, type-system, VM, sandbox, and standard-library change requires matching normative specifications in `docs/specs/EN` and `docs/specs/PT` before implementation.

1. [x] Specify the aggregate type and ownership model.
   - Decide the source syntax and static typing for arrays and records, mutation and aliasing rules, equality behavior, function-signature representation, and control-flow type joins.
   - Define whether values are copied, shared, or referenced and how cycles are prevented or collected; do not infer these semantics from a host-language implementation.
   - Acceptance criterion: bilingual specifications cover valid programs, rejected programs, observable behavior, resource ownership, and compatibility consequences before parser or VM changes begin.
   - Implemented as immutable value semantics, functional updates, nominal records, homogeneous typed arrays, exact control-flow joins, structural equality, unobservable storage sharing, and an acyclic-by-construction ownership model in bilingual normative specifications.
2. [x] Add a resource-bounded heap foundation to portable bytecode and the runtime.
   - Introduce only generic value-storage and access mechanisms required by approved core semantics; JSON, files, networking, and other domain APIs must not become VM instructions.
   - Extend independent JavaScript and Rust verification, logical memory accounting, recursion/alias safety, malformed-bytecode rejection, and inspector output.
   - Acceptance criterion: heap allocation and access cannot bypass deterministic sandbox limits, forge native references, access host memory, or create an effect before complete verification.
   - Implemented in portable format 2.7 with opaque `HEAP_REF` values, immutable `HEAP_ALLOC`, typed `HEAP_LOAD`, `HEAP_LENGTH`, independent JavaScript/Rust verification, cumulative object/slot/byte/depth limits, execution-local integer handles, Host ABI exclusion, inspector disassembly, and cross-language tests.
3. [x] Implement typed arrays and indexed access.
   - Add construction, read, update, length, bounds diagnostics, function parameters/returns, and deterministic iteration only as approved by the P7.1 specification.
   - Acceptance criterion: compiler and runtime tests cover empty and nested arrays, mutation rules, type mismatches, bounds failures, alias behavior, memory limits, and cross-language verification.
   - Implemented with `[T]` annotations, contextual empty arrays, ordered literals, I64 indexed access, `.length`, immutable `with [index] = value` updates, exact function contracts, nested arrays, structural equality, deterministic bounds diagnostics, and generic heap lowering.
4. [x] Implement typed records and field access.
   - Choose and document nominal or structural typing, declaration syntax, field initialization, field mutation, equality, module visibility, and schema evolution before implementation.
   - Acceptance criterion: records cross function and module boundaries with exact verified contracts; missing, duplicate, private, or type-incompatible fields fail deterministically.
   - Implemented with module-qualified nominal identities, top-level and exported `record` declarations, exact ordered initialization, field access, immutable multi-field `with { ... }` updates, structural equality, transitive schema contracts, and named imports across statically linked modules.
5. [x] Add explicit recoverable-error semantics and collection/text primitives.
   - Define a typed result mechanism before exposing operations that can fail during normal execution; exceptions, implicit nullability, and host-language exceptions must not emerge accidentally as language semantics.
   - Deliver common text and collection behavior through ordinary language functions or catalog-defined standard modules whenever possible, using new core instructions only when the approved value model requires generic operations.
   - Acceptance criterion: success and failure paths are statically visible, sandboxed, module-safe, and consistent across portable and optional native implementations.
   - Implemented with nominal result records, deterministic `ok`/`value`/`error` contracts, Unicode-scalar STRING operations, portable `std:result`, `std:text`, and `std:collections/i64`, and generic format 2.9 string instructions independently verified by JavaScript and Rust.
6. [x] Add `std:json` on top of the approved aggregate and error models.
   - JSON parsing and serialization must be catalog-defined APIs with canonical portable behavior or a documented reason why a portable implementation is impossible; `JSON` must not become a keyword or opcode.
   - Specify number mapping, duplicate keys, ordering, Unicode, nesting limits, output determinism, and malformed-input diagnostics.
   - Acceptance criterion: parse/stringify round trips, invalid inputs, deep structures, size limits, and portable/native semantic parity pass the complete cross-language gate.
   - Implemented as a portable typed wrapper over catalog-declared pure scalar Host ABI support, with `JsonDocument`, `JsonResult`, deterministic compact output, duplicate-key rejection, exact number lexemes, Unicode escape validation, and generated input/output/depth/value limits.
7. [x] Design capability-gated files and networking as a subsequent P7 delivery slice.
   - Define byte/buffer values, asynchronous execution, cancellation, timeouts, response-size limits, deterministic testing, and deployment policy before adding `std:files` or `std:http`.
   - File and network operations must remain named, typed Host ABI capabilities selected by catalog data and explicit runtime policy; `FETCH`, paths, sockets, and platform handles must not become source keywords, portable opcodes, or trusted bytecode pointers.
   - Design acceptance criterion: the contract covers denied, unavailable, incompatible, timed-out, oversized, and cancelled operations without escaping policy or resource limits, and permits hosts to omit the capabilities entirely.
   - Completed as a bilingual design contract for immutable `BYTES`, typed results, task/future scheduling, structured cancellation, timeout units, path and destination policy, deterministic fake hosts, and a required failure matrix. No file or network capability is enabled yet.

P7 acceptance criterion: JIMP can safely represent and manipulate typed aggregate data, process JSON through the standard library, and express recoverable failures while retaining portable verification, deterministic resource bounds, static module linking, data-defined host capabilities, and a VM free of domain-specific APIs.

### P8 — expressive types and binary data

P8 provides the value-model prerequisites for structured JSON and safe external I/O. Its complete design contract is maintained in [`docs/specs/EN/P8_TYPES.md`](specs/EN/P8_TYPES.md) and [`docs/specs/PT/P8_TYPES.md`](specs/PT/P8_TYPES.md).

1. [x] Specify and implement nominal tagged variants.
   - Define construction, payload typing, module visibility, equality, nesting, control-flow joins, portable representation, and deterministic resource behavior.
   - Acceptance criterion: exact variant contracts cross module and function boundaries without exposing storage identity, native pointers, or public-name-specific VM behavior.
2. [x] Add exhaustive pattern matching.
   - Define binding scopes, nested patterns, alternative order, catch-all behavior, unreachable cases, result-type joins, and evaluation order.
   - Acceptance criterion: missing, duplicate, impossible, unreachable, or type-incompatible alternatives fail before bytecode emission and lowering uses only generic control flow and value access.
3. [x] Add compile-time parametric types and functions.
   - Deliver `Option<T>` and `Result<T, E>`, document representation and instantiation, bound generated code size, and preserve exact independently verifiable contracts.
   - Acceptance criterion: generic records, variants, and functions work across modules without runtime casts or reflection; P7 result records retain a documented migration path.
4. [x] Add bounded recursive immutable values.
   - Permit finite recursive data while rejecting or preventing cyclic runtime object graphs; bound construction, depth, traversal, equality, and serialization.
   - Acceptance criterion: recursive values are usable through functions and pattern matching, excessive depth fails deterministically, and malformed bytecode cannot manufacture cycles.
5. [ ] Add immutable `BYTES`.
   - Define binary construction, length, indexed access, half-open slicing, concatenation, equality, UTF-8 conversions, sandbox accounting, and generic portable lowering.
   - Acceptance criterion: binary values are distinct from STRING and `[I64]`, remain immutable and resource-bounded, and introduce no file-format or network opcode.
6. [ ] Evolve `std:json` to structured `JsonValue`.
   - Build recursive JSON values from approved variants and collections while preserving exact number text, duplicate-key rejection, member order, Unicode, canonicalization, diagnostics, and limits.
   - Acceptance criterion: structured parse/stringify and migration from `JsonDocument` pass cross-language tests without making JSON a keyword, intrinsic, bytecode type, or opcode.
7. [ ] Complete P8 compatibility and conformance.
   - Publish final bilingual normative specifications, format consequences, malformed-bytecode fixtures, resource-limit cases, and package/install coverage.
   - Acceptance criterion: the complete P8 surface passes the full cross-platform quality gate and independent JavaScript/Rust verification.

P8.1–P8.4 are implemented on `.jbc` 2.9 by lowering to the existing verified heap, call, equality, and control-flow instructions. P8 delivery continues with P8.5 through P8.7; a new pre-stable bytecode minor is introduced only when portable representation or generic instruction changes require it.

### P9 — asynchronous capability integrations

P9 implements the approved P7.7 I/O design only after P8 provides generic results and `BYTES`. Its complete contract is maintained in [`docs/specs/EN/P9_CAPABILITIES.md`](specs/EN/P9_CAPABILITIES.md) and [`docs/specs/PT/P9_CAPABILITIES.md`](specs/PT/P9_CAPABILITIES.md).

1. [ ] Specify and implement a typed task/future model.
   - Define creation authority, awaiting, ownership, result retention, failure representation, pending work at program exit, and unforgeable execution-local task identities.
2. [ ] Add a deterministic resource-bounded scheduler.
   - Bound pending tasks, active host operations, polls, wakeups, retained result bytes, and total scheduler work; prohibit unbounded blocking inside one VM instruction.
3. [ ] Add structured cancellation and explicit timeouts.
   - Define propagation, terminal states, idempotence, cleanup, exact duration units, and the guarantee that cancelled or timed-out work cannot publish a later effect.
4. [ ] Replace the closed reference capability table with data-driven host registration.
   - Version symbols, signatures, effect classifications, resource-policy metadata, async lifecycle, and compatibility independently from authorization.
   - Acceptance criterion: duplicate, unavailable, denied, malformed, version-incompatible, or signature-incompatible registrations fail before effects; compiler and VM behavior is API-name-independent.
5. [ ] Implement capability-gated `std:files`.
   - Require separate read/write authority, an embedder root, canonical symlink-safe containment, atomic-write policy, `BYTES` limits, tasks, typed failures, cancellation, and isolated deterministic tests.
6. [ ] Implement capability-gated `std:http`.
   - Define URL, scheme, method, headers, destination allowlist, DNS/rebinding, redirect, TLS, credential, size, decompression, timeout, cancellation, and response contracts.
7. [ ] Add deterministic fake-host integration infrastructure.
   - Script clocks, files, DNS, HTTP completion, cancellation, and failures without public network access or ambient filesystem authority.
8. [ ] Complete the P9 security and conformance gate.
   - Review traversal, symlink races, SSRF, DNS rebinding, redirects, TLS, header injection, decompression bombs, secret leakage, confused deputy risks, task leaks, cancellation races, and accounting bypasses.

P9 acceptance criterion: files and HTTP operate only through explicitly installed, registered, and authorized typed capabilities over bounded asynchronous primitives. The default runtime grants neither authority, and every denial or failure path is deterministic and tested without domain-specific VM instructions.

### P10 — packages and extension ecosystem

P10 adds reproducible reuse and third-party integration without runtime module loading or package-supplied authority. Its complete contract is maintained in [`docs/specs/EN/P10_ECOSYSTEM.md`](specs/EN/P10_ECOSYSTEM.md) and [`docs/specs/PT/P10_ECOSYSTEM.md`](specs/PT/P10_ECOSYSTEM.md).

1. [ ] Specify a canonical project manifest and package identity.
   - Define package/version syntax, entry module, toolchain and standard-library compatibility, dependencies, target requirements, normalization, unknown fields, and deterministic serialization.
2. [ ] Implement deterministic workspace and local-path dependency resolution.
   - Preserve canonical containment, immutable snapshots, module-qualified identity, cycle/conflict/alias rejection, and static linking without ambient package search.
3. [ ] Add a canonical lockfile and integrity model.
   - Record exact versions, sources, content digests, dependency edges, toolchain compatibility, standard-library profile, and target profile; changed locked content fails closed.
4. [ ] Add a content-addressed cache and verified offline builds.
   - Require atomic population, digest verification, corruption recovery, concurrent safety, explicit cleanup, immutable snapshots, and zero package lifecycle scripts.
5. [ ] Add immutable Git dependencies and then design registry distribution.
   - Lock mutable references to commits; define bounded secure retrieval, namespace ownership, immutable versions, checksums, optional provenance, yanking, mirrors, authentication, and dependency-confusion defenses before a public registry.
6. [ ] Publish a versioned host-extension SDK.
   - Expose the P9 data-driven registration ABI, supported types, async lifecycle, cancellation, errors, resource policy, thread safety, compatibility, and optional out-of-process isolation.
   - Source packages never install or activate native extensions; deployment and authorization remain operator-controlled.
7. [ ] Add explicit CLI dependency and publishing workflows.
   - Cover manifest validation, add/remove, lock, fetch/install, offline verification, pack, integrity inspection, publish, stable machine diagnostics, credential redaction, and immutable-version protection.
8. [ ] Complete ecosystem conformance and release qualification.
   - Test fixture registries and Git repositories, corrupt caches, dependency confusion, conflicts, cycles, offline builds, reproducibility, SDK compatibility, and denied capabilities without live external services.

P10 acceptance criterion: clean supported machines resolve one locked project into identical linked bytecode; offline rebuilds verify integrity; dependency code is never executed during resolution; and third-party host capabilities remain unavailable until separately installed and authorized.

### Planned dependency order

```text
P8 variants, generics, recursive values, and BYTES
  -> P9 bounded async runtime and capability-gated files/HTTP
  -> P10 reproducible packages and versioned host-extension SDK
```

P10 manifest and local-workspace design may be researched during late P8/P9, but no package or extension surface may assume unfinished value, async, capability, or security contracts.

## Current decisions

| Topic                     | Current decision                                                                |
| ------------------------- | ------------------------------------------------------------------------------- |
| Official compiler         | JavaScript (Node.js 20 or later for development)                                |
| Official runtime          | Rust, with no Node.js dependency during execution                               |
| Active format             | Portable binary `.jbc` 2.9, little-endian                                       |
| External interface        | Named, typed Host ABI imports authorized by capability policy                   |
| Execution architecture    | Generic register ISA generated from `isa/v1.json`                               |
| Portable VM specification | P3 functions, loops, sandbox, standard errors, and debug metadata implemented    |
| Sandbox profile           | Generated `jimp-reference-sandbox` v1 with deterministic logical budgets        |
| Error contract            | Generated `jimp-error-v1` codes with human and one-line JSON CLI output          |
| Source modules            | Acyclic relative imports and named function/record exports, statically linked    |
| Standard library          | Versioned `std:` catalog with validated portable fallbacks and target-only native replacements |
| Distribution              | Platform archives with unified CLI, bundled runtime, checksums, and conformance suite |
| Aggregate model           | Immutable typed arrays and nominal records with value semantics and functional updates |
| Recoverable failures      | Nominal result records with explicit `ok`, typed fallback `value`, and `error`   |
| JSON                      | Typed `std:json` wrapper with pure catalog-backed support and deterministic limits |
| Future domain APIs        | Standard-library and Host ABI capabilities, never source keywords or domain opcodes  |
| Implemented P8 work       | Tagged variants, exhaustive matching, generic records/variants/functions, `Option<T>`, `Result<T, E>`, and bounded recursive immutable values |
| Planned language work     | P8 immutable `BYTES`, structured JSON, and final compatibility/conformance |
| Planned integrations      | P9 bounded async tasks, data-driven host registration, capability-gated files and HTTP |
| Planned ecosystem         | P10 deterministic packages, lockfiles, verified cache, registry design, and host SDK |
| Security boundary         | VM-level validation and capability confinement; OS/process isolation remains external |
| Compatibility             | Legacy format 1 and portable 2.0–2.8 are not accepted; format 2.9 is pre-stable |

## Validating the current milestone

```powershell
npm run check
npm run build:runtime
npm run jimp -- run examples/aggregates.jimp
npm run jimp -- run examples/data.jimp
npm run jimp -- compile examples/functions.jimp -o functions.jbc
npm run jimp -- inspect functions.jbc
npm run jimp -- check functions.jbc
```

The aggregate run must print both value-semantics confirmations; the check command must validate without executing it.
