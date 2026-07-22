# JIMP Portable VM v1 — Generated ISA Reference

[Portuguese version](../PT/ISA.md)

> This file is generated from [`isa/v1.json`](../../../isa/v1.json). Do not edit it manually.

- Format version: `2.9`
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
| `5` | `HEAP_REF` | yes | Opaque reference to an immutable, VM-owned heap object. |
| `255` | `VOID` | no | Signature-only marker for no return value. |

## Instructions

| Opcode | Name | Operands | Description |
| ---: | --- | --- | --- |
| `1` | `LOAD_CONST` | `destination: register (u16)`<br>`constant: constant_index (u32)` | Loads an immutable constant into a virtual register. |
| `2` | `MOVE` | `destination: register (u16)`<br>`source: register (u16)` | Copies a value between virtual registers. |
| `3` | `HOST_CALL` | `import: import_index (u32)`<br>`argument_start: register (u16)`<br>`argument_count: register_count (u16)`<br>`result: optional_register (u16)` | Invokes a resolved, typed host import. |
| `4` | `HEAP_ALLOC` | `destination: register (u16)`<br>`value_start: register (u16)`<br>`value_count: register_count (u16)` | Atomically allocates an immutable heap object from consecutive registers. |
| `5` | `HEAP_LOAD` | `destination: register (u16)`<br>`object: register (u16)`<br>`index: register (u16)`<br>`result_type: value_type_tag (u16)` | Loads a typed slot from an immutable heap object using an I64 index. |
| `6` | `HEAP_LENGTH` | `destination: register (u16)`<br>`object: register (u16)` | Loads an immutable heap object's slot count as I64. |
| `7` | `HEAP_REPLACE` | `destination: register (u16)`<br>`object: register (u16)`<br>`index: register (u16)`<br>`value: register (u16)` | Creates an immutable heap object with one indexed slot replaced. |
| `8` | `HEAP_EQUAL` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Compares two immutable heap graphs structurally without exposing reference identity. |
| `60` | `STRING_LENGTH` | `destination: register (u16)`<br>`value: register (u16)` | Returns the Unicode scalar-value count of an immutable UTF-8 string as I64. |
| `61` | `STRING_LOAD` | `destination: register (u16)`<br>`value: register (u16)`<br>`index: register (u16)` | Loads one Unicode scalar value from an immutable UTF-8 string using an I64 index. |
| `62` | `STRING_SLICE` | `destination: register (u16)`<br>`value: register (u16)`<br>`start: register (u16)`<br>`end: register (u16)` | Copies a half-open Unicode scalar-value range from an immutable UTF-8 string. |
| `63` | `STRING_CONCAT` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Concatenates two immutable UTF-8 strings. |
| `10` | `NEGATE` | `destination: register (u16)`<br>`operand: register (u16)` | Negates a typed numeric value. |
| `11` | `ADD` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Adds two typed numeric values. |
| `12` | `SUBTRACT` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Subtracts two typed numeric values. |
| `13` | `MULTIPLY` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Multiplies two typed numeric values. |
| `14` | `DIVIDE` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Divides two typed numeric values. |
| `15` | `REMAINDER` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Computes the remainder of two typed numeric values. |
| `20` | `EQUAL` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Compares two same-typed values for equality. |
| `21` | `NOT_EQUAL` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Compares two same-typed values for inequality. |
| `22` | `LESS_THAN` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Tests whether a numeric value is less than another. |
| `23` | `LESS_EQUAL` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Tests whether a numeric value is less than or equal to another. |
| `24` | `GREATER_THAN` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Tests whether a numeric value is greater than another. |
| `25` | `GREATER_EQUAL` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Tests whether a numeric value is greater than or equal to another. |
| `30` | `BOOL_NOT` | `destination: register (u16)`<br>`operand: register (u16)` | Computes boolean negation. |
| `31` | `BOOL_AND` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Computes eager boolean conjunction. |
| `32` | `BOOL_OR` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Computes eager boolean disjunction. |
| `40` | `JUMP` | `target: code_offset (u32)` | Continues execution at an instruction offset in the current function. |
| `41` | `JUMP_IF_FALSE` | `condition: register (u16)`<br>`target: code_offset (u32)` | Jumps when a boolean condition is false. |
| `42` | `JUMP_IF_TRUE` | `condition: register (u16)`<br>`target: code_offset (u32)` | Jumps when a boolean condition is true. |
| `50` | `CALL` | `function: function_index (u32)`<br>`argument_start: register (u16)`<br>`argument_count: register_count (u16)`<br>`result: optional_register (u16)` | Invokes a typed function using consecutive argument registers. |
| `51` | `RETURN` | `result: optional_register (u16)` | Returns from the current function with an optional value. |
| `255` | `HALT` | — | Terminates the entry function successfully. |
