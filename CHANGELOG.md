# Changelog

All notable changes to JIMP are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned

- Formalize the v1 language syntax.
- Separate bytecode verification from runtime execution.
- Add automated compiler-to-runtime integration tests.

## [0.1.0] - 2026-07-17

### Added

- Initial JavaScript compiler and Rust runtime project structure.
- Minimal `print "text";` source language support.
- Binary JIMP bytecode v1 with `JIMP` magic number, versioning, `PRINT`, and `HALT` instructions.
- Bytecode validation for headers, versions, operand bounds, UTF-8 strings, termination, and trailing data.
- Console output support through the initial runtime host.
- Compiler and runtime unit tests.
- End-to-end example at `examples/hello.jimp`.
- English and Portuguese bytecode specifications, plus English implementation-status documentation.
