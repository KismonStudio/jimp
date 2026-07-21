# JIMP Implementation Status

**Last updated:** July 21, 2026
**Development version:** 0.1.0

This document tracks the JIMP implementation. The conceptual project definition lives under `docs/specs`; this file records only executable work and the subsequent delivery plan.

## Current milestone: P5 module linker and standard-library delivery complete

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
