import { readFile, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { compile } from "./compiler.js";

function usage() {
  return "Usage: jimp compile <input.jimp> [-o <output.jbc>]";
}

async function main(args) {
  if (args[0] !== "compile" || !args[1]) throw new Error(usage());
  const inputPath = resolve(args[1]);
  const outputOption = args.indexOf("-o");
  const outputPath = outputOption >= 0
    ? resolve(args[outputOption + 1] ?? "")
    : resolve(`${basename(inputPath, extname(inputPath))}.jbc`);
  if (outputOption >= 0 && !args[outputOption + 1]) throw new Error(usage());

  const bytecode = compile(await readFile(inputPath, "utf8"));
  await writeFile(outputPath, bytecode);
  process.stdout.write(`Compiled ${inputPath} to ${outputPath}\n`);
}

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
