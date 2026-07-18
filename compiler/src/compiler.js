import { OPCODES, encodeProgram } from "./bytecode.js";

const PRINT_STATEMENT = /^print\s+"((?:[^"\\]|\\[\\"nrt])*)"\s*;?\s*$/;

function unescapeString(value, line) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    throw new Error(`Invalid string escape at line ${line}.`);
  }
}

export function compile(source) {
  const instructions = [];
  const lines = source.replaceAll("\r\n", "\n").split("\n");

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("//")) return;

    const match = line.match(PRINT_STATEMENT);
    if (!match) {
      throw new Error(`Syntax error at line ${index + 1}: expected print \"text\".`);
    }

    instructions.push({ opcode: OPCODES.PRINT, value: unescapeString(match[1], index + 1) });
  });

  instructions.push({ opcode: OPCODES.HALT });
  return encodeProgram(instructions);
}
