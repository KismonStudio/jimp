import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { compile } from "./compiler.js";
import { ERROR_CODES, JimpError, formatError, normalizeError } from "./errors.js";
import { decodeBytecode, formatInspection } from "./inspector.js";
import { SANDBOX_LIMITS } from "./generated/sandbox.js";

function usage() {
  return "Usage: jimp compile <input.jimp> [-o <output.jbc>] [--error-format=json] | jimp inspect <input.jbc> [--json] [--error-format=json]";
}

function usageError() {
  return new JimpError(ERROR_CODES.USAGE, usage());
}

async function withError(definition, operation) {
  try {
    return await operation();
  } catch (error) {
    throw normalizeError(error, definition);
  }
}

async function main(args) {
  const [command, input] = args;
  if (!input) throw usageError();

  if (command === "inspect") {
    const unsupportedOptions = args.slice(2).filter((argument) => argument !== "--json");
    if (unsupportedOptions.length > 0 || args.filter((argument) => argument === "--json").length > 1) {
      throw usageError();
    }

    const inputPath = resolve(input);
    const inputSize = (await withError(ERROR_CODES.IO, () => stat(inputPath))).size;
    if (inputSize > SANDBOX_LIMITS.MAX_MODULE_BYTES) {
      throw new JimpError(
        ERROR_CODES.DECODE,
        `Module size exceeds the sandbox limit of ${SANDBOX_LIMITS.MAX_MODULE_BYTES} bytes.`,
      );
    }
    const bytecode = await withError(ERROR_CODES.IO, () => readFile(inputPath));
    const program = await withError(ERROR_CODES.DECODE, () => decodeBytecode(bytecode));
    const output = args.includes("--json")
      ? `${JSON.stringify(program, (_, value) => typeof value === "bigint" ? value.toString() : value, 2)}\n`
      : formatInspection(program);
    process.stdout.write(output);
    return;
  }

  if (command !== "compile") throw usageError();
  if (args.length !== 2 && (args.length !== 4 || args[2] !== "-o")) throw usageError();
  const inputPath = resolve(input);
  const outputOption = args.indexOf("-o");
  const outputPath = outputOption >= 0
    ? resolve(args[outputOption + 1])
    : resolve(`${basename(inputPath, extname(inputPath))}.jbc`);

  const source = await withError(ERROR_CODES.IO, () => readFile(inputPath, "utf8"));
  const bytecode = await withError(ERROR_CODES.COMPILE, () => compile(source));
  await withError(ERROR_CODES.IO, () => writeFile(outputPath, bytecode));
  process.stdout.write(`Compiled ${inputPath} to ${outputPath}\n`);
}

const rawArguments = process.argv.slice(2);
const errorFormat = rawArguments.includes("--error-format=json") ? "json" : "human";
const argumentsWithoutErrorFormat = rawArguments.filter((argument) => argument !== "--error-format=json");

main(argumentsWithoutErrorFormat).catch((error) => {
  const normalized = normalizeError(error, ERROR_CODES.INTERNAL);
  process.stderr.write(formatError(normalized, errorFormat));
  process.exitCode = normalized.exitCode;
});
