# JIMP Sandbox and Security Model v1

[Portuguese version](../PT/SECURITY.md)

## Status

This document specifies the P4.4 security contract for the official Rust runtime, portable `.jbc` format `2.6`, and `jimp-reference-sandbox` profile v1. It consolidates the guarantees defined by [VM.md](VM.md), the generated limits in [SANDBOX.md](SANDBOX.md), the capability model used by [STDLIB.md](STDLIB.md), and the failure classes in [ERRORS.md](ERRORS.md).

The terms **must**, **must not**, **required**, and **invalid** are normative. This is a VM-level sandbox contract, not a claim of operating-system or process isolation.

## Scope and trust boundaries

The official runtime treats the complete `.jbc` byte sequence as untrusted, including its header, section directory, constants, strings, imports, function metadata, instructions, control flow, and debug mappings. A module is not trusted because it was produced by the official compiler. Compiler-side checks improve diagnostics and reproducibility, but the Rust runtime independently decodes and verifies every module.

The trusted computing base consists of:

- the official runtime executable and its dependencies;
- the host implementation registered with the runtime;
- the capability policy selected by the embedder;
- the operating system and any outer process-isolation controls.

JIMP bytecode, source projects, build metadata, and debug metadata are outside that trusted base. A compromised runtime, host implementation, policy configuration, operating system, or distribution channel is outside the protection provided by this contract.

## Threat model

The sandbox is designed to reject or contain these module-controlled behaviors:

- malformed, truncated, overlapping, oversized, or unsupported module structures;
- invalid indices, register ranges, instruction operands, function ranges, or jump targets;
- type confusion across branches, calls, returns, and host invocations;
- unreachable or improperly terminated instruction streams;
- excessive verifier work within the dimensions represented by the reference profile;
- unbounded VM loops, recursion, active registers, or logical value memory;
- requests for unavailable, denied, or signature-incompatible host capabilities;
- attempts to influence execution through non-authoritative debug metadata;
- attempts to embed native addresses or invoke arbitrary FFI targets.

The sandbox assumes that the runtime and authorized host code behave according to their contracts. It does not defend against malicious native code already running inside the trusted process.

## Validation and effect boundary

The official runtime follows this order:

1. Read file metadata and reject an encoded module larger than `MAX_MODULE_BYTES` before reading its contents.
2. Decode the complete container and apply load limits.
3. Verify all functions, instructions, control-flow paths, types, signatures, termination rules, debug mappings, and verification budgets.
4. Resolve every host import against the exact capability policy, available host table, and declared signature without invoking the capability.
5. Create execution state and begin interpreting the verified representation.
6. Invoke a host capability only when a verified `HOST_CALL` is reached.

No module-requested host effect may occur before step 6. A decode, verification, or resolution failure therefore produces no module-requested partial output or other host action. Reading the input file, allocating runtime bookkeeping, and writing runtime diagnostics are runtime operations, not effects requested by the module.

`--validate-portable` completes steps 1 through 4 and never executes bytecode.

## Security guarantees

| Property | Enforced behavior | Failure phase |
| --- | --- | --- |
| Structural integrity | Section bounds, overlap, cardinality, encodings, indices, and instruction boundaries are checked before execution. | Decode |
| Control-flow and type integrity | Reachability, jump targets, path-sensitive register types, calls, returns, and host-call contracts are verified for every function. | Verify |
| Capability confinement | Every import must be exactly allowed, available, and signature-compatible before any instruction executes. | Resolve |
| VM resource bounds | Load, verification, call-frame, register, logical-value-memory, and execution-step limits use the selected sandbox profile. | Decode, verify, or execute |
| Host argument integrity | Runtime values are checked against the resolved import signature immediately before invocation. | Execute |
| Debug non-authority | Debug metadata may enrich diagnostics but cannot change decoding, control flow, values, authorization, or execution. | Decode or verify |
| Native-pointer exclusion | Bytecode contains symbolic imports and numeric VM operands, never trusted native addresses. | Decode and resolve |

A valid module can directly manipulate only its scalar values, virtual registers, control flow, and call frames. It has no implicit access to files, networking, environment variables, clocks, randomness, processes, or native memory. Such access exists only when an explicitly authorized host capability provides it.

## Capability security

A host import is a request, not permission. Before execution, the resolver requires all of the following:

1. The canonical capability symbol is present in the embedder's exact allowlist.
2. The host registered that symbol exactly once.
3. Parameter and return types exactly match the module declaration.
4. Resolution can complete without performing the requested external operation.

Resolution replaces symbolic lookup with an implementation-defined numeric handle. Bytecode cannot choose that handle or use it as a native address. The host validates the runtime argument values again when the handle is invoked.

The official standalone runtime currently authorizes only `std.console.write(STRING): VOID`. This permits writing supplied UTF-8 data to standard output and grants no filesystem, network, environment, clock, randomness, process, or arbitrary FFI authority.

Capability policy must be deny-by-default. Adding a capability expands the sandbox's authority and requires a separate review of its input validation, authorization, resource quotas, determinism, and side effects.

## Resource accounting

The normative numeric ceilings live in [`sandbox/v1.json`](../../../sandbox/v1.json) and are published in [SANDBOX.md](SANDBOX.md). Their security roles are:

- **Load limits** bound encoded input structures before large dependent allocations are accepted.
- **Verification limits** bound decoded instruction volume, per-function register state, and path-sensitive type-analysis state.
- **Execution limits** bound interpreted instructions, simultaneous frames, active registers, and logical value bytes.

Logical value memory charges each active register slot plus the UTF-8 payload of strings stored in active registers. Constant-pool strings are charged by separate load limits. The accounting is deterministic and portable, but it is not a measurement of allocator overhead or process resident memory.

One VM instruction incurs one execution step regardless of host work. Time spent, memory allocated, bytes written, or external requests performed inside an authorized host capability are not charged by the VM budgets. Hosts must apply their own quotas and cancellation rules.

## Failure and effect semantics

Decode and verification failures reject the complete module. Resolution failures reject it before execution. Execution-limit, arithmetic, or host-invocation failures terminate the program through the standard `jimp-error-v1` contract.

Execution is not transactional. Effects completed by earlier authorized host calls are not rolled back when a later instruction, limit, or host call fails. A host must not rely on the VM to provide atomicity, compensation, or exactly-once delivery.

## Explicit non-guarantees

The JIMP sandbox does not by itself provide:

- an operating-system process, container, user, tenant, or kernel security boundary;
- a hard limit on process RSS, allocator overhead, CPU time, wall-clock time, threads, file descriptors, or host-side allocations;
- a quota on standard output or other effects performed by an authorized capability;
- preemption, timeout, cancellation, or rollback of a blocked or long-running host invocation;
- confidentiality or integrity for module files, diagnostics, host arguments, or external data;
- bytecode authentication, signing, origin verification, or anti-tamper protection;
- protection from timing, cache, output-volume, or other side channels;
- protection from defects in the runtime, host implementation, dependencies, compiler, operating system, or hardware;
- deterministic behavior for external capabilities unless their individual contracts require it.

Deployments that execute adversarial code should combine this VM contract with an outer low-privilege process boundary and operating-system controls appropriate to their threat model.

## Host implementation requirements

A conforming host must:

- expose only explicitly registered, uniquely named, typed capabilities;
- keep import resolution free of module-requested side effects;
- validate handles, argument counts, argument types, and return types;
- reject unknown handles and malformed values without invoking an unintended operation;
- never interpret bytecode data as a raw pointer, native function address, or unrestricted FFI target;
- enforce capability-specific authorization, size limits, timeouts, path or network restrictions, and output quotas where applicable;
- report recoverable failures through the host result contract instead of intentionally terminating the process;
- document every externally observable effect and nondeterministic behavior.

The host remains responsible for the safety of its native implementation even when the VM supplied valid typed arguments.

## Deployment guidance

For untrusted modules, operators should run the runtime with the smallest capability allowlist and least-privileged operating-system identity, constrain process memory and CPU externally, bound output and I/O, isolate sensitive files and credentials, and validate a module with `--validate-portable` before scheduling execution. Validation is useful for admission control but does not authorize later execution under a different host policy.

## P4.4 acceptance

P4.4 is complete when the trust boundary, threat model, pre-effect validation order, capability rules, deterministic VM budgets, failure semantics, host obligations, and explicit non-guarantees are documented consistently in English and Portuguese and linked from the VM and generated sandbox references. This task changes no opcode, bytecode section, capability permission, or runtime authority.
