use crate::{
    generated::isa::{Opcode, ValueType},
    host::{Host, ResolvedHostImport},
    portable::{Instruction, Value, VerifiedPortableModule},
};

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
) -> Result<(), String> {
    if resolved_imports.len() != module.imports.len() {
        return Err("Resolved host-import table does not match the verified module.".into());
    }
    let function = module
        .functions
        .get(module.entry_function)
        .ok_or("Verified entry function is unavailable.")?;
    let mut registers = vec![Value::Null; function.register_count];

    let mut instruction_pointer = 0;
    loop {
        let instruction = &function.instructions[instruction_pointer];
        let mut next_instruction = instruction_pointer + 1;
        match *instruction {
            Instruction::LoadConst {
                destination,
                constant,
            } => {
                registers[destination] = module.constants[constant].clone();
            }
            Instruction::Move {
                destination,
                source,
            } => {
                registers[destination] = registers[source].clone();
            }
            Instruction::Unary {
                opcode,
                destination,
                operand,
            } => {
                registers[destination] = execute_unary(opcode, &registers[operand])?;
            }
            Instruction::Binary {
                opcode,
                destination,
                left,
                right,
            } => {
                let result = execute_binary(opcode, &registers[left], &registers[right])?;
                registers[destination] = result;
            }
            Instruction::Jump { target } => next_instruction = target,
            Instruction::JumpIfFalse { condition, target } => match registers[condition] {
                Value::Bool(false) => next_instruction = target,
                Value::Bool(true) => {}
                _ => return Err("JUMP_IF_FALSE condition has an invalid runtime type.".into()),
            },
            Instruction::JumpIfTrue { condition, target } => match registers[condition] {
                Value::Bool(true) => next_instruction = target,
                Value::Bool(false) => {}
                _ => return Err("JUMP_IF_TRUE condition has an invalid runtime type.".into()),
            },
            Instruction::HostCall {
                import,
                argument_start,
                argument_count,
                result,
            } => {
                let signature = &module.imports[import];
                let resolved = &resolved_imports[import];
                let arguments = &registers[argument_start..argument_start + argument_count];
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
                let returned = host.invoke(resolved.handle, arguments)?;
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
                        registers[destination] = value;
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
            Instruction::Halt => return Ok(()),
        }
        instruction_pointer = next_instruction;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
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
}
