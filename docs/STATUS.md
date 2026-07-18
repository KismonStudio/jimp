# JIMP Implementation Status

**Last updated:** July 18, 2026
**Prototype version:** 0.1.0

This document tracks the JIMP implementation. The conceptual project definition lives under `docs/specs`; this file records only executable work and the subsequent delivery plan.

## Current milestone: first vertical slice

The project has a complete, tested path from source code to execution:

```text
.jimp source file
  -> JavaScript compiler
  -> .jbc v1 binary bytecode
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
- [x] v1 binary bytecode emission.
- [x] `.jbc` inspection in readable and JSON formats.

### Bytecode v1

- [x] Header with `JIMP` magic number, version, and instruction count.
- [x] Little-endian multibyte integer encoding.
- [x] `PRINT` opcode (`1`) carrying UTF-8 text.
- [x] `HALT` opcode (`255`).
- [x] Contract published in English and Portuguese under `docs/specs/EN` and `docs/specs/PT`.
- [x] Formal v1 source syntax published in English and Portuguese.

### Runtime

- [x] File-based bytecode loading.
- [x] Magic number and version validation.
- [x] Read-boundary and incomplete-operand validation.
- [x] Rejection of unknown opcodes and invalid UTF-8 text.
- [x] Required `HALT` termination.
- [x] Rejection of trailing bytes after termination.
- [x] Initial console host implementation for `PRINT`.

### Quality

- [x] Compiler unit tests for bytecode emission and syntax errors.
- [x] Runtime unit tests for valid bytecode and invalid magic numbers.
- [x] Manual end-to-end test compiling and executing `examples/hello.jimp`.
- [x] Bytecode inspector tests for decoding, formatting, count mismatches, and trailing data.

## Next tasks

### P0 — consolidate the v1 contract

1. [x] Write a formal v1 language-syntax specification.
   - Acceptance criterion: grammar, lexical rules, comments, and escapes are unambiguous.
2. [ ] Separate decoding/verification from the runtime execution loop.
   - Acceptance criterion: malformed bytecode is fully rejected before it can create an observable host effect.
3. [ ] Add automated compiler-to-runtime integration tests.
   - Acceptance criterion: valid programs and corrupted bytecode cases run in local CI.

### P1 — core language

1. [ ] Implement numeric, boolean, and `null` values.
2. [ ] Implement immutable and mutable variables with declaration-and-use analysis.
3. [ ] Implement arithmetic, comparison, and boolean expressions.
4. [ ] Implement conditional branches and blocks (`if` / `else`).
5. [ ] Define bytecode values, registers, and a constant pool.

Acceptance criterion: a program can declare values, calculate an expression, and select a conditional path; the compiler rejects undeclared identifiers and type incompatibilities defined by the specification.

### P2 — structured execution

1. [ ] Implement functions, parameters, returns, and a call stack.
2. [ ] Implement loops and control-flow instructions.
3. [ ] Define sandbox memory, stack, and execution limits.
4. [ ] Create a standard error format for compiler and runtime.
5. [ ] Add debug metadata mapping bytecode back to source lines.

### P3 — modules and Host ABI

1. [ ] Specify imports, exports, and module resolution.
2. [ ] Define the Host ABI: names, signatures, capabilities, and errors.
3. [ ] Implement explicit host capability registration.
4. [ ] Design the first standard library independent from the VM.
5. [ ] Document the sandbox model and security guarantees.

## Current decisions

| Topic | Current decision |
| --- | --- |
| Official compiler | JavaScript (Node.js 20 or later for development) |
| Official runtime | Rust, with no Node.js dependency during execution |
| Initial format | Binary `.jbc`, little-endian, version 1 |
| Initial external interface | Console through the `PRINT` opcode |
| Compatibility | No stability guarantee beyond the currently documented bytecode v1 |

## Validating the current milestone

```powershell
npm test
cargo test --manifest-path runtime/Cargo.toml
node compiler/src/cli.js compile examples/hello.jimp -o hello.jbc
node compiler/src/cli.js inspect hello.jbc
cargo run --manifest-path runtime/Cargo.toml -- hello.jbc
```

The final command must print `Hello, JIMP!`.
