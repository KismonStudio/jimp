import {
  FORMAT_VERSION,
  INSTRUCTIONS,
  NO_REGISTER,
  OPERAND_TYPES,
  VALUE_TYPES,
} from "../generated/isa.js";

const MAGIC = Buffer.from("JIMP");
const HEADER_SIZE = 20;
const DIRECTORY_ENTRY_SIZE = 12;
const NO_NAME = 0xffffffff;

export const SECTION_KINDS = Object.freeze({
  CONSTANTS: 1,
  HOST_IMPORTS: 2,
  FUNCTIONS: 3,
  CODE: 4,
  DEBUG: 5,
});

const requiredSectionKinds = new Set([
  SECTION_KINDS.CONSTANTS,
  SECTION_KINDS.HOST_IMPORTS,
  SECTION_KINDS.FUNCTIONS,
  SECTION_KINDS.CODE,
]);
const instructionByName = new Map(INSTRUCTIONS.map((instruction) => [instruction.name, instruction]));
const instructionByOpcode = new Map(INSTRUCTIONS.map((instruction) => [instruction.opcode, instruction]));
const operandTypeByName = new Map(OPERAND_TYPES.map((operand) => [operand.name, operand]));
const valueTypeByTag = new Map(Object.entries(VALUE_TYPES).map(([name, tag]) => [tag, name]));

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function assertUnsigned(value, maximum, context) {
  invariant(Number.isInteger(value) && value >= 0 && value <= maximum, `${context} is out of range.`);
}

function encodeU8(value) {
  const buffer = Buffer.alloc(1);
  buffer.writeUInt8(value);
  return buffer;
}

function encodeU16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function encodeU32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function encodeValueType(name, context, { allowNull = true, allowVoid = false } = {}) {
  const tag = VALUE_TYPES[name];
  invariant(tag !== undefined, `${context} has unknown value type ${name}.`);
  invariant(allowNull || name !== "NULL", `${context} cannot use NULL.`);
  invariant(allowVoid || name !== "VOID", `${context} cannot use VOID.`);
  return tag;
}

function encodeConstant(constant, index) {
  const context = `Constant ${index}`;
  const tag = encodeValueType(constant.type, context);
  invariant(constant.type !== "VOID", `${context} cannot use VOID.`);

  switch (constant.type) {
    case "NULL":
      return encodeU8(tag);
    case "BOOL":
      invariant(typeof constant.value === "boolean", `${context} must contain a boolean.`);
      return Buffer.from([tag, constant.value ? 1 : 0]);
    case "I64": {
      invariant(typeof constant.value === "bigint", `${context} must contain a bigint.`);
      const payload = Buffer.alloc(8);
      try {
        payload.writeBigInt64LE(constant.value);
      } catch {
        throw new Error(`${context} is outside the i64 range.`);
      }
      return Buffer.concat([encodeU8(tag), payload]);
    }
    case "F64": {
      invariant(typeof constant.value === "number", `${context} must contain a number.`);
      const payload = Buffer.alloc(8);
      payload.writeDoubleLE(constant.value);
      return Buffer.concat([encodeU8(tag), payload]);
    }
    case "STRING": {
      invariant(typeof constant.value === "string", `${context} must contain a string.`);
      const payload = Buffer.from(constant.value, "utf8");
      assertUnsigned(payload.length, 0xffffffff, `${context} UTF-8 length`);
      return Buffer.concat([encodeU8(tag), encodeU32(payload.length), payload]);
    }
    default:
      throw new Error(`${context} uses unsupported type ${constant.type}.`);
  }
}

function encodeConstants(constants) {
  assertUnsigned(constants.length, 0xffffffff, "Constant count");
  return Buffer.concat([encodeU32(constants.length), ...constants.map(encodeConstant)]);
}

function assertStringConstant(constants, index, context) {
  assertUnsigned(index, 0xffffffff, context);
  const constant = constants[index];
  invariant(constant?.type === "STRING" && constant.value.length > 0, `${context} must reference a non-empty string constant.`);
}

function encodeImports(imports, constants) {
  assertUnsigned(imports.length, 0xffffffff, "Host import count");
  const entries = imports.map((hostImport, index) => {
    const context = `Host import ${index}`;
    assertStringConstant(constants, hostImport.namespace, `${context} namespace`);
    assertStringConstant(constants, hostImport.name, `${context} name`);
    const parameterTypes = hostImport.parameterTypes ?? [];
    assertUnsigned(parameterTypes.length, 0xffff, `${context} parameter count`);
    const parameterTags = parameterTypes.map((type, parameterIndex) =>
      encodeValueType(type, `${context} parameter ${parameterIndex}`, { allowNull: false }));
    const returnTag = encodeValueType(hostImport.returnType, `${context} return type`, { allowVoid: true });
    invariant((hostImport.flags ?? 0) === 0, `${context} flags must be zero.`);
    return Buffer.concat([
      encodeU32(hostImport.namespace),
      encodeU32(hostImport.name),
      encodeU16(parameterTags.length),
      encodeU8(returnTag),
      encodeU8(0),
      Buffer.from(parameterTags),
    ]);
  });
  return Buffer.concat([encodeU32(imports.length), ...entries]);
}

function encodeFunctions(functions, constants) {
  assertUnsigned(functions.length, 0xffffffff, "Function count");
  let codeOffset = 0;
  const codeParts = [];
  const entries = functions.map((func, index) => {
    const context = `Function ${index}`;
    invariant(Buffer.isBuffer(func.code), `${context} code must be a Buffer.`);
    if (func.name !== null && func.name !== undefined) {
      assertStringConstant(constants, func.name, `${context} name`);
    }
    assertUnsigned(func.registerCount, 0xffff, `${context} register count`);
    assertUnsigned(func.code.length, 0xffffffff, `${context} code length`);
    const parameterTypes = func.parameterTypes ?? [];
    assertUnsigned(parameterTypes.length, 0xffff, `${context} parameter count`);
    const parameterTags = parameterTypes.map((type, parameterIndex) =>
      encodeValueType(type, `${context} parameter ${parameterIndex}`, { allowNull: false }));
    const returnTag = encodeValueType(func.returnType, `${context} return type`, { allowVoid: true });
    invariant((func.flags ?? 0) === 0, `${context} flags must be zero.`);
    const entry = Buffer.concat([
      encodeU32(func.name ?? NO_NAME),
      encodeU32(codeOffset),
      encodeU32(func.code.length),
      encodeU16(func.registerCount),
      encodeU16(parameterTags.length),
      encodeU8(returnTag),
      encodeU8(0),
      encodeU16(0),
      Buffer.from(parameterTags),
    ]);
    codeOffset += func.code.length;
    assertUnsigned(codeOffset, 0xffffffff, "Combined code length");
    codeParts.push(func.code);
    return entry;
  });
  return {
    functions: Buffer.concat([encodeU32(functions.length), ...entries]),
    code: Buffer.concat(codeParts),
  };
}

export function encodeInstruction(name, operands = {}) {
  const instruction = instructionByName.get(name);
  invariant(instruction, `Unknown instruction ${name}.`);
  const chunks = [encodeU8(instruction.opcode)];

  for (const operand of instruction.operands) {
    const definition = operandTypeByName.get(operand.type);
    const value = operands[operand.name];
    const maximum = definition.encoding === "u16" ? 0xffff : 0xffffffff;
    assertUnsigned(value, maximum, `${name}.${operand.name}`);
    if (!definition.allowsNoRegister && definition.encoding === "u16") {
      invariant(value !== NO_REGISTER, `${name}.${operand.name} cannot use NO_REGISTER.`);
    }
    chunks.push(definition.encoding === "u16" ? encodeU16(value) : encodeU32(value));
  }

  const expectedOperands = new Set(instruction.operands.map(({ name: operandName }) => operandName));
  for (const operandName of Object.keys(operands)) {
    invariant(expectedOperands.has(operandName), `${name} has unexpected operand ${operandName}.`);
  }
  return Buffer.concat(chunks);
}

export function encodePortableModule({ constants, imports, functions, entryFunction = 0 }) {
  invariant(Array.isArray(constants), "constants must be an array.");
  invariant(Array.isArray(imports), "imports must be an array.");
  invariant(Array.isArray(functions) && functions.length > 0, "functions must be a non-empty array.");
  assertUnsigned(entryFunction, functions.length - 1, "Entry function");
  const entry = functions[entryFunction];
  invariant((entry.parameterTypes?.length ?? 0) === 0, "Entry function must have no parameters.");
  invariant(entry.returnType === "VOID", "Entry function must return VOID.");

  const encodedFunctions = encodeFunctions(functions, constants);
  const sections = [
    { kind: SECTION_KINDS.CONSTANTS, payload: encodeConstants(constants) },
    { kind: SECTION_KINDS.HOST_IMPORTS, payload: encodeImports(imports, constants) },
    { kind: SECTION_KINDS.FUNCTIONS, payload: encodedFunctions.functions },
    { kind: SECTION_KINDS.CODE, payload: encodedFunctions.code },
  ];
  const directorySize = sections.length * DIRECTORY_ENTRY_SIZE;
  let sectionOffset = HEADER_SIZE + directorySize;
  const directory = [];
  for (const section of sections) {
    assertUnsigned(sectionOffset, 0xffffffff, "Section offset");
    directory.push(Buffer.concat([
      encodeU16(section.kind),
      encodeU16(0),
      encodeU32(sectionOffset),
      encodeU32(section.payload.length),
    ]));
    sectionOffset += section.payload.length;
    assertUnsigned(sectionOffset, 0xffffffff, "Module length");
  }

  const header = Buffer.concat([
    MAGIC,
    encodeU16(FORMAT_VERSION.major),
    encodeU16(FORMAT_VERSION.minor),
    encodeU32(0),
    encodeU32(entryFunction),
    encodeU16(sections.length),
    encodeU16(0),
  ]);
  return Buffer.concat([header, ...directory, ...sections.map(({ payload }) => payload)]);
}

class Cursor {
  constructor(buffer, baseOffset = 0) {
    this.buffer = buffer;
    this.baseOffset = baseOffset;
    this.offset = 0;
  }

  read(length, context) {
    const end = this.offset + length;
    invariant(Number.isSafeInteger(end) && end <= this.buffer.length,
      `Unexpected end of bytecode while reading ${context} at offset ${this.baseOffset + this.offset}.`);
    const value = this.buffer.subarray(this.offset, end);
    this.offset = end;
    return value;
  }

  u8(context) { return this.read(1, context).readUInt8(); }
  u16(context) { return this.read(2, context).readUInt16LE(); }
  u32(context) { return this.read(4, context).readUInt32LE(); }
  i64(context) { return this.read(8, context).readBigInt64LE(); }
  f64(context) { return this.read(8, context).readDoubleLE(); }

  finish(context) {
    invariant(this.offset === this.buffer.length,
      `Trailing data in ${context} starts at offset ${this.baseOffset + this.offset}.`);
  }
}

function decodeValueType(tag, context, { allowNull = true, allowVoid = false } = {}) {
  const name = valueTypeByTag.get(tag);
  invariant(name, `${context} has unknown value type tag ${tag}.`);
  invariant(allowNull || name !== "NULL", `${context} cannot use NULL.`);
  invariant(allowVoid || name !== "VOID", `${context} cannot use VOID.`);
  return name;
}

function decodeConstants(section) {
  const cursor = new Cursor(section.payload, section.offset);
  const count = cursor.u32("constant count");
  const constants = [];
  for (let index = 0; index < count; index += 1) {
    const tag = cursor.u8(`constant ${index} tag`);
    const type = decodeValueType(tag, `Constant ${index}`);
    invariant(type !== "VOID", `Constant ${index} cannot use VOID.`);
    let value = null;
    if (type === "BOOL") {
      const encoded = cursor.u8(`constant ${index} boolean`);
      invariant(encoded === 0 || encoded === 1, `Constant ${index} has an invalid boolean value.`);
      value = encoded === 1;
    } else if (type === "I64") {
      value = cursor.i64(`constant ${index} i64`);
    } else if (type === "F64") {
      value = cursor.f64(`constant ${index} f64`);
    } else if (type === "STRING") {
      const length = cursor.u32(`constant ${index} string length`);
      const encoded = cursor.read(length, `constant ${index} string`);
      try {
        value = new TextDecoder("utf-8", { fatal: true }).decode(encoded);
      } catch {
        throw new Error(`Constant ${index} contains invalid UTF-8.`);
      }
    }
    constants.push({ type, value });
  }
  cursor.finish("constant section");
  return constants;
}

function decodeImports(section, constants) {
  const cursor = new Cursor(section.payload, section.offset);
  const count = cursor.u32("host import count");
  const imports = [];
  for (let index = 0; index < count; index += 1) {
    const namespace = cursor.u32(`host import ${index} namespace`);
    const name = cursor.u32(`host import ${index} name`);
    const parameterCount = cursor.u16(`host import ${index} parameter count`);
    const returnType = decodeValueType(cursor.u8(`host import ${index} return type`), `Host import ${index} return type`, { allowVoid: true });
    invariant(cursor.u8(`host import ${index} flags`) === 0, `Host import ${index} flags must be zero.`);
    const parameterTypes = [];
    for (let parameter = 0; parameter < parameterCount; parameter += 1) {
      parameterTypes.push(decodeValueType(
        cursor.u8(`host import ${index} parameter ${parameter}`),
        `Host import ${index} parameter ${parameter}`,
        { allowNull: false },
      ));
    }
    assertStringConstant(constants, namespace, `Host import ${index} namespace`);
    assertStringConstant(constants, name, `Host import ${index} name`);
    imports.push({
      namespace,
      name,
      symbol: `${constants[namespace].value}.${constants[name].value}`,
      parameterTypes,
      returnType,
    });
  }
  cursor.finish("host-import section");
  return imports;
}

function decodeFunctions(section, constants, codeLength) {
  const cursor = new Cursor(section.payload, section.offset);
  const count = cursor.u32("function count");
  const functions = [];
  for (let index = 0; index < count; index += 1) {
    const name = cursor.u32(`function ${index} name`);
    const codeOffset = cursor.u32(`function ${index} code offset`);
    const length = cursor.u32(`function ${index} code length`);
    const registerCount = cursor.u16(`function ${index} register count`);
    const parameterCount = cursor.u16(`function ${index} parameter count`);
    const returnType = decodeValueType(cursor.u8(`function ${index} return type`), `Function ${index} return type`, { allowVoid: true });
    invariant(cursor.u8(`function ${index} flags`) === 0, `Function ${index} flags must be zero.`);
    invariant(cursor.u16(`function ${index} reserved`) === 0, `Function ${index} reserved field must be zero.`);
    const parameterTypes = [];
    for (let parameter = 0; parameter < parameterCount; parameter += 1) {
      parameterTypes.push(decodeValueType(
        cursor.u8(`function ${index} parameter ${parameter}`),
        `Function ${index} parameter ${parameter}`,
        { allowNull: false },
      ));
    }
    if (name !== NO_NAME) assertStringConstant(constants, name, `Function ${index} name`);
    invariant(codeOffset + length <= codeLength, `Function ${index} code range is outside the code section.`);
    functions.push({ name: name === NO_NAME ? null : name, codeOffset, codeLength: length, registerCount, parameterTypes, returnType });
  }
  cursor.finish("function section");
  const ranges = functions
    .map(({ codeOffset, codeLength: length }, index) => ({ start: codeOffset, end: codeOffset + length, index }))
    .filter(({ start, end }) => end > start)
    .sort((left, right) => left.start - right.start);
  invariant(ranges.length === functions.length, "Every function must contain code.");
  invariant(ranges[0]?.start === 0, "Function code must begin at offset zero.");
  for (let index = 1; index < ranges.length; index += 1) {
    invariant(ranges[index].start === ranges[index - 1].end,
      ranges[index].start < ranges[index - 1].end
        ? `Function ${ranges[index].index} code overlaps another function.`
        : `Unreferenced code precedes function ${ranges[index].index}.`);
  }
  invariant(ranges.at(-1)?.end === codeLength, "Unreferenced bytes follow the final function.");
  return functions;
}

function decodeFunctionInstructions(code, func, functionIndex, constants, imports) {
  const functionCode = code.subarray(func.codeOffset, func.codeOffset + func.codeLength);
  const cursor = new Cursor(functionCode, func.codeOffset);
  const registerTypes = Array(func.registerCount).fill("NULL");
  const instructions = [];
  let halted = false;

  while (cursor.offset < functionCode.length) {
    const offset = cursor.offset;
    const opcode = cursor.u8(`function ${functionIndex} instruction opcode`);
    const definition = instructionByOpcode.get(opcode);
    invariant(definition, `Unsupported portable opcode ${opcode} at code offset ${func.codeOffset + offset}.`);
    const operands = {};
    for (const operand of definition.operands) {
      const type = operandTypeByName.get(operand.type);
      const value = type.encoding === "u16"
        ? cursor.u16(`${definition.name}.${operand.name}`)
        : cursor.u32(`${definition.name}.${operand.name}`);
      if (!type.allowsNoRegister && type.encoding === "u16") {
        invariant(value !== NO_REGISTER, `${definition.name}.${operand.name} cannot use NO_REGISTER.`);
      }
      operands[operand.name] = value;
    }

    if (definition.name === "LOAD_CONST") {
      invariant(operands.destination < func.registerCount, "LOAD_CONST destination register is out of range.");
      invariant(operands.constant < constants.length, "LOAD_CONST constant index is out of range.");
      registerTypes[operands.destination] = constants[operands.constant].type;
    } else if (definition.name === "MOVE") {
      invariant(operands.destination < func.registerCount, "MOVE destination register is out of range.");
      invariant(operands.source < func.registerCount, "MOVE source register is out of range.");
      registerTypes[operands.destination] = registerTypes[operands.source];
    } else if (definition.name === "HOST_CALL") {
      const hostImport = imports[operands.import];
      invariant(hostImport, "HOST_CALL import index is out of range.");
      invariant(operands.argument_count === hostImport.parameterTypes.length,
        "HOST_CALL argument count does not match the import signature.");
      if (operands.argument_count === 0) {
        invariant(operands.argument_start === 0, "HOST_CALL with no arguments must use register zero as its argument start.");
      } else {
        invariant(operands.argument_start < func.registerCount, "HOST_CALL argument start is out of range.");
        invariant(operands.argument_start + operands.argument_count <= func.registerCount,
          "HOST_CALL argument range is out of bounds.");
      }
      for (let index = 0; index < hostImport.parameterTypes.length; index += 1) {
        invariant(registerTypes[operands.argument_start + index] === hostImport.parameterTypes[index],
          `HOST_CALL argument ${index} type does not match the import signature.`);
      }
      if (hostImport.returnType === "VOID") {
        invariant(operands.result === NO_REGISTER, "A VOID HOST_CALL must use NO_REGISTER as its result.");
      } else {
        invariant(operands.result < func.registerCount, "HOST_CALL result register is out of range.");
        registerTypes[operands.result] = hostImport.returnType;
      }
    } else if (definition.name === "HALT") {
      invariant(cursor.offset === functionCode.length, "HALT must be the final instruction of a function.");
      halted = true;
    }

    instructions.push({
      index: instructions.length,
      offset: func.codeOffset + offset,
      size: cursor.offset - offset,
      opcode,
      name: definition.name,
      operands,
    });
  }

  invariant(halted, `Function ${functionIndex} must terminate with HALT.`);
  return instructions;
}

export function decodePortableModule(bytecode) {
  invariant(Buffer.isBuffer(bytecode), "Bytecode must be a Buffer.");
  const cursor = new Cursor(bytecode);
  invariant(cursor.read(4, "magic number").equals(MAGIC), "Invalid JIMP bytecode magic.");
  const major = cursor.u16("format major version");
  const minor = cursor.u16("format minor version");
  invariant(major === FORMAT_VERSION.major && minor === FORMAT_VERSION.minor,
    `Unsupported portable bytecode format ${major}.${minor}.`);
  invariant(cursor.u32("module flags") === 0, "Module flags must be zero.");
  const entryFunction = cursor.u32("entry function");
  const sectionCount = cursor.u16("section count");
  invariant(cursor.u16("reserved header field") === 0, "Reserved header field must be zero.");
  const directoryEnd = HEADER_SIZE + sectionCount * DIRECTORY_ENTRY_SIZE;
  invariant(directoryEnd <= bytecode.length, "Section directory exceeds the file bounds.");

  const sections = new Map();
  const ranges = [];
  for (let index = 0; index < sectionCount; index += 1) {
    const kind = cursor.u16(`section ${index} kind`);
    const flags = cursor.u16(`section ${index} flags`);
    const offset = cursor.u32(`section ${index} offset`);
    const length = cursor.u32(`section ${index} length`);
    invariant((flags & ~1) === 0, `Section ${index} uses reserved flags.`);
    const known = Object.values(SECTION_KINDS).includes(kind);
    invariant(known || (flags & 1) === 1, `Section ${index} has unknown required kind ${kind}.`);
    invariant(offset >= directoryEnd && offset + length <= bytecode.length, `Section ${index} is outside the file bounds.`);
    if (known) {
      invariant(!sections.has(kind), `Section kind ${kind} is duplicated.`);
      sections.set(kind, { kind, flags, offset, payload: bytecode.subarray(offset, offset + length) });
    }
    if (length > 0) ranges.push({ start: offset, end: offset + length, index });
  }
  ranges.sort((left, right) => left.start - right.start);
  invariant(ranges.length > 0 && ranges[0].start === directoryEnd, "Section payloads must begin immediately after the directory.");
  for (let index = 1; index < ranges.length; index += 1) {
    invariant(ranges[index].start === ranges[index - 1].end,
      ranges[index].start < ranges[index - 1].end
        ? `Section ${ranges[index].index} overlaps another section.`
        : `Unreferenced bytes precede section ${ranges[index].index}.`);
  }
  invariant(ranges.at(-1).end === bytecode.length, "Unreferenced bytes follow the final section.");
  for (const kind of requiredSectionKinds) {
    invariant(sections.has(kind), `Required section kind ${kind} is missing.`);
    invariant(sections.get(kind).flags === 0, `Required section kind ${kind} cannot be optional.`);
  }

  const constants = decodeConstants(sections.get(SECTION_KINDS.CONSTANTS));
  const imports = decodeImports(sections.get(SECTION_KINDS.HOST_IMPORTS), constants);
  const code = sections.get(SECTION_KINDS.CODE).payload;
  const functions = decodeFunctions(sections.get(SECTION_KINDS.FUNCTIONS), constants, code.length)
    .map((func, index) => ({
      ...func,
      instructions: decodeFunctionInstructions(code, func, index, constants, imports),
    }));
  invariant(entryFunction < functions.length, "Entry function index is out of range.");
  invariant(functions[entryFunction].parameterTypes.length === 0, "Entry function must have no parameters.");
  invariant(functions[entryFunction].returnType === "VOID", "Entry function must return VOID.");

  return {
    header: { major, minor, entryFunction, sectionCount },
    constants,
    imports,
    functions,
    code: Buffer.from(code),
  };
}
