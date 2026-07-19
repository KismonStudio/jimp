# Legacy JIMP Bytecode Format 1

[Portuguese version](../PT/BYTECODE.md)

This document preserves the historical prototype bytecode contract implemented in JIMP 0.1.0.

Format 1 is no longer emitted or accepted. The active interoperable contract is [JIMP Portable VM v1](VM.md), encoded as `.jbc` format `2.1`.

All multi-byte integers are unsigned little-endian. A program starts with a ten-byte header:

| Field | Size | Value |
| --- | ---: | --- |
| magic | 4 bytes | ASCII `JIMP` |
| version | 2 bytes | `1` |
| instruction count | 4 bytes | number of encoded instructions |

Instructions follow immediately. The last instruction must be `HALT`, and no bytes may follow it.

| Opcode | Name | Encoding | Behavior |
| ---: | --- | --- | --- |
| `1` | `PRINT` | opcode, UTF-8 byte length (`u16`), UTF-8 bytes | Writes the text followed by a newline through the console host. |
| `255` | `HALT` | opcode | Stops execution successfully. |

Runtimes must reject malformed headers, unsupported versions and opcodes, incomplete operands, invalid UTF-8, missing `HALT`, and trailing data.

## Validation before execution

A runtime must decode and validate the complete module before executing its first instruction or invoking any host capability. Validation failure must not produce partial program output or any other program-requested host effect.
