use std::{env, fs, process};

use crate::{
    error::JimpError,
    generated::errors,
    generated::sandbox::MAX_MODULE_BYTES,
    generated::targets::{TARGET_PROFILES, TargetProfile},
    host::{CapabilityPolicy, ConsoleHost, Host, ResolvedHostImport, resolve_host_imports},
    portable::{VerifiedPortableModule, decode_portable_module, verify_portable_module},
    vm::execute,
};

mod error;
mod generated;
mod host;
mod portable;
mod vm;

const RUNTIME_PROTOCOL_VERSION: u32 = 1;

#[derive(Clone, Copy)]
enum ErrorFormat {
    Human,
    Json,
}

fn usage() -> JimpError {
    JimpError::new(
        errors::USAGE,
        "Usage: jimp-runtime <program.jbc> [--target-profile=<profile>] [--error-format=json] | jimp-runtime --validate-portable <program.jbc> [--target-profile=<profile>] [--error-format=json]",
    )
}

fn read_module(path: &str) -> Result<Vec<u8>, JimpError> {
    let metadata =
        fs::metadata(path).map_err(|error| JimpError::new(errors::IO, error.to_string()))?;
    if metadata.len() > MAX_MODULE_BYTES as u64 {
        return Err(JimpError::new(
            errors::DECODE,
            format!("Module size exceeds the sandbox limit of {MAX_MODULE_BYTES} bytes."),
        ));
    }
    fs::read(path).map_err(|error| JimpError::new(errors::IO, error.to_string()))
}

fn prepare_module<H: Host>(
    bytes: &[u8],
    host: &H,
    target: &TargetProfile,
) -> Result<(VerifiedPortableModule, Vec<ResolvedHostImport>), JimpError> {
    let decoded =
        decode_portable_module(bytes).map_err(|error| JimpError::new(errors::DECODE, error))?;
    let module =
        verify_portable_module(decoded).map_err(|error| JimpError::new(errors::VERIFY, error))?;
    match &module.build {
        Some(build)
            if build.target_profile != target.name
                || build.standard_library_major != 1
                || build.guaranteed_capabilities
                    != target
                        .guaranteed_capabilities
                        .iter()
                        .map(|capability| capability.symbol.to_owned())
                        .collect::<Vec<_>>() =>
        {
            return Err(JimpError::new(
                errors::RESOLVE,
                format!(
                    "Build metadata is incompatible with runtime target profile {}.",
                    target.name
                ),
            ));
        }
        None if target.name != "portable" => {
            return Err(JimpError::new(
                errors::RESOLVE,
                "Bytecode without build metadata is valid only for the portable target.",
            ));
        }
        _ => {}
    }
    for guaranteed in target.guaranteed_capabilities {
        let available = host
            .capabilities()
            .iter()
            .find(|capability| capability.symbol == guaranteed.symbol)
            .ok_or_else(|| {
                JimpError::new(
                    errors::RESOLVE,
                    format!("Target capability {} is not available.", guaranteed.symbol),
                )
            })?;
        if available.parameter_types != guaranteed.parameter_types
            || available.return_type != guaranteed.return_type
        {
            return Err(JimpError::new(
                errors::RESOLVE,
                format!(
                    "Target capability {} has an incompatible signature.",
                    guaranteed.symbol
                ),
            ));
        }
    }
    let mut allowed_symbols = vec!["std.console.write"];
    allowed_symbols.extend(
        target
            .guaranteed_capabilities
            .iter()
            .map(|capability| capability.symbol),
    );
    let resolved = resolve_host_imports(
        &module.imports,
        host.capabilities(),
        &CapabilityPolicy::new(&allowed_symbols),
    )
    .map_err(|error| JimpError::new(errors::RESOLVE, error))?;
    Ok((module, resolved))
}

fn run<H: Host>(bytes: &[u8], host: &mut H, target: &TargetProfile) -> Result<(), JimpError> {
    let (module, resolved) = prepare_module(bytes, host, target)?;
    execute(&module, &resolved, host).map_err(|error| {
        let (message, source_line, source_module_id) = error.into_parts();
        JimpError::new(errors::EXECUTE, message).with_source_location(source_line, source_module_id)
    })
}

fn validate_portable<H: Host>(
    bytes: &[u8],
    host: &H,
    target: &TargetProfile,
) -> Result<usize, JimpError> {
    let (_, resolved) = prepare_module(bytes, host, target)?;
    Ok(resolved.len())
}

fn parse_arguments(
    arguments: &[String],
) -> Result<(bool, String, &'static TargetProfile), JimpError> {
    let mut validate_only = false;
    let mut path = None;
    let mut target_name = "portable";
    let mut has_target = false;
    for argument in arguments {
        if argument == "--validate-portable" && !validate_only {
            validate_only = true;
        } else if let Some(name) = argument.strip_prefix("--target-profile=") {
            if has_target || name.is_empty() {
                return Err(usage());
            }
            has_target = true;
            target_name = name;
        } else if path.is_none() && !argument.starts_with('-') {
            path = Some(argument.clone());
        } else {
            return Err(usage());
        }
    }
    let path = path.ok_or_else(usage)?;
    let target = TARGET_PROFILES
        .iter()
        .find(|profile| profile.name == target_name)
        .ok_or_else(|| {
            JimpError::new(
                errors::USAGE,
                format!("Unknown target profile {target_name}."),
            )
        })?;
    Ok((validate_only, path, target))
}

fn report_and_exit(error: JimpError, format: ErrorFormat) -> ! {
    match format {
        ErrorFormat::Human => eprintln!("{}", error.human()),
        ErrorFormat::Json => eprintln!("{}", error.json()),
    }
    process::exit(error.exit_code());
}

fn main() {
    let raw_arguments: Vec<String> = env::args().skip(1).collect();
    if raw_arguments.as_slice() == ["--version"] {
        println!(
            "jimp-runtime {} protocol {RUNTIME_PROTOCOL_VERSION}",
            env!("CARGO_PKG_VERSION")
        );
        return;
    }
    let json_option_count = raw_arguments
        .iter()
        .filter(|argument| argument.as_str() == "--error-format=json")
        .count();
    let format = if json_option_count == 1 {
        ErrorFormat::Json
    } else {
        ErrorFormat::Human
    };
    let arguments: Vec<String> = raw_arguments
        .into_iter()
        .filter(|argument| argument != "--error-format=json")
        .collect();
    if json_option_count > 1 {
        report_and_exit(usage(), format);
    }
    let (validate_only, path, target) = match parse_arguments(&arguments) {
        Ok(parsed) => parsed,
        Err(error) => report_and_exit(error, format),
    };

    let result = read_module(&path)
        .and_then(|bytes| {
            if validate_only {
                validate_portable(&bytes, &ConsoleHost, target).map(|import_count| {
                    println!(
                        "Portable module valid and execution-ready: {import_count} host import(s) resolved."
                    );
                })
            } else {
                run(&bytes, &mut ConsoleHost, target)
            }
        });

    if let Err(error) = result {
        report_and_exit(error, format);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{host::HostHandle, portable::Value};

    #[derive(Default)]
    struct RecordingHost {
        invocations: usize,
    }

    impl Host for RecordingHost {
        fn invoke(
            &mut self,
            _handle: HostHandle,
            _arguments: &[Value],
        ) -> Result<Option<Value>, String> {
            self.invocations += 1;
            Ok(None)
        }
    }

    #[test]
    fn performs_no_host_effect_when_verification_fails() {
        let mut host = RecordingHost::default();

        let target = TARGET_PROFILES
            .iter()
            .find(|profile| profile.name == "portable")
            .expect("portable target");
        assert!(run(b"not portable bytecode", &mut host, target).is_err());
        assert_eq!(host.invocations, 0);
    }
}
