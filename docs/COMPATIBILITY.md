# Compatibility and Conformance

AUREON publishes compatibility as separate contracts so an implementation can support or reject each layer explicitly.

| Contract | Supported version |
| --- | --- |
| Toolchain | 0.1.0 |
| Runtime protocol | 1 |
| Portable bytecode | 2.9, little-endian |
| Host ABI catalog | 1 |
| Standard-library major | 1 |
| Target profiles | `portable`, `reference-native-i64` |
| Diagnostics | `aureon-error-v1` |

Compatibility is exact during the pre-stable 0.x series. The active runtime accepts portable bytecode `2.9` and rejects legacy format 1 plus portable formats `2.0` through `2.8`. The CLI rejects a runtime whose complete version/protocol handshake differs, and the runtime rejects unsupported bytecode, standard-library, capability, or target-profile metadata before execution.

## Running conformance

From a source checkout or installed release package:

```powershell
npm run test:conformance
```

An alternate public CLI and runtime can be selected without importing compiler internals:

```powershell
node tools/run-conformance.js --aureon=C:\path\to\aureon.js --runtime=C:\path\to\aureon-runtime.exe
```

The versioned manifest under `conformance/v1` separates language, bytecode, Host ABI, standard-library, target-profile, diagnostics, sandbox, and compatibility cases. Negative fixtures verify that no program output occurs before rejection. Repeated positive execution verifies deterministic observable output.
