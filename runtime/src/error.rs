use crate::generated::errors::{ERROR_SCHEMA, ErrorDefinition};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum ErrorLocation {
    Source {
        line: usize,
        module_id: Option<String>,
    },
    BytecodeOffset(usize),
}

#[derive(Debug)]
pub(crate) struct AureonError {
    definition: ErrorDefinition,
    message: String,
    location: Option<ErrorLocation>,
}

impl AureonError {
    pub(crate) fn new(definition: ErrorDefinition, message: impl Into<String>) -> Self {
        let message = message.into();
        let location = infer_location(&message, definition.phase);
        Self {
            definition,
            message,
            location,
        }
    }

    pub(crate) fn exit_code(&self) -> i32 {
        self.definition.exit_code
    }

    pub(crate) fn with_source_location(
        mut self,
        source_line: Option<u32>,
        module_id: Option<String>,
    ) -> Self {
        if let Some(line) = source_line.and_then(|line| usize::try_from(line).ok()) {
            self.location = Some(ErrorLocation::Source { line, module_id });
        }
        self
    }

    pub(crate) fn human(&self) -> String {
        let location = match &self.location {
            Some(ErrorLocation::Source {
                line,
                module_id: Some(module_id),
            }) => format!(" at source {module_id}:{line}"),
            Some(ErrorLocation::Source {
                line,
                module_id: None,
            }) => format!(" at source line {line}"),
            Some(ErrorLocation::BytecodeOffset(offset)) => {
                format!(" at bytecode offset {offset}")
            }
            None => String::new(),
        };
        format!(
            "AUREON error {} ({}){}: {}",
            self.definition.code,
            self.definition.phase,
            location,
            single_line(&self.message)
        )
    }

    pub(crate) fn json(&self) -> String {
        let location = match &self.location {
            Some(ErrorLocation::Source {
                line,
                module_id: Some(module_id),
            }) => format!(
                r#","location":{{"kind":"source","line":{line},"moduleId":"{}"}}"#,
                json_escape(module_id)
            ),
            Some(ErrorLocation::Source {
                line,
                module_id: None,
            }) => {
                format!(r#","location":{{"kind":"source","line":{line}}}"#)
            }
            Some(ErrorLocation::BytecodeOffset(offset)) => {
                format!(r#","location":{{"kind":"bytecode","offset":{offset}}}"#)
            }
            None => String::new(),
        };
        format!(
            r#"{{"schema":"{}","code":"{}","phase":"{}","message":"{}"{}}}"#,
            ERROR_SCHEMA,
            self.definition.code,
            self.definition.phase,
            json_escape(&self.message),
            location
        )
    }
}

fn infer_location(message: &str, phase: &str) -> Option<ErrorLocation> {
    match phase {
        "compile" => parse_number_after(message, "at line ").map(|line| ErrorLocation::Source {
            line,
            module_id: None,
        }),
        "decode" | "verify" => {
            parse_number_after(message, "offset ").map(ErrorLocation::BytecodeOffset)
        }
        _ => None,
    }
}

fn parse_number_after(message: &str, marker: &str) -> Option<usize> {
    let start = message.rfind(marker)? + marker.len();
    let digits: String = message[start..]
        .chars()
        .take_while(|character| character.is_ascii_digit())
        .collect();
    (!digits.is_empty()).then(|| digits.parse().ok()).flatten()
}

fn single_line(message: &str) -> String {
    message
        .replace('\r', "\\r")
        .replace('\n', "\\n")
        .replace('\t', "\\t")
}

fn json_escape(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for character in value.chars() {
        match character {
            '"' => escaped.push_str("\\\""),
            '\\' => escaped.push_str("\\\\"),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            '\u{08}' => escaped.push_str("\\b"),
            '\u{0c}' => escaped.push_str("\\f"),
            character if character.is_control() => {
                escaped.push_str(&format!("\\u{:04x}", character as u32));
            }
            character => escaped.push(character),
        }
    }
    escaped
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generated::errors::{COMPILE, DECODE, EXECUTE};

    #[test]
    fn extracts_source_and_bytecode_locations() {
        let source = AureonError::new(COMPILE, "Failure at line 7.");
        let bytecode = AureonError::new(DECODE, "Failure at code offset 12.");

        assert_eq!(
            source.location,
            Some(ErrorLocation::Source {
                line: 7,
                module_id: None,
            })
        );
        assert_eq!(bytecode.location, Some(ErrorLocation::BytecodeOffset(12)));
    }

    #[test]
    fn renders_valid_json_without_a_location() {
        let error = AureonError::new(EXECUTE, "Invalid \"value\".\nStopped.");

        assert_eq!(
            error.json(),
            r#"{"schema":"aureon-error-v1","code":"AUREON-4001","phase":"execute","message":"Invalid \"value\".\nStopped."}"#
        );
    }

    #[test]
    fn renders_human_diagnostics_on_one_line() {
        let error = AureonError::new(EXECUTE, "First\nSecond");
        assert_eq!(
            error.human(),
            "AUREON error AUREON-4001 (execute): First\\nSecond"
        );
    }
}
