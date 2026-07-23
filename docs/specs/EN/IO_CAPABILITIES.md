# AUREON File and Network Capability Design v1

[Portuguese version](../PT/IO_CAPABILITIES.md)

## Status

This is the completed P7.7 design contract. It grants no runtime authority and adds no `std:files` or `std:http` catalog module. Its implementation is planned by [P8](P8_TYPES.md) for value prerequisites and [P9](P9_CAPABILITIES.md) for asynchronous scheduling and capability-gated APIs.

## Required value and execution model

- `BYTES` must be an immutable, resource-charged byte sequence distinct from STRING and `[I64]`.
- External operations must return typed results; expected denial, timeout, cancellation, status, decoding, and size failures must not become language exceptions.
- Asynchronous work requires a specified task/future model with structured cancellation. Blocking a VM instruction on unbounded host work is invalid.
- Cancellation tokens and request handles are typed, execution-local, unforgeable values. They are never native pointers, constants, serializable bytecode data, or comparable identities.
- Timeouts are explicit I64 durations with a documented unit and maximum; no ambient clock authority is implied.

## Capability surface

Future functions may be cataloged under `std:files` and `std:http`, while authority remains separately named Host ABI capabilities such as `std.files.read`, `std.files.write`, and `std.http.request`. Source names such as `FETCH`, paths, sockets, methods, and headers do not become opcodes or keywords.

Filesystem capabilities require an embedder-selected root, canonical containment after symbolic-link resolution, explicit read/write separation, byte limits, and atomic-write policy. Network capabilities require scheme and destination allowlists, redirect policy, DNS/rebinding policy, request and response byte limits, header limits, timeout, cancellation, and TLS policy.

## Failure and test matrix

A conforming implementation must test allowed success plus denied, unavailable, signature-incompatible, invalid input, escaped path, disallowed destination, timeout, cancellation, oversized request, oversized response, malformed response, and host failure. Resolution failures occur before execution. Runtime failures return typed data when expected by the API and perform no later effect after cancellation. Fake deterministic hosts must cover tests without real filesystem or network access.

Hosts can omit every file and network capability. The portable VM, compiler, and existing standard library remain usable without them.
