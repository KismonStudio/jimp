use crate::{
    generated::isa::ValueType,
    host::{Host, ResolvedHostImport},
    portable::{Instruction, Value, VerifiedPortableModule},
};

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

    for instruction in &function.instructions {
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
    }

    unreachable!("verified entry functions always terminate with HALT")
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
}
