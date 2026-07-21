use std::{env, fs, process};

use crate::{
    error::JimpError,
    generated::errors,
    generated::sandbox::MAX_MODULE_BYTES,
    host::{CapabilityPolicy, ConsoleHost, Host, ResolvedHostImport, resolve_host_imports},
    portable::{VerifiedPortableModule, decode_portable_module, verify_portable_module},
    vm::execute,
};

mod error;
mod generated;
mod host;
mod portable;
mod vm;

const PORTABLE_CAPABILITY_POLICY: &[&str] = &["std.console.write"];

#[derive(Clone, Copy)]
enum ErrorFormat {
    Human,
    Json,
}

fn usage() -> JimpError {
    JimpError::new(
        errors::USAGE,
        "Usage: jimp-runtime <program.jbc> [--error-format=json] | jimp-runtime --validate-portable <program.jbc> [--error-format=json]",
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
) -> Result<(VerifiedPortableModule, Vec<ResolvedHostImport>), JimpError> {
    let decoded =
        decode_portable_module(bytes).map_err(|error| JimpError::new(errors::DECODE, error))?;
    let module =
        verify_portable_module(decoded).map_err(|error| JimpError::new(errors::VERIFY, error))?;
    let resolved = resolve_host_imports(
        &module.imports,
        host.capabilities(),
        &CapabilityPolicy::new(PORTABLE_CAPABILITY_POLICY),
    )
    .map_err(|error| JimpError::new(errors::RESOLVE, error))?;
    Ok((module, resolved))
}

fn run<H: Host>(bytes: &[u8], host: &mut H) -> Result<(), JimpError> {
    let (module, resolved) = prepare_module(bytes, host)?;
    execute(&module, &resolved, host).map_err(|error| {
        let (message, source_line) = error.into_parts();
        JimpError::new(errors::EXECUTE, message).with_source_line(source_line)
    })
}

fn validate_portable<H: Host>(bytes: &[u8], host: &H) -> Result<usize, JimpError> {
    let (_, resolved) = prepare_module(bytes, host)?;
    Ok(resolved.len())
}

fn parse_arguments(arguments: &[String]) -> Result<(bool, String), JimpError> {
    match arguments {
        [path] => Ok((false, path.clone())),
        [command, path] if command == "--validate-portable" => Ok((true, path.clone())),
        _ => Err(usage()),
    }
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
    let (validate_only, path) = match parse_arguments(&arguments) {
        Ok(parsed) => parsed,
        Err(error) => report_and_exit(error, format),
    };

    let result = read_module(&path)
        .and_then(|bytes| {
            if validate_only {
                validate_portable(&bytes, &ConsoleHost).map(|import_count| {
                    println!(
                        "Portable module valid and execution-ready: {import_count} host import(s) resolved."
                    );
                })
            } else {
                run(&bytes, &mut ConsoleHost)
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

        assert!(run(b"not portable bytecode", &mut host).is_err());
        assert_eq!(host.invocations, 0);
    }
}
