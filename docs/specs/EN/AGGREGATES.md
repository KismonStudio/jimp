# AUREON Aggregate Values v1

[Portuguese version](../PT/AGGREGATES.md)

## Status and scope

This document is the normative aggregate-value contract. P7.2 introduced the generic heap foundation, P7.3 implemented typed arrays, and P7.4 implemented nominal records.

## Types and syntax

Arrays use `[T]`, contain one element type, and preserve insertion order. Records are nominal, module-scoped declarations whose identity is the declaring module plus record name.

```aureon
record Point {
  x: I64,
  y: I64,
}

let values: [I64] = [10, 20]
let origin: Point = Point { x: 0, y: 0 }
```

An optional `: Type` annotation is permitted on `let` and `var`. An empty array requires a contextual element type. Array access uses `values[index]`, its I64 length is `values.length`, and record access uses `origin.x`. Record literals must initialize every field exactly once, in declaration order after analysis.

Aggregate updates are expressions and never mutate an existing value:

```aureon
let changed = values with [0] = 11
let moved = origin with { x: 4 }
```

The index expression is I64. A record update may name one or more distinct fields. Evaluation is left to right: the base, then the index when present, then replacement expressions in source order.

## Static typing

- Array literals must have one statically exact element type. Nested arrays are permitted.
- Record types are nominal. Records with identical fields but different qualified declarations are different types.
- Aggregate types may appear recursively in variable annotations, record fields, function parameters, and function returns.
- Function signatures encode the complete source type. The portable VM may erase array and record details to `HEAP_REF`, but compiler-generated operations and calls must be proven against the complete source signature before encoding.
- A control-flow join retains a register or variable type only when every incoming reachable path has the exact same type. There is no aggregate union, implicit nullable type, numeric widening, or structural record coercion.
- `NULL` is not an array or record and is not an implicit aggregate default.

The following are rejected before bytecode emission: heterogeneous array literals, untyped empty arrays, non-I64 indices, missing, duplicate, private, or unknown record fields, in-place indexed or field assignment, incompatible branch joins, and calls or returns with non-exact aggregate types.

## Ownership, aliasing, and lifetime

Arrays and records have immutable value semantics. Assignment, argument passing, return, and functional update behave as if the complete value were copied. Implementations may share immutable storage, but storage identity, address, reference count, and reclamation timing are not observable.

`var` permits rebinding only. Neither `value[index] = replacement` nor `value.field = replacement` is valid. A functional update returns a new value and leaves every alias of the old value unchanged.

Heap objects are created atomically from values that already exist. An object cannot contain its own not-yet-created reference, and no instruction mutates an object after creation. Consequently, the reachable heap graph is a directed acyclic graph. P7 does not require tracing cycle collection. A conforming runtime may retain allocated objects until execution ends, subject to cumulative sandbox limits.

## Equality and observable behavior

`==` and `!=` use structural equality for same-typed aggregates:

- arrays are equal when lengths match and corresponding elements are recursively equal;
- records are equal only when their nominal types match and every declared field is recursively equal;
- scalar leaves retain their existing equality rules;
- evaluation is deterministic and must terminate within sandbox work and depth limits.

There is no reference-identity operator. Sharing storage cannot change equality, updates, iteration order, diagnostics, or resource-limit outcomes defined by the reference sandbox.

Arrays are traversed deterministically by combining their I64 `length` with ascending I64 indices. P7 does not add a separate collection-iteration statement.

An out-of-bounds array read or update is a deterministic runtime failure until the recoverable-error mechanism in P7.5 provides an explicitly typed alternative. It performs no host effect and does not return `NULL`.

## Valid and rejected examples

Valid:

```aureon
let empty: [String] = []
let matrix: [[I64]] = [[1, 2], [3, 4]]
let next = matrix with [0] = [5, 6]
```

Rejected:

```aureon
let unknown = []
let mixed = [1, "two"]
matrix[0] = [5, 6]
let bad = Point { x: 1 }
```

## Modules and compatibility

An exported record declaration exposes its nominal type and complete field schema. Importers must explicitly import that record name to construct values. Exported functions may use aggregate types in their exact source contracts; the linker carries required record schemas transitively so callers can type-check returned values and field access without weakening nominal identity. Private record constructors remain module-local.

P7.2 changed the pre-stable portable format from `2.6` to `2.7` by adding `HEAP_REF` and the initial heap instructions. P7.3 and P7.4 completed aggregate value semantics in format `2.8` with generic immutable replacement and structural equality. Active format `2.9` preserves those semantics while adding unrelated generic STRING operations. Exact-version runtimes reject every earlier minor version. `HEAP_REF` cannot occur in the constant pool or Host ABI signatures and never exposes a host or native pointer.
