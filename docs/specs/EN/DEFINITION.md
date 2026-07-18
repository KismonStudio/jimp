# JIMP — Official Project Definition (v1)

## Overview

**JIMP** is a programming language that compiles to **portable bytecode**, designed to completely separate the **compilation** process from the **execution** process.

Its architecture is based on two independent components:

* **Writer (Compiler):** responsible for analyzing, validating, and transforming source code into bytecode.
* **Reader (Runtime/VM):** responsible exclusively for interpreting and executing that bytecode.

The runtime has no knowledge of the high-level language or concepts such as variables, functions, strings, JSON, or specific APIs. It only executes a small, standardized, and deterministic set of instructions.

---

# Philosophy

The fundamental principle of JIMP is:

> **The compiler is smart. The runtime is simple.**

All language complexity exists only during compilation.

Once compiled, only a bytecode program remains, executable by any compatible implementation of the JIMP Virtual Machine.

---

# Goals

The project has the following goals:

* Create a portable programming language.
* Provide an open specification for the language, bytecode, and virtual machine.
* Allow multiple compatible VM implementations.
* Support multiple execution environments.
* Keep the runtime extremely small and predictable.
* Simplify portability across different architectures.
* Support execution on desktop, mobile, servers, and embedded systems.
* Support bare-metal execution.
* Provide sandboxing by default.
* Enable integration with applications and engines through a standardized Host ABI.

---

# Non-Goals

JIMP **does not aim to**:

* Replace JavaScript.
* Replace C.
* Replace Rust.
* Depend on Node.js.
* Depend on any operating system.
* Be a language exclusively for game development.
* Depend on the Kismon Engine or any other engine.

---

# Architecture

```text
JIMP Source Code
        │
        ▼
Official Compiler (JavaScript)
        │
        ▼
Lexer
        │
        ▼
Parser
        │
        ▼
AST
        │
        ▼
Semantic Analysis
        │
        ▼
IR
        │
        ▼
Optimizations
        │
        ▼
Bytecode (.jbc)
        │
        ▼
JIMP Runtime
        │
        ▼
Host Environment
```

---

# Components

## 1. Language

Defines:

* Syntax
* Grammar
* Type system
* Expressions
* Control flow
* Functions
* Modules
* Semantic rules

The language does not define how a program is executed.

---

## 2. Bytecode

JIMP Bytecode is a portable binary format.

It defines:

* Instructions
* Operands
* Constant Pool
* Imports
* Exports
* Metadata
* Debug information

The format is completely platform-independent.

---

## 3. Virtual Machine

The Virtual Machine is responsible only for:

* Loading modules.
* Validating bytecode.
* Managing registers.
* Managing memory.
* Managing the stack.
* Executing instructions.
* Forwarding calls to the Host.

The VM **does not implement high-level APIs**.

---

## 4. Host Environment

The Host provides external resources to the program.

Examples:

* Console
* File system
* Network
* Clock
* Graphical interface
* Hardware
* Engines

Each environment implements only the resources it chooses to provide.

---

# Project Structure

```text
JIMP
├── Language
├── Compiler
├── Bytecode
├── Virtual Machine
├── Runtime
├── CLI
├── Standard Library
└── Specification
```

---

# Official Implementation

## Compiler

Implemented in:

```text
JavaScript
```

Responsible for:

* Lexer
* Parser
* AST
* Semantic analysis
* IR
* Optimizations
* Bytecode generation
* CLI

---

## Runtime

Implemented in:

```text
Rust
```

Responsible for:

* Decoder
* Verifier
* Virtual Machine
* Scheduler
* Memory management
* Execution

The runtime is an independent executable.

It does not depend on Node.js.

---

# Communication

Communication between the compiler and the runtime occurs exclusively through bytecode.

```text
Source Code
      │
      ▼
Compiler
      │
      ▼
program.jbc
      │
      ▼
Runtime
```

Bytecode is the only contract between them.

---

# Compatible Implementations

The specification allows multiple implementations.

Examples:

* JavaScript VM
* Rust VM
* C VM
* Zig VM
* WebAssembly VM
* Bare-Metal VM

As long as they comply with the official specification.

---

# Portability

The same bytecode can be executed in any environment that implements the specification.

Examples:

* Windows
* Linux
* macOS
* Android
* Termux
* Raspberry Pi
* ESP32 (platform-specific implementation)
* Bare Metal

---

# Host ABI

All external communication occurs through the Host ABI.

Example:

```text
std.console.write
std.console.read
std.time.sleep
std.time.now
std.filesystem.read
std.filesystem.write
std.network.request
```

The VM is unaware of these implementations.

It simply requests that the Host execute them.

---

# Standard Library

The standard library is independent of the VM.

It may be organized into modules:

```text
std.core
std.text
std.math
std.collections
std.console
std.time
std.filesystem
std.network
```

Not all modules are required to exist in every environment.

---

# Security

Before execution, the runtime performs:

* Structural validation.
* Import validation.
* Bytecode version validation.
* Boundary validation.
* Instruction validation.

The goal is to prevent the execution of invalid or incompatible bytecode.

---

# Independence

JIMP can be used for:

* CLI applications
* Automation
* Development tools
* Scripting
* Games
* Servers
* Embedded systems
* Educational projects
* Experimental environments

Without depending on any specific framework.

---

# Integrations

External projects can integrate JIMP by implementing a Host.

Examples:

```text
Node.js Host
Android Host
Linux Host
Windows Host
Bare-Metal Host
Kismon Engine Host
Unreal Engine Host
Godot Host
```

Each Host provides its own APIs.

---

# Relationship with Kismon Engine

The **Kismon Engine is not part of the JIMP core**.

It may provide its own Host containing engine-specific libraries.

Example:

```jimp
use kismon.entity
use kismon.physics
use kismon.audio
```

These modules belong to the Kismon integration, not to JIMP itself.

---

# Distribution

The project is distributed as two main components.

## JIMP CLI

Responsible for:

* Compiling source code
* Validating source code
* Generating bytecode
* Running auxiliary tools

## JIMP Runtime

Responsible for:

* Loading bytecode
* Validating bytecode
* Executing programs

The CLI automatically installs the runtime when required.

---

# Development Philosophy

The project core prioritizes:

* Simplicity
* Modularity
* Portability
* Low coupling
* Open specification
* Cross-implementation compatibility
* Predictability
* Ease of porting to new platforms

---

# Mission

> Build a modern programming language based on portable bytecode, featuring a simple virtual machine, an open specification, and a decoupled architecture, allowing the same program to run in any environment that implements the JIMP Runtime and its Host ABI, regardless of the language used to implement that runtime.

---

# Architecture Summary

```text
              JIMP Source Code
                     │
                     ▼
      Official Compiler (JavaScript)
                     │
                     ▼
        Portable Bytecode (.jbc)
                     │
      ┌──────────────┼──────────────┐
      ▼              ▼              ▼
  Rust VM      JavaScript VM      C VM
      │              │              │
      └──────────────┼──────────────┘
                     ▼
             Host Environment
                     │
      ┌──────────────┼──────────────┐
      ▼              ▼              ▼
    Linux        Android      Kismon Engine
```
