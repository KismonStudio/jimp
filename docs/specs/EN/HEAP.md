# JIMP Portable Heap v1

[Portuguese version](../PT/HEAP.md)

## Scope

Format `2.7` introduced the generic, immutable, resource-bounded heap foundation, and format `2.8` added generic functional replacement and structural equality for typed arrays and records. Active format `2.9` preserves that heap contract and adds generic STRING operations. The VM still does not define JSON, files, networking, host handles, or native pointers.

## Representation and instructions

`HEAP_REF` is an opaque VM value. It may appear in function signatures and registers, but never in constants or Host ABI signatures.

- `HEAP_ALLOC destination, value_start, value_count` atomically snapshots consecutive typed registers into a new immutable ordered object and stores its opaque reference. Zero values require `value_start = 0`.
- `HEAP_LOAD destination, object, index, result_type` reads one slot. `object` must be `HEAP_REF`, `index` must be I64, and the runtime slot type must exactly equal the verified result type.
- `HEAP_LENGTH destination, object` returns the slot count as I64.
- `HEAP_REPLACE destination, object, index, value` creates a new object with one slot replaced and leaves the original unchanged.
- `HEAP_EQUAL destination, left, right` compares immutable graphs structurally and returns BOOL without exposing handle identity.

The verifier checks complete instruction structure, register ranges, allocation width, flow types, result tags, call contracts, and termination before execution or Host ABI resolution can produce an effect. A bad index or mismatched defensive runtime type fails deterministically.

`EQUAL` and `NOT_EQUAL` reject raw `HEAP_REF` operands because reference identity is not observable. P7.3 and P7.4 lower approved same-typed aggregate comparisons to `HEAP_EQUAL`; `!=` additionally applies boolean negation.

## Safety and ownership

References are integer handles into one execution-local VM arena, not addresses. Handles cannot be encoded, forged through constants, passed to the host, dereferenced outside the arena, or reused by another execution.

Objects are immutable and allocations may refer only to previously allocated objects. This construction order makes cycles and forward references impossible. The reference runtime retains objects until execution ends; allocation budgets are therefore cumulative and independent of garbage-collection timing.

## Resource accounting

The generated sandbox contract defines maximum object count, slots per object, cumulative slots, logical heap bytes, nesting depth, and structural-equality visits. Logical bytes charge one object header, every slot, and direct UTF-8 string payloads. Nested objects are charged once when allocated, while a reference consumes only its slot. Failed allocation performs no partial allocation and does not modify its destination register.

Register memory and heap memory are separate budgets. Copying a `HEAP_REF` does not duplicate its object; allocating a new object always consumes cumulative heap budget. Execution-step limits remain applicable to every heap instruction.

## Inspector

The bytecode inspector prints heap instructions and all encoded operands. It never follows or displays runtime references because `.jbc` files cannot contain heap objects or handles.
