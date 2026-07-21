# JIMP

JIMP is a programming language that compiles to portable bytecode, with a JavaScript compiler and an independent Rust runtime.

## Current foundation

The current language supports typed scalar expressions, lexical `let` and `var` variables, `if`/`else`, `while`, `break`, `continue`, short-circuit boolean operators, typed functions, recursion, and `print` for string expressions. It lowers source constructs to generic VM instructions and typed host imports, encodes a portable `.jbc` 2.5 module with optional source-line debug metadata, verifies cyclic control flow and call contracts, and executes it through the resource-bounded Rust runtime. The [language syntax](docs/specs/EN/LANGUAGE.md), [portable VM contract](docs/specs/EN/VM.md), [generated ISA reference](docs/specs/EN/ISA.md), [sandbox profile](docs/specs/EN/SANDBOX.md), [security model](docs/specs/EN/SECURITY.md), and [standard error format](docs/specs/EN/ERRORS.md) are formally documented. The approved but not yet implemented P4 contracts define [static source modules](docs/specs/EN/MODULES.md) and a [VM-independent standard library](docs/specs/EN/STDLIB.md).

Implementation progress and the prioritized roadmap are maintained in [docs/STATUS.md](docs/STATUS.md).

Release history is maintained in [CHANGELOG.md](CHANGELOG.md).

```powershell
npm run check
node compiler/src/cli.js compile examples/hello.jimp -o hello.jbc
node compiler/src/cli.js inspect hello.jbc
cargo run --manifest-path runtime/Cargo.toml -- hello.jbc
```

Use `inspect <file.jbc> --json` to produce machine-readable output. Inspection validates the bytecode before displaying its header, instruction offsets, opcodes, operands, and available source-line mappings.

Compiler, inspector, and runtime failures use the same stable error contract. Human-readable diagnostics are the default; pass `--error-format=json` to emit one `jimp-error-v1` JSON object on standard error. The option is independent from the inspector's `--json` output option.

`npm run check` runs compiler unit tests, compiler-to-runtime integration tests, Rust formatting and lint checks, and runtime unit tests.

The portable VM ISA source of truth is [`isa/v1.json`](isa/v1.json). The resource profile source of truth is [`sandbox/v1.json`](sandbox/v1.json). The error contract source of truth is [`errors/v1.json`](errors/v1.json). The standard-library catalog source of truth is [`stdlib/v1.json`](stdlib/v1.json), with canonical portable fallback sources under [`stdlib/src`](stdlib/src). After changing one, run its `npm run generate:*` command; `npm run check` rejects stale generated JavaScript, Rust, or specification files and invalid fallback signatures or host dependencies.

Portable `.jbc` encoding, decoding, and JavaScript verification live in [`compiler/src/portable/module.js`](compiler/src/portable/module.js). The Rust runtime independently decodes and verifies format `2.5`, resolves authorized host imports to numeric handles, and executes the generic instruction stream under the generated reference sandbox's load, verification, stack, memory, and step budgets. Runtime failures include a source line when the optional debug section maps the current instruction.

Use `cargo run --manifest-path runtime/Cargo.toml -- --validate-portable <file.jbc>` to validate a module and resolve its host imports without executing it.
