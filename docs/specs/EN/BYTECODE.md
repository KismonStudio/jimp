# JIMP Bytecode v1

[Portuguese version](../PT/BYTECODE.md)

This document defines the initial interoperable JIMP bytecode contract.

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
