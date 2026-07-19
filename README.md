# JIMP

JIMP is a programming language that compiles to portable bytecode, with a JavaScript compiler and an independent Rust runtime.

## Current foundation

The current language foundation supports typed scalar expressions, immutable `let` variables, mutable `var` variables, and `print` for string expressions. It lowers source constructs to generic VM instructions and typed host imports, encodes a portable `.jbc` 2.1 module, validates the complete module, and executes it through the Rust runtime. The [language syntax](docs/specs/EN/LANGUAGE.md), [portable VM contract](docs/specs/EN/VM.md), and [generated ISA reference](docs/specs/EN/ISA.md) are formally documented.

Implementation progress and the prioritized roadmap are maintained in [docs/STATUS.md](docs/STATUS.md).

Release history is maintained in [CHANGELOG.md](CHANGELOG.md).

```powershell
npm run check
node compiler/src/cli.js compile examples/hello.jimp -o hello.jbc
node compiler/src/cli.js inspect hello.jbc
cargo run --manifest-path runtime/Cargo.toml -- hello.jbc
```

Use `inspect <file.jbc> --json` to produce machine-readable output. Inspection validates the bytecode before displaying its header, instruction offsets, opcodes, and operands.

`npm run check` runs compiler unit tests, compiler-to-runtime integration tests, Rust formatting and lint checks, and runtime unit tests.

The portable VM ISA source of truth is [`isa/v1.json`](isa/v1.json). After changing it, run `npm run generate:isa`; `npm run check` rejects stale generated JavaScript, Rust, or specification files.

Portable `.jbc` encoding, decoding, and JavaScript verification live in [`compiler/src/portable/module.js`](compiler/src/portable/module.js). The Rust runtime independently decodes and verifies format `2.1`, resolves authorized host imports to numeric handles, and executes the generic instruction stream.

Use `cargo run --manifest-path runtime/Cargo.toml -- --validate-portable <file.jbc>` to validate a module and resolve its host imports without executing it.
