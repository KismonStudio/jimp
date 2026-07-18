import { MAGIC, OPCODES, VERSION } from "./bytecode.js";

const HEADER_SIZE = 10;
const textDecoder = new TextDecoder("utf-8", { fatal: true });

function requireBytes(bytecode, offset, length, context) {
  if (offset + length > bytecode.length) {
    throw new Error(`Unexpected end of bytecode while reading ${context} at offset ${offset}.`);
  }
}

export function decodeBytecode(bytecode) {
  if (!Buffer.isBuffer(bytecode)) {
    throw new TypeError("Bytecode must be provided as a Buffer.");
  }
  requireBytes(bytecode, 0, HEADER_SIZE, "header");

  if (!bytecode.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Invalid JIMP bytecode magic.");
  }

  const version = bytecode.readUInt16LE(4);
  if (version !== VERSION) {
    throw new Error(`Unsupported JIMP bytecode version ${version}.`);
  }

  const instructionCount = bytecode.readUInt32LE(6);
  const instructions = [];
  let offset = HEADER_SIZE;

  for (let index = 0; index < instructionCount; index += 1) {
    requireBytes(bytecode, offset, 1, `instruction ${index}`);
    const instructionOffset = offset;
    const opcode = bytecode.readUInt8(offset);
    offset += 1;

    if (opcode === OPCODES.PRINT) {
      requireBytes(bytecode, offset, 2, `PRINT length for instruction ${index}`);
      const byteLength = bytecode.readUInt16LE(offset);
      offset += 2;
      requireBytes(bytecode, offset, byteLength, `PRINT value for instruction ${index}`);

      let value;
      try {
        value = textDecoder.decode(bytecode.subarray(offset, offset + byteLength));
      } catch {
        throw new Error(`Invalid UTF-8 string at offset ${offset}.`);
      }
      offset += byteLength;
      instructions.push({
        index,
        offset: instructionOffset,
        size: offset - instructionOffset,
        opcode,
        name: "PRINT",
        operand: { byteLength, value },
      });
      continue;
    }

    if (opcode === OPCODES.HALT) {
      if (index !== instructionCount - 1) {
        throw new Error(`HALT must be the final instruction, found at index ${index}.`);
      }
      instructions.push({
        index,
        offset: instructionOffset,
        size: 1,
        opcode,
        name: "HALT",
      });
      continue;
    }

    throw new Error(`Unsupported opcode ${opcode} at offset ${instructionOffset}.`);
  }

  if (instructions.at(-1)?.opcode !== OPCODES.HALT) {
    throw new Error("Program must terminate with HALT.");
  }
  if (offset !== bytecode.length) {
    throw new Error(`Trailing data starts at offset ${offset}.`);
  }

  return {
    header: {
      magic: MAGIC.toString("ascii"),
      version,
      instructionCount,
      headerSize: HEADER_SIZE,
      fileSize: bytecode.length,
    },
    instructions,
  };
}

export function formatInspection(program) {
  const lines = [
    "JIMP Bytecode",
    `File size: ${program.header.fileSize} bytes`,
    `Magic: ${program.header.magic}`,
    `Version: ${program.header.version}`,
    `Instruction count: ${program.header.instructionCount}`,
    "Instructions:",
  ];

  for (const instruction of program.instructions) {
    const index = String(instruction.index).padStart(4, "0");
    const offset = instruction.offset.toString(16).padStart(8, "0");
    const operand = instruction.name === "PRINT"
      ? ` length=${instruction.operand.byteLength} value=${JSON.stringify(instruction.operand.value)}`
      : "";
    lines.push(`[${index}] @0x${offset} ${instruction.name}${operand}`);
  }

  return `${lines.join("\n")}\n`;
}
