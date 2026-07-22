use crate::{
    generated::{
        isa::{Opcode, ValueType},
        sandbox::{
            HEAP_OBJECT_HEADER_BYTES, HEAP_SLOT_BYTES, MAX_ACTIVE_REGISTERS, MAX_CALL_FRAMES,
            MAX_EXECUTION_STEPS, MAX_HEAP_BYTES, MAX_HEAP_DEPTH, MAX_HEAP_EQUALITY_VISITS,
            MAX_HEAP_OBJECTS, MAX_HEAP_SLOTS_PER_OBJECT, MAX_RUNTIME_VALUE_BYTES,
            MAX_TOTAL_HEAP_SLOTS, REGISTER_SLOT_BYTES,
        },
    },
    host::{Host, ResolvedHostImport},
    portable::{Instruction, SourceLocation, Value, VerifiedPortableModule},
};
use std::collections::HashSet;

struct Frame {
    function: usize,
    instruction_pointer: usize,
    registers: Vec<Value>,
    return_destination: Option<usize>,
}

struct HeapObject {
    values: Vec<Value>,
    depth: usize,
}

#[derive(Default)]
struct Heap {
    objects: Vec<HeapObject>,
    allocated_slots: usize,
    allocated_bytes: usize,
}

impl Heap {
    fn allocate(&mut self, values: Vec<Value>) -> Result<Value, String> {
        if values.len() > MAX_HEAP_SLOTS_PER_OBJECT {
            return Err(format!(
                "Heap object slot limit of {MAX_HEAP_SLOTS_PER_OBJECT} was exceeded."
            ));
        }
        if self.objects.len() >= MAX_HEAP_OBJECTS {
            return Err(format!(
                "Heap object limit of {MAX_HEAP_OBJECTS} was exceeded."
            ));
        }
        let allocated_slots = self
            .allocated_slots
            .checked_add(values.len())
            .ok_or("Heap slot count overflow.")?;
        if allocated_slots > MAX_TOTAL_HEAP_SLOTS {
            return Err(format!(
                "Cumulative heap slot limit of {MAX_TOTAL_HEAP_SLOTS} was exceeded."
            ));
        }
        let mut depth = 1_usize;
        let mut payload_bytes = 0_usize;
        for value in &values {
            payload_bytes = payload_bytes
                .checked_add(value_payload_bytes(value))
                .ok_or("Heap memory calculation overflow.")?;
            if let Value::HeapRef(handle) = value {
                let referenced = self
                    .objects
                    .get(*handle)
                    .ok_or("Heap allocation contained an invalid or forward heap reference.")?;
                depth = depth.max(
                    referenced
                        .depth
                        .checked_add(1)
                        .ok_or("Heap depth overflow.")?,
                );
            }
        }
        if depth > MAX_HEAP_DEPTH {
            return Err(format!(
                "Heap nesting depth limit of {MAX_HEAP_DEPTH} was exceeded."
            ));
        }
        let object_bytes = values
            .len()
            .checked_mul(HEAP_SLOT_BYTES)
            .and_then(|bytes| bytes.checked_add(HEAP_OBJECT_HEADER_BYTES))
            .and_then(|bytes| bytes.checked_add(payload_bytes))
            .ok_or("Heap memory calculation overflow.")?;
        let allocated_bytes = self
            .allocated_bytes
            .checked_add(object_bytes)
            .ok_or("Heap memory calculation overflow.")?;
        if allocated_bytes > MAX_HEAP_BYTES {
            return Err(format!(
                "Cumulative heap memory limit of {MAX_HEAP_BYTES} bytes was exceeded."
            ));
        }
        let handle = self.objects.len();
        self.objects.push(HeapObject { values, depth });
        self.allocated_slots = allocated_slots;
        self.allocated_bytes = allocated_bytes;
        Ok(Value::HeapRef(handle))
    }

    fn load(&self, handle: usize, index: i64, expected: ValueType) -> Result<Value, String> {
        let object = self
            .objects
            .get(handle)
            .ok_or("HEAP_LOAD received an invalid heap reference.")?;
        let index = usize::try_from(index)
            .map_err(|_| "HEAP_LOAD index cannot be negative or unsupported.".to_owned())?;
        let value = object
            .values
            .get(index)
            .ok_or_else(|| format!("HEAP_LOAD index {index} is out of bounds."))?;
        if value.value_type() != expected {
            return Err(format!(
                "HEAP_LOAD slot type does not match the verified {expected:?} result type."
            ));
        }
        Ok(value.clone())
    }

    fn length(&self, handle: usize) -> Result<i64, String> {
        let length = self
            .objects
            .get(handle)
            .ok_or("HEAP_LENGTH received an invalid heap reference.")?
            .values
            .len();
        i64::try_from(length).map_err(|_| "Heap object length is outside the I64 range.".into())
    }

    fn replace(&mut self, handle: usize, index: i64, value: Value) -> Result<Value, String> {
        let index = usize::try_from(index)
            .map_err(|_| "HEAP_REPLACE index cannot be negative or unsupported.".to_owned())?;
        let mut values = self
            .objects
            .get(handle)
            .ok_or("HEAP_REPLACE received an invalid heap reference.")?
            .values
            .clone();
        let slot = values
            .get_mut(index)
            .ok_or_else(|| format!("HEAP_REPLACE index {index} is out of bounds."))?;
        *slot = value;
        self.allocate(values)
    }

    fn equal(&self, left: usize, right: usize) -> Result<(bool, usize), String> {
        let mut pending = vec![(left, right)];
        let mut visited = HashSet::new();
        let mut visits = 0_usize;
        while let Some((left, right)) = pending.pop() {
            if left == right || !visited.insert((left, right)) {
                continue;
            }
            visits = visits
                .checked_add(1)
                .ok_or("Heap equality visit count overflow.")?;
            if visits > MAX_HEAP_EQUALITY_VISITS {
                return Err(format!(
                    "Heap equality visit limit of {MAX_HEAP_EQUALITY_VISITS} was exceeded."
                ));
            }
            let left = self
                .objects
                .get(left)
                .ok_or("HEAP_EQUAL received an invalid left heap reference.")?;
            let right = self
                .objects
                .get(right)
                .ok_or("HEAP_EQUAL received an invalid right heap reference.")?;
            if left.values.len() != right.values.len() {
                return Ok((false, visits));
            }
            for (left, right) in left.values.iter().zip(&right.values) {
                visits = visits
                    .checked_add(1)
                    .ok_or("Heap equality visit count overflow.")?;
                if visits > MAX_HEAP_EQUALITY_VISITS {
                    return Err(format!(
                        "Heap equality visit limit of {MAX_HEAP_EQUALITY_VISITS} was exceeded."
                    ));
                }
                match (left, right) {
                    (Value::HeapRef(left), Value::HeapRef(right)) => {
                        pending.push((*left, *right));
                    }
                    (Value::Null, Value::Null) => {}
                    (Value::Bool(left), Value::Bool(right)) if left == right => {}
                    (Value::I64(left), Value::I64(right)) if left == right => {}
                    (Value::F64(left), Value::F64(right)) if left == right => {}
                    (Value::String(left), Value::String(right)) if left == right => {}
                    _ => return Ok((false, visits)),
                }
            }
        }
        Ok((true, visits))
    }
}

#[derive(Debug, Eq, PartialEq)]
pub(crate) struct RuntimeError {
    message: String,
    source_line: Option<u32>,
    source_module_id: Option<String>,
}

impl RuntimeError {
    fn new(
        message: impl Into<String>,
        source_line: Option<u32>,
        source_module_id: Option<String>,
    ) -> Self {
        Self {
            message: message.into(),
            source_line,
            source_module_id,
        }
    }

    pub(crate) fn into_parts(self) -> (String, Option<u32>, Option<String>) {
        (self.message, self.source_line, self.source_module_id)
    }

    #[cfg(test)]
    fn message(&self) -> &str {
        &self.message
    }
}

impl From<String> for RuntimeError {
    fn from(message: String) -> Self {
        Self::new(message, None, None)
    }
}

impl From<&str> for RuntimeError {
    fn from(message: &str) -> Self {
        Self::new(message, None, None)
    }
}

fn runtime_error(
    message: impl Into<String>,
    module: &VerifiedPortableModule,
    location: Option<SourceLocation>,
) -> RuntimeError {
    let source_module_id = location
        .and_then(|location| location.source_index)
        .and_then(|index| module.debug_sources.get(index))
        .cloned();
    RuntimeError::new(
        message,
        location.map(|location| location.source_line),
        source_module_id,
    )
}

struct RuntimeResources {
    active_registers: usize,
    value_bytes: usize,
    execution_steps: usize,
}

fn value_payload_bytes(value: &Value) -> usize {
    match value {
        Value::String(value) => value.len(),
        _ => 0,
    }
}

fn frame_value_bytes(register_count: usize, arguments: &[Value]) -> Result<usize, String> {
    let slot_bytes = register_count
        .checked_mul(REGISTER_SLOT_BYTES)
        .ok_or("Runtime register memory calculation overflow.")?;
    arguments.iter().try_fold(slot_bytes, |total, value| {
        total
            .checked_add(value_payload_bytes(value))
            .ok_or_else(|| "Runtime value memory calculation overflow.".into())
    })
}

impl RuntimeResources {
    fn new(entry_registers: usize) -> Result<Self, String> {
        if entry_registers > MAX_ACTIVE_REGISTERS {
            return Err(format!(
                "Active register limit of {MAX_ACTIVE_REGISTERS} was exceeded."
            ));
        }
        let value_bytes = frame_value_bytes(entry_registers, &[])?;
        if value_bytes > MAX_RUNTIME_VALUE_BYTES {
            return Err(format!(
                "Runtime value memory limit of {MAX_RUNTIME_VALUE_BYTES} bytes was exceeded."
            ));
        }
        Ok(Self {
            active_registers: entry_registers,
            value_bytes,
            execution_steps: 0,
        })
    }

    fn step(&mut self) -> Result<(), String> {
        self.steps(1)
    }

    fn steps(&mut self, count: usize) -> Result<(), String> {
        self.execution_steps = self
            .execution_steps
            .checked_add(count)
            .ok_or("Execution step count overflow.")?;
        if self.execution_steps > MAX_EXECUTION_STEPS {
            return Err(format!(
                "Execution step limit of {MAX_EXECUTION_STEPS} was exceeded."
            ));
        }
        Ok(())
    }

    fn push_frame(&mut self, register_count: usize, arguments: &[Value]) -> Result<(), String> {
        let active_registers = self
            .active_registers
            .checked_add(register_count)
            .ok_or("Active register count overflow.")?;
        if active_registers > MAX_ACTIVE_REGISTERS {
            return Err(format!(
                "Active register limit of {MAX_ACTIVE_REGISTERS} was exceeded."
            ));
        }
        let value_bytes = self
            .value_bytes
            .checked_add(frame_value_bytes(register_count, arguments)?)
            .ok_or("Runtime value memory calculation overflow.")?;
        if value_bytes > MAX_RUNTIME_VALUE_BYTES {
            return Err(format!(
                "Runtime value memory limit of {MAX_RUNTIME_VALUE_BYTES} bytes was exceeded."
            ));
        }
        self.active_registers = active_registers;
        self.value_bytes = value_bytes;
        Ok(())
    }

    fn pop_frame(&mut self, frame: &Frame) {
        self.active_registers -= frame.registers.len();
        self.value_bytes -= frame_value_bytes(frame.registers.len(), &frame.registers)
            .expect("verified frame memory must remain representable");
    }

    fn replace_register(
        &mut self,
        frame: &mut Frame,
        destination: usize,
        value: Value,
    ) -> Result<(), String> {
        let old_payload = value_payload_bytes(&frame.registers[destination]);
        let new_payload = value_payload_bytes(&value);
        let value_bytes = self
            .value_bytes
            .checked_sub(old_payload)
            .and_then(|bytes| bytes.checked_add(new_payload))
            .ok_or("Runtime value memory calculation overflow.")?;
        if value_bytes > MAX_RUNTIME_VALUE_BYTES {
            return Err(format!(
                "Runtime value memory limit of {MAX_RUNTIME_VALUE_BYTES} bytes was exceeded."
            ));
        }
        frame.registers[destination] = value;
        self.value_bytes = value_bytes;
        Ok(())
    }
}

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
) -> Result<(), RuntimeError> {
    if resolved_imports.len() != module.imports.len() {
        return Err("Resolved host-import table does not match the verified module.".into());
    }
    let entry = module
        .functions
        .get(module.entry_function)
        .ok_or("Verified entry function is unavailable.")?;
    let mut frames = vec![Frame {
        function: module.entry_function,
        instruction_pointer: 0,
        registers: vec![Value::Null; entry.register_count],
        return_destination: None,
    }];
    let mut resources = RuntimeResources::new(entry.register_count)?;
    let mut heap = Heap::default();

    loop {
        let frame = frames.last().expect("execution always has an active frame");
        let function = frame.function;
        let instruction_pointer = frame.instruction_pointer;
        let source_location = module
            .source_locations
            .get(function)
            .and_then(|locations| locations.get(instruction_pointer))
            .copied()
            .flatten();
        resources
            .step()
            .map_err(|message| runtime_error(message, module, source_location))?;
        let instruction = module.functions[function].instructions[instruction_pointer].clone();
        frames
            .last_mut()
            .expect("execution always has an active frame")
            .instruction_pointer += 1;

        let step = (|| -> Result<bool, String> {
            match instruction {
                Instruction::LoadConst {
                    destination,
                    constant,
                } => {
                    resources.replace_register(
                        frames.last_mut().expect("active frame"),
                        destination,
                        module.constants[constant].clone(),
                    )?;
                }
                Instruction::Move {
                    destination,
                    source,
                } => {
                    let value = frames.last().expect("active frame").registers[source].clone();
                    resources.replace_register(
                        frames.last_mut().expect("active frame"),
                        destination,
                        value,
                    )?;
                }
                Instruction::HeapAlloc {
                    destination,
                    value_start,
                    value_count,
                } => {
                    let values = frames.last().expect("active frame").registers
                        [value_start..value_start + value_count]
                        .to_vec();
                    let reference = heap.allocate(values)?;
                    resources.replace_register(
                        frames.last_mut().expect("active frame"),
                        destination,
                        reference,
                    )?;
                }
                Instruction::HeapLoad {
                    destination,
                    object,
                    index,
                    result_type,
                } => {
                    let frame = frames.last().expect("active frame");
                    let handle = match frame.registers[object] {
                        Value::HeapRef(handle) => handle,
                        _ => return Err("HEAP_LOAD object has an invalid runtime type.".into()),
                    };
                    let index = match frame.registers[index] {
                        Value::I64(index) => index,
                        _ => return Err("HEAP_LOAD index has an invalid runtime type.".into()),
                    };
                    let value = heap.load(handle, index, result_type)?;
                    resources.replace_register(
                        frames.last_mut().expect("active frame"),
                        destination,
                        value,
                    )?;
                }
                Instruction::HeapLength {
                    destination,
                    object,
                } => {
                    let handle = match frames.last().expect("active frame").registers[object] {
                        Value::HeapRef(handle) => handle,
                        _ => return Err("HEAP_LENGTH object has an invalid runtime type.".into()),
                    };
                    let length = heap.length(handle)?;
                    resources.replace_register(
                        frames.last_mut().expect("active frame"),
                        destination,
                        Value::I64(length),
                    )?;
                }
                Instruction::HeapReplace {
                    destination,
                    object,
                    index,
                    value,
                } => {
                    let frame = frames.last().expect("active frame");
                    let handle = match frame.registers[object] {
                        Value::HeapRef(handle) => handle,
                        _ => return Err("HEAP_REPLACE object has an invalid runtime type.".into()),
                    };
                    let index = match frame.registers[index] {
                        Value::I64(index) => index,
                        _ => return Err("HEAP_REPLACE index has an invalid runtime type.".into()),
                    };
                    let value = frame.registers[value].clone();
                    let reference = heap.replace(handle, index, value)?;
                    resources.replace_register(
                        frames.last_mut().expect("active frame"),
                        destination,
                        reference,
                    )?;
                }
                Instruction::HeapEqual {
                    destination,
                    left,
                    right,
                } => {
                    let frame = frames.last().expect("active frame");
                    let left = match frame.registers[left] {
                        Value::HeapRef(handle) => handle,
                        _ => {
                            return Err(
                                "HEAP_EQUAL left operand has an invalid runtime type.".into()
                            );
                        }
                    };
                    let right = match frame.registers[right] {
                        Value::HeapRef(handle) => handle,
                        _ => {
                            return Err(
                                "HEAP_EQUAL right operand has an invalid runtime type.".into()
                            );
                        }
                    };
                    let (equal, visits) = heap.equal(left, right)?;
                    resources.steps(visits)?;
                    resources.replace_register(
                        frames.last_mut().expect("active frame"),
                        destination,
                        Value::Bool(equal),
                    )?;
                }
                Instruction::StringLength { destination, value } => {
                    let value = match &frames.last().expect("active frame").registers[value] {
                        Value::String(value) => value,
                        _ => return Err("STRING_LENGTH value has an invalid runtime type.".into()),
                    };
                    let length = i64::try_from(value.chars().count())
                        .map_err(|_| "STRING_LENGTH result is outside the I64 range.")?;
                    resources.replace_register(
                        frames.last_mut().expect("active frame"),
                        destination,
                        Value::I64(length),
                    )?;
                }
                Instruction::StringLoad {
                    destination,
                    value,
                    index,
                } => {
                    let frame = frames.last().expect("active frame");
                    let value = match &frame.registers[value] {
                        Value::String(value) => value,
                        _ => return Err("STRING_LOAD value has an invalid runtime type.".into()),
                    };
                    let index = match frame.registers[index] {
                        Value::I64(index) => usize::try_from(index)
                            .map_err(|_| "STRING_LOAD index cannot be negative or unsupported.")?,
                        _ => return Err("STRING_LOAD index has an invalid runtime type.".into()),
                    };
                    let character = value
                        .chars()
                        .nth(index)
                        .ok_or_else(|| format!("STRING_LOAD index {index} is out of bounds."))?;
                    resources.replace_register(
                        frames.last_mut().expect("active frame"),
                        destination,
                        Value::String(character.to_string()),
                    )?;
                }
                Instruction::StringSlice {
                    destination,
                    value,
                    start,
                    end,
                } => {
                    let frame = frames.last().expect("active frame");
                    let value = match &frame.registers[value] {
                        Value::String(value) => value,
                        _ => return Err("STRING_SLICE value has an invalid runtime type.".into()),
                    };
                    let start = match frame.registers[start] {
                        Value::I64(start) => usize::try_from(start)
                            .map_err(|_| "STRING_SLICE start cannot be negative or unsupported.")?,
                        _ => return Err("STRING_SLICE start has an invalid runtime type.".into()),
                    };
                    let end = match frame.registers[end] {
                        Value::I64(end) => usize::try_from(end)
                            .map_err(|_| "STRING_SLICE end cannot be negative or unsupported.")?,
                        _ => return Err("STRING_SLICE end has an invalid runtime type.".into()),
                    };
                    let length = value.chars().count();
                    if start > end || end > length {
                        return Err(format!(
                            "STRING_SLICE range {start}..{end} is outside string length {length}."
                        ));
                    }
                    let result = value.chars().skip(start).take(end - start).collect();
                    resources.replace_register(
                        frames.last_mut().expect("active frame"),
                        destination,
                        Value::String(result),
                    )?;
                }
                Instruction::StringConcat {
                    destination,
                    left,
                    right,
                } => {
                    let frame = frames.last().expect("active frame");
                    let left = match &frame.registers[left] {
                        Value::String(value) => value,
                        _ => return Err("STRING_CONCAT left has an invalid runtime type.".into()),
                    };
                    let right = match &frame.registers[right] {
                        Value::String(value) => value,
                        _ => return Err("STRING_CONCAT right has an invalid runtime type.".into()),
                    };
                    let mut result = String::with_capacity(left.len().saturating_add(right.len()));
                    result.push_str(left);
                    result.push_str(right);
                    resources.replace_register(
                        frames.last_mut().expect("active frame"),
                        destination,
                        Value::String(result),
                    )?;
                }
                Instruction::Unary {
                    opcode,
                    destination,
                    operand,
                } => {
                    let value = execute_unary(
                        opcode,
                        &frames.last().expect("active frame").registers[operand],
                    )?;
                    resources.replace_register(
                        frames.last_mut().expect("active frame"),
                        destination,
                        value,
                    )?;
                }
                Instruction::Binary {
                    opcode,
                    destination,
                    left,
                    right,
                } => {
                    let frame = frames.last().expect("active frame");
                    let result =
                        execute_binary(opcode, &frame.registers[left], &frame.registers[right])?;
                    resources.replace_register(
                        frames.last_mut().expect("active frame"),
                        destination,
                        result,
                    )?;
                }
                Instruction::Jump { target } => {
                    frames.last_mut().expect("active frame").instruction_pointer = target;
                }
                Instruction::JumpIfFalse { condition, target } => {
                    match frames.last().expect("active frame").registers[condition] {
                        Value::Bool(false) => {
                            frames.last_mut().expect("active frame").instruction_pointer = target;
                        }
                        Value::Bool(true) => {}
                        _ => {
                            return Err(
                                "JUMP_IF_FALSE condition has an invalid runtime type.".into()
                            );
                        }
                    }
                }
                Instruction::JumpIfTrue { condition, target } => {
                    match frames.last().expect("active frame").registers[condition] {
                        Value::Bool(true) => {
                            frames.last_mut().expect("active frame").instruction_pointer = target;
                        }
                        Value::Bool(false) => {}
                        _ => {
                            return Err(
                                "JUMP_IF_TRUE condition has an invalid runtime type.".into()
                            );
                        }
                    }
                }
                Instruction::HostCall {
                    import,
                    argument_start,
                    argument_count,
                    result,
                } => {
                    let signature = &module.imports[import];
                    let resolved = &resolved_imports[import];
                    let returned = {
                        let arguments = &frames.last().expect("active frame").registers
                            [argument_start..argument_start + argument_count];
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
                        host.invoke(resolved.handle, arguments)?
                    };
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
                            resources.replace_register(
                                frames.last_mut().expect("active frame"),
                                destination,
                                value,
                            )?;
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
                Instruction::Call {
                    function,
                    argument_start,
                    argument_count,
                    result,
                } => {
                    if frames.len() >= MAX_CALL_FRAMES {
                        return Err(format!(
                            "Call stack limit of {MAX_CALL_FRAMES} frame(s) was exceeded."
                        ));
                    }
                    let called = &module.functions[function];
                    let registers = {
                        let arguments = &frames.last().expect("active frame").registers
                            [argument_start..argument_start + argument_count];
                        for (index, (argument, expected)) in
                            arguments.iter().zip(&called.parameter_types).enumerate()
                        {
                            if argument.value_type() != *expected {
                                return Err(format!(
                                    "Function call argument {index} has an invalid runtime type."
                                ));
                            }
                        }
                        resources.push_frame(called.register_count, arguments)?;
                        let mut registers = vec![Value::Null; called.register_count];
                        registers[..arguments.len()].clone_from_slice(arguments);
                        registers
                    };
                    frames.push(Frame {
                        function,
                        instruction_pointer: 0,
                        registers,
                        return_destination: result,
                    });
                }
                Instruction::Return { result } => {
                    let mut completed = frames.pop().expect("RETURN has an active function frame");
                    resources.pop_frame(&completed);
                    let returned = result.map(|register| {
                        std::mem::replace(&mut completed.registers[register], Value::Null)
                    });
                    let signature = &module.functions[completed.function];
                    let caller = frames
                        .last_mut()
                        .ok_or("Verified entry function returned unexpectedly.")?;
                    match (
                        signature.return_type,
                        completed.return_destination,
                        returned,
                    ) {
                        (ValueType::Void, None, None) => {}
                        (expected, Some(destination), Some(value))
                            if value.value_type() == expected =>
                        {
                            resources.replace_register(caller, destination, value)?;
                        }
                        _ => {
                            return Err(
                                "Function return contract is inconsistent at runtime.".into()
                            );
                        }
                    }
                }
                Instruction::Halt => return Ok(true),
            }
            Ok(false)
        })();
        match step {
            Ok(true) => return Ok(()),
            Ok(false) => {}
            Err(message) => return Err(runtime_error(message, module, source_location)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        generated::sandbox::{MAX_CONSTANT_STRING_BYTES, MAX_HEAP_DEPTH},
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
            build: None,
            constants: vec![Value::String("Hello from the VM\n".into())],
            imports: vec![HostImport {
                symbol: "test.console.write".into(),
                parameter_types: vec![ValueType::String],
                return_type: ValueType::Void,
            }],
            functions: vec![VerifiedFunction {
                register_count: 2,
                parameter_types: vec![],
                return_type: ValueType::Void,
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
            debug_sources: vec![],
            source_locations: vec![],
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
    fn executes_immutable_heap_allocation_and_typed_access() {
        let module = VerifiedPortableModule {
            entry_function: 0,
            build: None,
            constants: vec![Value::String("heap value".into()), Value::I64(0)],
            imports: vec![HostImport {
                symbol: "test.console.write".into(),
                parameter_types: vec![ValueType::String],
                return_type: ValueType::Void,
            }],
            functions: vec![VerifiedFunction {
                register_count: 4,
                parameter_types: vec![],
                return_type: ValueType::Void,
                instructions: vec![
                    Instruction::LoadConst {
                        destination: 0,
                        constant: 0,
                    },
                    Instruction::HeapAlloc {
                        destination: 1,
                        value_start: 0,
                        value_count: 1,
                    },
                    Instruction::LoadConst {
                        destination: 2,
                        constant: 1,
                    },
                    Instruction::HeapLoad {
                        destination: 3,
                        object: 1,
                        index: 2,
                        result_type: ValueType::String,
                    },
                    Instruction::HostCall {
                        import: 0,
                        argument_start: 3,
                        argument_count: 1,
                        result: None,
                    },
                    Instruction::Halt,
                ],
            }],
            debug_sources: vec![],
            source_locations: vec![],
        };
        let resolved = [ResolvedHostImport {
            symbol: "test.console.write".into(),
            handle: HostHandle::new(7),
        }];
        let mut host = RecordingHost::default();

        execute(&module, &resolved, &mut host).expect("heap access should execute");

        assert_eq!(host.arguments, [Value::String("heap value".into())]);
    }

    #[test]
    fn immutable_heap_replacement_preserves_the_original_and_compares_structurally() {
        let mut heap = Heap::default();
        let original = heap
            .allocate(vec![Value::I64(7)])
            .expect("original allocation should succeed");
        let same = heap
            .allocate(vec![Value::I64(7)])
            .expect("equal allocation should succeed");
        let original_handle = match original {
            Value::HeapRef(handle) => handle,
            _ => unreachable!("heap allocation returns a heap reference"),
        };
        let same_handle = match same {
            Value::HeapRef(handle) => handle,
            _ => unreachable!("heap allocation returns a heap reference"),
        };
        let changed = heap
            .replace(original_handle, 0, Value::I64(8))
            .expect("replacement should succeed");
        let changed_handle = match changed {
            Value::HeapRef(handle) => handle,
            _ => unreachable!("heap replacement returns a heap reference"),
        };

        assert_eq!(
            heap.load(original_handle, 0, ValueType::I64),
            Ok(Value::I64(7))
        );
        assert_eq!(
            heap.load(changed_handle, 0, ValueType::I64),
            Ok(Value::I64(8))
        );
        assert_eq!(
            heap.equal(original_handle, same_handle)
                .map(|result| result.0),
            Ok(true)
        );
        assert_eq!(
            heap.equal(original_handle, changed_handle)
                .map(|result| result.0),
            Ok(false)
        );
    }

    #[test]
    fn enforces_heap_nesting_depth_without_partial_host_effects() {
        let mut instructions = vec![Instruction::HeapAlloc {
            destination: 0,
            value_start: 0,
            value_count: 0,
        }];
        for _ in 0..MAX_HEAP_DEPTH {
            instructions.push(Instruction::HeapAlloc {
                destination: 1,
                value_start: 0,
                value_count: 1,
            });
            instructions.push(Instruction::Move {
                destination: 0,
                source: 1,
            });
        }
        instructions.push(Instruction::Halt);
        let module = VerifiedPortableModule {
            entry_function: 0,
            build: None,
            constants: vec![],
            imports: vec![],
            functions: vec![VerifiedFunction {
                register_count: 2,
                parameter_types: vec![],
                return_type: ValueType::Void,
                instructions,
            }],
            debug_sources: vec![],
            source_locations: vec![],
        };

        let error = execute(&module, &[], &mut RecordingHost::default())
            .expect_err("heap depth must be bounded");

        assert!(error.message().contains("Heap nesting depth limit"));
    }

    #[test]
    fn executes_verified_conditional_jumps() {
        let module = VerifiedPortableModule {
            entry_function: 0,
            build: None,
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
                parameter_types: vec![],
                return_type: ValueType::Void,
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
            debug_sources: vec![],
            source_locations: vec![],
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

    #[test]
    fn attaches_the_current_source_line_to_runtime_failures() {
        let module = VerifiedPortableModule {
            entry_function: 0,
            build: None,
            constants: vec![Value::I64(1), Value::I64(0)],
            imports: vec![],
            functions: vec![VerifiedFunction {
                register_count: 2,
                parameter_types: vec![],
                return_type: ValueType::Void,
                instructions: vec![
                    Instruction::LoadConst {
                        destination: 0,
                        constant: 0,
                    },
                    Instruction::LoadConst {
                        destination: 1,
                        constant: 1,
                    },
                    Instruction::Binary {
                        opcode: Opcode::Divide,
                        destination: 0,
                        left: 0,
                        right: 1,
                    },
                    Instruction::Halt,
                ],
            }],
            debug_sources: vec!["lib/math.jimp".into()],
            source_locations: vec![vec![
                Some(SourceLocation {
                    source_index: Some(0),
                    source_line: 8,
                }),
                Some(SourceLocation {
                    source_index: Some(0),
                    source_line: 8,
                }),
                Some(SourceLocation {
                    source_index: Some(0),
                    source_line: 9,
                }),
                Some(SourceLocation {
                    source_index: Some(0),
                    source_line: 9,
                }),
            ]],
        };

        let error =
            execute(&module, &[], &mut RecordingHost::default()).expect_err("division must fail");

        assert_eq!(error.message(), "I64 division by zero.");
        assert_eq!(error.source_line, Some(9));
        assert_eq!(error.source_module_id.as_deref(), Some("lib/math.jimp"));
    }

    #[test]
    fn enforces_the_active_register_budget_before_the_call_frame_budget() {
        let module = VerifiedPortableModule {
            entry_function: 0,
            build: None,
            constants: vec![],
            imports: vec![],
            functions: vec![
                VerifiedFunction {
                    register_count: 0,
                    parameter_types: vec![],
                    return_type: ValueType::Void,
                    instructions: vec![
                        Instruction::Call {
                            function: 1,
                            argument_start: 0,
                            argument_count: 0,
                            result: None,
                        },
                        Instruction::Halt,
                    ],
                },
                VerifiedFunction {
                    register_count: 4_096,
                    parameter_types: vec![],
                    return_type: ValueType::Void,
                    instructions: vec![
                        Instruction::Call {
                            function: 1,
                            argument_start: 0,
                            argument_count: 0,
                            result: None,
                        },
                        Instruction::Return { result: None },
                    ],
                },
            ],
            debug_sources: vec![],
            source_locations: vec![],
        };

        let error = execute(&module, &[], &mut RecordingHost::default())
            .expect_err("recursive frames must exceed the active register budget");

        assert_eq!(
            error.message(),
            format!("Active register limit of {MAX_ACTIVE_REGISTERS} was exceeded.")
        );
    }

    #[test]
    fn enforces_logical_runtime_value_memory_for_recursive_strings() {
        let module = VerifiedPortableModule {
            entry_function: 0,
            build: None,
            constants: vec![Value::String("x".repeat(MAX_CONSTANT_STRING_BYTES))],
            imports: vec![],
            functions: vec![
                VerifiedFunction {
                    register_count: 1,
                    parameter_types: vec![],
                    return_type: ValueType::Void,
                    instructions: vec![
                        Instruction::LoadConst {
                            destination: 0,
                            constant: 0,
                        },
                        Instruction::Call {
                            function: 1,
                            argument_start: 0,
                            argument_count: 1,
                            result: None,
                        },
                        Instruction::Halt,
                    ],
                },
                VerifiedFunction {
                    register_count: 1,
                    parameter_types: vec![ValueType::String],
                    return_type: ValueType::Void,
                    instructions: vec![
                        Instruction::Call {
                            function: 1,
                            argument_start: 0,
                            argument_count: 1,
                            result: None,
                        },
                        Instruction::Return { result: None },
                    ],
                },
            ],
            debug_sources: vec![],
            source_locations: vec![],
        };

        let error = execute(&module, &[], &mut RecordingHost::default())
            .expect_err("recursive string copies must exceed logical value memory");

        assert_eq!(
            error.message(),
            format!("Runtime value memory limit of {MAX_RUNTIME_VALUE_BYTES} bytes was exceeded.")
        );
    }
}
