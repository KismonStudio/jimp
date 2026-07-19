# JIMP Portable VM v1

[Portuguese version](../PT/VM.md)

## Status

This document specifies the implemented foundation of the portable JIMP VM v1. It uses `.jbc` container format `2.0` so runtimes can distinguish it unambiguously from the retired prototype format `1`.

The historical format in [BYTECODE.md](BYTECODE.md) contained a temporary `PRINT` opcode and is no longer emitted or accepted. Format `2.0` remains pre-stable while the language and VM continue to evolve.

The terms **must**, **must not**, **required**, and **invalid** are normative.

## Design principles

- The compiler understands high-level language concepts.
- The VM understands only generic execution primitives.
- External behavior is provided through named, typed host imports.
- A `.jbc` module contains no native pointers or platform-specific symbols.
- The complete module is verified before execution or host effects.
- The same valid module has the same structural meaning on every compatible runtime.

## Scalar value model

Portable VM v1 defines the following scalar value types:

| Type | Type tag | Meaning |
| --- | ---: | --- |
| `null` | `0` | Absence of a value |
| `bool` | `1` | `false` or `true` |
| `i64` | `2` | Signed 64-bit two's-complement integer |
| `f64` | `3` | IEEE 754 binary64 bit pattern |
| `string` | `4` | Immutable sequence of valid UTF-8 bytes |
| `void` | `255` | Signature-only marker for no return value |

`void` is not a runtime value and must not be stored in a register or constant-pool entry. There are no implicit conversions between value types.

The runtime's in-memory representation is implementation-defined. The observable values and their bytecode encodings are portable. All multibyte numbers in `.jbc` are little-endian.

Strings are immutable. A string loaded from the constant pool may be shared by an implementation, but its observable content must not change. Collection, object, binary-buffer, and function-reference values are outside the initial v1 foundation.

## Virtual registers

Each function declares a `register_count` encoded as an unsigned 16-bit integer. Registers are local to a function invocation and are addressed from `r0` through `r(register_count - 1)`.

- Valid register indices range from `0` through `65534`.
- `0xffff` is reserved as `NO_REGISTER` in instruction operands.
- A function may declare zero through `65535` registers.
- Every register is initialized to `null` when its frame is created.
- Function arguments, when functions become executable, occupy consecutive registers starting at `r0`.
- Reading or writing an index outside the declared register range is invalid bytecode.
- Registers contain values, never host pointers or bytecode addresses.

Register allocation is a compiler responsibility. A runtime may use any internal representation that preserves these semantics.

## Module container

A portable `.jbc` file consists of a header, a section directory, and section payloads. The directory permits validation and skipping optional sections without interpreting code.

### Header

| Field | Encoding | Required value |
| --- | --- | --- |
| magic | 4 bytes | ASCII `JIMP` |
| format major | `u16` | `2` |
| format minor | `u16` | `0` for this design |
| module flags | `u32` | `0`; other bits are reserved |
| entry function | `u32` | Index in the function section |
| section count | `u16` | Number of directory entries |
| reserved | `u16` | `0` |

The header is followed immediately by `section count` directory entries.

### Section directory entry

| Field | Encoding | Meaning |
| --- | --- | --- |
| kind | `u16` | Section kind identifier |
| flags | `u16` | Section behavior flags |
| offset | `u32` | Absolute byte offset from the beginning of the file |
| length | `u32` | Section payload length in bytes |

Section flag bit `0` means `OPTIONAL`. All other flag bits are reserved and must be zero. A runtime may skip an unknown section only when `OPTIONAL` is set; it must reject an unknown required section.

Sections must be fully inside the file, must not overlap the header, directory, or another section, and may appear in any physical order. Padding is not implied and is not part of a section unless included in its declared length.

### Section kinds

| Kind | Identifier | Cardinality |
| --- | ---: | --- |
| constants | `1` | Exactly one, required |
| host imports | `2` | Exactly one, required; may contain zero entries |
| functions | `3` | Exactly one, required |
| code | `4` | Exactly one, required |
| debug | `5` | Zero or one, optional |

Duplicate singleton sections are invalid.

## Constant section

The constant section starts with an entry count encoded as `u32`, followed by that many entries. Each entry starts with a one-byte type tag and has the following payload:

| Type | Payload |
| --- | --- |
| `null` | No payload |
| `bool` | One byte: `0` for false or `1` for true |
| `i64` | Eight-byte two's-complement value |
| `f64` | Eight-byte IEEE 754 binary64 bit pattern |
| `string` | UTF-8 byte length as `u32`, followed by that many bytes |

Other boolean payloads, invalid UTF-8 strings, unknown tags, incomplete entries, and trailing section data are invalid. Duplicate constants are allowed and have distinct indices.

## Host-import section

The host-import section starts with an import count encoded as `u32`. Each import declares:

| Field | Encoding | Meaning |
| --- | --- | --- |
| namespace | `u32` | Index of a string constant, such as `std.console` |
| name | `u32` | Index of a string constant, such as `write` |
| parameter count | `u16` | Number of parameter type tags |
| return type | `u8` | Scalar type tag or `void` |
| flags | `u8` | `0` for synchronous v1 imports |
| parameter types | byte array | One scalar type tag per parameter |

The canonical import name is `namespace.name`, for example `std.console.write`. Namespace and name constants must be non-empty strings. `null` and `void` are invalid parameter types; `void` is permitted only as a return type.

All imports must be resolved, signature-checked, and authorized by host policy before execution begins. Resolution produces an implementation-defined numeric handle, so instruction execution does not require string lookup. Import resolution must not itself perform a program-requested external effect.

Raw native addresses and arbitrary FFI calls are forbidden. A host may reject an otherwise valid module when a required capability is unavailable or denied.

## Function section

The function section starts with a function count encoded as `u32`. Each function entry declares:

| Field | Encoding | Meaning |
| --- | --- | --- |
| name | `u32` | String constant index, or `0xffffffff` for anonymous |
| code offset | `u32` | Offset relative to the beginning of the code section |
| code length | `u32` | Function byte length |
| register count | `u16` | Size of the function's register frame |
| parameter count | `u16` | Number of parameter type tags |
| return type | `u8` | Scalar type tag or `void` |
| flags | `u8` | Reserved; must be `0` |
| reserved | `u16` | Must be `0` |
| parameter types | byte array | One scalar type tag per parameter |

Function code ranges must be fully inside the code section and must not overlap. The header's entry-function index must exist. In the initial v1 foundation, the entry function must have zero parameters and return `void`.

Function invocation instructions are intentionally deferred. The function-section model is defined now so the container will not require redesign when `CALL` and `RETURN` are introduced.

## Code section and instruction model

The code section contains function instruction streams. Every instruction starts with a one-byte opcode followed by operands defined by the machine-readable ISA specification.

- Opcodes are stable within a format-major version.
- Operand integers are little-endian.
- Instructions have no implicit alignment or padding.
- Unknown opcodes and malformed operands are invalid.
- Instruction boundaries must be derived from the ISA definition, not guessed by scanning bytes.
- A module cannot define new opcode semantics.

The initial generic instruction set has these semantic operations. Numeric opcodes and operand encodings are defined by the machine-readable [`isa/v1.json`](../../../isa/v1.json) source and summarized in the generated [ISA reference](ISA.md).

### `LOAD_CONST destination, constant`

- `destination`: register index (`u16`).
- `constant`: constant-pool index (`u32`).
- Copies the referenced immutable constant value into the destination register.

### `MOVE destination, source`

- `destination`: register index (`u16`).
- `source`: register index (`u16`).
- Copies the source value into the destination register.

### `HOST_CALL import, argument_start, argument_count, result`

- `import`: host-import index (`u32`).
- `argument_start`: first argument register (`u16`).
- `argument_count`: number of consecutive argument registers (`u16`).
- `result`: destination register (`u16`) or `NO_REGISTER`.

Arguments occupy the consecutive range beginning at `argument_start`. The count and value types must match the declared import signature. A `void` import requires `NO_REGISTER`; a value-returning import requires a valid destination register. The runtime must check value types before invoking the host even when static verification has already established them.

### `HALT`

- Has no operands.
- Terminates the entry function and the program successfully.
- In the initial linear foundation, it must be the final instruction of the entry function.

`PRINT`, `FETCH`, `JSON`, `VAR`, and `FUNCTION` are not VM instructions. The compiler lowers language constructs to generic instructions and host imports.

## Example lowering

The source statement:

```jimp
print "Hello";
```

is represented conceptually as:

```text
constants:
  0: string "std.console"
  1: string "write"
  2: string "Hello\n"

imports:
  0: std.console.write(string) -> void

entry function:
  registers: 1
  LOAD_CONST r0, constant[2]
  HOST_CALL import[0], r0, 1, NO_REGISTER
  HALT
```

An operating-system host may implement the import with a terminal, while a bare-metal host may implement it with VGA memory or a framebuffer. The `.jbc` module remains unchanged.

## Verification and execution order

Before executing any instruction, a runtime must:

1. Validate the header and version.
2. Validate the section directory, bounds, cardinality, and overlap rules.
3. Decode and validate every constant, import, function, and instruction.
4. Validate all indices, register ranges, function ranges, signatures, and termination rules.
5. Apply implementation resource limits.
6. Resolve and authorize every host import without program-requested effects.
7. Create the verified internal program representation.

Only then may execution begin. Structural validation failure must produce no program-requested host effect. A host call may still fail during execution; effects completed by earlier valid host calls are not rolled back.

## Resource limits and security

A runtime may impose documented limits lower than format maxima, including module size, constant count, string length, import count, function count, registers per function, instruction count, memory, and execution steps. Limits must be checked before unsafe allocation or execution.

The module must never contain trusted native addresses. Debug data is non-authoritative and must not affect execution. Hosts expose capabilities explicitly and remain responsible for platform authorization and sandbox policy.

## Deferred decisions

The following items require later specifications: arithmetic semantics, comparison rules, branching, calls and returns, heap values, collections, binary buffers, asynchronous host operations, exceptions, module imports and exports, debug encoding, and AOT/JIT execution.
