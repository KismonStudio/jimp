import { NO_REGISTER } from "./generated/isa.js";
import { encodeInstruction, encodePortableModule } from "./portable/module.js";

const PRINT_STATEMENT = /^print\s+"((?:[^"\\]|\\[\\"nrt])*)"\s*;?\s*$/;

function unescapeString(value, line) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    throw new Error(`Invalid string escape at line ${line}.`);
  }
}

export function compile(source) {
  const outputLines = [];
  const lines = source.replaceAll("\r\n", "\n").split("\n");

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("//")) return;

    const match = line.match(PRINT_STATEMENT);
    if (!match) {
      throw new Error(`Syntax error at line ${index + 1}: expected print \"text\".`);
    }

    outputLines.push(unescapeString(match[1], index + 1));
  });

  const constants = [];
  const imports = [];
  const code = [];
  if (outputLines.length > 0) {
    constants.push(
      { type: "STRING", value: "std.console" },
      { type: "STRING", value: "write" },
    );
    imports.push({
      namespace: 0,
      name: 1,
      parameterTypes: ["STRING"],
      returnType: "VOID",
    });
    for (const line of outputLines) {
      const constant = constants.length;
      constants.push({ type: "STRING", value: `${line}\n` });
      code.push(
        encodeInstruction("LOAD_CONST", { destination: 0, constant }),
        encodeInstruction("HOST_CALL", {
          import: 0,
          argument_start: 0,
          argument_count: 1,
          result: NO_REGISTER,
        }),
      );
    }
  }
  code.push(encodeInstruction("HALT"));

  return encodePortableModule({
    constants,
    imports,
    functions: [{
      name: null,
      code: Buffer.concat(code),
      registerCount: outputLines.length > 0 ? 1 : 0,
      parameterTypes: [],
      returnType: "VOID",
    }],
  });
}
