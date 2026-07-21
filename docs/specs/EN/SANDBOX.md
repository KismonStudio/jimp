# JIMP Reference Sandbox v1

[Portuguese version](../PT/SANDBOX.md)

> This file is generated from [`sandbox/v1.json`](../../../sandbox/v1.json). Do not edit it manually.

These limits define the mandatory resource profile implemented by the official compiler tools and Rust runtime. Load and verification limits are checked before execution. Execution limits terminate the program with an error and do not roll back earlier authorized host effects. Runtime value memory is a portable logical charge, not a promise about process RSS or allocator overhead.

| Phase | Limit | Value | Unit | Meaning |
| --- | --- | ---: | --- | --- |
| Load | `MAX_MODULE_BYTES` | 16,777,216 | bytes | Maximum encoded .jbc file size. |
| Load | `MAX_SECTION_COUNT` | 16 | sections | Maximum number of module-directory entries. |
| Load | `MAX_CONSTANTS` | 65,536 | constants | Maximum number of constant-pool entries. |
| Load | `MAX_CONSTANT_STRING_BYTES` | 1,048,576 | bytes | Maximum UTF-8 byte length of one string constant. |
| Load | `MAX_TOTAL_CONSTANT_STRING_BYTES` | 8,388,608 | bytes | Maximum combined UTF-8 bytes of all string constants. |
| Load | `MAX_SYMBOL_BYTES` | 256 | bytes | Maximum UTF-8 byte length of a referenced function or host symbol component. |
| Load | `MAX_HOST_IMPORTS` | 1,024 | imports | Maximum number of typed host imports. |
| Load | `MAX_FUNCTIONS` | 4,096 | functions | Maximum number of functions, including entry. |
| Load | `MAX_PARAMETERS` | 256 | parameters | Maximum parameters in a host or function signature. |
| Load | `MAX_CODE_BYTES` | 8,388,608 | bytes | Maximum combined encoded function-code size. |
| Verify | `MAX_TOTAL_INSTRUCTIONS` | 262,144 | instructions | Maximum decoded instructions across the module. |
| Verify | `MAX_REGISTERS_PER_FUNCTION` | 4,096 | registers | Maximum virtual registers in one function frame. |
| Verify | `MAX_VERIFICATION_TYPE_CELLS` | 4,194,304 | type cells | Maximum instruction-count times register-count for one function's flow analysis. |
| Execute | `MAX_CALL_FRAMES` | 1,024 | frames | Maximum simultaneous call frames, including entry. |
| Execute | `MAX_ACTIVE_REGISTERS` | 262,144 | registers | Maximum virtual registers across all active frames. |
| Execute | `REGISTER_SLOT_BYTES` | 16 | bytes | Logical memory charged for every active register, excluding string payload bytes. |
| Execute | `MAX_RUNTIME_VALUE_BYTES` | 33,554,432 | bytes | Maximum logical bytes for active register slots and their string payloads. |
| Execute | `MAX_EXECUTION_STEPS` | 1,000,000 | instructions | Maximum instructions executed by one program. |
