# AUREON Variants, Matching, Generics, and Recursive Values

[Portuguese version](../PT/VARIANTS_AND_GENERICS.md)

## Status and scope

This document specifies the P8.1–P8.4 language contract implemented by the compiler, linker, standard catalog, and `.abc` 2.9 runtime. The terms **must**, **must not**, **required**, and **invalid** are normative.

## Declarations and types

Records, variants, and functions may declare up to `MAX_TYPE_PARAMETERS` unique type parameters:

```aureon
record Box<T> {
  value: T,
}

variant Result<T, E> {
  Ok(value: T),
  Error(error: E),
}

function identity<T>(value: T): T {
  return value;
}
```

A generic nominal type must provide exactly its declared number of type arguments, for example `Box<I64>` or `Result<STRING, I64>`. Generic types may be nested up to `MAX_TYPE_NESTING`. Type parameters have no constraints and are invariant. They do not exist as reflectable runtime values.

Nominal identity includes declaration kind, portable module identity, declared name, and exact type arguments. Two structurally equal declarations or differently instantiated types are not interchangeable.

## Variant construction

A value is constructed with `Type::Alternative(arguments)`. Arguments are positional and must exactly match the alternative payload fields.

```aureon
let success: Result<I64, STRING> = Result::Ok(42);
let failure: Result<I64, STRING> = Result::Error("failed");
```

Type arguments are inferred from payload arguments and an expected type. Construction is invalid if any type parameter remains unresolved; consequently, an empty alternative such as `Option::None()` normally requires a type annotation or another exact expected context.

Alternative names must be unique inside a variant. A variant must have at least one alternative and no more than `MAX_VARIANT_ALTERNATIVES`. Each alternative is limited to `MAX_NOMINAL_FIELDS` payload fields.

## Exhaustive matching

A match expression evaluates its subject once, selects one alternative, binds its payload from left to right, and evaluates exactly one result expression:

```aureon
let value = match(result) { Ok(item) => item, Error(_) => 0 };
```

Every declared alternative must occur exactly once. Unknown, duplicate, missing, or incorrectly bound alternatives are compile errors. All result expressions must have the same exact type. An arm binding is immutable and visible only in that arm. `_` discards one payload position and does not introduce a binding.

The source syntax currently supports flat alternative patterns only. Nested patterns, guards, catch-all arms, explicit fallthrough, and multi-line match expressions are not defined. A match has at most `MAX_MATCH_ARMS` arms.

## Generic inference and representation

Generic function type arguments are inferred by exact unification of declared parameter types with call argument types and, when available, the expected return type. Explicit call-site type arguments, overloads, subtyping, implicit conversions, and partial inference are not defined. Any inconsistent or unresolved substitution is a compile error.

One portable function body is emitted for each generic declaration. A naked type variable uses `HEAP_REF` at the bytecode function boundary. Concrete values are boxed into one-slot immutable heap objects before such calls and unboxed afterward. Generic-dependent nominal payload fields use the same verified representation. This uniform representation avoids monomorphized code growth while preserving exact source-level checking.

The runtime neither knows generic names nor performs unchecked casts. The compiler lowers variants and generics to existing `HEAP_ALLOC`, `HEAP_LOAD`, `HEAP_REPLACE`, `HEAP_EQUAL`, `CALL`, comparison, move, and jump instructions. There is no `MATCH`, `OPTION`, `RESULT`, or public-alternative opcode.

Indexed access and functional indexed update are invalid when an array's element type is a naked unresolved type parameter. Concrete arrays and generic nominal values remain supported.

## Recursive immutable values

A variant payload may recursively contain an instantiation of its declaring type:

```aureon
variant List<T> {
  Nil,
  Cons(head: T, tail: List<T>),
}
```

Only finite runtime values can be constructed. Heap objects are immutable after allocation, references are verifier-created handles rather than native pointers, and no instruction can forge a handle or introduce a backward mutable edge. Cyclic object graphs are therefore not expressible by valid bytecode.

Construction, transport, matching, and structural equality are bounded by the generated sandbox limits, including `MAX_HEAP_OBJECTS`, `MAX_TOTAL_HEAP_SLOTS`, `MAX_HEAP_BYTES`, `MAX_HEAP_DEPTH`, `MAX_HEAP_EQUALITY_VISITS`, `MAX_CALL_FRAMES`, and `MAX_EXECUTION_STEPS`. Exceeding a runtime budget terminates execution deterministically.

## Standard generic variants

`std:option` exports `Option<T>` with `None` and `Some(value: T)`. `std:result` exports `Result<T, E>` with `Ok(value: T)` and `Error(error: E)`. These are ordinary catalog-defined portable declarations; their names receive no compiler or VM privilege. Existing `StringResult` and other P7 result records remain available for compatibility.

## Module contract

Generic functions, records, and variants may be exported and imported by name. Export metadata carries type parameters, nominal identity, payload schemas, and transitive type dependencies. Linking preserves one generic function body and module-qualified nominal identities. A compiled `.abc` remains self-contained and requires no source-level type metadata at runtime.
