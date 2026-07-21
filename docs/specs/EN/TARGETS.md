# JIMP Target Profiles v1

[Portuguese version](../PT/TARGETS.md)

> Generated from [`targets/v1.json`](../../../targets/v1.json).

Target profiles are explicit compiler/runtime contracts. Native standard-library replacement occurs only at link time; the runtime never probes or falls back dynamically.

| Profile | Guaranteed optional capabilities | Contract |
| --- | --- | --- |
| `portable` | — | Portable baseline with no optional native standard-library capabilities. |
| `reference-native-i64` | `std.math.i64.absolute`, `std.math.i64.maximum`, `std.math.i64.minimum`, `std.math.i64.sign` | Reference runtime profile with native, semantically equivalent signed-I64 helpers. |
