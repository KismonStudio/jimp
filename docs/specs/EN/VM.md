# AUREON Portable VM v1

[Portuguese version](../PT/VM.md)

## Status

This document specifies the implemented portable AUREON VM v1 through P7.6. Format `2.9` preserves the independently verified, resource-bounded immutable heap and adds generic Unicode-scalar STRING length, indexed load, half-open slice, and concatenation operations.

The historical format in [BYTECODE.md](BYTECODE.md) contained a temporary `PRINT` opcode and is no longer emitted or accepted. Format `2.9` remains pre-stable while the language and VM continue to evolve.

The terms **must**, **must not**, **required**, and **invalid** are normative.

## Design principles

- The compiler understands high-level language concepts.
- The VM understands only generic execution primitives.
- External behavior is provided through named, typed host imports.
- A `.abc` module contains no native pointers or platform-specific symbols.
- The complete module is verified before execution or host effects.
- The same valid module has the same structural meaning on every compatible runtime.

## Value model

Portable VM v1 defines the following scalar value types:

| Type | Type tag | Meaning |
| --- | ---: | --- |
| `null` | `0` | Absence of a value |
| `bool` | `1` | `false` or `true` |
| `i64` | `2` | Signed 64-bit two's-complement integer |
| `f64` | `3` | IEEE 754 binary64 bit pattern |
| `string` | `4` | Immutable sequence of valid UTF-8 bytes |
| `heap_ref` | `5` | Opaque reference to an immutable VM-owned heap object |
| `void` | `255` | Signature-only marker for no return value |

`void` is not a runtime value and must not be stored in a register or constant-pool entry. There are no implicit conversions between value types.

The runtime's in-memory representation is implementation-defined. The observable values and their bytecode encodings are portable. All multibyte numbers in `.abc` are little-endian.

Strings are immutable. A string loaded from the constant pool may be shared by an implementation, but its observable content must not change. `heap_ref` follows the separate [portable heap contract](HEAP.md); collection and record meanings remain compiler-level contracts. Binary-buffer and function-reference values remain deferred.

## Virtual registers

Each function declares a `register_count` encoded as an unsigned 16-bit integer. Registers are local to a function invocation and are addressed from `r0` through `r(register_count - 1)`.

- Valid register indices range from `0` through `65534`.
- `0xffff` is reserved as `NO_REGISTER` in instruction operands.
- A function may declare zero through `65535` registers.
- Every register is initialized to `null` when its frame is created.
- Function arguments occupy consecutive registers starting at `r0` in each newly created call frame.
- Reading or writing an index outside the declared register range is invalid bytecode.
- Registers contain values, never host pointers or bytecode addresses.

Register allocation is a compiler responsibility. A runtime may use any internal representation that preserves these semantics.

## Module container

A portable `.abc` file consists of a header, a section directory, and section payloads. The directory permits validation and skipping optional sections without interpreting code.

### Header

| Field | Encoding | Required value |
| --- | --- | --- |
| magic | 4 bytes | ASCII `AURN` |
| format major | `u16` | `2` |
| format minor | `u16` | `9` |
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
| build metadata | `6` | Zero or one, optional |

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

Function code ranges must be fully inside the code section and must not overlap. The header's entry-function index must exist, have zero parameters, return `void`, and end physically with `HALT`. Every other function ends physically with `RETURN`. `HALT` is invalid outside the entry function, `RETURN` is invalid inside it, and bytecode cannot call the entry function.

## Code section and instruction model

The code section contains function instruction streams. Every instruction starts with a one-byte opcode followed by operands defined by the machine-readable ISA specification.

- Opcodes are stable within a format-major version.
- Operand integers are little-endian.
- Instructions have no implicit alignment or padding.
- Unknown opcodes and malformed operands are invalid.
- Instruction boundaries must be derived from the ISA definition, not guessed by scanning bytes.
- A module cannot define new opcode semantics.

## Debug section

The debug section maps encoded instruction offsets back to portable source-module IDs and source lines. Its directory entry must set the `OPTIONAL` flag. A valid format `2.9` module may omit this section without changing execution semantics.

| Field | Encoding | Meaning |
| --- | --- | --- |
| debug version | `u16` | `2` |
| debug flags | `u16` | `0`; other bits are reserved |
| source count | `u32` | Number of source-module IDs that follow |
| mapping count | `u32` | Number of mappings that follow |
| source byte length | `u32` | UTF-8 length of one portable module ID |
| source bytes | byte array | Non-empty portable module ID |
| code offset | `u32` | Mapping field: offset relative to the complete code section |
| source index | `u32` | Mapping field: source-table index, or `0xffffffff` when unavailable |
| source line | `u32` | Mapping field: one-based source line |

The source table precedes the mappings. Source IDs must be unique, valid UTF-8, non-empty, and no longer than the sandbox symbol limit. Each mapping contains one `code offset`, one `source index`, and one `source line`. Code offsets must be strictly increasing and must reference decoded instruction boundaries. Source indices must reference the source table or use `0xffffffff`. Counts above the sandbox instruction limit, zero source lines, duplicate offsets or sources, incomplete data, and trailing data are invalid. Mappings may be omitted for individual instructions.

Debug metadata is non-authoritative: it must not change instruction decoding, verification, control flow, values, host authorization, or any other execution behavior. The official runtime uses a valid mapping for the current instruction when reporting an execution failure; without a mapping, the same failure is reported without a source location.

## Build-metadata section

The optional build-metadata section records build metadata version `1`, zero flags, the selected standard-library major (`u16`), a zero reserved field, the target-profile name, the portable entry-module ID, and a sorted unique list of target-guaranteed capabilities. Each string is encoded as a `u32` byte length followed by non-empty UTF-8 bytes and is bounded by `MAX_SYMBOL_BYTES`; the capability count is bounded by `MAX_HOST_IMPORTS`.

This section is descriptive, not authority. A runtime selecting a non-portable target must receive that target explicitly, require an exact metadata match, independently verify the profile and host signatures, and then apply its own capability policy. It must never grant a capability merely because bytecode metadata names it. Modules without build metadata are compatible only with the portable baseline.

The initial generic instruction set has these semantic operations. Numeric opcodes and operand encodings are defined by the machine-readable [`isa/v1.json`](../../../isa/v1.json) source and summarized in the generated [ISA reference](ISA.md).

### `LOAD_CONST destination, constant`

- `destination`: register index (`u16`).
- `constant`: constant-pool index (`u32`).
- Copies the referenced immutable constant value into the destination register.

### `MOVE destination, source`

- `destination`: register index (`u16`).
- `source`: register index (`u16`).
- Copies the source value into the destination register.

### Typed unary operations

`NEGATE` and `BOOL_NOT` use `destination, operand` register operands. `NEGATE` accepts `I64` or `F64` and preserves the operand type. `BOOL_NOT` accepts `BOOL` and produces `BOOL`. Negating the minimum `I64` is a runtime overflow error.

### Typed binary arithmetic

`ADD`, `SUBTRACT`, `MULTIPLY`, `DIVIDE`, and `REMAINDER` use `destination, left, right` register operands. Both inputs must have the same numeric type, and the result has that type. `I64` arithmetic is checked; overflow, division by zero, and remainder by zero are runtime errors. `I64` division truncates toward zero. `F64` arithmetic follows IEEE 754 binary64 behavior.

### Generic STRING operations

`STRING_LENGTH destination, value` accepts STRING and produces I64. `STRING_LOAD destination, value, index` accepts STRING and I64 and produces a one-scalar STRING. `STRING_SLICE destination, value, start, end` accepts STRING and two I64 bounds and produces a half-open STRING range. These operations count Unicode scalar values, never UTF-8 bytes; negative or out-of-range indices and invalid ranges fail deterministically. `STRING_CONCAT destination, left, right` accepts two STRING values and produces STRING. All results remain subject to logical value-memory and execution-step budgets.

### Typed comparisons

`EQUAL` and `NOT_EQUAL` accept two same-typed runtime values and produce `BOOL`. `LESS_THAN`, `LESS_EQUAL`, `GREATER_THAN`, and `GREATER_EQUAL` accept two values of the same numeric type and produce `BOOL`.

### Typed boolean operations

`BOOL_AND` and `BOOL_OR` accept two `BOOL` operands and produce `BOOL`. They remain eager bytecode operations. The compiler lowers source-level `&&` and `||` to conditional jumps so their right operand is evaluated only when required.

### Control flow

`JUMP target` continues execution at `target`. `JUMP_IF_FALSE condition, target` and `JUMP_IF_TRUE condition, target` select between `target` and the following instruction according to a `BOOL` register.

- `target` is an unsigned `u32` byte offset relative to the beginning of the current function.
- A target must identify the first byte of an instruction in the same function.
- A target may be before or after the jump instruction, enabling loops.
- Every encoded instruction must be reachable from the function entry.
- Register types required by an instruction must be valid on every incoming control-flow path.

The verifier computes a fixed point across all incoming paths. Back edges cannot bypass type checks or make an encoded instruction unreachable.

### `CALL function, argument_start, argument_count, result`

- `function`: function-table index (`u32`), excluding the entry function.
- `argument_start`: first argument register in the caller (`u16`).
- `argument_count`: number of consecutive caller registers (`u16`).
- `result`: caller destination register (`u16`) or `NO_REGISTER`.

The argument count and types must exactly match the callee signature. A call creates an isolated frame with the callee's declared register count, initializes all registers to `null`, and copies arguments into consecutive registers beginning at `r0`. A `void` callee requires `NO_REGISTER`; a value-returning callee requires a valid destination register. Calls may be recursive.

### `RETURN result`

`result` is a register (`u16`) or `NO_REGISTER`. A `void` function must return `NO_REGISTER`. A value-returning function must return a register whose type exactly matches its signature. Returning removes the current frame, writes a returned value to the caller's declared destination when applicable, and resumes the caller after its `CALL`.

### `HOST_CALL import, argument_start, argument_count, result`

- `import`: host-import index (`u32`).
- `argument_start`: first argument register (`u16`).
- `argument_count`: number of consecutive argument registers (`u16`).
- `result`: destination register (`u16`) or `NO_REGISTER`.

Arguments occupy the consecutive range beginning at `argument_start`. The count and value types must match the declared import signature. A `void` import requires `NO_REGISTER`; a value-returning import requires a valid destination register. The runtime must check value types before invoking the host even when static verification has already established them.

### `HALT`

- Has no operands.
- Terminates the entry function and the program successfully.
- It must be the final encoded instruction of the entry function and must be reachable.

`PRINT`, `FETCH`, `JSON`, `VAR`, and `FUNCTION` are not VM instructions. The compiler lowers language constructs to generic instructions and host imports.

## Example lowering

The source statement:

```aureon
print "Hello";
```

is represented conceptually as:

```text
constants:
  0: string "std.console"
  1: string "write"
  2: string "Hello"
  3: string "\n"

imports:
  0: std.console.write(string) -> void

entry function:
  registers: 1
  LOAD_CONST r0, constant[2]
  HOST_CALL import[0], r0, 1, NO_REGISTER
  LOAD_CONST r0, constant[3]
  HOST_CALL import[0], r0, 1, NO_REGISTER
  HALT
```

An operating-system host may implement the import with a terminal, while a bare-metal host may implement it with VGA memory or a framebuffer. The `.abc` module remains unchanged.

## Verification and execution order

Before executing any instruction, a runtime must:

1. Validate the header and version.
2. Validate the section directory, bounds, cardinality, and overlap rules.
3. Decode and validate every constant, import, function, and instruction.
4. Validate all indices, register ranges, function ranges, jump targets, reachability, path-sensitive register types, signatures, and termination rules.
5. Apply implementation resource limits.
6. Resolve and authorize every host import without program-requested effects.
7. Create the verified internal program representation.

Only then may execution begin. Structural validation failure must produce no program-requested host effect. A host call may still fail during execution; effects completed by earlier valid host calls are not rolled back.

Instruction decoding first establishes opcode, operand, register, index, and jump-target structure. Type validation then propagates register types over the verified control-flow graph and requires every instruction contract to hold for all incoming paths. Physical instruction order alone must not determine the inferred type at a branch entry.

## Resource limits and security

The official limits are generated from [`sandbox/v1.json`](../../../sandbox/v1.json) and published in the [AUREON Reference Sandbox v1](SANDBOX.md). The JavaScript encoder and verifier and the Rust decoder and verifier enforce the same load and verification limits. The CLI checks the encoded file size before reading it.

Execution tracks steps, call frames, active registers, logical runtime value memory, and cumulative logical heap memory. Logical register value memory equals `16` bytes for every active register plus the UTF-8 payload bytes of every string stored in those registers. Heap objects, slots, direct string payloads, and depth follow [HEAP.md](HEAP.md) and are bounded separately. A frame is charged before its register array or argument strings are copied. Replacing or returning a value updates the register charge, and host arguments are borrowed without a VM-side copy.

Exceeding a load or verification limit rejects the complete module before execution and host effects. Exceeding an execution limit terminates the program with an error; completed effects from earlier authorized host calls are not rolled back. Logical limits are portable and deterministic but do not describe implementation allocator overhead or total process RSS.

Failures are exposed through the [AUREON Standard Error Format v1](ERRORS.md). Decode, verification, host-import resolution, and execution failures have separate stable codes. Diagnostic wording is implementation detail and may improve without changing the error code.

The module must never contain trusted native addresses. Debug and build metadata are non-authoritative and must not grant capabilities or otherwise alter authorization. Hosts expose capabilities explicitly and remain responsible for platform authorization and sandbox policy. The complete threat model, trust boundary, host obligations, and explicit non-guarantees are specified in the [AUREON Sandbox and Security Model v1](SECURITY.md).

## Deferred decisions

The following items require later specifications or implementation: binary buffers, asynchronous host operations, recoverable errors, runtime module imports and exports, column-level debug locations, and AOT/JIT execution.
