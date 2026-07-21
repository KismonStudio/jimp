import {
  FORMAT_VERSION,
  INSTRUCTIONS,
  NO_REGISTER,
  OPERAND_TYPES,
  VALUE_TYPES,
} from "../generated/isa.js";
import { SANDBOX_LIMITS } from "../generated/sandbox.js";

const {
  MAX_CODE_BYTES,
  MAX_CONSTANTS,
  MAX_CONSTANT_STRING_BYTES,
  MAX_FUNCTIONS,
  MAX_HOST_IMPORTS,
  MAX_MODULE_BYTES,
  MAX_PARAMETERS,
  MAX_REGISTERS_PER_FUNCTION,
  MAX_SECTION_COUNT,
  MAX_SYMBOL_BYTES,
  MAX_TOTAL_CONSTANT_STRING_BYTES,
  MAX_TOTAL_INSTRUCTIONS,
  MAX_VERIFICATION_TYPE_CELLS,
} = SANDBOX_LIMITS;

const MAGIC = Buffer.from("JIMP");
const HEADER_SIZE = 20;
const DIRECTORY_ENTRY_SIZE = 12;
const NO_NAME = 0xffffffff;
const DEBUG_VERSION = 2;
const BUILD_VERSION = 1;
const SECTION_OPTIONAL = 1;
const NO_SOURCE = 0xffffffff;

export const SECTION_KINDS = Object.freeze({
  CONSTANTS: 1,
  HOST_IMPORTS: 2,
  FUNCTIONS: 3,
  CODE: 4,
  DEBUG: 5,
  BUILD: 6,
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
const NUMERIC_TYPES = new Set(["I64", "F64"]);
const NUMERIC_BINARY_INSTRUCTIONS = new Set([
  "ADD", "SUBTRACT", "MULTIPLY", "DIVIDE", "REMAINDER",
]);
const EQUALITY_INSTRUCTIONS = new Set(["EQUAL", "NOT_EQUAL"]);
const ORDERED_COMPARISON_INSTRUCTIONS = new Set([
  "LESS_THAN", "LESS_EQUAL", "GREATER_THAN", "GREATER_EQUAL",
]);
const BOOLEAN_BINARY_INSTRUCTIONS = new Set(["BOOL_AND", "BOOL_OR"]);

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

function encodeConstant(constant, index, resourceState) {
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
      invariant(payload.length <= MAX_CONSTANT_STRING_BYTES,
        `${context} exceeds the sandbox string limit of ${MAX_CONSTANT_STRING_BYTES} UTF-8 bytes.`);
      resourceState.stringBytes += payload.length;
      invariant(resourceState.stringBytes <= MAX_TOTAL_CONSTANT_STRING_BYTES,
        `Constant strings exceed the sandbox aggregate limit of ${MAX_TOTAL_CONSTANT_STRING_BYTES} UTF-8 bytes.`);
      return Buffer.concat([encodeU8(tag), encodeU32(payload.length), payload]);
    }
    default:
      throw new Error(`${context} uses unsupported type ${constant.type}.`);
  }
}

function encodeConstants(constants) {
  invariant(constants.length <= MAX_CONSTANTS,
    `Constant count exceeds the sandbox limit of ${MAX_CONSTANTS}.`);
  const resourceState = { stringBytes: 0 };
  return Buffer.concat([
    encodeU32(constants.length),
    ...constants.map((constant, index) => encodeConstant(constant, index, resourceState)),
  ]);
}

function assertStringConstant(constants, index, context) {
  assertUnsigned(index, 0xffffffff, context);
  const constant = constants[index];
  invariant(constant?.type === "STRING" && constant.value.length > 0, `${context} must reference a non-empty string constant.`);
  invariant(Buffer.byteLength(constant.value, "utf8") <= MAX_SYMBOL_BYTES,
    `${context} exceeds the sandbox symbol limit of ${MAX_SYMBOL_BYTES} UTF-8 bytes.`);
}

function encodeImports(imports, constants) {
  invariant(imports.length <= MAX_HOST_IMPORTS,
    `Host import count exceeds the sandbox limit of ${MAX_HOST_IMPORTS}.`);
  const entries = imports.map((hostImport, index) => {
    const context = `Host import ${index}`;
    assertStringConstant(constants, hostImport.namespace, `${context} namespace`);
    assertStringConstant(constants, hostImport.name, `${context} name`);
    const parameterTypes = hostImport.parameterTypes ?? [];
    invariant(parameterTypes.length <= MAX_PARAMETERS,
      `${context} parameter count exceeds the sandbox limit of ${MAX_PARAMETERS}.`);
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
  invariant(functions.length <= MAX_FUNCTIONS,
    `Function count exceeds the sandbox limit of ${MAX_FUNCTIONS}.`);
  let codeOffset = 0;
  const codeParts = [];
  const entries = functions.map((func, index) => {
    const context = `Function ${index}`;
    invariant(Buffer.isBuffer(func.code), `${context} code must be a Buffer.`);
    if (func.name !== null && func.name !== undefined) {
      assertStringConstant(constants, func.name, `${context} name`);
    }
    assertUnsigned(func.registerCount, MAX_REGISTERS_PER_FUNCTION, `${context} register count`);
    assertUnsigned(func.code.length, 0xffffffff, `${context} code length`);
    const parameterTypes = func.parameterTypes ?? [];
    invariant(parameterTypes.length <= MAX_PARAMETERS,
      `${context} parameter count exceeds the sandbox limit of ${MAX_PARAMETERS}.`);
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
    invariant(codeOffset <= MAX_CODE_BYTES,
      `Combined code length exceeds the sandbox limit of ${MAX_CODE_BYTES} bytes.`);
    codeParts.push(func.code);
    return entry;
  });
  return {
    functions: Buffer.concat([encodeU32(functions.length), ...entries]),
    code: Buffer.concat(codeParts),
  };
}

function encodeDebug(functions) {
  if (!functions.some((func) => Object.hasOwn(func, "debug"))) return null;
  const entries = [];
  const sources = [];
  const sourceIndices = new Map();
  let functionCodeOffset = 0;
  for (let functionIndex = 0; functionIndex < functions.length; functionIndex += 1) {
    const func = functions[functionIndex];
    invariant(Array.isArray(func.debug), `Function ${functionIndex} debug mappings must be an array.`);
    let source = NO_SOURCE;
    if (func.moduleId !== null && func.moduleId !== undefined) {
      invariant(typeof func.moduleId === "string" && func.moduleId.length > 0,
        `Function ${functionIndex} module ID must be a non-empty string.`);
      const encodedSource = Buffer.from(func.moduleId, "utf8");
      invariant(encodedSource.length <= MAX_SYMBOL_BYTES,
        `Function ${functionIndex} module ID exceeds the sandbox symbol limit of ${MAX_SYMBOL_BYTES} UTF-8 bytes.`);
      if (!sourceIndices.has(func.moduleId)) {
        sourceIndices.set(func.moduleId, sources.length);
        sources.push(encodedSource);
      }
      source = sourceIndices.get(func.moduleId);
    }
    let previousOffset = -1;
    for (const [mappingIndex, mapping] of func.debug.entries()) {
      const context = `Function ${functionIndex} debug mapping ${mappingIndex}`;
      assertUnsigned(mapping.offset, 0xffffffff, `${context} code offset`);
      invariant(mapping.offset < func.code.length, `${context} code offset is outside the function.`);
      invariant(mapping.offset > previousOffset, `${context} code offsets must be strictly increasing.`);
      assertUnsigned(mapping.line, 0xffffffff, `${context} source line`);
      invariant(mapping.line > 0, `${context} source line must be one-based.`);
      entries.push({ offset: functionCodeOffset + mapping.offset, source, line: mapping.line });
      previousOffset = mapping.offset;
    }
    functionCodeOffset += func.code.length;
  }
  invariant(entries.length <= MAX_TOTAL_INSTRUCTIONS,
    `Debug mapping count exceeds the sandbox instruction limit of ${MAX_TOTAL_INSTRUCTIONS}.`);
  return Buffer.concat([
    encodeU16(DEBUG_VERSION),
    encodeU16(0),
    encodeU32(sources.length),
    encodeU32(entries.length),
    ...sources.flatMap((source) => [encodeU32(source.length), source]),
    ...entries.flatMap(({ offset, source, line }) => [
      encodeU32(offset),
      encodeU32(source),
      encodeU32(line),
    ]),
  ]);
}

function encodeBuild(build) {
  if (build === undefined) return null;
  invariant(build !== null && typeof build === "object", "Build metadata must be an object.");
  assertUnsigned(build.standardLibraryMajor, 0xffff, "Build standard-library major");
  invariant(build.standardLibraryMajor > 0, "Build standard-library major must be positive.");
  const strings = [build.targetProfile, build.entryModuleId, ...(build.guaranteedCapabilities ?? [])];
  for (const [index, value] of strings.entries()) {
    invariant(typeof value === "string" && value.length > 0,
      `Build string ${index} must be non-empty.`);
    invariant(Buffer.byteLength(value, "utf8") <= MAX_SYMBOL_BYTES,
      `Build string ${index} exceeds the sandbox symbol limit of ${MAX_SYMBOL_BYTES} UTF-8 bytes.`);
  }
  const capabilities = build.guaranteedCapabilities ?? [];
  invariant(Array.isArray(capabilities), "Build guaranteed capabilities must be an array.");
  invariant(capabilities.length <= MAX_HOST_IMPORTS,
    `Build capability count exceeds the sandbox limit of ${MAX_HOST_IMPORTS}.`);
  invariant(new Set(capabilities).size === capabilities.length,
    "Build guaranteed capabilities must be unique.");
  invariant(capabilities.join() === [...capabilities].sort().join(),
    "Build guaranteed capabilities must be sorted.");
  const encodeString = (value) => {
    const bytes = Buffer.from(value, "utf8");
    return Buffer.concat([encodeU32(bytes.length), bytes]);
  };
  return Buffer.concat([
    encodeU16(BUILD_VERSION),
    encodeU16(0),
    encodeU16(build.standardLibraryMajor),
    encodeU16(0),
    encodeString(build.targetProfile),
    encodeString(build.entryModuleId),
    encodeU32(capabilities.length),
    ...capabilities.map(encodeString),
  ]);
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

export function encodePortableModule({ constants, imports, functions, entryFunction = 0, build }) {
  invariant(Array.isArray(constants), "constants must be an array.");
  invariant(Array.isArray(imports), "imports must be an array.");
  invariant(Array.isArray(functions) && functions.length > 0, "functions must be a non-empty array.");
  assertUnsigned(entryFunction, functions.length - 1, "Entry function");
  const entry = functions[entryFunction];
  invariant((entry.parameterTypes?.length ?? 0) === 0, "Entry function must have no parameters.");
  invariant(entry.returnType === "VOID", "Entry function must return VOID.");

  const encodedFunctions = encodeFunctions(functions, constants);
  const encodedDebug = encodeDebug(functions);
  const encodedBuild = encodeBuild(build);
  const sections = [
    { kind: SECTION_KINDS.CONSTANTS, payload: encodeConstants(constants) },
    { kind: SECTION_KINDS.HOST_IMPORTS, payload: encodeImports(imports, constants) },
    { kind: SECTION_KINDS.FUNCTIONS, payload: encodedFunctions.functions },
    { kind: SECTION_KINDS.CODE, payload: encodedFunctions.code },
    ...(encodedDebug === null ? [] : [{
      kind: SECTION_KINDS.DEBUG,
      flags: SECTION_OPTIONAL,
      payload: encodedDebug,
    }]),
    ...(encodedBuild === null ? [] : [{
      kind: SECTION_KINDS.BUILD,
      flags: SECTION_OPTIONAL,
      payload: encodedBuild,
    }]),
  ];
  invariant(sections.length <= MAX_SECTION_COUNT,
    `Section count exceeds the sandbox limit of ${MAX_SECTION_COUNT}.`);
  const directorySize = sections.length * DIRECTORY_ENTRY_SIZE;
  let sectionOffset = HEADER_SIZE + directorySize;
  const directory = [];
  for (const section of sections) {
    assertUnsigned(sectionOffset, 0xffffffff, "Section offset");
    directory.push(Buffer.concat([
      encodeU16(section.kind),
      encodeU16(section.flags ?? 0),
      encodeU32(sectionOffset),
      encodeU32(section.payload.length),
    ]));
    sectionOffset += section.payload.length;
    invariant(sectionOffset <= MAX_MODULE_BYTES,
      `Module size exceeds the sandbox limit of ${MAX_MODULE_BYTES} bytes.`);
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
  invariant(count <= MAX_CONSTANTS,
    `Constant count exceeds the sandbox limit of ${MAX_CONSTANTS}.`);
  const constants = [];
  let totalStringBytes = 0;
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
      invariant(length <= MAX_CONSTANT_STRING_BYTES,
        `Constant ${index} exceeds the sandbox string limit of ${MAX_CONSTANT_STRING_BYTES} UTF-8 bytes.`);
      totalStringBytes += length;
      invariant(totalStringBytes <= MAX_TOTAL_CONSTANT_STRING_BYTES,
        `Constant strings exceed the sandbox aggregate limit of ${MAX_TOTAL_CONSTANT_STRING_BYTES} UTF-8 bytes.`);
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
  invariant(count <= MAX_HOST_IMPORTS,
    `Host import count exceeds the sandbox limit of ${MAX_HOST_IMPORTS}.`);
  const imports = [];
  for (let index = 0; index < count; index += 1) {
    const namespace = cursor.u32(`host import ${index} namespace`);
    const name = cursor.u32(`host import ${index} name`);
    const parameterCount = cursor.u16(`host import ${index} parameter count`);
    invariant(parameterCount <= MAX_PARAMETERS,
      `Host import ${index} parameter count exceeds the sandbox limit of ${MAX_PARAMETERS}.`);
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
  invariant(count <= MAX_FUNCTIONS,
    `Function count exceeds the sandbox limit of ${MAX_FUNCTIONS}.`);
  const functions = [];
  for (let index = 0; index < count; index += 1) {
    const name = cursor.u32(`function ${index} name`);
    const codeOffset = cursor.u32(`function ${index} code offset`);
    const length = cursor.u32(`function ${index} code length`);
    const registerCount = cursor.u16(`function ${index} register count`);
    invariant(registerCount <= MAX_REGISTERS_PER_FUNCTION,
      `Function ${index} register count exceeds the sandbox limit of ${MAX_REGISTERS_PER_FUNCTION}.`);
    const parameterCount = cursor.u16(`function ${index} parameter count`);
    invariant(parameterCount <= MAX_PARAMETERS,
      `Function ${index} parameter count exceeds the sandbox limit of ${MAX_PARAMETERS}.`);
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

function decodeDebug(section, functions) {
  if (section === undefined) return [];
  invariant(section.flags === SECTION_OPTIONAL, "Debug section must be optional.");
  const cursor = new Cursor(section.payload, section.offset);
  invariant(cursor.u16("debug version") === DEBUG_VERSION,
    `Unsupported debug metadata version.`);
  invariant(cursor.u16("debug flags") === 0, "Debug flags must be zero.");
  const sourceCount = cursor.u32("debug source count");
  invariant(sourceCount <= MAX_TOTAL_INSTRUCTIONS,
    `Debug source count exceeds the sandbox instruction limit of ${MAX_TOTAL_INSTRUCTIONS}.`);
  const count = cursor.u32("debug mapping count");
  invariant(count <= MAX_TOTAL_INSTRUCTIONS,
    `Debug mapping count exceeds the sandbox instruction limit of ${MAX_TOTAL_INSTRUCTIONS}.`);
  const sources = [];
  const sourceSet = new Set();
  for (let index = 0; index < sourceCount; index += 1) {
    const length = cursor.u32(`debug source ${index} length`);
    invariant(length > 0 && length <= MAX_SYMBOL_BYTES,
      `Debug source ${index} must contain between 1 and ${MAX_SYMBOL_BYTES} UTF-8 bytes.`);
    const encoded = cursor.read(length, `debug source ${index}`);
    let source;
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(encoded);
    } catch {
      throw new Error(`Debug source ${index} contains invalid UTF-8.`);
    }
    invariant(!sourceSet.has(source), `Debug source ${index} is duplicated.`);
    sourceSet.add(source);
    sources.push(source);
  }
  const instructionOffsets = new Set(functions.flatMap((func) =>
    func.instructions.map(({ offset }) => offset)));
  const mappings = [];
  let previousOffset = -1;
  for (let index = 0; index < count; index += 1) {
    const offset = cursor.u32(`debug mapping ${index} code offset`);
    const source = cursor.u32(`debug mapping ${index} source index`);
    const line = cursor.u32(`debug mapping ${index} source line`);
    invariant(offset > previousOffset, "Debug mapping code offsets must be strictly increasing.");
    invariant(instructionOffsets.has(offset),
      `Debug mapping ${index} must reference an instruction boundary.`);
    invariant(line > 0, `Debug mapping ${index} source line must be one-based.`);
    invariant(source === NO_SOURCE || source < sources.length,
      `Debug mapping ${index} source index is out of range.`);
    mappings.push({ offset, moduleId: source === NO_SOURCE ? null : sources[source], line });
    previousOffset = offset;
  }
  cursor.finish("debug section");
  return mappings;
}

function decodeBuild(section) {
  if (section === undefined) return null;
  invariant(section.flags === SECTION_OPTIONAL, "Build section must be optional.");
  const cursor = new Cursor(section.payload, section.offset);
  invariant(cursor.u16("build version") === BUILD_VERSION, "Unsupported build metadata version.");
  invariant(cursor.u16("build flags") === 0, "Build flags must be zero.");
  const standardLibraryMajor = cursor.u16("build standard-library major");
  invariant(standardLibraryMajor > 0, "Build standard-library major must be positive.");
  invariant(cursor.u16("build reserved") === 0, "Build reserved field must be zero.");
  const decodeString = (context) => {
    const length = cursor.u32(`${context} length`);
    invariant(length > 0 && length <= MAX_SYMBOL_BYTES,
      `${context} must contain between 1 and ${MAX_SYMBOL_BYTES} UTF-8 bytes.`);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(cursor.read(length, context));
    } catch {
      throw new Error(`${context} contains invalid UTF-8.`);
    }
  };
  const targetProfile = decodeString("build target profile");
  const entryModuleId = decodeString("build entry module ID");
  const count = cursor.u32("build capability count");
  invariant(count <= MAX_HOST_IMPORTS,
    `Build capability count exceeds the sandbox limit of ${MAX_HOST_IMPORTS}.`);
  const guaranteedCapabilities = Array.from({ length: count }, (_, index) =>
    decodeString(`build capability ${index}`));
  invariant(new Set(guaranteedCapabilities).size === guaranteedCapabilities.length,
    "Build guaranteed capabilities must be unique.");
  invariant(guaranteedCapabilities.join() === [...guaranteedCapabilities].sort().join(),
    "Build guaranteed capabilities must be sorted.");
  cursor.finish("build section");
  return { targetProfile, standardLibraryMajor, entryModuleId, guaranteedCapabilities };
}

function decodeFunctionInstructions(
  code,
  func,
  functionIndex,
  entryFunction,
  constants,
  imports,
  functions,
  resourceState,
) {
  const functionCode = code.subarray(func.codeOffset, func.codeOffset + func.codeLength);
  const cursor = new Cursor(functionCode, func.codeOffset);
  const instructions = [];

  while (cursor.offset < functionCode.length) {
    resourceState.instructionCount += 1;
    invariant(resourceState.instructionCount <= MAX_TOTAL_INSTRUCTIONS,
      `Instruction count exceeds the sandbox limit of ${MAX_TOTAL_INSTRUCTIONS}.`);
    const localOffset = cursor.offset;
    const opcode = cursor.u8(`function ${functionIndex} instruction opcode`);
    const definition = instructionByOpcode.get(opcode);
    invariant(definition,
      `Unsupported portable opcode ${opcode} at code offset ${func.codeOffset + localOffset}.`);
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
    instructions.push({
      index: instructions.length,
      localOffset,
      offset: func.codeOffset + localOffset,
      size: cursor.offset - localOffset,
      opcode,
      name: definition.name,
      operands,
    });
  }

  const isEntry = functionIndex === entryFunction;
  const terminal = isEntry ? "HALT" : "RETURN";
  invariant(instructions.length > 0 && instructions.at(-1).name === terminal,
    `Function ${functionIndex} must terminate with ${terminal}.`);
  invariant(!isEntry || instructions.slice(0, -1).every(({ name }) => name !== "HALT"),
    "HALT must be the final instruction of the entry function.");
  invariant(isEntry || instructions.every(({ name }) => name !== "HALT"),
    "HALT is only valid in the entry function.");
  invariant(!isEntry || instructions.every(({ name }) => name !== "RETURN"),
    "RETURN is not valid in the entry function.");
  invariant(instructions.length * func.registerCount <= MAX_VERIFICATION_TYPE_CELLS,
    `Function ${functionIndex} type-flow analysis exceeds the sandbox limit of ${MAX_VERIFICATION_TYPE_CELLS} cells.`);

  const instructionByOffset = new Map(instructions.map((instruction) => [
    instruction.localOffset,
    instruction.index,
  ]));
  for (const instruction of instructions) {
    if (!["JUMP", "JUMP_IF_FALSE", "JUMP_IF_TRUE"].includes(instruction.name)) continue;
    invariant(instructionByOffset.has(instruction.operands.target),
      `${instruction.name} target must reference an instruction boundary.`);
  }

  const incomingTypes = Array(instructions.length).fill(null);
  const initialTypes = Array(func.registerCount).fill("NULL");
  initialTypes.splice(0, func.parameterTypes.length, ...func.parameterTypes);
  incomingTypes[0] = initialTypes;

  function register(operands, name, instructionName) {
    const index = operands[name];
    invariant(index < func.registerCount,
      `${instructionName} ${name.replaceAll("_", " ")} register is out of range.`);
    return index;
  }

  const queue = [0];
  const queued = new Set([0]);

  function mergeInto(index, types) {
    if (incomingTypes[index] === null) {
      incomingTypes[index] = [...types];
      if (!queued.has(index)) {
        queue.push(index);
        queued.add(index);
      }
      return;
    }
    let changed = false;
    incomingTypes[index] = incomingTypes[index].map((type, registerIndex) => {
      if (type === types[registerIndex] || type === "UNKNOWN") return type;
      changed = true;
      return "UNKNOWN";
    });
    if (changed && !queued.has(index)) {
      queue.push(index);
      queued.add(index);
    }
  }

  while (queue.length > 0) {
    const instructionIndex = queue.shift();
    queued.delete(instructionIndex);
    const instruction = instructions[instructionIndex];
    const registerTypes = incomingTypes[instruction.index];
    const types = [...registerTypes];
    const { name, operands } = instruction;

    if (name === "LOAD_CONST") {
      const destination = register(operands, "destination", name);
      invariant(operands.constant < constants.length, "LOAD_CONST constant index is out of range.");
      types[destination] = constants[operands.constant].type;
    } else if (name === "MOVE") {
      const destination = register(operands, "destination", name);
      const source = register(operands, "source", name);
      types[destination] = types[source];
    } else if (name === "NEGATE" || name === "BOOL_NOT") {
      const destination = register(operands, "destination", name);
      const operand = register(operands, "operand", name);
      if (name === "NEGATE") {
        invariant(NUMERIC_TYPES.has(types[operand]), "NEGATE operand must be I64 or F64.");
        types[destination] = types[operand];
      } else {
        invariant(types[operand] === "BOOL", "BOOL_NOT operand must be BOOL.");
        types[destination] = "BOOL";
      }
    } else if (
      NUMERIC_BINARY_INSTRUCTIONS.has(name)
      || EQUALITY_INSTRUCTIONS.has(name)
      || ORDERED_COMPARISON_INSTRUCTIONS.has(name)
      || BOOLEAN_BINARY_INSTRUCTIONS.has(name)
    ) {
      const destination = register(operands, "destination", name);
      const left = register(operands, "left", name);
      const right = register(operands, "right", name);
      const leftType = types[left];
      const rightType = types[right];
      invariant(leftType !== "UNKNOWN" && leftType === rightType,
        `${name} operands must have the same type.`);
      if (NUMERIC_BINARY_INSTRUCTIONS.has(name)) {
        invariant(NUMERIC_TYPES.has(leftType), `${name} operands must be I64 or F64.`);
        types[destination] = leftType;
      } else if (EQUALITY_INSTRUCTIONS.has(name)) {
        types[destination] = "BOOL";
      } else if (ORDERED_COMPARISON_INSTRUCTIONS.has(name)) {
        invariant(NUMERIC_TYPES.has(leftType), `${name} operands must be I64 or F64.`);
        types[destination] = "BOOL";
      } else {
        invariant(leftType === "BOOL", `${name} operands must be BOOL.`);
        types[destination] = "BOOL";
      }
    } else if (name === "JUMP_IF_FALSE" || name === "JUMP_IF_TRUE") {
      const condition = register(operands, "condition", name);
      invariant(types[condition] === "BOOL", `${name} condition must be BOOL.`);
    } else if (name === "HOST_CALL") {
      const hostImport = imports[operands.import];
      invariant(hostImport, "HOST_CALL import index is out of range.");
      invariant(operands.argument_count === hostImport.parameterTypes.length,
        "HOST_CALL argument count does not match the import signature.");
      if (operands.argument_count === 0) {
        invariant(operands.argument_start === 0,
          "HOST_CALL with no arguments must use register zero as its argument start.");
      } else {
        invariant(operands.argument_start < func.registerCount,
          "HOST_CALL argument start is out of range.");
        invariant(operands.argument_start + operands.argument_count <= func.registerCount,
          "HOST_CALL argument range is out of bounds.");
      }
      for (let index = 0; index < hostImport.parameterTypes.length; index += 1) {
        invariant(types[operands.argument_start + index] === hostImport.parameterTypes[index],
          `HOST_CALL argument ${index} type does not match the import signature.`);
      }
      if (hostImport.returnType === "VOID") {
        invariant(operands.result === NO_REGISTER,
          "A VOID HOST_CALL must use NO_REGISTER as its result.");
      } else {
        const result = register(operands, "result", name);
        types[result] = hostImport.returnType;
      }
    } else if (name === "CALL") {
      const calledFunction = functions[operands.function];
      invariant(calledFunction, "CALL function index is out of range.");
      invariant(operands.function !== entryFunction, "CALL cannot invoke the entry function.");
      invariant(operands.argument_count === calledFunction.parameterTypes.length,
        "CALL argument count does not match the function signature.");
      if (operands.argument_count === 0) {
        invariant(operands.argument_start === 0,
          "CALL with no arguments must use register zero as its argument start.");
      } else {
        invariant(operands.argument_start < func.registerCount,
          "CALL argument start is out of range.");
        invariant(operands.argument_start + operands.argument_count <= func.registerCount,
          "CALL argument range is out of bounds.");
      }
      for (let index = 0; index < calledFunction.parameterTypes.length; index += 1) {
        invariant(types[operands.argument_start + index] === calledFunction.parameterTypes[index],
          `CALL argument ${index} type does not match the function signature.`);
      }
      if (calledFunction.returnType === "VOID") {
        invariant(operands.result === NO_REGISTER,
          "A VOID CALL must use NO_REGISTER as its result.");
      } else {
        const result = register(operands, "result", name);
        types[result] = calledFunction.returnType;
      }
    } else if (name === "RETURN") {
      if (func.returnType === "VOID") {
        invariant(operands.result === NO_REGISTER,
          "A VOID function RETURN must use NO_REGISTER.");
      } else {
        const result = register(operands, "result", name);
        invariant(types[result] === func.returnType,
          `RETURN value must have type ${func.returnType}.`);
      }
    }

    if (name === "HALT" || name === "RETURN") continue;
    if (name === "JUMP") {
      mergeInto(instructionByOffset.get(operands.target), types);
      continue;
    }
    if (name === "JUMP_IF_FALSE" || name === "JUMP_IF_TRUE") {
      mergeInto(instruction.index + 1, types);
      mergeInto(instructionByOffset.get(operands.target), types);
      continue;
    }
    mergeInto(instruction.index + 1, types);
  }

  for (const instruction of instructions) {
    invariant(incomingTypes[instruction.index] !== null,
      `Instruction at code offset ${instruction.offset} is unreachable.`);
  }

  return instructions.map(({ localOffset: _localOffset, ...instruction }) => instruction);
}

export function decodePortableModule(bytecode) {
  invariant(Buffer.isBuffer(bytecode), "Bytecode must be a Buffer.");
  invariant(bytecode.length <= MAX_MODULE_BYTES,
    `Module size exceeds the sandbox limit of ${MAX_MODULE_BYTES} bytes.`);
  const cursor = new Cursor(bytecode);
  invariant(cursor.read(4, "magic number").equals(MAGIC), "Invalid JIMP bytecode magic.");
  const major = cursor.u16("format major version");
  const minor = cursor.u16("format minor version");
  invariant(major === FORMAT_VERSION.major && minor === FORMAT_VERSION.minor,
    `Unsupported portable bytecode format ${major}.${minor}.`);
  invariant(cursor.u32("module flags") === 0, "Module flags must be zero.");
  const entryFunction = cursor.u32("entry function");
  const sectionCount = cursor.u16("section count");
  invariant(sectionCount <= MAX_SECTION_COUNT,
    `Section count exceeds the sandbox limit of ${MAX_SECTION_COUNT}.`);
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
  invariant(code.length <= MAX_CODE_BYTES,
    `Code size exceeds the sandbox limit of ${MAX_CODE_BYTES} bytes.`);
  const functionDefinitions = decodeFunctions(
    sections.get(SECTION_KINDS.FUNCTIONS),
    constants,
    code.length,
  );
  const resourceState = { instructionCount: 0 };
  const decodedFunctions = functionDefinitions.map((func, index) => ({
      ...func,
      instructions: decodeFunctionInstructions(
        code,
        func,
        index,
        entryFunction,
        constants,
        imports,
        functionDefinitions,
        resourceState,
      ),
    }));
  const debug = decodeDebug(sections.get(SECTION_KINDS.DEBUG), decodedFunctions);
  const build = decodeBuild(sections.get(SECTION_KINDS.BUILD));
  const sourceLocationByOffset = new Map(debug.map(({ offset, moduleId, line }) => [
    offset,
    { moduleId, line },
  ]));
  const functions = decodedFunctions.map((func) => ({
    ...func,
    instructions: func.instructions.map((instruction) => ({
      ...instruction,
      sourceLine: sourceLocationByOffset.get(instruction.offset)?.line ?? null,
      sourceModuleId: sourceLocationByOffset.get(instruction.offset)?.moduleId ?? null,
    })),
  }));
  invariant(entryFunction < functions.length, "Entry function index is out of range.");
  invariant(functions[entryFunction].parameterTypes.length === 0, "Entry function must have no parameters.");
  invariant(functions[entryFunction].returnType === "VOID", "Entry function must return VOID.");

  return {
    header: { major, minor, entryFunction, sectionCount },
    constants,
    imports,
    functions,
    debug,
    build,
    code: Buffer.from(code),
  };
}
