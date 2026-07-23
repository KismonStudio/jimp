# AUREON Toolchain Guide

This document describes the implemented P6 command-line toolchain. Language, bytecode, sandbox, standard-library, and target-profile contracts remain under `docs/specs`.

## Installation from a source package

AUREON source packages distribute the JavaScript compiler and Rust runtime source together. Platform release artifacts additionally bundle a compatible native runtime as documented in [RELEASING.md](RELEASING.md).

```powershell
npm install
npm run build:runtime
npm link
aureon --version
```

`npm run build:runtime` creates the optimized reference runtime in the package-controlled `runtime/target/release` directory. `npm link` exposes the `aureon` executable through npm's normal binary-link mechanism.

## Commands

```text
aureon run <input.aur> [project options] [--runtime=<path>] [--error-format=json]
aureon compile <input.aur> [-o <output.abc>] [project options] [--error-format=json]
aureon check <input.aur|input.abc> [project options] [--runtime=<path>] [--error-format=json]
aureon inspect <input.abc> [--json] [--error-format=json]
aureon init <directory> [--error-format=json]
aureon repl [project options] [--runtime=<path>] [--error-format=json]
aureon --version
aureon --help
```

Project options are:

- `--project-root=<path>` selects the source containment root.
- `--stdlib-major=<number>` selects the standard-library major catalog.
- `--target-profile=<profile>` selects link-time portable or native standard-library implementations and is forwarded to runtime validation.

`--json` controls successful inspector output. `--error-format=json` controls diagnostics for every command and is forwarded to runtime execution and validation.

## Run lifecycle

`aureon run` performs these steps in order:

1. Resolve, analyze, and link the complete source project.
2. Write the resulting `.abc` into a uniquely created system temporary directory.
3. Discover a runtime from an explicit or package-controlled location.
4. Verify the runtime version handshake.
5. Execute with the selected target profile and error format.
6. Remove the temporary directory after success or failure.

A compilation failure occurs before runtime discovery or execution. The runtime still independently decodes, verifies, resolves capabilities, and enforces sandbox limits.

## Check lifecycle

For a `.aur` input, `aureon check` compiles to temporary bytecode and invokes runtime validation without executing the entry function. For a `.abc` input, it validates the existing bytecode directly. Project-root and standard-library compiler options are invalid for an existing `.abc`; a target profile remains valid and may be required by native-targeted bytecode.

## Runtime discovery and compatibility

The CLI checks runtime locations in this order:

1. `--runtime=<path>`.
2. The explicit `AUREON_RUNTIME` environment variable.
3. The package-controlled `runtime/bin` location reserved for future release artifacts.
4. The package-controlled release build.
5. The package-controlled development build.

It does not search the working directory, execute an arbitrary `PATH` match, invoke Cargo automatically, or download a runtime. A missing runtime produces an actionable I/O diagnostic.

Before `run` or `check`, the CLI invokes only the selected runtime's `--version` handshake. Compiler version `0.1.0` requires exactly `aureon-runtime 0.1.0 protocol 1`. A mismatch is rejected before bytecode execution.

## Project initialization

`aureon init <directory>` creates this minimal layout:

```text
<directory>/
  main.aur
  README.md
```

The target directory must not exist. Initialization never merges with or overwrites an existing path. If a write fails after directory creation, the tool removes only that newly created partial directory.

## Interactive source buffer

`aureon repl` retains entered source declarations and statements as text, not as hidden runtime values. `:run` recompiles and executes the complete buffer through the normal pipeline in a fresh VM. See [REPL.md](REPL.md) for commands and the explicit state model.

## Conformance and releases

The public, versioned suite and compatibility matrix are documented in [COMPATIBILITY.md](COMPATIBILITY.md). Platform packaging, checksum generation, CI support, and the distinction between compiler and runtime artifacts are documented in [RELEASING.md](RELEASING.md).

## Examples

The [examples guide](../examples/README.md) covers scalar language features, functions, loops, source modules, standard-library imports, native target selection, bytecode inspection, validation, project initialization, and structured failures. The complete set is executed through public commands in the integration gate.
