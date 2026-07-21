use crate::generated::{
    isa::{
        FORMAT_MAJOR, FORMAT_MINOR, INSTRUCTIONS, NO_REGISTER, OPERAND_TYPES, Opcode,
        OperandEncoding, ValueType,
    },
    sandbox::{
        MAX_CODE_BYTES, MAX_CONSTANT_STRING_BYTES, MAX_CONSTANTS, MAX_FUNCTIONS, MAX_HOST_IMPORTS,
        MAX_MODULE_BYTES, MAX_PARAMETERS, MAX_REGISTERS_PER_FUNCTION, MAX_SECTION_COUNT,
        MAX_SYMBOL_BYTES, MAX_TOTAL_CONSTANT_STRING_BYTES, MAX_TOTAL_INSTRUCTIONS,
        MAX_VERIFICATION_TYPE_CELLS,
    },
};
use std::collections::{HashMap, VecDeque};

const MAGIC: &[u8; 4] = b"JIMP";
const HEADER_SIZE: usize = 20;
const DIRECTORY_ENTRY_SIZE: usize = 12;
const SECTION_OPTIONAL: u16 = 1;
const CONSTANTS: u16 = 1;
const HOST_IMPORTS: u16 = 2;
const FUNCTIONS: u16 = 3;
const CODE: u16 = 4;
const DEBUG: u16 = 5;
const DEBUG_VERSION: u16 = 1;
const NO_NAME: u32 = u32::MAX;

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Value {
    Null,
    Bool(bool),
    I64(i64),
    F64(f64),
    String(String),
}

impl Value {
    fn string(&self) -> Option<&str> {
        match self {
            Self::String(value) => Some(value),
            _ => None,
        }
    }

    pub(crate) fn value_type(&self) -> ValueType {
        match self {
            Self::Null => ValueType::Null,
            Self::Bool(_) => ValueType::Bool,
            Self::I64(_) => ValueType::I64,
            Self::F64(_) => ValueType::F64,
            Self::String(_) => ValueType::String,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct HostImport {
    pub(crate) symbol: String,
    pub(crate) parameter_types: Vec<ValueType>,
    pub(crate) return_type: ValueType,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct Function {
    pub(crate) name: Option<u32>,
    pub(crate) code_offset: u32,
    pub(crate) code_length: u32,
    pub(crate) register_count: u16,
    pub(crate) parameter_types: Vec<ValueType>,
    pub(crate) return_type: ValueType,
}

#[derive(Debug, PartialEq)]
pub(crate) struct PortableModule {
    pub(crate) entry_function: u32,
    pub(crate) constants: Vec<Value>,
    pub(crate) imports: Vec<HostImport>,
    pub(crate) functions: Vec<Function>,
    pub(crate) code: Vec<u8>,
    pub(crate) debug: Vec<DebugMapping>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct DebugMapping {
    pub(crate) code_offset: u32,
    pub(crate) source_line: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum Instruction {
    LoadConst {
        destination: usize,
        constant: usize,
    },
    Move {
        destination: usize,
        source: usize,
    },
    Unary {
        opcode: Opcode,
        destination: usize,
        operand: usize,
    },
    Binary {
        opcode: Opcode,
        destination: usize,
        left: usize,
        right: usize,
    },
    Jump {
        target: usize,
    },
    JumpIfFalse {
        condition: usize,
        target: usize,
    },
    JumpIfTrue {
        condition: usize,
        target: usize,
    },
    HostCall {
        import: usize,
        argument_start: usize,
        argument_count: usize,
        result: Option<usize>,
    },
    Call {
        function: usize,
        argument_start: usize,
        argument_count: usize,
        result: Option<usize>,
    },
    Return {
        result: Option<usize>,
    },
    Halt,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct VerifiedFunction {
    pub(crate) register_count: usize,
    pub(crate) parameter_types: Vec<ValueType>,
    pub(crate) return_type: ValueType,
    pub(crate) instructions: Vec<Instruction>,
}

#[derive(Debug, PartialEq)]
pub(crate) struct VerifiedPortableModule {
    pub(crate) entry_function: usize,
    pub(crate) constants: Vec<Value>,
    pub(crate) imports: Vec<HostImport>,
    pub(crate) functions: Vec<VerifiedFunction>,
    pub(crate) source_lines: Vec<Vec<Option<u32>>>,
}

struct Cursor<'a> {
    bytes: &'a [u8],
    base_offset: usize,
    offset: usize,
}

impl<'a> Cursor<'a> {
    fn new(bytes: &'a [u8], base_offset: usize) -> Self {
        Self {
            bytes,
            base_offset,
            offset: 0,
        }
    }

    fn read_exact(&mut self, length: usize, context: &str) -> Result<&'a [u8], String> {
        let end = self
            .offset
            .checked_add(length)
            .ok_or_else(|| format!("Bytecode offset overflow while reading {context}."))?;
        let value = self.bytes.get(self.offset..end).ok_or_else(|| {
            format!(
                "Unexpected end of bytecode while reading {context} at offset {}.",
                self.base_offset + self.offset
            )
        })?;
        self.offset = end;
        Ok(value)
    }

    fn read_u8(&mut self, context: &str) -> Result<u8, String> {
        Ok(self.read_exact(1, context)?[0])
    }

    fn read_u16(&mut self, context: &str) -> Result<u16, String> {
        let value = self.read_exact(2, context)?;
        Ok(u16::from_le_bytes([value[0], value[1]]))
    }

    fn read_u32(&mut self, context: &str) -> Result<u32, String> {
        let value = self.read_exact(4, context)?;
        Ok(u32::from_le_bytes([value[0], value[1], value[2], value[3]]))
    }

    fn finish(&self, context: &str) -> Result<(), String> {
        if self.offset == self.bytes.len() {
            Ok(())
        } else {
            Err(format!(
                "Trailing data in {context} starts at offset {}.",
                self.base_offset + self.offset
            ))
        }
    }
}

#[derive(Clone, Copy)]
struct Section<'a> {
    flags: u16,
    offset: usize,
    payload: &'a [u8],
}

fn value_type(
    tag: u8,
    context: &str,
    allow_null: bool,
    allow_void: bool,
) -> Result<ValueType, String> {
    let value_type = ValueType::try_from(tag)
        .map_err(|_| format!("{context} has unknown value type tag {tag}."))?;
    if !allow_null && value_type == ValueType::Null {
        return Err(format!("{context} cannot use NULL."));
    }
    if !allow_void && value_type == ValueType::Void {
        return Err(format!("{context} cannot use VOID."));
    }
    Ok(value_type)
}

fn decode_constants(section: Section<'_>) -> Result<Vec<Value>, String> {
    let mut cursor = Cursor::new(section.payload, section.offset);
    let count = usize::try_from(cursor.read_u32("constant count")?)
        .map_err(|_| "Constant count is not supported on this platform.")?;
    if count > MAX_CONSTANTS {
        return Err(format!(
            "Constant count exceeds the sandbox limit of {MAX_CONSTANTS}."
        ));
    }
    let mut constants = Vec::with_capacity(count.min(section.payload.len()));
    let mut total_string_bytes = 0_usize;
    for index in 0..count {
        let tag = cursor.read_u8(&format!("constant {index} tag"))?;
        let kind = value_type(tag, &format!("Constant {index}"), true, false)?;
        let value = match kind {
            ValueType::Null => Value::Null,
            ValueType::Bool => match cursor.read_u8(&format!("constant {index} boolean"))? {
                0 => Value::Bool(false),
                1 => Value::Bool(true),
                _ => return Err(format!("Constant {index} has an invalid boolean value.")),
            },
            ValueType::I64 => {
                let bytes = cursor.read_exact(8, &format!("constant {index} i64"))?;
                Value::I64(i64::from_le_bytes(bytes.try_into().expect("eight bytes")))
            }
            ValueType::F64 => {
                let bytes = cursor.read_exact(8, &format!("constant {index} f64"))?;
                Value::F64(f64::from_le_bytes(bytes.try_into().expect("eight bytes")))
            }
            ValueType::String => {
                let length =
                    usize::try_from(cursor.read_u32(&format!("constant {index} string length"))?)
                        .map_err(|_| format!("Constant {index} string is too large."))?;
                if length > MAX_CONSTANT_STRING_BYTES {
                    return Err(format!(
                        "Constant {index} exceeds the sandbox string limit of {MAX_CONSTANT_STRING_BYTES} UTF-8 bytes."
                    ));
                }
                total_string_bytes = total_string_bytes
                    .checked_add(length)
                    .ok_or("Constant string byte count overflow.")?;
                if total_string_bytes > MAX_TOTAL_CONSTANT_STRING_BYTES {
                    return Err(format!(
                        "Constant strings exceed the sandbox aggregate limit of {MAX_TOTAL_CONSTANT_STRING_BYTES} UTF-8 bytes."
                    ));
                }
                let bytes = cursor
                    .read_exact(length, &format!("constant {index} string"))?
                    .to_vec();
                Value::String(
                    String::from_utf8(bytes)
                        .map_err(|_| format!("Constant {index} contains invalid UTF-8."))?,
                )
            }
            ValueType::Void => unreachable!("VOID constants are rejected"),
        };
        constants.push(value);
    }
    cursor.finish("constant section")?;
    Ok(constants)
}

fn string_constant<'a>(
    constants: &'a [Value],
    index: u32,
    context: &str,
) -> Result<&'a str, String> {
    let index = usize::try_from(index).map_err(|_| format!("{context} is out of range."))?;
    let value = constants
        .get(index)
        .and_then(Value::string)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("{context} must reference a non-empty string constant."))?;
    if value.len() > MAX_SYMBOL_BYTES {
        return Err(format!(
            "{context} exceeds the sandbox symbol limit of {MAX_SYMBOL_BYTES} UTF-8 bytes."
        ));
    }
    Ok(value)
}

fn decode_imports(section: Section<'_>, constants: &[Value]) -> Result<Vec<HostImport>, String> {
    let mut cursor = Cursor::new(section.payload, section.offset);
    let count = usize::try_from(cursor.read_u32("host import count")?)
        .map_err(|_| "Host import count is not supported on this platform.")?;
    if count > MAX_HOST_IMPORTS {
        return Err(format!(
            "Host import count exceeds the sandbox limit of {MAX_HOST_IMPORTS}."
        ));
    }
    let mut imports = Vec::with_capacity(count.min(section.payload.len()));
    for index in 0..count {
        let namespace_index = cursor.read_u32(&format!("host import {index} namespace"))?;
        let name_index = cursor.read_u32(&format!("host import {index} name"))?;
        let parameter_count =
            usize::from(cursor.read_u16(&format!("host import {index} parameter count"))?);
        if parameter_count > MAX_PARAMETERS {
            return Err(format!(
                "Host import {index} parameter count exceeds the sandbox limit of {MAX_PARAMETERS}."
            ));
        }
        let return_type = value_type(
            cursor.read_u8(&format!("host import {index} return type"))?,
            &format!("Host import {index} return type"),
            true,
            true,
        )?;
        if cursor.read_u8(&format!("host import {index} flags"))? != 0 {
            return Err(format!("Host import {index} flags must be zero."));
        }
        let mut parameter_types = Vec::with_capacity(parameter_count);
        for parameter in 0..parameter_count {
            parameter_types.push(value_type(
                cursor.read_u8(&format!("host import {index} parameter {parameter}"))?,
                &format!("Host import {index} parameter {parameter}"),
                false,
                false,
            )?);
        }
        let namespace = string_constant(
            constants,
            namespace_index,
            &format!("Host import {index} namespace"),
        )?;
        let name = string_constant(constants, name_index, &format!("Host import {index} name"))?;
        imports.push(HostImport {
            symbol: format!("{namespace}.{name}"),
            parameter_types,
            return_type,
        });
    }
    cursor.finish("host-import section")?;
    Ok(imports)
}

fn decode_functions(
    section: Section<'_>,
    constants: &[Value],
    code_length: usize,
) -> Result<Vec<Function>, String> {
    let mut cursor = Cursor::new(section.payload, section.offset);
    let count = usize::try_from(cursor.read_u32("function count")?)
        .map_err(|_| "Function count is not supported on this platform.")?;
    if count > MAX_FUNCTIONS {
        return Err(format!(
            "Function count exceeds the sandbox limit of {MAX_FUNCTIONS}."
        ));
    }
    let mut functions = Vec::with_capacity(count.min(section.payload.len()));
    for index in 0..count {
        let name_index = cursor.read_u32(&format!("function {index} name"))?;
        let code_offset = cursor.read_u32(&format!("function {index} code offset"))?;
        let code_length_u32 = cursor.read_u32(&format!("function {index} code length"))?;
        let register_count = cursor.read_u16(&format!("function {index} register count"))?;
        if usize::from(register_count) > MAX_REGISTERS_PER_FUNCTION {
            return Err(format!(
                "Function {index} register count exceeds the sandbox limit of {MAX_REGISTERS_PER_FUNCTION}."
            ));
        }
        let parameter_count =
            usize::from(cursor.read_u16(&format!("function {index} parameter count"))?);
        if parameter_count > MAX_PARAMETERS {
            return Err(format!(
                "Function {index} parameter count exceeds the sandbox limit of {MAX_PARAMETERS}."
            ));
        }
        let return_type = value_type(
            cursor.read_u8(&format!("function {index} return type"))?,
            &format!("Function {index} return type"),
            true,
            true,
        )?;
        if cursor.read_u8(&format!("function {index} flags"))? != 0 {
            return Err(format!("Function {index} flags must be zero."));
        }
        if cursor.read_u16(&format!("function {index} reserved"))? != 0 {
            return Err(format!("Function {index} reserved field must be zero."));
        }
        let mut parameter_types = Vec::with_capacity(parameter_count);
        for parameter in 0..parameter_count {
            parameter_types.push(value_type(
                cursor.read_u8(&format!("function {index} parameter {parameter}"))?,
                &format!("Function {index} parameter {parameter}"),
                false,
                false,
            )?);
        }
        let start = usize::try_from(code_offset)
            .map_err(|_| format!("Function {index} code offset is unsupported."))?;
        let length = usize::try_from(code_length_u32)
            .map_err(|_| format!("Function {index} code length is unsupported."))?;
        let end = start
            .checked_add(length)
            .ok_or_else(|| format!("Function {index} code range overflows."))?;
        if end > code_length {
            return Err(format!(
                "Function {index} code range is outside the code section."
            ));
        }
        let name = if name_index == NO_NAME {
            None
        } else {
            string_constant(constants, name_index, &format!("Function {index} name"))?;
            Some(name_index)
        };
        functions.push(Function {
            name,
            code_offset,
            code_length: code_length_u32,
            register_count,
            parameter_types,
            return_type,
        });
    }
    cursor.finish("function section")?;

    let mut ranges: Vec<_> = functions
        .iter()
        .enumerate()
        .map(|(index, function)| {
            let start = usize::try_from(function.code_offset)
                .expect("validated function offsets fit this platform");
            let length = usize::try_from(function.code_length)
                .expect("validated function lengths fit this platform");
            (start, start + length, index)
        })
        .collect();
    ranges.sort_unstable_by_key(|range| range.0);
    if ranges.len() != functions.len() || ranges.iter().any(|range| range.0 == range.1) {
        return Err("Every function must contain code.".into());
    }
    if ranges.first().map(|range| range.0) != Some(0) {
        return Err("Function code must begin at offset zero.".into());
    }
    for pair in ranges.windows(2) {
        if pair[1].0 != pair[0].1 {
            return Err(if pair[1].0 < pair[0].1 {
                format!("Function {} code overlaps another function.", pair[1].2)
            } else {
                format!("Unreferenced code precedes function {}.", pair[1].2)
            });
        }
    }
    if ranges.last().map(|range| range.1) != Some(code_length) {
        return Err("Unreferenced bytes follow the final function.".into());
    }
    Ok(functions)
}

fn decode_debug(
    section: Option<Section<'_>>,
    code_length: usize,
) -> Result<Vec<DebugMapping>, String> {
    let Some(section) = section else {
        return Ok(Vec::new());
    };
    if section.flags != SECTION_OPTIONAL {
        return Err("Debug section must be optional.".into());
    }
    let mut cursor = Cursor::new(section.payload, section.offset);
    if cursor.read_u16("debug version")? != DEBUG_VERSION {
        return Err("Unsupported debug metadata version.".into());
    }
    if cursor.read_u16("debug flags")? != 0 {
        return Err("Debug flags must be zero.".into());
    }
    let count = usize::try_from(cursor.read_u32("debug mapping count")?)
        .map_err(|_| "Debug mapping count is unsupported.".to_owned())?;
    if count > MAX_TOTAL_INSTRUCTIONS {
        return Err(format!(
            "Debug mapping count exceeds the sandbox instruction limit of {MAX_TOTAL_INSTRUCTIONS}."
        ));
    }
    let mut mappings = Vec::with_capacity(count.min(section.payload.len() / 8));
    let mut previous_offset = None;
    for index in 0..count {
        let code_offset = cursor.read_u32(&format!("debug mapping {index} code offset"))?;
        let source_line = cursor.read_u32(&format!("debug mapping {index} source line"))?;
        if previous_offset.is_some_and(|previous| code_offset <= previous) {
            return Err("Debug mapping code offsets must be strictly increasing.".into());
        }
        if usize::try_from(code_offset).map_or(true, |offset| offset >= code_length) {
            return Err(format!(
                "Debug mapping {index} code offset is outside the code section."
            ));
        }
        if source_line == 0 {
            return Err(format!(
                "Debug mapping {index} source line must be one-based."
            ));
        }
        mappings.push(DebugMapping {
            code_offset,
            source_line,
        });
        previous_offset = Some(code_offset);
    }
    cursor.finish("debug section")?;
    Ok(mappings)
}

fn decode_instruction_operands(
    opcode: Opcode,
    cursor: &mut Cursor<'_>,
) -> Result<Vec<u32>, String> {
    let instruction = INSTRUCTIONS
        .iter()
        .find(|instruction| instruction.opcode == opcode)
        .expect("generated opcode must have an instruction definition");
    instruction
        .operands
        .iter()
        .map(|operand| {
            let operand_type = OPERAND_TYPES
                .iter()
                .find(|operand_type| operand_type.kind == operand.kind)
                .expect("generated operand must have a type definition");
            let context = format!("{}.{}", instruction.name, operand.name);
            let value = match operand_type.encoding {
                OperandEncoding::U16 => u32::from(cursor.read_u16(&context)?),
                OperandEncoding::U32 => cursor.read_u32(&context)?,
            };
            if !operand_type.allows_no_register && value == u32::from(NO_REGISTER) {
                return Err(format!("{context} cannot use NO_REGISTER."));
            }
            Ok(value)
        })
        .collect()
}

fn register_index(value: u32, register_count: usize, context: &str) -> Result<usize, String> {
    let index = usize::try_from(value).map_err(|_| format!("{context} is out of range."))?;
    if index >= register_count {
        return Err(format!("{context} is out of range."));
    }
    Ok(index)
}

fn is_numeric(value_type: ValueType) -> bool {
    matches!(value_type, ValueType::I64 | ValueType::F64)
}

fn opcode_name(opcode: Opcode) -> &'static str {
    INSTRUCTIONS
        .iter()
        .find(|instruction| instruction.opcode == opcode)
        .expect("generated opcode must have an instruction definition")
        .name
}

fn merge_register_types(
    destination: &mut Option<Vec<Option<ValueType>>>,
    incoming: &[Option<ValueType>],
) -> bool {
    if let Some(existing) = destination {
        let mut changed = false;
        for (current, candidate) in existing.iter_mut().zip(incoming) {
            if current.is_some() && *current != *candidate {
                *current = None;
                changed = true;
            }
        }
        changed
    } else {
        *destination = Some(incoming.to_vec());
        true
    }
}

fn verify_instruction_flow(
    module: &PortableModule,
    function: &Function,
    function_index: usize,
    instructions: &[Instruction],
) -> Result<(), String> {
    let mut initial = vec![Some(ValueType::Null); usize::from(function.register_count)];
    for (destination, parameter_type) in initial.iter_mut().zip(&function.parameter_types) {
        *destination = Some(*parameter_type);
    }
    let mut incoming = vec![None; instructions.len()];
    incoming[0] = Some(initial);
    let mut worklist = VecDeque::from([0]);
    let mut queued = vec![false; instructions.len()];
    queued[0] = true;

    while let Some(index) = worklist.pop_front() {
        queued[index] = false;
        let instruction = &instructions[index];
        let mut types = incoming[index]
            .clone()
            .expect("worklist contains only reachable instructions");

        match *instruction {
            Instruction::LoadConst {
                destination,
                constant,
            } => types[destination] = Some(module.constants[constant].value_type()),
            Instruction::Move {
                destination,
                source,
            } => types[destination] = types[source],
            Instruction::Unary {
                opcode,
                destination,
                operand,
            } => {
                let operand_type = types[operand];
                if opcode == Opcode::Negate {
                    if !operand_type.is_some_and(is_numeric) {
                        return Err("NEGATE operand must be I64 or F64 on every path.".into());
                    }
                    types[destination] = operand_type;
                } else {
                    if operand_type != Some(ValueType::Bool) {
                        return Err("BOOL_NOT operand must be BOOL on every path.".into());
                    }
                    types[destination] = Some(ValueType::Bool);
                }
            }
            Instruction::Binary {
                opcode,
                destination,
                left,
                right,
            } => {
                let name = opcode_name(opcode);
                let left_type = types[left];
                let right_type = types[right];
                if left_type.is_none() || left_type != right_type {
                    return Err(format!(
                        "{name} operands must have the same type on every path."
                    ));
                }
                let value_type = left_type.expect("checked type must be present");
                let result_type = match opcode {
                    Opcode::Add
                    | Opcode::Subtract
                    | Opcode::Multiply
                    | Opcode::Divide
                    | Opcode::Remainder => {
                        if !is_numeric(value_type) {
                            return Err(format!("{name} operands must be I64 or F64."));
                        }
                        value_type
                    }
                    Opcode::Equal | Opcode::NotEqual => ValueType::Bool,
                    Opcode::LessThan
                    | Opcode::LessEqual
                    | Opcode::GreaterThan
                    | Opcode::GreaterEqual => {
                        if !is_numeric(value_type) {
                            return Err(format!("{name} operands must be I64 or F64."));
                        }
                        ValueType::Bool
                    }
                    Opcode::BoolAnd | Opcode::BoolOr => {
                        if value_type != ValueType::Bool {
                            return Err(format!("{name} operands must be BOOL."));
                        }
                        ValueType::Bool
                    }
                    _ => unreachable!("verified binary instruction has a binary opcode"),
                };
                types[destination] = Some(result_type);
            }
            Instruction::Jump { .. } => {}
            Instruction::JumpIfFalse { condition, .. }
            | Instruction::JumpIfTrue { condition, .. } => {
                if types[condition] != Some(ValueType::Bool) {
                    return Err("Conditional jump condition must be BOOL on every path.".into());
                }
            }
            Instruction::HostCall {
                import,
                argument_start,
                argument_count,
                result,
            } => {
                let host_import = &module.imports[import];
                for (argument, expected) in types[argument_start..argument_start + argument_count]
                    .iter()
                    .zip(&host_import.parameter_types)
                {
                    if *argument != Some(*expected) {
                        return Err(
                            "HOST_CALL argument type must match on every control-flow path.".into(),
                        );
                    }
                }
                if let Some(destination) = result {
                    types[destination] = Some(host_import.return_type);
                }
            }
            Instruction::Call {
                function: called_function,
                argument_start,
                argument_count,
                result,
            } => {
                let signature = &module.functions[called_function];
                for (argument, expected) in types[argument_start..argument_start + argument_count]
                    .iter()
                    .zip(&signature.parameter_types)
                {
                    if *argument != Some(*expected) {
                        return Err(
                            "CALL argument type must match on every control-flow path.".into()
                        );
                    }
                }
                if let Some(destination) = result {
                    types[destination] = Some(signature.return_type);
                }
            }
            Instruction::Return { result } => {
                match (function.return_type, result) {
                    (ValueType::Void, None) => {}
                    (ValueType::Void, Some(_)) => {
                        return Err("A VOID function RETURN must not contain a value.".into());
                    }
                    (expected, Some(register)) if types[register] == Some(expected) => {}
                    (expected, Some(_)) => {
                        return Err(format!("RETURN value must have type {expected:?}."));
                    }
                    (_, None) => {
                        return Err("A value-returning function must return a value.".into());
                    }
                }
                continue;
            }
            Instruction::Halt => continue,
        }

        let successors: Vec<usize> = match *instruction {
            Instruction::Jump { target } => {
                vec![target]
            }
            Instruction::JumpIfFalse { target, .. } | Instruction::JumpIfTrue { target, .. } => {
                vec![index + 1, target]
            }
            _ => vec![index + 1],
        };
        for successor in successors {
            if merge_register_types(&mut incoming[successor], &types) && !queued[successor] {
                worklist.push_back(successor);
                queued[successor] = true;
            }
        }
    }
    for (index, state) in incoming.iter().enumerate() {
        if state.is_none() {
            return Err(format!(
                "Function {function_index} instruction {index} is unreachable."
            ));
        }
    }
    Ok(())
}

fn verify_function(
    module: &PortableModule,
    function: &Function,
    function_index: usize,
    total_instruction_count: &mut usize,
    debug: &HashMap<u32, u32>,
    matched_debug_mappings: &mut usize,
) -> Result<(VerifiedFunction, Vec<Option<u32>>), String> {
    let register_count = usize::from(function.register_count);
    if function.parameter_types.len() > register_count {
        return Err(format!(
            "Function {function_index} has more parameters than registers."
        ));
    }
    let code_start = usize::try_from(function.code_offset)
        .map_err(|_| format!("Function {function_index} code offset is unsupported."))?;
    let code_length = usize::try_from(function.code_length)
        .map_err(|_| format!("Function {function_index} code length is unsupported."))?;
    let code_end = code_start
        .checked_add(code_length)
        .ok_or_else(|| format!("Function {function_index} code range overflows."))?;
    let function_code = module.code.get(code_start..code_end).ok_or_else(|| {
        format!("Function {function_index} code range is outside the code section.")
    })?;
    let mut cursor = Cursor::new(function_code, code_start);
    let mut instructions = Vec::new();
    let mut instruction_offsets = Vec::new();
    let is_entry = usize::try_from(module.entry_function).ok() == Some(function_index);

    while cursor.offset < function_code.len() {
        *total_instruction_count = total_instruction_count
            .checked_add(1)
            .ok_or("Instruction count overflow.")?;
        if *total_instruction_count > MAX_TOTAL_INSTRUCTIONS {
            return Err(format!(
                "Instruction count exceeds the sandbox limit of {MAX_TOTAL_INSTRUCTIONS}."
            ));
        }
        let instruction_offset = cursor.offset;
        let encoded_opcode =
            cursor.read_u8(&format!("function {function_index} instruction opcode"))?;
        let opcode = Opcode::try_from(encoded_opcode).map_err(|_| {
            format!(
                "Unsupported portable opcode {encoded_opcode} at code offset {}.",
                code_start + instruction_offset
            )
        })?;
        let operands = decode_instruction_operands(opcode, &mut cursor)?;
        instruction_offsets.push(instruction_offset);
        let instruction = match opcode {
            Opcode::LoadConst => {
                let destination = register_index(
                    operands[0],
                    register_count,
                    "LOAD_CONST destination register",
                )?;
                let constant = usize::try_from(operands[1])
                    .map_err(|_| "LOAD_CONST constant index is out of range.".to_owned())?;
                module
                    .constants
                    .get(constant)
                    .ok_or("LOAD_CONST constant index is out of range.")?;
                Instruction::LoadConst {
                    destination,
                    constant,
                }
            }
            Opcode::Move => {
                let destination =
                    register_index(operands[0], register_count, "MOVE destination register")?;
                let source = register_index(operands[1], register_count, "MOVE source register")?;
                Instruction::Move {
                    destination,
                    source,
                }
            }
            Opcode::Negate | Opcode::BoolNot => {
                let name = opcode_name(opcode);
                let destination = register_index(
                    operands[0],
                    register_count,
                    &format!("{name} destination register"),
                )?;
                let operand = register_index(
                    operands[1],
                    register_count,
                    &format!("{name} operand register"),
                )?;
                Instruction::Unary {
                    opcode,
                    destination,
                    operand,
                }
            }
            Opcode::Add
            | Opcode::Subtract
            | Opcode::Multiply
            | Opcode::Divide
            | Opcode::Remainder
            | Opcode::Equal
            | Opcode::NotEqual
            | Opcode::LessThan
            | Opcode::LessEqual
            | Opcode::GreaterThan
            | Opcode::GreaterEqual
            | Opcode::BoolAnd
            | Opcode::BoolOr => {
                let name = opcode_name(opcode);
                let destination = register_index(
                    operands[0],
                    register_count,
                    &format!("{name} destination register"),
                )?;
                let left = register_index(
                    operands[1],
                    register_count,
                    &format!("{name} left register"),
                )?;
                let right = register_index(
                    operands[2],
                    register_count,
                    &format!("{name} right register"),
                )?;
                Instruction::Binary {
                    opcode,
                    destination,
                    left,
                    right,
                }
            }
            Opcode::Jump => Instruction::Jump {
                target: usize::try_from(operands[0])
                    .map_err(|_| "JUMP target is out of range.".to_owned())?,
            },
            Opcode::JumpIfFalse | Opcode::JumpIfTrue => {
                let name = opcode_name(opcode);
                let condition = register_index(
                    operands[0],
                    register_count,
                    &format!("{name} condition register"),
                )?;
                let target = usize::try_from(operands[1])
                    .map_err(|_| format!("{name} target is out of range."))?;
                if opcode == Opcode::JumpIfFalse {
                    Instruction::JumpIfFalse { condition, target }
                } else {
                    Instruction::JumpIfTrue { condition, target }
                }
            }
            Opcode::HostCall => {
                let import = usize::try_from(operands[0])
                    .map_err(|_| "HOST_CALL import index is out of range.".to_owned())?;
                let host_import = module
                    .imports
                    .get(import)
                    .ok_or("HOST_CALL import index is out of range.")?;
                let argument_start = usize::try_from(operands[1])
                    .map_err(|_| "HOST_CALL argument start is out of range.".to_owned())?;
                let argument_count = usize::try_from(operands[2])
                    .map_err(|_| "HOST_CALL argument count is out of range.".to_owned())?;
                if argument_count != host_import.parameter_types.len() {
                    return Err(
                        "HOST_CALL argument count does not match the import signature.".into(),
                    );
                }
                if argument_count == 0 {
                    if argument_start != 0 {
                        return Err(
                            "HOST_CALL with no arguments must use register zero as its argument start."
                                .into(),
                        );
                    }
                } else {
                    let argument_end = argument_start
                        .checked_add(argument_count)
                        .ok_or("HOST_CALL argument range is out of bounds.")?;
                    if argument_start >= register_count || argument_end > register_count {
                        return Err("HOST_CALL argument range is out of bounds.".into());
                    }
                }
                let result = if host_import.return_type == ValueType::Void {
                    if operands[3] != u32::from(NO_REGISTER) {
                        return Err("A VOID HOST_CALL must use NO_REGISTER as its result.".into());
                    }
                    None
                } else {
                    let result =
                        register_index(operands[3], register_count, "HOST_CALL result register")?;
                    Some(result)
                };
                Instruction::HostCall {
                    import,
                    argument_start,
                    argument_count,
                    result,
                }
            }
            Opcode::Call => {
                let called_function = usize::try_from(operands[0])
                    .map_err(|_| "CALL function index is out of range.".to_owned())?;
                let signature = module
                    .functions
                    .get(called_function)
                    .ok_or("CALL function index is out of range.")?;
                if called_function == usize::try_from(module.entry_function).unwrap_or(usize::MAX) {
                    return Err("CALL cannot invoke the entry function.".into());
                }
                let argument_start = usize::try_from(operands[1])
                    .map_err(|_| "CALL argument start is out of range.".to_owned())?;
                let argument_count = usize::try_from(operands[2])
                    .map_err(|_| "CALL argument count is out of range.".to_owned())?;
                if argument_count != signature.parameter_types.len() {
                    return Err("CALL argument count does not match the function signature.".into());
                }
                if argument_count == 0 {
                    if argument_start != 0 {
                        return Err(
                            "CALL with no arguments must use register zero as its argument start."
                                .into(),
                        );
                    }
                } else {
                    let argument_end = argument_start
                        .checked_add(argument_count)
                        .ok_or("CALL argument range is out of bounds.")?;
                    if argument_start >= register_count || argument_end > register_count {
                        return Err("CALL argument range is out of bounds.".into());
                    }
                }
                let result = if signature.return_type == ValueType::Void {
                    if operands[3] != u32::from(NO_REGISTER) {
                        return Err("A VOID CALL must use NO_REGISTER as its result.".into());
                    }
                    None
                } else {
                    Some(register_index(
                        operands[3],
                        register_count,
                        "CALL result register",
                    )?)
                };
                Instruction::Call {
                    function: called_function,
                    argument_start,
                    argument_count,
                    result,
                }
            }
            Opcode::Return => {
                if is_entry {
                    return Err("RETURN is not valid in the entry function.".into());
                }
                let result = if function.return_type == ValueType::Void {
                    if operands[0] != u32::from(NO_REGISTER) {
                        return Err("A VOID function RETURN must use NO_REGISTER.".into());
                    }
                    None
                } else {
                    Some(register_index(
                        operands[0],
                        register_count,
                        "RETURN result register",
                    )?)
                };
                Instruction::Return { result }
            }
            Opcode::Halt => {
                if !is_entry {
                    return Err("HALT is only valid in the entry function.".into());
                }
                if cursor.offset != function_code.len() {
                    return Err("HALT must be the final instruction of the entry function.".into());
                }
                Instruction::Halt
            }
        };
        instructions.push(instruction);
    }

    let expected_terminal = if is_entry { "HALT" } else { "RETURN" };
    let has_expected_terminal = matches!(
        (is_entry, instructions.last()),
        (true, Some(Instruction::Halt)) | (false, Some(Instruction::Return { .. }))
    );
    if !has_expected_terminal {
        return Err(format!(
            "Function {function_index} must terminate with {expected_terminal}."
        ));
    }
    let verification_type_cells = instructions
        .len()
        .checked_mul(register_count)
        .ok_or_else(|| format!("Function {function_index} type-flow analysis size overflows."))?;
    if verification_type_cells > MAX_VERIFICATION_TYPE_CELLS {
        return Err(format!(
            "Function {function_index} type-flow analysis exceeds the sandbox limit of {MAX_VERIFICATION_TYPE_CELLS} cells."
        ));
    }
    let offset_to_index: HashMap<_, _> = instruction_offsets
        .iter()
        .copied()
        .enumerate()
        .map(|(index, offset)| (offset, index))
        .collect();
    for instruction in &mut instructions {
        let (name, target) = match instruction {
            Instruction::Jump { target } => ("JUMP", target),
            Instruction::JumpIfFalse { target, .. } => ("JUMP_IF_FALSE", target),
            Instruction::JumpIfTrue { target, .. } => ("JUMP_IF_TRUE", target),
            _ => continue,
        };
        *target = *offset_to_index
            .get(target)
            .ok_or_else(|| format!("{name} target must reference an instruction boundary."))?;
    }
    verify_instruction_flow(module, function, function_index, &instructions)?;
    let source_lines = instruction_offsets
        .iter()
        .map(|local_offset| {
            let global_offset = u32::try_from(code_start + local_offset)
                .expect("validated code offsets fit in u32");
            let source_line = debug.get(&global_offset).copied();
            if source_line.is_some() {
                *matched_debug_mappings += 1;
            }
            source_line
        })
        .collect();
    Ok((
        VerifiedFunction {
            register_count,
            parameter_types: function.parameter_types.clone(),
            return_type: function.return_type,
            instructions,
        },
        source_lines,
    ))
}

pub(crate) fn verify_portable_module(
    module: PortableModule,
) -> Result<VerifiedPortableModule, String> {
    let mut total_instruction_count = 0_usize;
    let debug: HashMap<_, _> = module
        .debug
        .iter()
        .map(|mapping| (mapping.code_offset, mapping.source_line))
        .collect();
    let mut matched_debug_mappings = 0_usize;
    let mut functions = Vec::with_capacity(module.functions.len());
    let mut source_lines = Vec::with_capacity(module.functions.len());
    for (index, function) in module.functions.iter().enumerate() {
        let (verified, lines) = verify_function(
            &module,
            function,
            index,
            &mut total_instruction_count,
            &debug,
            &mut matched_debug_mappings,
        )?;
        functions.push(verified);
        source_lines.push(lines);
    }
    if matched_debug_mappings != module.debug.len() {
        return Err("Debug mappings must reference instruction boundaries.".into());
    }
    let entry_function = usize::try_from(module.entry_function)
        .map_err(|_| "Entry function index is unsupported.".to_owned())?;
    Ok(VerifiedPortableModule {
        entry_function,
        constants: module.constants,
        imports: module.imports,
        functions,
        source_lines,
    })
}

fn is_known_section(kind: u16) -> bool {
    matches!(kind, CONSTANTS | HOST_IMPORTS | FUNCTIONS | CODE | DEBUG)
}

fn required_section<'a>(section: Option<Section<'a>>, kind: u16) -> Result<Section<'a>, String> {
    let section = section.ok_or_else(|| format!("Required section kind {kind} is missing."))?;
    if section.flags != 0 {
        return Err(format!("Required section kind {kind} cannot be optional."));
    }
    Ok(section)
}

pub(crate) fn decode_portable_module(bytes: &[u8]) -> Result<PortableModule, String> {
    if bytes.len() > MAX_MODULE_BYTES {
        return Err(format!(
            "Module size exceeds the sandbox limit of {MAX_MODULE_BYTES} bytes."
        ));
    }
    let mut cursor = Cursor::new(bytes, 0);
    if cursor.read_exact(4, "magic number")? != MAGIC {
        return Err("Invalid JIMP bytecode magic.".into());
    }
    let major = cursor.read_u16("format major version")?;
    let minor = cursor.read_u16("format minor version")?;
    if major != FORMAT_MAJOR || minor != FORMAT_MINOR {
        return Err(format!(
            "Unsupported portable bytecode format {major}.{minor}."
        ));
    }
    if cursor.read_u32("module flags")? != 0 {
        return Err("Module flags must be zero.".into());
    }
    let entry_function = cursor.read_u32("entry function")?;
    let section_count = usize::from(cursor.read_u16("section count")?);
    if section_count > MAX_SECTION_COUNT {
        return Err(format!(
            "Section count exceeds the sandbox limit of {MAX_SECTION_COUNT}."
        ));
    }
    if cursor.read_u16("reserved header field")? != 0 {
        return Err("Reserved header field must be zero.".into());
    }
    let directory_size = section_count
        .checked_mul(DIRECTORY_ENTRY_SIZE)
        .ok_or("Section directory size overflow.")?;
    let directory_end = HEADER_SIZE
        .checked_add(directory_size)
        .ok_or("Section directory offset overflow.")?;
    if directory_end > bytes.len() {
        return Err("Section directory exceeds the file bounds.".into());
    }

    let mut constants = None;
    let mut imports = None;
    let mut functions = None;
    let mut code = None;
    let mut debug = None;
    let mut ranges = Vec::with_capacity(section_count);

    for index in 0..section_count {
        let kind = cursor.read_u16(&format!("section {index} kind"))?;
        let flags = cursor.read_u16(&format!("section {index} flags"))?;
        let offset = usize::try_from(cursor.read_u32(&format!("section {index} offset"))?)
            .map_err(|_| format!("Section {index} offset is unsupported."))?;
        let length = usize::try_from(cursor.read_u32(&format!("section {index} length"))?)
            .map_err(|_| format!("Section {index} length is unsupported."))?;
        if flags & !SECTION_OPTIONAL != 0 {
            return Err(format!("Section {index} uses reserved flags."));
        }
        if !is_known_section(kind) && flags & SECTION_OPTIONAL == 0 {
            return Err(format!("Section {index} has unknown required kind {kind}."));
        }
        let end = offset
            .checked_add(length)
            .ok_or_else(|| format!("Section {index} range overflows."))?;
        if offset < directory_end || end > bytes.len() {
            return Err(format!("Section {index} is outside the file bounds."));
        }
        if length > 0 {
            ranges.push((offset, end, index));
        }
        if is_known_section(kind) {
            let section = Section {
                flags,
                offset,
                payload: &bytes[offset..end],
            };
            let slot = match kind {
                CONSTANTS => &mut constants,
                HOST_IMPORTS => &mut imports,
                FUNCTIONS => &mut functions,
                CODE => &mut code,
                DEBUG => &mut debug,
                _ => unreachable!(),
            };
            if slot.replace(section).is_some() {
                return Err(format!("Section kind {kind} is duplicated."));
            }
        }
    }

    ranges.sort_unstable_by_key(|range| range.0);
    if ranges.first().map(|range| range.0) != Some(directory_end) {
        return Err("Section payloads must begin immediately after the directory.".into());
    }
    for pair in ranges.windows(2) {
        if pair[1].0 != pair[0].1 {
            return Err(if pair[1].0 < pair[0].1 {
                format!("Section {} overlaps another section.", pair[1].2)
            } else {
                format!("Unreferenced bytes precede section {}.", pair[1].2)
            });
        }
    }
    if ranges.last().map(|range| range.1) != Some(bytes.len()) {
        return Err("Unreferenced bytes follow the final section.".into());
    }

    let constants = decode_constants(required_section(constants, CONSTANTS)?)?;
    let imports = decode_imports(required_section(imports, HOST_IMPORTS)?, &constants)?;
    let code_section = required_section(code, CODE)?;
    if code_section.payload.len() > MAX_CODE_BYTES {
        return Err(format!(
            "Code size exceeds the sandbox limit of {MAX_CODE_BYTES} bytes."
        ));
    }
    let code = code_section.payload.to_vec();
    let functions = decode_functions(
        required_section(functions, FUNCTIONS)?,
        &constants,
        code.len(),
    )?;
    let debug = decode_debug(debug, code.len())?;
    let entry_index = usize::try_from(entry_function)
        .map_err(|_| "Entry function index is unsupported.".to_owned())?;
    let entry = functions
        .get(entry_index)
        .ok_or("Entry function index is out of range.")?;
    if !entry.parameter_types.is_empty() {
        return Err("Entry function must have no parameters.".into());
    }
    if entry.return_type != ValueType::Void {
        return Err("Entry function must return VOID.".into());
    }

    Ok(PortableModule {
        entry_function,
        constants,
        imports,
        functions,
        code,
        debug,
    })
}
