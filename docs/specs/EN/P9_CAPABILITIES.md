# P9 Asynchronous Capability Integration Roadmap

[Portuguese version](../PT/P9_CAPABILITIES.md)

## Status and prerequisites

This document is the approved implementation roadmap for P9. It grants no current authority and does not add `std:files` or `std:http` yet. P9 begins only after P8 delivers generic typed results and immutable `BYTES`; any recursive public response model also depends on the approved P8 recursive-value contract.

P9 implements the security design established by [IO_CAPABILITIES.md](IO_CAPABILITIES.md). External API names remain standard-library catalog data and typed Host ABI symbols. Files, HTTP methods, URLs, sockets, paths, and platform handles never become keywords, opcodes, or trusted bytecode pointers.

## P9.1 — Task and future model

Specify and implement a typed asynchronous result such as `Task<T>` or `Future<T>` and the source operation used to await it. The design must define creation authority, single or repeated awaiting, ownership, result caching, failure representation, lexical scope, interaction with calls and loops, and behavior when entry execution finishes with pending work.

Task identifiers are execution-local, unforgeable, non-serializable, excluded from constants and ordinary Host ABI payloads, and never observable native handles. Generic scheduling instructions may be added only after their semantics and independent verification rules are approved.

## P9.2 — Deterministic bounded scheduler

Implement cooperative scheduling with explicit limits for pending tasks, ready events, polls, retained result bytes, active host operations, wakeups, and total scheduler work. Module verification completes before any task starts. Scheduling order and same-input fake-host behavior must be deterministic where external completion order is not involved.

The runtime must not block one VM instruction on unbounded native work. Host integrations use a reviewed start/poll/complete or equivalent protocol that supports outer runtime control and cannot re-enter arbitrary VM code.

## P9.3 — Structured cancellation and timeouts

Specify task scopes, cancellation propagation, terminal states, cleanup obligations, and timeout durations with an exact I64 unit and maximum. Cancellation must be idempotent. A completed, cancelled, timed-out, or failed task cannot later publish another result or perform a later module-requested effect.

Expected cancellation and timeout are typed results, not process failures or language exceptions. Runtime shutdown must request cancellation and bound cleanup; it cannot claim that uncooperative native code has stopped without an outer process boundary.

## P9.4 — Data-driven host registration

Replace the reference runtime's closed capability table with a versioned embedding interface that registers symbols, exact signatures, effect classifications, resource-policy metadata, and implementations as host data. The compiler and VM must not branch on standard-library function names.

Registration is separate from permission. Resolution still requires availability, exact signature compatibility, explicit policy authorization, and target-profile compatibility before execution. Duplicate symbols, unsupported ABI versions, malformed metadata, and incompatible policies fail before effects.

## P9.5 — Capability-gated `std:files`

Add typed file APIs only over immutable `BYTES`, generic results, tasks, and separately authorized read/write capabilities. The contract must define an embedder-selected root, platform-independent path syntax at the public boundary, canonical containment after symbolic-link resolution, read/write separation, overwrite and atomic-write policy, metadata exposure, request/result limits, cancellation, and cleanup.

The test matrix includes allowed reads and writes plus denial, unavailable capability, invalid path, traversal, absolute path, symbolic-link escape, race-sensitive replacement, oversized data, timeout, cancellation, host failure, and partial-write behavior. Tests use isolated temporary roots and never depend on developer files.

## P9.6 — Capability-gated `std:http`

Add typed HTTP requests and responses over immutable values and `BYTES`. The contract must define supported schemes and methods, normalized headers, URL parsing, destination allowlists, DNS and rebinding policy, redirect policy, TLS requirements, request/response/header limits, timeout, cancellation, decompression accounting, status handling, and credential isolation.

The default runtime grants no network authority. Tests use deterministic fake hosts or local isolated fixtures and cover denial, unavailable capability, malformed URL, disallowed scheme or destination, DNS policy failure, redirect escape, oversized input/output, malformed response, timeout, cancellation, and host failure.

## P9.7 — Deterministic integration harness

Provide fake clock, file, DNS, and HTTP hosts with scripted completions and failures. Conformance fixtures must exercise scheduler ordering and every required failure state without public internet access or ambient filesystem authority. The harness must prove that resolution failure causes no effect and cancellation prevents later effects.

## P9.8 — Security and conformance gate

Perform a dedicated threat-model review covering path traversal, symlink races, SSRF, DNS rebinding, redirect escapes, TLS policy, header injection, decompression bombs, secret leakage, confused deputy risks, unbounded native work, task leaks, cancellation races, and resource-accounting bypasses.

P9 is complete only when asynchronous operations, cancellation, data-driven host registration, files, and HTTP pass bilingual specifications, independent bytecode verification, deterministic fake-host tests, denied-by-default policies, package/install tests, and the full cross-platform quality gate.

## Deliberate exclusions

P9 does not add raw sockets, arbitrary FFI, subprocesses, environment access, ambient clocks, unrestricted filesystem paths, unrestricted redirects, dynamic code loading, or package installation. Those authorities require separate catalog capabilities and security reviews.
