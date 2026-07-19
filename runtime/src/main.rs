use std::{env, fs, process};

use crate::{
    host::{CapabilityPolicy, ConsoleHost, Host, ResolvedHostImport, resolve_host_imports},
    portable::{VerifiedPortableModule, decode_portable_module, verify_portable_module},
    vm::execute,
};

mod generated;
mod host;
mod portable;
mod vm;

const PORTABLE_CAPABILITY_POLICY: &[&str] = &["std.console.write"];

fn prepare_module<H: Host>(
    bytes: &[u8],
    host: &H,
) -> Result<(VerifiedPortableModule, Vec<ResolvedHostImport>), String> {
    let module = verify_portable_module(decode_portable_module(bytes)?)?;
    let resolved = resolve_host_imports(
        &module.imports,
        host.capabilities(),
        &CapabilityPolicy::new(PORTABLE_CAPABILITY_POLICY),
    )?;
    Ok((module, resolved))
}

fn run<H: Host>(bytes: &[u8], host: &mut H) -> Result<(), String> {
    let (module, resolved) = prepare_module(bytes, host)?;
    execute(&module, &resolved, host)
}

fn validate_portable<H: Host>(bytes: &[u8], host: &H) -> Result<usize, String> {
    let (_, resolved) = prepare_module(bytes, host)?;
    Ok(resolved.len())
}

fn main() {
    let mut args = env::args().skip(1);
    let Some(first_argument) = args.next() else {
        eprintln!("Usage: jimp-runtime <program.jbc> | --validate-portable <program.jbc>");
        process::exit(2);
    };
    let (validate_only, path) = if first_argument == "--validate-portable" {
        let Some(path) = args.next() else {
            eprintln!("Usage: jimp-runtime --validate-portable <program.jbc>");
            process::exit(2);
        };
        (true, path)
    } else {
        (false, first_argument)
    };
    if args.next().is_some() {
        eprintln!("Runtime error: unexpected command-line argument.");
        process::exit(2);
    }

    let result = fs::read(path)
        .map_err(|error| error.to_string())
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
        eprintln!("Runtime error: {error}");
        process::exit(1);
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
