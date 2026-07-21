# JIMP

JIMP is a programming language that compiles to portable bytecode, with a JavaScript compiler and an independent Rust runtime.

## Current foundation

The current language supports typed scalar expressions, lexical `let` and `var` variables, control flow, typed functions, recursion, `print`, acyclic static project modules, and catalog-backed standard modules. The compiler securely snapshots project graphs, tree-shakes standard-library exports, deterministically links generic calls, and emits self-contained portable `.jbc` 2.6 with optional debug and build metadata. The Rust runtime independently validates bytecode, explicit [target profiles](docs/specs/EN/TARGETS.md), Host ABI signatures, capability policy, and execution budgets. The [language](docs/specs/EN/LANGUAGE.md), [VM](docs/specs/EN/VM.md), [modules](docs/specs/EN/MODULES.md), [standard library](docs/specs/EN/STDLIB.md), [ISA](docs/specs/EN/ISA.md), [sandbox](docs/specs/EN/SANDBOX.md), [security model](docs/specs/EN/SECURITY.md), and [errors](docs/specs/EN/ERRORS.md) are formally documented.

Implementation progress and the prioritized roadmap are maintained in [docs/STATUS.md](docs/STATUS.md).

Release history is maintained in [CHANGELOG.md](CHANGELOG.md).

```powershell
npm run check
node compiler/src/cli.js compile examples/hello.jimp -o hello.jbc
node compiler/src/cli.js inspect hello.jbc
cargo run --manifest-path runtime/Cargo.toml -- hello.jbc
```

Use `inspect <file.jbc> --json` to produce machine-readable output. Inspection validates the bytecode before displaying its header, instruction offsets, opcodes, operands, and available module-and-line source mappings.

Compiler, inspector, and runtime failures use the same stable error contract. Human-readable diagnostics are the default; pass `--error-format=json` to emit one `jimp-error-v1` JSON object on standard error. The option is independent from the inspector's `--json` output option.

`npm run check` runs compiler unit tests, compiler-to-runtime integration tests, Rust formatting and lint checks, and runtime unit tests.

The portable VM ISA source of truth is [`isa/v1.json`](isa/v1.json). The resource profile source of truth is [`sandbox/v1.json`](sandbox/v1.json). The error contract source of truth is [`errors/v1.json`](errors/v1.json). The standard-library catalog source of truth is [`stdlib/v1.json`](stdlib/v1.json), with canonical portable fallback sources under [`stdlib/src`](stdlib/src). After changing one, run its `npm run generate:*` command; `npm run check` rejects stale generated JavaScript, Rust, or specification files and invalid fallback signatures or host dependencies.

Portable `.jbc` encoding, decoding, and JavaScript verification live in [`compiler/src/portable/module.js`](compiler/src/portable/module.js). The Rust runtime independently decodes and verifies format `2.6`, resolves authorized host imports to numeric handles, and executes the generic instruction stream under the generated reference sandbox's load, verification, stack, memory, and step budgets. Runtime failures include a portable module ID and source line when the optional debug section maps the current instruction.

Use `cargo run --manifest-path runtime/Cargo.toml -- --validate-portable <file.jbc>` to validate a module and resolve its host imports without executing it.
