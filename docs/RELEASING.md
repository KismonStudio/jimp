# Releasing JIMP

JIMP release candidates are validated on 64-bit Windows and Linux by the same complete quality gate. A release tag must match the package version as `v<version>`.

## Artifact model

Each platform archive contains the JavaScript compiler, public CLI, documentation, conformance suite, and the matching Rust runtime under `runtime/bin`. Node.js 20 or later is required to compile source, inspect bytecode, run the REPL, and coordinate execution. The bundled Rust runtime can validate or execute an existing compatible `.jbc` without Node.js.

Every archive is accompanied by a SHA-256 checksum file and a machine-readable `jimp-release-artifact-v1` manifest. Artifacts are platform-specific because they contain a native runtime. CI and release builds explicitly install Rust 1.94.1 and use the committed Cargo lockfile; reproducibility here means identical declared inputs and locked dependencies, not a claim of bit-for-bit identical native binaries across different operating-system images.

## Local candidate

```powershell
npm ci
npm run check
cargo build --locked --release --manifest-path runtime/Cargo.toml
node tools/package-release.js --platform=windows-x64 --runtime=runtime/target/release/jimp-runtime.exe
```

On Linux, use `--platform=linux-x64` and the runtime path without `.exe`.

## Automated release

The release workflow reruns the complete gate on both supported platforms, creates the archives and checksums, and publishes generated release notes only after both jobs succeed. A failure on either platform prevents publication.
