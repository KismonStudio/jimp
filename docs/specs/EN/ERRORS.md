# AUREON Standard Error Format v1

[Portuguese version](../PT/ERRORS.md)

> This file is generated from [`errors/v1.json`](../../../errors/v1.json). Do not edit it manually.

Compiler tools and runtimes report failures using a stable code, phase, message, and optional location. Human-readable output is the default. Passing `--error-format=json` emits one JSON object to standard error. Diagnostic text is not a compatibility boundary; `schema`, `code`, and `phase` are.

## Contract

`schema`, `code`, `phase`, and `message` are required. `location` is optional. Consumers must ignore unknown fields so compatible metadata can be added later.

## Human output

`AUREON error AUREON-1001 (compile) at source line 3: Undefined identifier value.`

## JSON output

```json
{"schema":"aureon-error-v1","code":"AUREON-1001","phase":"compile","message":"Undefined identifier value.","location":{"kind":"source","line":3}}
```

## Locations

`location` is omitted when unavailable. Source locations use `{"kind":"source","line":N}` and may include a portable `moduleId` when the frontend knows it. Bytecode locations use `{"kind":"bytecode","offset":N}`. Line numbers are one-based; byte offsets are zero-based. Runtime source locations are populated from the optional `.abc` debug section.

## Codes

| Code | Phase | CLI exit | Meaning |
| --- | --- | ---: | --- |
| `AUREON-0001` | `usage` | 2 | The command-line arguments are invalid or incomplete. |
| `AUREON-0002` | `io` | 1 | A required file could not be read, inspected, or written. |
| `AUREON-1001` | `compile` | 1 | Source parsing, semantic analysis, or bytecode lowering failed. |
| `AUREON-2001` | `decode` | 1 | The encoded .abc module is malformed or unsupported. |
| `AUREON-2002` | `verify` | 1 | The decoded module violates a structural, type, or control-flow rule. |
| `AUREON-3001` | `resolve` | 1 | A host import is unavailable, incompatible, or denied by policy. |
| `AUREON-4001` | `execute` | 1 | Execution or a host invocation failed. |
| `AUREON-9001` | `internal` | 1 | The tool encountered an unexpected internal failure. |
