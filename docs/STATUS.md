# JIMP Implementation Status

**Last updated:** July 18, 2026
**Development version:** 0.1.0

This document tracks the JIMP implementation. The conceptual project definition lives under `docs/specs`; this file records only executable work and the subsequent delivery plan.

## Current milestone: portable VM foundation complete

The project has a complete, tested path from source code to execution:

```text
.jimp source file
  -> JavaScript compiler
  -> portable .jbc 2.0 module
  -> complete verification and host-import resolution
  -> Rust runtime
  -> host console
```

Supported example:

```jimp
print "Hello, JIMP!";
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
- [x] String escapes: `\\`, `\"`, `\n`, `\r`, and `\t`.
- [x] Syntax diagnostics with source line numbers.
- [x] Portable `.jbc` 2.0 emission.
- [x] `.jbc` inspection in readable and JSON formats.

### Portable bytecode 2.0

- [x] Header with `JIMP` magic number, format version, entry function, and section directory.
- [x] Little-endian multibyte integer encoding.
- [x] Scalar constant pool, typed host imports, function metadata, and code sections.
- [x] Generic `LOAD_CONST`, `MOVE`, `HOST_CALL`, and `HALT` instructions.
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
- [x] Portable 2.0 container decoding in Rust.
- [x] Typed host-import resolution to numeric handles with explicit capability policy.
- [x] ISA-driven operand decoding and generic register-machine execution.
- [x] Runtime type checks before every host invocation.

### Quality

- [x] Compiler unit tests for bytecode emission and syntax errors.
- [x] Runtime unit tests for valid bytecode and invalid magic numbers.
- [x] Manual end-to-end test compiling and executing `examples/hello.jimp`.
- [x] Bytecode inspector tests for decoding, formatting, count mismatches, and trailing data.
- [x] Automated compiler-to-runtime integration tests for valid and corrupted bytecode.
- [x] Cross-platform local validation command: `npm run check`.

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

1. [ ] Implement numeric, boolean, and `null` values.
2. [ ] Implement immutable and mutable variables with declaration-and-use analysis.
3. [ ] Implement arithmetic, comparison, and boolean expressions.
4. [ ] Implement conditional branches and blocks (`if` / `else`).
5. [ ] Implement semantic type checks and lower the core language to the generic VM instructions.

Acceptance criterion: a program can declare values, calculate an expression, and select a conditional path; the compiler rejects undeclared identifiers and type incompatibilities defined by the specification.

### P3 — structured execution

1. [ ] Implement functions, parameters, returns, and a call stack.
2. [ ] Implement loops and control-flow instructions.
3. [ ] Define sandbox memory, stack, and execution limits.
4. [ ] Create a standard error format for compiler and runtime.
5. [ ] Add debug metadata mapping bytecode back to source lines.

### P4 — modules and standard library

1. [ ] Specify imports, exports, and module resolution.
2. [ ] Design the first standard library independent from the VM.
3. [ ] Define portable fallback implementations for optional native host capabilities.
4. [ ] Document the sandbox model and security guarantees.

## Current decisions

| Topic | Current decision |
| --- | --- |
| Official compiler | JavaScript (Node.js 20 or later for development) |
| Official runtime | Rust, with no Node.js dependency during execution |
| Active format | Portable binary `.jbc` 2.0, little-endian |
| External interface | Named, typed Host ABI imports authorized by capability policy |
| Execution architecture | Generic register ISA generated from `isa/v1.json` |
| Portable VM specification | Implemented P1 foundation |
| Compatibility | Legacy format 1 is not accepted; format 2.0 is still pre-stable |

## Validating the current milestone

```powershell
npm run check
node compiler/src/cli.js compile examples/hello.jimp -o hello.jbc
node compiler/src/cli.js inspect hello.jbc
cargo run --manifest-path runtime/Cargo.toml -- hello.jbc
```

The final command must print `Hello, JIMP!`.
