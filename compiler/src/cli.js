import { readFile, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { compile } from "./compiler.js";
import { decodeBytecode, formatInspection } from "./inspector.js";

function usage() {
  return [
    "Usage:",
    "  jimp compile <input.jimp> [-o <output.jbc>]",
    "  jimp inspect <input.jbc> [--json]",
  ].join("\n");
}

async function main(args) {
  const [command, input] = args;
  if (!input) throw new Error(usage());

  if (command === "inspect") {
    const unsupportedOptions = args.slice(2).filter((argument) => argument !== "--json");
    if (unsupportedOptions.length > 0) throw new Error(usage());

    const program = decodeBytecode(await readFile(resolve(input)));
    const output = args.includes("--json")
      ? `${JSON.stringify(program, null, 2)}\n`
      : formatInspection(program);
    process.stdout.write(output);
    return;
  }

  if (command !== "compile") throw new Error(usage());
  const inputPath = resolve(input);
  const outputOption = args.indexOf("-o");
  if (outputOption >= 0 && !args[outputOption + 1]) throw new Error(usage());
  const outputPath = outputOption >= 0
    ? resolve(args[outputOption + 1])
    : resolve(`${basename(inputPath, extname(inputPath))}.jbc`);

  const bytecode = compile(await readFile(inputPath, "utf8"));
  await writeFile(outputPath, bytecode);
  process.stdout.write(`Compiled ${inputPath} to ${outputPath}\n`);
}

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
