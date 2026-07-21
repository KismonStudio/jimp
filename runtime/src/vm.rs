use crate::{
    generated::{
        isa::{Opcode, ValueType},
        sandbox::{
            MAX_ACTIVE_REGISTERS, MAX_CALL_FRAMES, MAX_EXECUTION_STEPS, MAX_RUNTIME_VALUE_BYTES,
            REGISTER_SLOT_BYTES,
        },
    },
    host::{Host, ResolvedHostImport},
    portable::{Instruction, Value, VerifiedPortableModule},
};

struct Frame {
    function: usize,
    instruction_pointer: usize,
    registers: Vec<Value>,
    return_destination: Option<usize>,
}

#[derive(Debug, Eq, PartialEq)]
pub(crate) struct RuntimeError {
    message: String,
    source_line: Option<u32>,
}

impl RuntimeError {
    fn new(message: impl Into<String>, source_line: Option<u32>) -> Self {
        Self {
            message: message.into(),
            source_line,
        }
    }

    pub(crate) fn into_parts(self) -> (String, Option<u32>) {
        (self.message, self.source_line)
    }

    #[cfg(test)]
    fn message(&self) -> &str {
        &self.message
    }
}

impl From<String> for RuntimeError {
    fn from(message: String) -> Self {
        Self::new(message, None)
    }
}

impl From<&str> for RuntimeError {
    fn from(message: &str) -> Self {
        Self::new(message, None)
    }
}

struct RuntimeResources {
    active_registers: usize,
    value_bytes: usize,
    execution_steps: usize,
}

fn value_payload_bytes(value: &Value) -> usize {
    match value {
        Value::String(value) => value.len(),
        _ => 0,
    }
}

fn frame_value_bytes(register_count: usize, arguments: &[Value]) -> Result<usize, String> {
    let slot_bytes = register_count
        .checked_mul(REGISTER_SLOT_BYTES)
        .ok_or("Runtime register memory calculation overflow.")?;
    arguments.iter().try_fold(slot_bytes, |total, value| {
        total
            .checked_add(value_payload_bytes(value))
            .ok_or_else(|| "Runtime value memory calculation overflow.".into())
    })
}

impl RuntimeResources {
    fn new(entry_registers: usize) -> Result<Self, String> {
        if entry_registers > MAX_ACTIVE_REGISTERS {
            return Err(format!(
                "Active register limit of {MAX_ACTIVE_REGISTERS} was exceeded."
            ));
        }
        let value_bytes = frame_value_bytes(entry_registers, &[])?;
        if value_bytes > MAX_RUNTIME_VALUE_BYTES {
            return Err(format!(
                "Runtime value memory limit of {MAX_RUNTIME_VALUE_BYTES} bytes was exceeded."
            ));
        }
        Ok(Self {
            active_registers: entry_registers,
            value_bytes,
            execution_steps: 0,
        })
    }

    fn step(&mut self) -> Result<(), String> {
        self.execution_steps += 1;
        if self.execution_steps > MAX_EXECUTION_STEPS {
            return Err(format!(
                "Execution step limit of {MAX_EXECUTION_STEPS} was exceeded."
            ));
        }
        Ok(())
    }

    fn push_frame(&mut self, register_count: usize, arguments: &[Value]) -> Result<(), String> {
        let active_registers = self
            .active_registers
            .checked_add(register_count)
            .ok_or("Active register count overflow.")?;
        if active_registers > MAX_ACTIVE_REGISTERS {
            return Err(format!(
                "Active register limit of {MAX_ACTIVE_REGISTERS} was exceeded."
            ));
        }
        let value_bytes = self
            .value_bytes
            .checked_add(frame_value_bytes(register_count, arguments)?)
            .ok_or("Runtime value memory calculation overflow.")?;
        if value_bytes > MAX_RUNTIME_VALUE_BYTES {
            return Err(format!(
                "Runtime value memory limit of {MAX_RUNTIME_VALUE_BYTES} bytes was exceeded."
            ));
        }
        self.active_registers = active_registers;
        self.value_bytes = value_bytes;
        Ok(())
    }

    fn pop_frame(&mut self, frame: &Frame) {
        self.active_registers -= frame.registers.len();
        self.value_bytes -= frame_value_bytes(frame.registers.len(), &frame.registers)
            .expect("verified frame memory must remain representable");
    }

    fn replace_register(
        &mut self,
        frame: &mut Frame,
        destination: usize,
        value: Value,
    ) -> Result<(), String> {
        let old_payload = value_payload_bytes(&frame.registers[destination]);
        let new_payload = value_payload_bytes(&value);
        let value_bytes = self
            .value_bytes
            .checked_sub(old_payload)
            .and_then(|bytes| bytes.checked_add(new_payload))
            .ok_or("Runtime value memory calculation overflow.")?;
        if value_bytes > MAX_RUNTIME_VALUE_BYTES {
            return Err(format!(
                "Runtime value memory limit of {MAX_RUNTIME_VALUE_BYTES} bytes was exceeded."
            ));
        }
        frame.registers[destination] = value;
        self.value_bytes = value_bytes;
        Ok(())
    }
}

fn execute_unary(opcode: Opcode, operand: &Value) -> Result<Value, String> {
    match (opcode, operand) {
        (Opcode::Negate, Value::I64(value)) => value
            .checked_neg()
            .map(Value::I64)
            .ok_or_else(|| "I64 negation overflow.".into()),
        (Opcode::Negate, Value::F64(value)) => Ok(Value::F64(-value)),
        (Opcode::BoolNot, Value::Bool(value)) => Ok(Value::Bool(!value)),
        _ => Err("Unary instruction received an invalid runtime value type.".into()),
    }
}

fn checked_i64_binary(opcode: Opcode, left: i64, right: i64) -> Result<Value, String> {
    let result = match opcode {
        Opcode::Add => left.checked_add(right),
        Opcode::Subtract => left.checked_sub(right),
        Opcode::Multiply => left.checked_mul(right),
        Opcode::Divide if right == 0 => return Err("I64 division by zero.".into()),
        Opcode::Divide => left.checked_div(right),
        Opcode::Remainder if right == 0 => return Err("I64 remainder by zero.".into()),
        Opcode::Remainder => left.checked_rem(right),
        _ => return Err("Invalid I64 arithmetic instruction.".into()),
    };
    result
        .map(Value::I64)
        .ok_or_else(|| format!("I64 {:?} overflow.", opcode))
}

fn values_equal(left: &Value, right: &Value) -> Result<bool, String> {
    match (left, right) {
        (Value::Null, Value::Null) => Ok(true),
        (Value::Bool(left), Value::Bool(right)) => Ok(left == right),
        (Value::I64(left), Value::I64(right)) => Ok(left == right),
        (Value::F64(left), Value::F64(right)) => Ok(left == right),
        (Value::String(left), Value::String(right)) => Ok(left == right),
        _ => Err("Equality instruction received different runtime value types.".into()),
    }
}

fn execute_binary(opcode: Opcode, left: &Value, right: &Value) -> Result<Value, String> {
    match (left, right) {
        (Value::I64(left), Value::I64(right)) => match opcode {
            Opcode::Add
            | Opcode::Subtract
            | Opcode::Multiply
            | Opcode::Divide
            | Opcode::Remainder => checked_i64_binary(opcode, *left, *right),
            Opcode::Equal => Ok(Value::Bool(left == right)),
            Opcode::NotEqual => Ok(Value::Bool(left != right)),
            Opcode::LessThan => Ok(Value::Bool(left < right)),
            Opcode::LessEqual => Ok(Value::Bool(left <= right)),
            Opcode::GreaterThan => Ok(Value::Bool(left > right)),
            Opcode::GreaterEqual => Ok(Value::Bool(left >= right)),
            _ => Err("I64 operands received an invalid binary instruction.".into()),
        },
        (Value::F64(left), Value::F64(right)) => match opcode {
            Opcode::Add => Ok(Value::F64(left + right)),
            Opcode::Subtract => Ok(Value::F64(left - right)),
            Opcode::Multiply => Ok(Value::F64(left * right)),
            Opcode::Divide => Ok(Value::F64(left / right)),
            Opcode::Remainder => Ok(Value::F64(left % right)),
            Opcode::Equal => Ok(Value::Bool(left == right)),
            Opcode::NotEqual => Ok(Value::Bool(left != right)),
            Opcode::LessThan => Ok(Value::Bool(left < right)),
            Opcode::LessEqual => Ok(Value::Bool(left <= right)),
            Opcode::GreaterThan => Ok(Value::Bool(left > right)),
            Opcode::GreaterEqual => Ok(Value::Bool(left >= right)),
            _ => Err("F64 operands received an invalid binary instruction.".into()),
        },
        (Value::Bool(left), Value::Bool(right)) => match opcode {
            Opcode::Equal => Ok(Value::Bool(left == right)),
            Opcode::NotEqual => Ok(Value::Bool(left != right)),
            Opcode::BoolAnd => Ok(Value::Bool(*left && *right)),
            Opcode::BoolOr => Ok(Value::Bool(*left || *right)),
            _ => Err("BOOL operands received an invalid binary instruction.".into()),
        },
        _ if matches!(opcode, Opcode::Equal | Opcode::NotEqual) => {
            let equal = values_equal(left, right)?;
            Ok(Value::Bool(if opcode == Opcode::Equal {
                equal
            } else {
                !equal
            }))
        }
        _ => Err("Binary instruction received invalid runtime value types.".into()),
    }
}

pub(crate) fn execute<H: Host>(
    module: &VerifiedPortableModule,
    resolved_imports: &[ResolvedHostImport],
    host: &mut H,
) -> Result<(), RuntimeError> {
    if resolved_imports.len() != module.imports.len() {
        return Err("Resolved host-import table does not match the verified module.".into());
    }
    let entry = module
        .functions
        .get(module.entry_function)
        .ok_or("Verified entry function is unavailable.")?;
    let mut frames = vec![Frame {
        function: module.entry_function,
        instruction_pointer: 0,
        registers: vec![Value::Null; entry.register_count],
        return_destination: None,
    }];
    let mut resources = RuntimeResources::new(entry.register_count)?;

    loop {
        let frame = frames.last().expect("execution always has an active frame");
        let function = frame.function;
        let instruction_pointer = frame.instruction_pointer;
        let source_line = module
            .source_lines
            .get(function)
            .and_then(|lines| lines.get(instruction_pointer))
            .copied()
            .flatten();
        resources
            .step()
            .map_err(|message| RuntimeError::new(message, source_line))?;
        let instruction = module.functions[function].instructions[instruction_pointer].clone();
        frames
            .last_mut()
            .expect("execution always has an active frame")
            .instruction_pointer += 1;

        let step = (|| -> Result<bool, String> {
            match instruction {
                Instruction::LoadConst {
                    destination,
                    constant,
                } => {
                    resources.replace_register(
                        frames.last_mut().expect("active frame"),
                        destination,
                        module.constants[constant].clone(),
                    )?;
                }
                Instruction::Move {
                    destination,
                    source,
                } => {
                    let value = frames.last().expect("active frame").registers[source].clone();
                    resources.replace_register(
                        frames.last_mut().expect("active frame"),
                        destination,
                        value,
                    )?;
                }
                Instruction::Unary {
                    opcode,
                    destination,
                    operand,
                } => {
                    let value = execute_unary(
                        opcode,
                        &frames.last().expect("active frame").registers[operand],
                    )?;
                    resources.replace_register(
                        frames.last_mut().expect("active frame"),
                        destination,
                        value,
                    )?;
                }
                Instruction::Binary {
                    opcode,
                    destination,
                    left,
                    right,
                } => {
                    let frame = frames.last().expect("active frame");
                    let result =
                        execute_binary(opcode, &frame.registers[left], &frame.registers[right])?;
                    resources.replace_register(
                        frames.last_mut().expect("active frame"),
                        destination,
                        result,
                    )?;
                }
                Instruction::Jump { target } => {
                    frames.last_mut().expect("active frame").instruction_pointer = target;
                }
                Instruction::JumpIfFalse { condition, target } => {
                    match frames.last().expect("active frame").registers[condition] {
                        Value::Bool(false) => {
                            frames.last_mut().expect("active frame").instruction_pointer = target;
                        }
                        Value::Bool(true) => {}
                        _ => {
                            return Err(
                                "JUMP_IF_FALSE condition has an invalid runtime type.".into()
                            );
                        }
                    }
                }
                Instruction::JumpIfTrue { condition, target } => {
                    match frames.last().expect("active frame").registers[condition] {
                        Value::Bool(true) => {
                            frames.last_mut().expect("active frame").instruction_pointer = target;
                        }
                        Value::Bool(false) => {}
                        _ => {
                            return Err(
                                "JUMP_IF_TRUE condition has an invalid runtime type.".into()
                            );
                        }
                    }
                }
                Instruction::HostCall {
                    import,
                    argument_start,
                    argument_count,
                    result,
                } => {
                    let signature = &module.imports[import];
                    let resolved = &resolved_imports[import];
                    let returned = {
                        let arguments = &frames.last().expect("active frame").registers
                            [argument_start..argument_start + argument_count];
                        for (index, (argument, expected_type)) in
                            arguments.iter().zip(&signature.parameter_types).enumerate()
                        {
                            if argument.value_type() != *expected_type {
                                return Err(format!(
                                    "Host call {} argument {index} has an invalid runtime type.",
                                    resolved.symbol
                                ));
                            }
                        }
                        host.invoke(resolved.handle, arguments)?
                    };
                    match (signature.return_type, result, returned) {
                        (ValueType::Void, None, None) => {}
                        (ValueType::Void, None, Some(_)) => {
                            return Err(format!(
                                "Host call {} returned a value for a VOID import.",
                                resolved.symbol
                            ));
                        }
                        (expected_type, Some(destination), Some(value))
                            if value.value_type() == expected_type =>
                        {
                            resources.replace_register(
                                frames.last_mut().expect("active frame"),
                                destination,
                                value,
                            )?;
                        }
                        (_, Some(_), None) => {
                            return Err(format!(
                                "Host call {} did not return its declared value.",
                                resolved.symbol
                            ));
                        }
                        (_, Some(_), Some(_)) => {
                            return Err(format!(
                                "Host call {} returned an incompatible value type.",
                                resolved.symbol
                            ));
                        }
                        _ => {
                            return Err(format!(
                                "Host call {} result contract is inconsistent.",
                                resolved.symbol
                            ));
                        }
                    }
                }
                Instruction::Call {
                    function,
                    argument_start,
                    argument_count,
                    result,
                } => {
                    if frames.len() >= MAX_CALL_FRAMES {
                        return Err(format!(
                            "Call stack limit of {MAX_CALL_FRAMES} frame(s) was exceeded."
                        ));
                    }
                    let called = &module.functions[function];
                    let registers = {
                        let arguments = &frames.last().expect("active frame").registers
                            [argument_start..argument_start + argument_count];
                        for (index, (argument, expected)) in
                            arguments.iter().zip(&called.parameter_types).enumerate()
                        {
                            if argument.value_type() != *expected {
                                return Err(format!(
                                    "Function call argument {index} has an invalid runtime type."
                                ));
                            }
                        }
                        resources.push_frame(called.register_count, arguments)?;
                        let mut registers = vec![Value::Null; called.register_count];
                        registers[..arguments.len()].clone_from_slice(arguments);
                        registers
                    };
                    frames.push(Frame {
                        function,
                        instruction_pointer: 0,
                        registers,
                        return_destination: result,
                    });
                }
                Instruction::Return { result } => {
                    let mut completed = frames.pop().expect("RETURN has an active function frame");
                    resources.pop_frame(&completed);
                    let returned = result.map(|register| {
                        std::mem::replace(&mut completed.registers[register], Value::Null)
                    });
                    let signature = &module.functions[completed.function];
                    let caller = frames
                        .last_mut()
                        .ok_or("Verified entry function returned unexpectedly.")?;
                    match (
                        signature.return_type,
                        completed.return_destination,
                        returned,
                    ) {
                        (ValueType::Void, None, None) => {}
                        (expected, Some(destination), Some(value))
                            if value.value_type() == expected =>
                        {
                            resources.replace_register(caller, destination, value)?;
                        }
                        _ => {
                            return Err(
                                "Function return contract is inconsistent at runtime.".into()
                            );
                        }
                    }
                }
                Instruction::Halt => return Ok(true),
            }
            Ok(false)
        })();
        match step {
            Ok(true) => return Ok(()),
            Ok(false) => {}
            Err(message) => return Err(RuntimeError::new(message, source_line)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        generated::sandbox::MAX_CONSTANT_STRING_BYTES,
        host::{HostHandle, ResolvedHostImport},
        portable::{HostImport, VerifiedFunction},
    };

    #[derive(Default)]
    struct RecordingHost {
        arguments: Vec<Value>,
    }

    impl Host for RecordingHost {
        fn invoke(
            &mut self,
            handle: HostHandle,
            arguments: &[Value],
        ) -> Result<Option<Value>, String> {
            assert_eq!(handle, HostHandle::new(7));
            self.arguments = arguments.to_vec();
            Ok(None)
        }
    }

    #[test]
    fn executes_generic_register_and_host_call_instructions() {
        let module = VerifiedPortableModule {
            entry_function: 0,
            constants: vec![Value::String("Hello from the VM\n".into())],
            imports: vec![HostImport {
                symbol: "test.console.write".into(),
                parameter_types: vec![ValueType::String],
                return_type: ValueType::Void,
            }],
            functions: vec![VerifiedFunction {
                register_count: 2,
                parameter_types: vec![],
                return_type: ValueType::Void,
                instructions: vec![
                    Instruction::LoadConst {
                        destination: 0,
                        constant: 0,
                    },
                    Instruction::Move {
                        destination: 1,
                        source: 0,
                    },
                    Instruction::HostCall {
                        import: 0,
                        argument_start: 1,
                        argument_count: 1,
                        result: None,
                    },
                    Instruction::Halt,
                ],
            }],
            source_lines: vec![],
        };
        let resolved = [ResolvedHostImport {
            symbol: "test.console.write".into(),
            handle: HostHandle::new(7),
        }];
        let mut host = RecordingHost::default();

        execute(&module, &resolved, &mut host).expect("module should execute");

        assert_eq!(
            host.arguments,
            [Value::String("Hello from the VM\n".into())]
        );
    }

    #[test]
    fn executes_verified_conditional_jumps() {
        let module = VerifiedPortableModule {
            entry_function: 0,
            constants: vec![
                Value::Bool(false),
                Value::String("wrong".into()),
                Value::String("right".into()),
            ],
            imports: vec![HostImport {
                symbol: "test.console.write".into(),
                parameter_types: vec![ValueType::String],
                return_type: ValueType::Void,
            }],
            functions: vec![VerifiedFunction {
                register_count: 2,
                parameter_types: vec![],
                return_type: ValueType::Void,
                instructions: vec![
                    Instruction::LoadConst {
                        destination: 0,
                        constant: 0,
                    },
                    Instruction::JumpIfFalse {
                        condition: 0,
                        target: 4,
                    },
                    Instruction::LoadConst {
                        destination: 1,
                        constant: 1,
                    },
                    Instruction::Jump { target: 5 },
                    Instruction::LoadConst {
                        destination: 1,
                        constant: 2,
                    },
                    Instruction::HostCall {
                        import: 0,
                        argument_start: 1,
                        argument_count: 1,
                        result: None,
                    },
                    Instruction::Halt,
                ],
            }],
            source_lines: vec![],
        };
        let resolved = [ResolvedHostImport {
            symbol: "test.console.write".into(),
            handle: HostHandle::new(7),
        }];
        let mut host = RecordingHost::default();

        execute(&module, &resolved, &mut host).expect("conditional module should execute");

        assert_eq!(host.arguments, [Value::String("right".into())]);
    }

    #[test]
    fn executes_checked_numeric_and_comparison_operations() {
        assert_eq!(
            execute_binary(Opcode::Add, &Value::I64(20), &Value::I64(22)),
            Ok(Value::I64(42))
        );
        assert_eq!(
            execute_binary(Opcode::Divide, &Value::F64(7.5), &Value::F64(2.5)),
            Ok(Value::F64(3.0))
        );
        assert_eq!(
            execute_binary(Opcode::GreaterEqual, &Value::I64(5), &Value::I64(5)),
            Ok(Value::Bool(true))
        );
        assert_eq!(
            execute_binary(
                Opcode::Equal,
                &Value::String("same".into()),
                &Value::String("same".into())
            ),
            Ok(Value::Bool(true))
        );
    }

    #[test]
    fn executes_boolean_and_unary_operations() {
        assert_eq!(
            execute_binary(Opcode::BoolAnd, &Value::Bool(true), &Value::Bool(false)),
            Ok(Value::Bool(false))
        );
        assert_eq!(
            execute_binary(Opcode::BoolOr, &Value::Bool(true), &Value::Bool(false)),
            Ok(Value::Bool(true))
        );
        assert_eq!(
            execute_unary(Opcode::BoolNot, &Value::Bool(false)),
            Ok(Value::Bool(true))
        );
        assert_eq!(
            execute_unary(Opcode::Negate, &Value::I64(7)),
            Ok(Value::I64(-7))
        );
    }

    #[test]
    fn rejects_invalid_i64_arithmetic_at_runtime() {
        assert!(
            execute_binary(Opcode::Add, &Value::I64(i64::MAX), &Value::I64(1))
                .expect_err("addition must overflow")
                .contains("overflow")
        );
        assert_eq!(
            execute_binary(Opcode::Divide, &Value::I64(1), &Value::I64(0)),
            Err("I64 division by zero.".into())
        );
        assert_eq!(
            execute_unary(Opcode::Negate, &Value::I64(i64::MIN)),
            Err("I64 negation overflow.".into())
        );
    }

    #[test]
    fn attaches_the_current_source_line_to_runtime_failures() {
        let module = VerifiedPortableModule {
            entry_function: 0,
            constants: vec![Value::I64(1), Value::I64(0)],
            imports: vec![],
            functions: vec![VerifiedFunction {
                register_count: 2,
                parameter_types: vec![],
                return_type: ValueType::Void,
                instructions: vec![
                    Instruction::LoadConst {
                        destination: 0,
                        constant: 0,
                    },
                    Instruction::LoadConst {
                        destination: 1,
                        constant: 1,
                    },
                    Instruction::Binary {
                        opcode: Opcode::Divide,
                        destination: 0,
                        left: 0,
                        right: 1,
                    },
                    Instruction::Halt,
                ],
            }],
            source_lines: vec![vec![Some(8), Some(8), Some(9), Some(9)]],
        };

        let error =
            execute(&module, &[], &mut RecordingHost::default()).expect_err("division must fail");

        assert_eq!(error.message(), "I64 division by zero.");
        assert_eq!(error.source_line, Some(9));
    }

    #[test]
    fn enforces_the_active_register_budget_before_the_call_frame_budget() {
        let module = VerifiedPortableModule {
            entry_function: 0,
            constants: vec![],
            imports: vec![],
            functions: vec![
                VerifiedFunction {
                    register_count: 0,
                    parameter_types: vec![],
                    return_type: ValueType::Void,
                    instructions: vec![
                        Instruction::Call {
                            function: 1,
                            argument_start: 0,
                            argument_count: 0,
                            result: None,
                        },
                        Instruction::Halt,
                    ],
                },
                VerifiedFunction {
                    register_count: 4_096,
                    parameter_types: vec![],
                    return_type: ValueType::Void,
                    instructions: vec![
                        Instruction::Call {
                            function: 1,
                            argument_start: 0,
                            argument_count: 0,
                            result: None,
                        },
                        Instruction::Return { result: None },
                    ],
                },
            ],
            source_lines: vec![],
        };

        let error = execute(&module, &[], &mut RecordingHost::default())
            .expect_err("recursive frames must exceed the active register budget");

        assert_eq!(
            error.message(),
            format!("Active register limit of {MAX_ACTIVE_REGISTERS} was exceeded.")
        );
    }

    #[test]
    fn enforces_logical_runtime_value_memory_for_recursive_strings() {
        let module = VerifiedPortableModule {
            entry_function: 0,
            constants: vec![Value::String("x".repeat(MAX_CONSTANT_STRING_BYTES))],
            imports: vec![],
            functions: vec![
                VerifiedFunction {
                    register_count: 1,
                    parameter_types: vec![],
                    return_type: ValueType::Void,
                    instructions: vec![
                        Instruction::LoadConst {
                            destination: 0,
                            constant: 0,
                        },
                        Instruction::Call {
                            function: 1,
                            argument_start: 0,
                            argument_count: 1,
                            result: None,
                        },
                        Instruction::Halt,
                    ],
                },
                VerifiedFunction {
                    register_count: 1,
                    parameter_types: vec![ValueType::String],
                    return_type: ValueType::Void,
                    instructions: vec![
                        Instruction::Call {
                            function: 1,
                            argument_start: 0,
                            argument_count: 1,
                            result: None,
                        },
                        Instruction::Return { result: None },
                    ],
                },
            ],
            source_lines: vec![],
        };

        let error = execute(&module, &[], &mut RecordingHost::default())
            .expect_err("recursive string copies must exceed logical value memory");

        assert_eq!(
            error.message(),
            format!("Runtime value memory limit of {MAX_RUNTIME_VALUE_BYTES} bytes was exceeded.")
        );
    }
}
