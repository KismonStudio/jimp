use std::io::{self, Write};

use crate::{
    generated::isa::ValueType,
    portable::{HostImport, Value},
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct HostHandle(u32);

impl HostHandle {
    pub(crate) const fn new(value: u32) -> Self {
        Self(value)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct HostCapability {
    pub(crate) symbol: &'static str,
    pub(crate) parameter_types: &'static [ValueType],
    pub(crate) return_type: ValueType,
    pub(crate) handle: HostHandle,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ResolvedHostImport {
    pub(crate) symbol: String,
    pub(crate) handle: HostHandle,
}

pub(crate) struct CapabilityPolicy<'a> {
    allowed_symbols: &'a [&'a str],
}

impl<'a> CapabilityPolicy<'a> {
    pub(crate) const fn new(allowed_symbols: &'a [&'a str]) -> Self {
        Self { allowed_symbols }
    }

    fn allows(&self, symbol: &str) -> bool {
        self.allowed_symbols.contains(&symbol)
    }
}

pub(crate) fn resolve_host_imports(
    imports: &[HostImport],
    capabilities: &[HostCapability],
    policy: &CapabilityPolicy<'_>,
) -> Result<Vec<ResolvedHostImport>, String> {
    for (index, capability) in capabilities.iter().enumerate() {
        if capabilities[..index]
            .iter()
            .any(|previous| previous.symbol == capability.symbol)
        {
            return Err(format!(
                "Host capability {} is registered more than once.",
                capability.symbol
            ));
        }
    }

    imports
        .iter()
        .enumerate()
        .map(|(index, import)| {
            if !policy.allows(&import.symbol) {
                return Err(format!(
                    "Host import {index} ({}) is denied by capability policy.",
                    import.symbol
                ));
            }
            let capability = capabilities
                .iter()
                .find(|capability| capability.symbol == import.symbol)
                .ok_or_else(|| {
                    format!("Host import {index} ({}) is not available.", import.symbol)
                })?;
            if capability.parameter_types != import.parameter_types
                || capability.return_type != import.return_type
            {
                return Err(format!(
                    "Host import {index} ({}) has an incompatible signature.",
                    import.symbol
                ));
            }
            Ok(ResolvedHostImport {
                symbol: import.symbol.clone(),
                handle: capability.handle,
            })
        })
        .collect()
}

pub(crate) trait Host {
    fn invoke(&mut self, handle: HostHandle, arguments: &[Value]) -> Result<Option<Value>, String>;

    fn capabilities(&self) -> &[HostCapability] {
        &[]
    }
}

pub(crate) struct ConsoleHost;

const CONSOLE_WRITE_PARAMETERS: &[ValueType] = &[ValueType::String];
const CONSOLE_CAPABILITIES: &[HostCapability] = &[HostCapability {
    symbol: "std.console.write",
    parameter_types: CONSOLE_WRITE_PARAMETERS,
    return_type: ValueType::Void,
    handle: HostHandle::new(0),
}];

impl Host for ConsoleHost {
    fn invoke(&mut self, handle: HostHandle, arguments: &[Value]) -> Result<Option<Value>, String> {
        if handle != HostHandle::new(0) {
            return Err("Console host received an unknown capability handle.".into());
        }
        let [Value::String(value)] = arguments else {
            return Err("std.console.write requires exactly one STRING argument.".into());
        };
        io::stdout()
            .lock()
            .write_all(value.as_bytes())
            .map_err(|error| format!("Console host error: {error}"))?;
        Ok(None)
    }

    fn capabilities(&self) -> &[HostCapability] {
        CONSOLE_CAPABILITIES
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn console_import(parameter_types: Vec<ValueType>) -> HostImport {
        HostImport {
            symbol: "std.console.write".into(),
            parameter_types,
            return_type: ValueType::Void,
        }
    }

    #[test]
    fn resolves_a_permitted_import_to_a_numeric_handle() {
        let imports = [console_import(vec![ValueType::String])];
        let resolved = resolve_host_imports(
            &imports,
            CONSOLE_CAPABILITIES,
            &CapabilityPolicy::new(&["std.console.write"]),
        )
        .expect("import should resolve");

        assert_eq!(resolved[0].handle, HostHandle::new(0));
    }

    #[test]
    fn rejects_an_import_denied_by_policy() {
        let imports = [console_import(vec![ValueType::String])];
        let error =
            resolve_host_imports(&imports, CONSOLE_CAPABILITIES, &CapabilityPolicy::new(&[]))
                .expect_err("import should be denied");

        assert!(error.contains("denied by capability policy"));
    }

    #[test]
    fn rejects_an_incompatible_signature() {
        let imports = [console_import(vec![ValueType::I64])];
        let error = resolve_host_imports(
            &imports,
            CONSOLE_CAPABILITIES,
            &CapabilityPolicy::new(&["std.console.write"]),
        )
        .expect_err("signature should be rejected");

        assert!(error.contains("incompatible signature"));
    }

    #[test]
    fn rejects_a_permitted_but_unavailable_capability() {
        let imports = [HostImport {
            symbol: "std.time.sleep".into(),
            parameter_types: vec![ValueType::I64],
            return_type: ValueType::Void,
        }];
        let error = resolve_host_imports(
            &imports,
            CONSOLE_CAPABILITIES,
            &CapabilityPolicy::new(&["std.time.sleep"]),
        )
        .expect_err("capability should be unavailable");

        assert!(error.contains("is not available"));
    }
}
