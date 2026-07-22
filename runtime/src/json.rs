use crate::generated::sandbox::{
    MAX_JSON_DEPTH, MAX_JSON_INPUT_BYTES, MAX_JSON_OUTPUT_BYTES, MAX_JSON_VALUES,
};
use std::collections::HashSet;

#[derive(Debug, PartialEq)]
enum JsonValue {
    Null,
    Bool(bool),
    Number(String),
    String(String),
    Array(Vec<JsonValue>),
    Object(Vec<(String, JsonValue)>),
}

struct Parser<'a> {
    input: &'a str,
    offset: usize,
    values: usize,
}

impl<'a> Parser<'a> {
    fn new(input: &'a str) -> Result<Self, String> {
        if input.len() > MAX_JSON_INPUT_BYTES {
            return Err(format!(
                "JSON input exceeds the limit of {MAX_JSON_INPUT_BYTES} bytes."
            ));
        }
        Ok(Self {
            input,
            offset: 0,
            values: 0,
        })
    }

    fn error(&self, message: &str) -> String {
        format!("Invalid JSON at byte {}: {message}", self.offset)
    }

    fn byte(&self) -> Option<u8> {
        self.input.as_bytes().get(self.offset).copied()
    }

    fn skip_whitespace(&mut self) {
        while matches!(self.byte(), Some(b' ' | b'\n' | b'\r' | b'\t')) {
            self.offset += 1;
        }
    }

    fn parse(mut self) -> Result<JsonValue, String> {
        self.skip_whitespace();
        let value = self.parse_value(0)?;
        self.skip_whitespace();
        if self.offset != self.input.len() {
            return Err(self.error("unexpected trailing data."));
        }
        Ok(value)
    }

    fn parse_value(&mut self, depth: usize) -> Result<JsonValue, String> {
        self.values = self
            .values
            .checked_add(1)
            .ok_or_else(|| self.error("value count overflow."))?;
        if self.values > MAX_JSON_VALUES {
            return Err(format!(
                "JSON value count exceeds the limit of {MAX_JSON_VALUES}."
            ));
        }
        match self.byte() {
            Some(b'n') => {
                self.literal("null")?;
                Ok(JsonValue::Null)
            }
            Some(b't') => {
                self.literal("true")?;
                Ok(JsonValue::Bool(true))
            }
            Some(b'f') => {
                self.literal("false")?;
                Ok(JsonValue::Bool(false))
            }
            Some(b'"') => self.parse_string().map(JsonValue::String),
            Some(b'[') => self.parse_array(depth),
            Some(b'{') => self.parse_object(depth),
            Some(b'-' | b'0'..=b'9') => self.parse_number().map(JsonValue::Number),
            Some(_) => Err(self.error("expected a JSON value.")),
            None => Err(self.error("expected a JSON value.")),
        }
    }

    fn literal(&mut self, expected: &str) -> Result<(), String> {
        if self.input[self.offset..].starts_with(expected) {
            self.offset += expected.len();
            Ok(())
        } else {
            Err(self.error(&format!("expected {expected}.")))
        }
    }

    fn enter_container(&self, depth: usize) -> Result<usize, String> {
        let depth = depth
            .checked_add(1)
            .ok_or_else(|| self.error("nesting depth overflow."))?;
        if depth > MAX_JSON_DEPTH {
            return Err(format!(
                "JSON nesting depth exceeds the limit of {MAX_JSON_DEPTH}."
            ));
        }
        Ok(depth)
    }

    fn parse_array(&mut self, depth: usize) -> Result<JsonValue, String> {
        let depth = self.enter_container(depth)?;
        self.offset += 1;
        self.skip_whitespace();
        let mut values = Vec::new();
        if self.byte() == Some(b']') {
            self.offset += 1;
            return Ok(JsonValue::Array(values));
        }
        loop {
            values.push(self.parse_value(depth)?);
            self.skip_whitespace();
            match self.byte() {
                Some(b',') => {
                    self.offset += 1;
                    self.skip_whitespace();
                }
                Some(b']') => {
                    self.offset += 1;
                    return Ok(JsonValue::Array(values));
                }
                _ => return Err(self.error("expected ',' or ']' in array.")),
            }
        }
    }

    fn parse_object(&mut self, depth: usize) -> Result<JsonValue, String> {
        let depth = self.enter_container(depth)?;
        self.offset += 1;
        self.skip_whitespace();
        let mut entries = Vec::new();
        let mut keys = HashSet::new();
        if self.byte() == Some(b'}') {
            self.offset += 1;
            return Ok(JsonValue::Object(entries));
        }
        loop {
            if self.byte() != Some(b'"') {
                return Err(self.error("object keys must be strings."));
            }
            let key = self.parse_string()?;
            if !keys.insert(key.clone()) {
                return Err(self.error("duplicate object key."));
            }
            self.skip_whitespace();
            if self.byte() != Some(b':') {
                return Err(self.error("expected ':' after object key."));
            }
            self.offset += 1;
            self.skip_whitespace();
            let value = self.parse_value(depth)?;
            entries.push((key, value));
            self.skip_whitespace();
            match self.byte() {
                Some(b',') => {
                    self.offset += 1;
                    self.skip_whitespace();
                }
                Some(b'}') => {
                    self.offset += 1;
                    return Ok(JsonValue::Object(entries));
                }
                _ => return Err(self.error("expected ',' or '}' in object.")),
            }
        }
    }

    fn parse_number(&mut self) -> Result<String, String> {
        let start = self.offset;
        if self.byte() == Some(b'-') {
            self.offset += 1;
        }
        match self.byte() {
            Some(b'0') => self.offset += 1,
            Some(b'1'..=b'9') => {
                self.offset += 1;
                while matches!(self.byte(), Some(b'0'..=b'9')) {
                    self.offset += 1;
                }
            }
            _ => return Err(self.error("invalid number integer part.")),
        }
        if self.byte() == Some(b'.') {
            self.offset += 1;
            if !matches!(self.byte(), Some(b'0'..=b'9')) {
                return Err(self.error("number fraction requires a digit."));
            }
            while matches!(self.byte(), Some(b'0'..=b'9')) {
                self.offset += 1;
            }
        }
        if matches!(self.byte(), Some(b'e' | b'E')) {
            self.offset += 1;
            if matches!(self.byte(), Some(b'+' | b'-')) {
                self.offset += 1;
            }
            if !matches!(self.byte(), Some(b'0'..=b'9')) {
                return Err(self.error("number exponent requires a digit."));
            }
            while matches!(self.byte(), Some(b'0'..=b'9')) {
                self.offset += 1;
            }
        }
        Ok(self.input[start..self.offset].to_owned())
    }

    fn parse_string(&mut self) -> Result<String, String> {
        self.offset += 1;
        let mut value = String::new();
        loop {
            match self.byte() {
                Some(b'"') => {
                    self.offset += 1;
                    return Ok(value);
                }
                Some(b'\\') => {
                    self.offset += 1;
                    self.parse_escape(&mut value)?;
                }
                Some(0x00..=0x1f) => {
                    return Err(self.error("unescaped control character in string."));
                }
                Some(_) => {
                    let character = self.input[self.offset..]
                        .chars()
                        .next()
                        .ok_or_else(|| self.error("unterminated string."))?;
                    value.push(character);
                    self.offset += character.len_utf8();
                }
                None => return Err(self.error("unterminated string.")),
            }
        }
    }

    fn parse_escape(&mut self, value: &mut String) -> Result<(), String> {
        let escaped = self
            .byte()
            .ok_or_else(|| self.error("unterminated string escape."))?;
        self.offset += 1;
        match escaped {
            b'"' => value.push('"'),
            b'\\' => value.push('\\'),
            b'/' => value.push('/'),
            b'b' => value.push('\u{0008}'),
            b'f' => value.push('\u{000c}'),
            b'n' => value.push('\n'),
            b'r' => value.push('\r'),
            b't' => value.push('\t'),
            b'u' => {
                let first = self.parse_hex_quad()?;
                let scalar = if (0xd800..=0xdbff).contains(&first) {
                    if self.byte() != Some(b'\\')
                        || self.input.as_bytes().get(self.offset + 1) != Some(&b'u')
                    {
                        return Err(self.error("high surrogate requires a low surrogate."));
                    }
                    self.offset += 2;
                    let second = self.parse_hex_quad()?;
                    if !(0xdc00..=0xdfff).contains(&second) {
                        return Err(self.error("invalid low surrogate."));
                    }
                    0x10000 + ((u32::from(first) - 0xd800) << 10) + (u32::from(second) - 0xdc00)
                } else if (0xdc00..=0xdfff).contains(&first) {
                    return Err(self.error("unexpected low surrogate."));
                } else {
                    u32::from(first)
                };
                value.push(
                    char::from_u32(scalar)
                        .ok_or_else(|| self.error("invalid Unicode scalar value."))?,
                );
            }
            _ => return Err(self.error("invalid string escape.")),
        }
        Ok(())
    }

    fn parse_hex_quad(&mut self) -> Result<u16, String> {
        let end = self
            .offset
            .checked_add(4)
            .ok_or_else(|| self.error("Unicode escape overflow."))?;
        let digits = self
            .input
            .as_bytes()
            .get(self.offset..end)
            .ok_or_else(|| self.error("incomplete Unicode escape."))?;
        let mut value = 0_u16;
        for digit in digits {
            let digit = match digit {
                b'0'..=b'9' => u16::from(digit - b'0'),
                b'a'..=b'f' => u16::from(digit - b'a') + 10,
                b'A'..=b'F' => u16::from(digit - b'A') + 10,
                _ => return Err(self.error("invalid Unicode escape.")),
            };
            value = value * 16 + digit;
        }
        self.offset = end;
        Ok(value)
    }
}

fn write_string(output: &mut String, value: &str) {
    output.push('"');
    for character in value.chars() {
        match character {
            '"' => output.push_str("\\\""),
            '\\' => output.push_str("\\\\"),
            '\u{0008}' => output.push_str("\\b"),
            '\u{000c}' => output.push_str("\\f"),
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\t' => output.push_str("\\t"),
            '\u{0000}'..='\u{001f}' => {
                output.push_str(&format!("\\u{:04x}", u32::from(character)));
            }
            _ => output.push(character),
        }
    }
    output.push('"');
}

fn write_value(output: &mut String, value: &JsonValue) {
    match value {
        JsonValue::Null => output.push_str("null"),
        JsonValue::Bool(value) => output.push_str(if *value { "true" } else { "false" }),
        JsonValue::Number(value) => output.push_str(value),
        JsonValue::String(value) => write_string(output, value),
        JsonValue::Array(values) => {
            output.push('[');
            for (index, value) in values.iter().enumerate() {
                if index > 0 {
                    output.push(',');
                }
                write_value(output, value);
            }
            output.push(']');
        }
        JsonValue::Object(entries) => {
            output.push('{');
            for (index, (key, value)) in entries.iter().enumerate() {
                if index > 0 {
                    output.push(',');
                }
                write_string(output, key);
                output.push(':');
                write_value(output, value);
            }
            output.push('}');
        }
    }
}

pub(crate) fn canonicalize(input: &str) -> Result<String, String> {
    let value = Parser::new(input)?.parse()?;
    let mut output = String::new();
    write_value(&mut output, &value);
    if output.len() > MAX_JSON_OUTPUT_BYTES {
        return Err(format!(
            "JSON output exceeds the limit of {MAX_JSON_OUTPUT_BYTES} bytes."
        ));
    }
    Ok(output)
}

pub(crate) fn diagnostic(input: &str) -> String {
    canonicalize(input).err().unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonicalizes_valid_json_and_preserves_member_order() {
        assert_eq!(
            canonicalize(" { \"emoji\" : \"\\ud83d\\ude00\", \"n\" : 1.0 } "),
            Ok("{\"emoji\":\"😀\",\"n\":1.0}".into())
        );
    }

    #[test]
    fn rejects_duplicate_keys_and_invalid_numbers() {
        assert!(diagnostic("{\"a\":1,\"a\":2}").contains("duplicate object key"));
        assert!(diagnostic("01").contains("trailing data"));
    }

    #[test]
    fn enforces_input_and_depth_limits() {
        let oversized = " ".repeat(MAX_JSON_INPUT_BYTES + 1);
        assert!(diagnostic(&oversized).contains("input exceeds the limit"));

        let nested = format!(
            "{}null{}",
            "[".repeat(MAX_JSON_DEPTH + 1),
            "]".repeat(MAX_JSON_DEPTH + 1)
        );
        assert!(diagnostic(&nested).contains("nesting depth exceeds the limit"));
    }
}
