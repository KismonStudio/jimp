# AUREON

AUREON is a programming language that compiles to portable bytecode, with a JavaScript compiler and an independent Rust runtime.

## Current foundation

The current language supports typed scalar expressions, Unicode-scalar string operations, immutable typed arrays, nominal and generic records, tagged variants, exhaustive matching, generic functions, bounded recursive immutable values, functional aggregate updates, structural equality, lexical variables, control flow, typed functions, recursion, `print`, acyclic static project modules, and catalog-backed standard modules including `Option<T>` and `Result<T, E>`. The compiler securely snapshots project graphs, validates exact contracts across modules, tree-shakes standard-library exports, links one uniform verified body per generic function, and emits self-contained portable `.abc` 2.9. The Rust runtime independently validates bytecode, explicit [target profiles](docs/specs/EN/TARGETS.md), Host ABI signatures, capability policy, execution budgets, a generic immutable [heap](docs/specs/EN/HEAP.md), and bounded pure JSON support. The [P8 type model](docs/specs/EN/VARIANTS_AND_GENERICS.md), [aggregate value model](docs/specs/EN/AGGREGATES.md), [recoverable results](docs/specs/EN/RESULTS.md), [JSON contract](docs/specs/EN/JSON.md), [future I/O capability design](docs/specs/EN/IO_CAPABILITIES.md), [language](docs/specs/EN/LANGUAGE.md), [VM](docs/specs/EN/VM.md), [modules](docs/specs/EN/MODULES.md), [standard library](docs/specs/EN/STDLIB.md), [ISA](docs/specs/EN/ISA.md), [sandbox](docs/specs/EN/SANDBOX.md), [security model](docs/specs/EN/SECURITY.md), and [errors](docs/specs/EN/ERRORS.md) are formally documented.

Implementation progress and the prioritized roadmap are maintained in [docs/STATUS.md](docs/STATUS.md).

[P8.1–P8.4](docs/specs/EN/VARIANTS_AND_GENERICS.md) implement tagged variants, exhaustive matching, generics, standard `Option<T>`/`Result<T, E>`, and bounded recursive immutable values. Future work remains specification-first: [P8.5–P8.7](docs/specs/EN/P8_TYPES.md) add immutable `BYTES`, structured JSON, and final conformance; [P9](docs/specs/EN/P9_CAPABILITIES.md) adds bounded asynchronous execution, data-driven host registration, and capability-gated files/HTTP; [P10](docs/specs/EN/P10_ECOSYSTEM.md) adds deterministic packages, lockfiles, verified offline caches, registry policy, and a versioned host-extension SDK. Planned surfaces are not currently implemented or authorized.

Release history is maintained in [CHANGELOG.md](CHANGELOG.md).

```powershell
npm run check
npm run build:runtime
npm run aureon -- run examples/hello.aur
```

Install the local command with `npm link`, then use `aureon run`, `aureon compile`, `aureon check`, `aureon inspect`, `aureon init`, and the source-buffer `aureon repl` from any directory. Pass `--runtime=<path>` or set `AUREON_RUNTIME` to select an explicit runtime binary. Otherwise, the CLI checks only package-controlled bundled, release, and development runtime locations. It never selects an executable from the working directory or downloads one implicitly. The complete lifecycle and overwrite policy are documented in the [toolchain guide](docs/TOOLCHAIN.md).

Use `inspect <file.abc> --json` to produce machine-readable output. Inspection validates the bytecode before displaying its header, instruction offsets, opcodes, operands, build metadata, and available module-and-line source mappings. See the tested [examples guide](examples/README.md) for project modules, standard-library targets, structured errors, and project initialization.

Compiler, inspector, and runtime failures use the same stable error contract. Human-readable diagnostics are the default; pass `--error-format=json` to emit one `aureon-error-v1` JSON object on standard error. The option is independent from the inspector's `--json` output option.

`npm run check` runs compiler unit tests, public CLI and compiler-to-runtime integration tests, the versioned public conformance suite, an isolated npm pack/install/build/run test, Rust formatting and lint checks, and runtime unit tests. See the [compatibility matrix](docs/COMPATIBILITY.md) and [release process](docs/RELEASING.md).

The portable VM ISA source of truth is [`isa/v1.json`](isa/v1.json). The resource profile source of truth is [`sandbox/v1.json`](sandbox/v1.json). The error contract source of truth is [`errors/v1.json`](errors/v1.json). The standard-library catalog source of truth is [`stdlib/v1.json`](stdlib/v1.json), with canonical portable fallback sources under [`stdlib/src`](stdlib/src). After changing one, run its `npm run generate:*` command; `npm run check` rejects stale generated JavaScript, Rust, or specification files and invalid fallback signatures or host dependencies.

Portable `.abc` encoding, decoding, and JavaScript verification live in [`compiler/src/portable/module.js`](compiler/src/portable/module.js). The Rust runtime independently decodes and verifies format `2.9`, resolves authorized host imports to numeric handles, and executes the generic instruction stream under the generated reference sandbox's load, verification, stack, register-memory, heap-memory, equality-work, JSON-work, and step budgets. Runtime failures include a portable module ID and source line when the optional debug section maps the current instruction.

Use `aureon check <file.aur|file.abc>` to compile when needed, validate a module, and resolve its host imports without executing it. The compiler and runtime must report the same toolchain version and runtime protocol before `run` or `check` proceeds.
