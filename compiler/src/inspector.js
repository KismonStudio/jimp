import { decodePortableModule } from "./portable/module.js";

export function decodeBytecode(bytecode) {
  const module = decodePortableModule(bytecode);
  return {
    ...module,
    header: {
      magic: "JIMP",
      format: `${module.header.major}.${module.header.minor}`,
      entryFunction: module.header.entryFunction,
      sectionCount: module.header.sectionCount,
      fileSize: bytecode.length,
    },
  };
}

function formatConstant(constant) {
  if (constant.type === "STRING") return JSON.stringify(constant.value);
  if (constant.type === "I64") return constant.value.toString();
  if (constant.type === "NULL") return "null";
  return String(constant.value);
}

export function formatInspection(module) {
  const lines = [
    "JIMP Portable Bytecode",
    `File size: ${module.header.fileSize} bytes`,
    `Magic: ${module.header.magic}`,
    `Format: ${module.header.format}`,
    `Entry function: ${module.header.entryFunction}`,
    `Sections: ${module.header.sectionCount}`,
    `Constants (${module.constants.length}):`,
  ];

  module.constants.forEach((constant, index) => {
    lines.push(`  [${index}] ${constant.type} ${formatConstant(constant)}`);
  });
  lines.push(`Host imports (${module.imports.length}):`);
  module.imports.forEach((hostImport, index) => {
    const parameters = hostImport.parameterTypes.join(", ");
    lines.push(`  [${index}] ${hostImport.symbol}(${parameters}) -> ${hostImport.returnType}`);
  });
  lines.push(`Functions (${module.functions.length}):`);
  module.functions.forEach((func, functionIndex) => {
    lines.push(`  function[${functionIndex}] registers=${func.registerCount} code=${func.codeLength} bytes`);
    for (const instruction of func.instructions) {
      const index = String(instruction.index).padStart(4, "0");
      const offset = instruction.offset.toString(16).padStart(8, "0");
      const operands = Object.entries(instruction.operands)
        .map(([name, value]) => `${name}=${value}`)
        .join(" ");
      lines.push(`    [${index}] @code+0x${offset} ${instruction.name}${operands ? ` ${operands}` : ""}`);
    }
  });
  return `${lines.join("\n")}\n`;
}
