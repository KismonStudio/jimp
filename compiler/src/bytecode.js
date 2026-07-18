export const MAGIC = Buffer.from("JIMP");
export const VERSION = 1;
export const OPCODES = Object.freeze({
  PRINT: 1,
  HALT: 255,
});

export function encodeProgram(instructions) {
  const chunks = [];
  const header = Buffer.alloc(10);
  MAGIC.copy(header, 0);
  header.writeUInt16LE(VERSION, 4);
  header.writeUInt32LE(instructions.length, 6);
  chunks.push(header);

  for (const instruction of instructions) {
    if (instruction.opcode === OPCODES.PRINT) {
      const text = Buffer.from(instruction.value, "utf8");
      if (text.length > 0xffff) {
        throw new Error("String literal exceeds the bytecode limit of 65535 bytes.");
      }
      const encoded = Buffer.alloc(3 + text.length);
      encoded.writeUInt8(OPCODES.PRINT, 0);
      encoded.writeUInt16LE(text.length, 1);
      text.copy(encoded, 3);
      chunks.push(encoded);
    } else if (instruction.opcode === OPCODES.HALT) {
      chunks.push(Buffer.from([OPCODES.HALT]));
    } else {
      throw new Error(`Cannot encode unsupported opcode ${instruction.opcode}.`);
    }
  }

  return Buffer.concat(chunks);
}
