# JIMP Implementation Status

**Last updated:** July 21, 2026
**Development version:** 0.1.0

This document tracks the JIMP implementation. The conceptual project definition lives under `docs/specs`; this file records only executable work and the subsequent delivery plan.

## Current milestone: P5 complete; P6 developer toolchain planned

The project has a complete, tested path from source code to execution:

```text
.jimp source file
  -> JavaScript compiler
  -> portable .jbc 2.6 module with optional debug and build metadata
  -> complete verification, explicit target matching, and host-import resolution
  -> Rust runtime
  -> host console
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

1. [ ] Add a unified `jimp` command surface.
   - Provide `jimp run`, `jimp compile`, `jimp inspect`, and `jimp check` with consistent option parsing, exit codes, human diagnostics, and `--error-format=json` behavior.
   - `jimp run` must compile through the existing project resolver, execute the selected Rust runtime, forward standard-library and target-profile options explicitly, and clean up temporary output deterministically.
   - Acceptance criterion: a source project can be compiled, inspected, validated, or executed without invoking Node.js and Cargo commands separately; compilation failures never start the runtime.
2. [ ] Package the CLI and define runtime discovery.
   - Expose an installable CLI entry point, define the supported compiler/runtime version handshake, support an explicit runtime-path override, and reject missing or incompatible runtimes with an actionable diagnostic.
   - Installation must not perform an undeclared network download or silently select an arbitrary executable from the working directory.
   - Acceptance criterion: a clean supported environment can install the toolchain and run `jimp --version` and `jimp run examples/hello.jimp` from outside the repository.
3. [ ] Build a practical examples and project-start workflow.
   - Add reviewed examples for functions, loops, project modules, `std:console`, portable `std:math/i64`, native target selection, structured errors, and bytecode inspection.
   - Add a minimal project template or `jimp init` only after its generated layout and overwrite policy are specified.
   - Acceptance criterion: every documented example is executed by automated tests and uses only public commands and supported source syntax.
4. [ ] Add cross-platform CI and release artifacts.
   - Run the complete quality gate on supported Windows and Linux versions, build runtime artifacts reproducibly, and publish versioned checksums and release notes.
   - Define which components require Node.js at development time and which artifacts are sufficient for execution.
   - Acceptance criterion: release candidates pass the same compiler, integration, generated-artifact, Rust format, lint, and runtime tests on every supported platform.
5. [ ] Establish a versioned conformance suite and compatibility matrix.
   - Separate language, bytecode, Host ABI, standard-library, target-profile, and diagnostic fixtures so alternate implementations can validate one contract at a time.
   - Include positive programs, required rejection cases, deterministic output, sandbox limits, malformed metadata, capability denial, and compiler/runtime version mismatches.
   - Acceptance criterion: a release artifact can run the conformance suite without repository-internal APIs, and the supported `.jbc`, standard-library, and target-profile versions are published explicitly.
6. [ ] Evaluate an interactive REPL after the unified runner is stable.
   - Specify whether state persists as source declarations, linked modules, or runtime values before implementing the REPL.
   - Acceptance criterion: if approved, the REPL must use the same parser, analyzer, linker, runtime validation, capability policy, and error contracts as file execution.

P6 acceptance criterion: a user can install a versioned JIMP toolchain, execute a documented project with one command, inspect or validate its `.jbc`, receive consistent diagnostics, and reproduce the same behavior on every supported platform.

### P7 — aggregate data and expanded language capabilities

P7 expands the language only after P6 makes the current semantics easy to exercise and distribute. Every syntax, type-system, VM, sandbox, and standard-library change requires matching normative specifications in `docs/specs/EN` and `docs/specs/PT` before implementation.

1. [ ] Specify the aggregate type and ownership model.
   - Decide the source syntax and static typing for arrays and records, mutation and aliasing rules, equality behavior, function-signature representation, and control-flow type joins.
   - Define whether values are copied, shared, or referenced and how cycles are prevented or collected; do not infer these semantics from a host-language implementation.
   - Acceptance criterion: bilingual specifications cover valid programs, rejected programs, observable behavior, resource ownership, and compatibility consequences before parser or VM changes begin.
2. [ ] Add a resource-bounded heap foundation to portable bytecode and the runtime.
   - Introduce only generic value-storage and access mechanisms required by approved core semantics; JSON, files, networking, and other domain APIs must not become VM instructions.
   - Extend independent JavaScript and Rust verification, logical memory accounting, recursion/alias safety, malformed-bytecode rejection, and inspector output.
   - Acceptance criterion: heap allocation and access cannot bypass deterministic sandbox limits, forge native references, access host memory, or create an effect before complete verification.
3. [ ] Implement typed arrays and indexed access.
   - Add construction, read, update, length, bounds diagnostics, function parameters/returns, and deterministic iteration only as approved by the P7.1 specification.
   - Acceptance criterion: compiler and runtime tests cover empty and nested arrays, mutation rules, type mismatches, bounds failures, alias behavior, memory limits, and cross-language verification.
4. [ ] Implement typed records and field access.
   - Choose and document nominal or structural typing, declaration syntax, field initialization, field mutation, equality, module visibility, and schema evolution before implementation.
   - Acceptance criterion: records cross function and module boundaries with exact verified contracts; missing, duplicate, private, or type-incompatible fields fail deterministically.
5. [ ] Add explicit recoverable-error semantics and collection/text primitives.
   - Define a typed result mechanism before exposing operations that can fail during normal execution; exceptions, implicit nullability, and host-language exceptions must not emerge accidentally as language semantics.
   - Deliver common text and collection behavior through ordinary language functions or catalog-defined standard modules whenever possible, using new core instructions only when the approved value model requires generic operations.
   - Acceptance criterion: success and failure paths are statically visible, sandboxed, module-safe, and consistent across portable and optional native implementations.
6. [ ] Add `std:json` on top of the approved aggregate and error models.
   - JSON parsing and serialization must be catalog-defined APIs with canonical portable behavior or a documented reason why a portable implementation is impossible; `JSON` must not become a keyword or opcode.
   - Specify number mapping, duplicate keys, ordering, Unicode, nesting limits, output determinism, and malformed-input diagnostics.
   - Acceptance criterion: parse/stringify round trips, invalid inputs, deep structures, size limits, and portable/native semantic parity pass the complete cross-language gate.
7. [ ] Design capability-gated files and networking as a subsequent P7 delivery slice.
   - Define byte/buffer values, asynchronous execution, cancellation, timeouts, response-size limits, deterministic testing, and deployment policy before adding `std:files` or `std:http`.
   - File and network operations must remain named, typed Host ABI capabilities selected by catalog data and explicit runtime policy; `FETCH`, paths, sockets, and platform handles must not become source keywords, portable opcodes, or trusted bytecode pointers.
   - Acceptance criterion: denied, unavailable, incompatible, timed-out, oversized, and cancelled operations fail without escaping policy or resource limits, and hosts can omit the capabilities entirely.

P7 acceptance criterion: JIMP can safely represent and manipulate typed aggregate data, process JSON through the standard library, and express recoverable failures while retaining portable verification, deterministic resource bounds, static module linking, data-defined host capabilities, and a VM free of domain-specific APIs.

## Current decisions

| Topic                     | Current decision                                                                |
| ------------------------- | ------------------------------------------------------------------------------- |
| Official compiler         | JavaScript (Node.js 20 or later for development)                                |
| Official runtime          | Rust, with no Node.js dependency during execution                               |
| Active format             | Portable binary `.jbc` 2.6, little-endian                                       |
| External interface        | Named, typed Host ABI imports authorized by capability policy                   |
| Execution architecture    | Generic register ISA generated from `isa/v1.json`                               |
| Portable VM specification | P3 functions, loops, sandbox, standard errors, and debug metadata implemented    |
| Sandbox profile           | Generated `jimp-reference-sandbox` v1 with deterministic logical budgets        |
| Error contract            | Generated `jimp-error-v1` codes with human and one-line JSON CLI output          |
| Source modules            | Acyclic relative imports and named function exports, statically linked           |
| Standard library          | Versioned `std:` catalog with validated portable fallbacks and target-only native replacements |
| Planned distribution      | Unified versioned CLI with explicit runtime discovery and no silent downloads       |
| Planned aggregate model   | Must be specified bilingually before choosing representation, ownership, or syntax  |
| Future domain APIs        | Standard-library and Host ABI capabilities, never source keywords or domain opcodes  |
| Security boundary         | VM-level validation and capability confinement; OS/process isolation remains external |
| Compatibility             | Legacy format 1 and portable 2.0–2.5 are not accepted; format 2.6 is pre-stable |

## Validating the current milestone

```powershell
npm run check
node compiler/src/cli.js compile examples/functions.jimp -o functions.jbc
node compiler/src/cli.js inspect functions.jbc
cargo run --manifest-path runtime/Cargo.toml -- functions.jbc
```

The final command must print `factorial(5) == 120`.
