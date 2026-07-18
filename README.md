# JIMP

JIMP is a programming language that compiles to portable bytecode, with a JavaScript compiler and an independent Rust runtime.

## Current foundation

The initial vertical slice supports `print "text";`, encodes it into the binary `.jbc` v1 format, validates it, and executes it through the runtime console host. The bytecode contract is documented in [docs/specs/EN/BYTECODE.md](docs/specs/EN/BYTECODE.md).

Implementation progress and the prioritized roadmap are maintained in [docs/STATUS.md](docs/STATUS.md).

Release history is maintained in [CHANGELOG.md](CHANGELOG.md).

```powershell
npm test
node compiler/src/cli.js compile examples/hello.jimp -o hello.jbc
cargo run --manifest-path runtime/Cargo.toml -- hello.jbc
```
