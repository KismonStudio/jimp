# JIMP Portable VM v1 — Generated ISA Reference

[Portuguese version](../PT/ISA.md)

> This file is generated from [`isa/v1.json`](../../../isa/v1.json). Do not edit it manually.

- Format version: `2.0`
- Byte order: `little-endian`
- Opcode width: `1 byte`
- `NO_REGISTER`: `65535` (`0xffff`)

## Value type tags

| Tag | Name | Runtime value | Description |
| ---: | --- | --- | --- |
| `0` | `NULL` | yes | Absence of a value. |
| `1` | `BOOL` | yes | Boolean false or true. |
| `2` | `I64` | yes | Signed 64-bit two's-complement integer. |
| `3` | `F64` | yes | IEEE 754 binary64 value. |
| `4` | `STRING` | yes | Immutable valid UTF-8 string. |
| `255` | `VOID` | no | Signature-only marker for no return value. |

## Instructions

| Opcode | Name | Operands | Description |
| ---: | --- | --- | --- |
| `1` | `LOAD_CONST` | `destination: register (u16)`<br>`constant: constant_index (u32)` | Loads an immutable constant into a virtual register. |
| `2` | `MOVE` | `destination: register (u16)`<br>`source: register (u16)` | Copies a value between virtual registers. |
| `3` | `HOST_CALL` | `import: import_index (u32)`<br>`argument_start: register (u16)`<br>`argument_count: register_count (u16)`<br>`result: optional_register (u16)` | Invokes a resolved, typed host import. |
| `255` | `HALT` | — | Terminates the entry function successfully. |
