import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { compileProject } from "./linker.js";
import { ERROR_CODES, JimpError, formatError, normalizeError } from "./errors.js";
import { decodeBytecode, formatInspection } from "./inspector.js";
import { SANDBOX_LIMITS } from "./generated/sandbox.js";

function usage() {
  return "Usage: jimp compile <input.jimp> [-o <output.jbc>] [--project-root=<path>] [--stdlib-major=<number>] [--target-profile=<profile>] [--error-format=json] | jimp inspect <input.jbc> [--json] [--error-format=json]";
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
  const compileArguments = args.slice(2);
  let outputValue;
  let projectRoot;
  let standardLibraryMajor;
  let targetProfile;
  for (let index = 0; index < compileArguments.length; index += 1) {
    const argument = compileArguments[index];
    if (argument === "-o" && outputValue === undefined && compileArguments[index + 1]) {
      outputValue = compileArguments[index + 1];
      index += 1;
    } else if (argument.startsWith("--project-root=") && projectRoot === undefined) {
      projectRoot = resolve(argument.slice("--project-root=".length));
    } else if (argument.startsWith("--stdlib-major=") && standardLibraryMajor === undefined) {
      standardLibraryMajor = Number(argument.slice("--stdlib-major=".length));
      if (!Number.isInteger(standardLibraryMajor) || standardLibraryMajor <= 0) throw usageError();
    } else if (argument.startsWith("--target-profile=") && targetProfile === undefined) {
      targetProfile = argument.slice("--target-profile=".length);
      if (targetProfile.length === 0) throw usageError();
    } else {
      throw usageError();
    }
  }
  const inputPath = resolve(input);
  const outputPath = outputValue !== undefined
    ? resolve(outputValue)
    : resolve(`${basename(inputPath, extname(inputPath))}.jbc`);

  const bytecode = await withError(ERROR_CODES.COMPILE, () => compileProject(inputPath, {
    ...(projectRoot === undefined ? {} : { projectRoot }),
    ...(standardLibraryMajor === undefined ? {} : { standardLibraryMajor }),
    ...(targetProfile === undefined ? {} : { targetProfile }),
  }));
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
