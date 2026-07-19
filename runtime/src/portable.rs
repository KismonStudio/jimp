use crate::generated::isa::{
    FORMAT_MAJOR, FORMAT_MINOR, INSTRUCTIONS, NO_REGISTER, OPERAND_TYPES, Opcode, OperandEncoding,
    ValueType,
};

const MAGIC: &[u8; 4] = b"JIMP";
const HEADER_SIZE: usize = 20;
const DIRECTORY_ENTRY_SIZE: usize = 12;
const SECTION_OPTIONAL: u16 = 1;
const CONSTANTS: u16 = 1;
const HOST_IMPORTS: u16 = 2;
const FUNCTIONS: u16 = 3;
const CODE: u16 = 4;
const DEBUG: u16 = 5;
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
    pub(crate) name: Option<String>,
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
    HostCall {
        import: usize,
        argument_start: usize,
        argument_count: usize,
        result: Option<usize>,
    },
    Halt,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct VerifiedFunction {
    pub(crate) register_count: usize,
    pub(crate) instructions: Vec<Instruction>,
}

#[derive(Debug, PartialEq)]
pub(crate) struct VerifiedPortableModule {
    pub(crate) entry_function: usize,
    pub(crate) constants: Vec<Value>,
    pub(crate) imports: Vec<HostImport>,
    pub(crate) functions: Vec<VerifiedFunction>,
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
    let mut constants = Vec::with_capacity(count.min(section.payload.len()));
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
    constants
        .get(index)
        .and_then(Value::string)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("{context} must reference a non-empty string constant."))
}

fn decode_imports(section: Section<'_>, constants: &[Value]) -> Result<Vec<HostImport>, String> {
    let mut cursor = Cursor::new(section.payload, section.offset);
    let count = usize::try_from(cursor.read_u32("host import count")?)
        .map_err(|_| "Host import count is not supported on this platform.")?;
    let mut imports = Vec::with_capacity(count.min(section.payload.len()));
    for index in 0..count {
        let namespace_index = cursor.read_u32(&format!("host import {index} namespace"))?;
        let name_index = cursor.read_u32(&format!("host import {index} name"))?;
        let parameter_count =
            usize::from(cursor.read_u16(&format!("host import {index} parameter count"))?);
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
    let mut functions = Vec::with_capacity(count.min(section.payload.len()));
    for index in 0..count {
        let name_index = cursor.read_u32(&format!("function {index} name"))?;
        let code_offset = cursor.read_u32(&format!("function {index} code offset"))?;
        let code_length_u32 = cursor.read_u32(&format!("function {index} code length"))?;
        let register_count = cursor.read_u16(&format!("function {index} register count"))?;
        let parameter_count =
            usize::from(cursor.read_u16(&format!("function {index} parameter count"))?);
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
            Some(
                string_constant(constants, name_index, &format!("Function {index} name"))?
                    .to_owned(),
            )
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

fn verify_function(
    module: &PortableModule,
    function: &Function,
    function_index: usize,
) -> Result<VerifiedFunction, String> {
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
    let mut register_types = vec![ValueType::Null; register_count];
    register_types[..function.parameter_types.len()].copy_from_slice(&function.parameter_types);
    let mut instructions = Vec::new();
    let mut halted = false;

    while cursor.offset < function_code.len() {
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
        let instruction = match opcode {
            Opcode::LoadConst => {
                let destination = register_index(
                    operands[0],
                    register_count,
                    "LOAD_CONST destination register",
                )?;
                let constant = usize::try_from(operands[1])
                    .map_err(|_| "LOAD_CONST constant index is out of range.".to_owned())?;
                let value = module
                    .constants
                    .get(constant)
                    .ok_or("LOAD_CONST constant index is out of range.")?;
                register_types[destination] = value.value_type();
                Instruction::LoadConst {
                    destination,
                    constant,
                }
            }
            Opcode::Move => {
                let destination =
                    register_index(operands[0], register_count, "MOVE destination register")?;
                let source = register_index(operands[1], register_count, "MOVE source register")?;
                register_types[destination] = register_types[source];
                Instruction::Move {
                    destination,
                    source,
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
                    for (index, expected_type) in host_import.parameter_types.iter().enumerate() {
                        if register_types[argument_start + index] != *expected_type {
                            return Err(format!(
                                "HOST_CALL argument {index} type does not match the import signature."
                            ));
                        }
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
                    register_types[result] = host_import.return_type;
                    Some(result)
                };
                Instruction::HostCall {
                    import,
                    argument_start,
                    argument_count,
                    result,
                }
            }
            Opcode::Halt => {
                if cursor.offset != function_code.len() {
                    return Err("HALT must be the final instruction of a function.".into());
                }
                halted = true;
                Instruction::Halt
            }
        };
        instructions.push(instruction);
    }

    if !halted {
        return Err(format!(
            "Function {function_index} must terminate with HALT."
        ));
    }
    Ok(VerifiedFunction {
        register_count,
        instructions,
    })
}

pub(crate) fn verify_portable_module(
    module: PortableModule,
) -> Result<VerifiedPortableModule, String> {
    let functions = module
        .functions
        .iter()
        .enumerate()
        .map(|(index, function)| verify_function(&module, function, index))
        .collect::<Result<Vec<_>, _>>()?;
    let entry_function = usize::try_from(module.entry_function)
        .map_err(|_| "Entry function index is unsupported.".to_owned())?;
    Ok(VerifiedPortableModule {
        entry_function,
        constants: module.constants,
        imports: module.imports,
        functions,
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
    let code = required_section(code, CODE)?.payload.to_vec();
    let functions = decode_functions(
        required_section(functions, FUNCTIONS)?,
        &constants,
        code.len(),
    )?;
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
    })
}
