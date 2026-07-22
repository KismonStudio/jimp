# JIMP Source Module Contract v1

[Portuguese version](../PT/MODULES.md)

## Status

This document specifies the implemented source-module contract for named function and record imports and exports, graph resolution, and static linking. The CLI securely loads an acyclic source graph, validates exact scalar and aggregate contracts, links module-qualified identities deterministically, and emits one self-contained `.jbc` 2.9 file with module-aware debug metadata.

The terms **must**, **must not**, **required**, and **invalid** are normative.

## Design boundary

Modules are a compiler and linker concept. They are not VM instructions, runtime filesystem requests, or Host ABI capabilities.

- One UTF-8 `.jimp` file defines one source module.
- Compilation starts from one entry module and produces one self-contained `.jbc` file.
- All source imports are resolved, parsed, analyzed, and linked before bytecode is emitted.
- Imported calls lower to the existing generic `CALL` instruction.
- Source imports must never become `HOST_CALL` instructions merely because they use `import` syntax.
- The runtime does not search source paths, read imported source files, download dependencies, or execute a dynamic module loader.
- Host ABI imports remain the separate typed capability mechanism defined by [VM.md](VM.md).

This boundary allows the same linked `.jbc` to run on hosts that have no source filesystem.

## Scope

Supported:

- relative source-file imports;
- named imported bindings;
- optional local aliases;
- exported typed functions;
- exported nominal record declarations and schemas;
- private module-local functions;
- private module-local records;
- transitive, acyclic dependency graphs;
- deterministic static linking into one portable module.

Deferred:

- exported variables or constants;
- mutable module state and module initializers;
- default, wildcard, namespace, side-effect-only, or dynamic imports;
- re-exports and export lists;
- cyclic module graphs;
- packages, version constraints, registries, URLs, and network resolution;
- runtime module loading and multiple `.jbc` linkage;
- source-level Host ABI declarations.

An imported non-entry module must contain only imports, record declarations, and function declarations. Executable statements are valid only in the entry module. This rule avoids hidden initialization order and observable import-time effects.

## Syntax

Imports occupy one logical line and must appear before every record declaration, function declaration, or executable statement, except for blank lines and comments.

```jimp
import { add, multiply as mul } from "./math.jimp";

let answer = add(20, 22);
mul(answer, 2);
```

Exports are written directly on function or record declarations:

```jimp
export function add(left: I64, right: I64): I64 {
  return left + right;
}

function privateHelper(value: I64): I64 {
  return value;
}

export record Point {
  x: I64,
  y: I64,
}
```

Once module syntax is enabled, `import`, `export`, `from`, and `as` are reserved, case-sensitive words. A semicolon on an import line is optional, consistent with other simple lines.

The following forms are invalid in module contract v1:

```jimp
import "./effects.jimp";
import * as math from "./math.jimp";
import math from "./math.jimp";
export { add };
export let value = 1;
```

## Imported bindings

An import item names an exported function or record and may declare a different local name with `as`.

```jimp
import { calculate as calculateTotal } from "./totals.jimp";
```

- The name before `as` is looked up in the dependency's export table.
- The name after `as`, or the original name when no alias exists, is the local binding.
- An imported function binding is immutable and callable wherever a module-local function is callable.
- An imported record binding names the same nominal type and permits record literals, annotations, field access, and exact aggregate function contracts under its local alias.
- Imported bindings are available throughout their module, including in functions declared before the import's first call site.
- Two imports must not create the same local binding.
- An imported binding must not conflict with a module-local function or record, variable, parameter, or reserved word.
- Importing the same exported declaration under distinct local aliases is valid.
- An import item that names a missing or private declaration is invalid.

Calls must match the exported function's exact parameter and return contract. JIMP performs no implicit conversion at a module boundary.

## Exported declarations

`export` changes visibility only. It does not change function evaluation, record identity, typing, calling convention, or runtime representation.

- Only a top-level function or record declaration may use `export`.
- Export names are the declared function or record names; export aliases are not supported.
- Export names must be unique in one module.
- A private function remains callable inside its declaring module.
- An exported function may call private functions and imported functions.
- An exported function cannot capture entry-module variables, matching the existing isolated function-scope rule.
- The entry module may export functions, although those exports are used only when another compilation treats that file as a dependency.
- An exported record exposes its qualified nominal identity, ordered field names, and exact field types. Importing it does not create a structurally interchangeable local record.
- An exported function may accept or return aggregates. Required record schemas are carried transitively for exact call and field-access analysis, but a caller must import a record declaration explicitly to name or construct that type.

Export tables are compile-time metadata. They do not expose native pointers and need not remain observable in the linked runtime module.

## Module specifiers

The initial source resolver accepts relative specifiers only:

```text
./name.jimp
../shared/name.jimp
```

A relative specifier:

- must begin with `./` or `../`;
- must use `/` as its separator on every operating system;
- must end in the exact `.jimp` extension;
- must not contain a NUL character, a backslash, an empty path segment, or a trailing slash;
- is interpreted after normal JIMP string-escape decoding;
- is not URL-decoded and does not use percent escapes;
- does not receive implicit extensions or `index.jimp` lookup.

Absolute paths, drive-qualified paths, UNC paths, `file:` URLs, network URLs, and bare names are invalid source specifiers.

The `std:` prefix is reserved for the [standard-library contract](STDLIB.md). A filesystem resolver must not interpret `std:` as a relative or project-root path. The compiler resolves it only from the selected toolchain catalog; when that catalog does not provide the requested module, the specifier is unresolved.

## Project root and module identity

Every compilation has one project root. The official CLI will use the entry module's directory by default and may accept an explicit root in a later implementation. The entry module and every resolved dependency must remain inside the real project root.

Each file has two related identities:

1. **Physical identity** is its canonical filesystem path after resolving symbolic links. It is used for caching, containment checks, and duplicate-file detection.
2. **Portable module ID** is the normalized path relative to the project root, encoded with `/`, such as `lib/math.jimp`. It is used in deterministic diagnostics and linker symbols.

Resolution must reject:

- lexical `..` traversal that escapes the project root;
- symbolic-link traversal whose real target escapes the real project root;
- two distinct portable module IDs that resolve to the same physical file;
- platform-specific aliases whose spelling would make the graph ambiguous;
- a file that is not regular, readable UTF-8 source.

Portable module IDs are case-sensitive. A compiler on a case-insensitive filesystem must detect conflicting IDs instead of silently choosing one.

## Resolution algorithm

For each import, the resolver performs these steps in order:

1. Decode and validate the module specifier.
2. Resolve it relative to the importing module's physical parent directory.
3. Normalize `.` and `..` segments without permitting project-root escape.
4. Resolve symbolic links and verify containment inside the real project root.
5. Require an existing, regular `.jimp` file.
6. Derive its portable module ID relative to the project root.
7. Reuse the parsed module when its physical identity is already cached.
8. Parse imports in source order and recursively resolve uncached dependencies.

No fallback search path is attempted after a step fails. In particular, the resolver must not search the working directory, environment-defined module paths, parent package directories, or the network.

## Graph validation

The complete graph must be resolved before semantic lowering begins.

- The entry module is the graph root.
- Every physical source file is parsed at most once per compilation.
- Imports are traversed in source order.
- A dependency cycle is invalid, including a file importing itself through an alias.
- A cycle diagnostic must show the portable module ID path that closes the cycle.
- Every imported name is checked only after the dependency's export table is known.
- A source file cannot change between graph loading and bytecode emission; implementations should snapshot contents or verify a stable file identity.

For a valid graph, modules are linked in a deterministic topological order: dependencies precede importers, and otherwise the first source-order discovery wins. Identical source bytes and compiler options must produce the same linked order on every supported platform.

## Name resolution and linking

Name resolution occurs within a module namespace before global function indices are allocated.

1. Collect module-local record schemas, function signatures, and export tables.
2. Resolve each imported binding to one exported function or record identity: `(portable module ID, export name)`.
3. Analyze declarations and function bodies using local and imported bindings and exact nominal aggregate identities.
4. Assign linked function indices in deterministic module and declaration order.
5. Lower calls to numeric `CALL` operands.
6. Emit one entry function for the entry module's executable statements.

Private functions with the same name in different modules do not conflict. Linker-visible names, diagnostics, and future debug file identities must remain module-qualified even if the current `.jbc` function table stores a compact implementation name.

The linked bytecode must retain sufficient debug identity to distinguish equal line numbers from different source modules. Extending a `jimp-error-v1` source location with a portable module ID is compatible because consumers must ignore unknown fields.

## Failure behavior

Module failures are compiler failures and use `JIMP-1001` with phase `compile`. Diagnostics must identify the importing portable module ID and source line when available.

Required failure cases include:

- invalid or unsupported specifier;
- project-root or symbolic-link escape;
- missing, unreadable, non-regular, or invalid UTF-8 source;
- duplicate or conflicting local import binding;
- missing or private exported declaration;
- duplicate export;
- import appearing after a declaration or executable statement;
- executable statement in a non-entry module;
- dependency cycle;
- incompatible imported call contract;
- ambiguous physical or case-insensitive file identity.

The compiler must emit no `.jbc` when any module failure occurs.

## Grammar extension

This grammar extends the notation in [LANGUAGE.md](LANGUAGE.md):

```ebnf
module              = { trivia-line }, { import-declaration, { trivia-line } },
                      { function-declaration | record-declaration
                        | exported-declaration | entry-statement } ;

import-declaration  = whitespace, "import", required-whitespace,
                      "{", whitespace, import-list, whitespace, "}",
                      required-whitespace, "from", required-whitespace,
                      string-literal, [ ";" ], whitespace, line-boundary ;
import-list         = import-item,
                      { whitespace, ",", whitespace, import-item } ;
import-item         = identifier,
                      [ required-whitespace, "as", required-whitespace,
                        identifier ] ;

exported-declaration = whitespace, "export", required-whitespace,
                       ( function-declaration | record-declaration ) ;
entry-statement     = statement ;
```

An empty import list is invalid. `entry-statement` is permitted only in the entry module. The `export` prefix and the declaration header must occupy the same logical line.

## Current implementation

The frontend represents imports separately from executable statements and marks visibility directly on function and record declarations. The project resolver supplies each imported item with its specifier, imported and local names, portable dependency module ID, declaration kind, and either an exact function signature or nominal record schema with transitive schema dependencies. Analysis rejects unresolved or extraneous descriptors, invalid contracts, duplicate local bindings, name conflicts, and executable statements in a non-entry module.

An analyzed imported call retains its module-qualified function identity until the linker assigns dependency-first global indices. The CLI uses `compileProject(entryPath)` semantics and supports complete project graphs. The lower-level `compile(source)` embedding API remains intentionally single-source and rejects imports because it has no project root or filesystem authority.

## Implementation acceptance criteria

The module implementation is complete through P7.6:

- the parser and analyzer implement this syntax and visibility model;
- the resolver enforces canonical identity and project-root containment;
- acyclic multi-file programs link deterministically into one `.jbc`;
- imported calls execute through generic `CALL` instructions and aggregate values use generic heap instructions in the Rust runtime;
- source diagnostics distinguish module IDs and lines;
- unit and cross-language integration tests cover valid graphs and every required failure class;
- no module concept or source path resolver is added to the VM instruction set.
