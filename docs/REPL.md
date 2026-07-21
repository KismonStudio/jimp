# JIMP REPL

The JIMP REPL is a source-buffer session. It deliberately does not preserve hidden runtime values, VM frames, or host handles between executions.

Each entered source line remains in an ordered buffer. `:run` writes a temporary source module, then invokes the same project resolver, parser, analyzer, linker, bytecode encoder, runtime handshake, independent runtime validation, capability policy, diagnostics, and sandbox used by `jimp run`. The complete buffer is recompiled and executed from a fresh VM every time, so observable effects repeat only when the user explicitly enters `:run` again.

```powershell
jimp repl
```

Project and runtime options accepted by `jimp run` are also accepted by the REPL. A project root controls relative module resolution and the containment boundary.

## Commands

| Command | Behavior |
| --- | --- |
| `:run` | Compile and execute the complete source buffer. |
| `:show` | Display the buffer with line numbers. |
| `:undo` | Remove the last source line. |
| `:clear` | Remove all source lines. |
| `:help` | Display command help. |
| `:quit` or `:exit` | End the session. |

Compilation or runtime errors use the selected normal or JSON diagnostic format and do not discard the buffer. This first REPL intentionally provides no automatic execution, incomplete-syntax detection, value introspection, incremental bytecode linking, or persistence of runtime state. Those features would require separately specified semantics.
