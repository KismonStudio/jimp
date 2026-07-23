#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants as fileConstants, readFileSync } from "node:fs";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compileProject } from "./linker.js";
import { ERROR_CODES, AureonError, formatError, normalizeError } from "./errors.js";
import { decodeBytecode, formatInspection } from "./inspector.js";
import { SANDBOX_LIMITS } from "./generated/sandbox.js";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const packageDefinition = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const TOOLCHAIN_VERSION = packageDefinition.version;
const RUNTIME_PROTOCOL_VERSION = 1;
const runtimeExecutable = process.platform === "win32" ? "aureon-runtime.exe" : "aureon-runtime";

function usage() {
  return [
    "Usage:",
    "  aureon run <input.aur> [project options] [--runtime=<path>] [--error-format=json]",
    "  aureon compile <input.aur> [-o <output.abc>] [project options] [--error-format=json]",
    "  aureon check <input.aur|input.abc> [project options] [--runtime=<path>] [--error-format=json]",
    "  aureon inspect <input.abc> [--json] [--error-format=json]",
    "  aureon init <directory> [--error-format=json]",
    "  aureon repl [project options] [--runtime=<path>] [--error-format=json]",
    "  aureon --version",
    "  aureon --help",
    "Project options: --project-root=<path> --stdlib-major=<number> --target-profile=<profile>",
  ].join("\n");
}

function usageError(message = usage()) {
  return new AureonError(ERROR_CODES.USAGE, message);
}

async function withError(definition, operation) {
  try {
    return await operation();
  } catch (error) {
    throw normalizeError(error, definition);
  }
}

function requireOptionValue(argument, prefix) {
  const value = argument.slice(prefix.length);
  if (value.length === 0) throw usageError();
  return value;
}

function parseProjectOptions(argumentsList, { allowOutput = false, allowRuntime = false } = {}) {
  let outputPath;
  let projectRoot;
  let standardLibraryMajor;
  let targetProfile;
  let runtimePath;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (allowOutput && argument === "-o" && outputPath === undefined && argumentsList[index + 1]) {
      outputPath = resolve(argumentsList[index + 1]);
      index += 1;
    } else if (argument.startsWith("--project-root=") && projectRoot === undefined) {
      projectRoot = resolve(requireOptionValue(argument, "--project-root="));
    } else if (argument.startsWith("--stdlib-major=") && standardLibraryMajor === undefined) {
      standardLibraryMajor = Number(requireOptionValue(argument, "--stdlib-major="));
      if (!Number.isInteger(standardLibraryMajor) || standardLibraryMajor <= 0) throw usageError();
    } else if (argument.startsWith("--target-profile=") && targetProfile === undefined) {
      targetProfile = requireOptionValue(argument, "--target-profile=");
    } else if (allowRuntime && argument.startsWith("--runtime=") && runtimePath === undefined) {
      runtimePath = resolve(requireOptionValue(argument, "--runtime="));
    } else {
      throw usageError();
    }
  }
  return {
    bytecodeIncompatibleOptions: projectRoot !== undefined || standardLibraryMajor !== undefined,
    outputPath,
    projectRootPath: projectRoot,
    runtimePath,
    targetProfile: targetProfile ?? "portable",
    compilerOptions: {
      ...(projectRoot === undefined ? {} : { projectRoot }),
      ...(standardLibraryMajor === undefined ? {} : { standardLibraryMajor }),
      ...(targetProfile === undefined ? {} : { targetProfile }),
    },
  };
}

async function compileTo(inputPath, outputPath, compilerOptions) {
  const bytecode = await withError(
    ERROR_CODES.COMPILE,
    () => compileProject(inputPath, compilerOptions),
  );
  await withError(ERROR_CODES.IO, () => writeFile(outputPath, bytecode));
}

async function isExecutableFile(path) {
  try {
    const metadata = await stat(path);
    if (!metadata.isFile()) return false;
    await access(path, process.platform === "win32" ? fileConstants.F_OK : fileConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function discoverRuntime(explicitPath) {
  if (explicitPath !== undefined) {
    if (await isExecutableFile(explicitPath)) return explicitPath;
    throw new AureonError(
      ERROR_CODES.IO,
      `Configured runtime "${explicitPath}" is not an executable file.`,
    );
  }
  const environmentPath = process.env.AUREON_RUNTIME;
  if (environmentPath !== undefined && environmentPath.length > 0) {
    const resolvedPath = resolve(environmentPath);
    if (await isExecutableFile(resolvedPath)) return resolvedPath;
    throw new AureonError(
      ERROR_CODES.IO,
      `AUREON_RUNTIME points to "${resolvedPath}", which is not an executable file.`,
    );
  }
  const candidates = [
    join(packageRoot, "runtime", "bin", runtimeExecutable),
    join(packageRoot, "runtime", "target", "release", runtimeExecutable),
    join(packageRoot, "runtime", "target", "debug", runtimeExecutable),
  ];
  for (const candidate of candidates) {
    if (await isExecutableFile(candidate)) return candidate;
  }
  throw new AureonError(
    ERROR_CODES.IO,
    "No compatible AUREON runtime was found in the installed package. "
      + "Build it with `npm run build:runtime` or pass `--runtime=<path>`.",
  );
}

function verifyRuntime(runtimePath) {
  const result = spawnSync(runtimePath, ["--version"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024,
    timeout: 5_000,
    windowsHide: true,
  });
  if (result.error) {
    throw new AureonError(ERROR_CODES.IO, `Cannot start runtime "${runtimePath}": ${result.error.message}.`);
  }
  const expected = `aureon-runtime ${TOOLCHAIN_VERSION} protocol ${RUNTIME_PROTOCOL_VERSION}`;
  if (result.status !== 0 || result.stdout.trim() !== expected) {
    throw usageError(
      `Runtime "${runtimePath}" is incompatible; expected handshake "${expected}".`,
    );
  }
}

function executeRuntime(runtimePath, argumentsList) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(runtimePath, argumentsList, {
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", (error) => rejectPromise(new AureonError(
      ERROR_CODES.IO,
      `Cannot start runtime "${runtimePath}": ${error.message}.`,
    )));
    child.once("exit", (code, signal) => {
      if (signal !== null) {
        rejectPromise(new AureonError(
          ERROR_CODES.IO,
          `Runtime "${runtimePath}" terminated by signal ${signal}.`,
        ));
      } else {
        resolvePromise(code ?? 1);
      }
    });
  });
}

async function inspectBytecode(input, json) {
  const inputPath = resolve(input);
  const inputSize = (await withError(ERROR_CODES.IO, () => stat(inputPath))).size;
  if (inputSize > SANDBOX_LIMITS.MAX_MODULE_BYTES) {
    throw new AureonError(
      ERROR_CODES.DECODE,
      `Module size exceeds the sandbox limit of ${SANDBOX_LIMITS.MAX_MODULE_BYTES} bytes.`,
    );
  }
  const bytecode = await withError(ERROR_CODES.IO, () => readFile(inputPath));
  const program = await withError(ERROR_CODES.DECODE, () => decodeBytecode(bytecode));
  process.stdout.write(json
    ? `${JSON.stringify(program, (_, value) => typeof value === "bigint" ? value.toString() : value, 2)}\n`
    : formatInspection(program));
}

async function initializeProject(directory) {
  const target = resolve(directory);
  try {
    await mkdir(target);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new AureonError(
        ERROR_CODES.IO,
        `Project directory "${target}" already exists; no files were changed.`,
      );
    }
    throw error;
  }
  try {
    await writeFile(join(target, "main.aur"), [
      'import { writeLine } from "std:console";',
      "",
      'writeLine("Hello from AUREON!");',
      "",
    ].join("\n"), { flag: "wx" });
    await writeFile(join(target, "README.md"), [
      "# AUREON Project",
      "",
      "Run this project with:",
      "",
      "```powershell",
      "aureon run main.aur",
      "```",
      "",
    ].join("\n"), { flag: "wx" });
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
  process.stdout.write(`Initialized AUREON project at ${target}\n`);
}

async function runSource(command, input, optionArguments, errorFormat) {
  const inputPath = resolve(input);
  const options = parseProjectOptions(optionArguments, {
    allowOutput: command === "compile",
    allowRuntime: command === "run" || command === "check",
  });
  if (command === "compile") {
    const outputPath = options.outputPath
      ?? resolve(`${basename(inputPath, extname(inputPath))}.abc`);
    await compileTo(inputPath, outputPath, options.compilerOptions);
    process.stdout.write(`Compiled ${inputPath} to ${outputPath}\n`);
    return 0;
  }

  let temporaryDirectory;
  let bytecodePath = inputPath;
  try {
    if (extname(inputPath) !== ".abc") {
      temporaryDirectory = await withError(
        ERROR_CODES.IO,
        () => mkdtemp(join(tmpdir(), "aureon-run-")),
      );
      bytecodePath = join(temporaryDirectory, "program.abc");
      await compileTo(inputPath, bytecodePath, options.compilerOptions);
    } else if (options.bytecodeIncompatibleOptions) {
      throw usageError("Project compilation options cannot be used when checking a .abc file.");
    }
    const runtimePath = await discoverRuntime(options.runtimePath);
    verifyRuntime(runtimePath);
    const runtimeArguments = [
      ...(command === "check" ? ["--validate-portable"] : []),
      `--target-profile=${options.targetProfile}`,
      ...(errorFormat === "json" ? ["--error-format=json"] : []),
      bytecodePath,
    ];
    return await executeRuntime(runtimePath, runtimeArguments);
  } finally {
    if (temporaryDirectory !== undefined) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}

function replHelp() {
  return [
    "REPL commands:",
    "  :run    Compile and execute the complete source buffer",
    "  :show   Show the numbered source buffer",
    "  :undo   Remove the last source line",
    "  :clear  Clear the source buffer",
    "  :help   Show this help",
    "  :quit   Exit the REPL",
  ].join("\n");
}

async function runRepl(optionArguments, errorFormat) {
  const options = parseProjectOptions(optionArguments, { allowRuntime: true });
  const sessionRoot = options.projectRootPath ?? process.cwd();
  const sourcePath = join(sessionRoot, `.aur-repl-${process.pid}-${randomUUID()}.aur`);
  const sourceLines = [];
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const input = createInterface({ input: process.stdin, output: process.stdout, terminal: interactive });
  process.stdout.write("AUREON REPL 0.1 - source-buffer session. Type :help for commands.\n");
  if (interactive) {
    input.setPrompt("aureon> ");
    input.prompt();
  }
  try {
    for await (const line of input) {
      const command = line.trim();
      if (command === ":quit" || command === ":exit") break;
      if (command === ":help") {
        process.stdout.write(`${replHelp()}\n`);
      } else if (command === ":show") {
        process.stdout.write(sourceLines.length === 0
          ? "Source buffer is empty.\n"
          : `${sourceLines.map((sourceLine, index) => `${index + 1}: ${sourceLine}`).join("\n")}\n`);
      } else if (command === ":undo") {
        if (sourceLines.length > 0) sourceLines.pop();
      } else if (command === ":clear") {
        sourceLines.length = 0;
      } else if (command === ":run") {
        if (sourceLines.length === 0) {
          process.stdout.write("Source buffer is empty.\n");
        } else {
          try {
            await withError(ERROR_CODES.IO, () => writeFile(sourcePath, `${sourceLines.join("\n")}\n`));
            await runSource("run", sourcePath, optionArguments, errorFormat);
          } catch (error) {
            process.stderr.write(formatError(normalizeError(error, ERROR_CODES.INTERNAL), errorFormat));
          }
        }
      } else if (command.startsWith(":")) {
        process.stdout.write(`Unknown REPL command "${command}". Type :help for commands.\n`);
      } else {
        sourceLines.push(line);
      }
      if (interactive) input.prompt();
    }
  } finally {
    input.close();
    await rm(sourcePath, { force: true });
  }
  return 0;
}

export async function main(args, errorFormat = "human") {
  if (args.length === 1 && args[0] === "--version") {
    process.stdout.write(`aureon ${TOOLCHAIN_VERSION} runtime-protocol ${RUNTIME_PROTOCOL_VERSION}\n`);
    return 0;
  }
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  const [command, input, ...optionArguments] = args;
  if (command === "repl") return runRepl(args.slice(1), errorFormat);
  if (!command || !input) throw usageError();
  if (["run", "compile", "check"].includes(command)) {
    return runSource(command, input, optionArguments, errorFormat);
  }
  if (command === "inspect") {
    const unsupported = optionArguments.filter((argument) => argument !== "--json");
    if (unsupported.length > 0 || optionArguments.filter((argument) => argument === "--json").length > 1) {
      throw usageError();
    }
    await inspectBytecode(input, optionArguments.includes("--json"));
    return 0;
  }
  if (command === "init") {
    if (optionArguments.length > 0) throw usageError();
    await withError(ERROR_CODES.IO, () => initializeProject(input));
    return 0;
  }
  throw usageError();
}

export async function runCliProcess(rawArguments = process.argv.slice(2)) {
  const jsonOptionCount = rawArguments
    .filter((argument) => argument === "--error-format=json")
    .length;
  const errorFormat = jsonOptionCount === 1 ? "json" : "human";
  const argumentsWithoutErrorFormat = rawArguments
    .filter((argument) => argument !== "--error-format=json");
  try {
    if (jsonOptionCount > 1) throw usageError();
    process.exitCode = await main(argumentsWithoutErrorFormat, errorFormat);
  } catch (error) {
    const normalized = normalizeError(error, ERROR_CODES.INTERNAL);
    process.stderr.write(formatError(normalized, errorFormat));
    process.exitCode = normalized.exitCode;
  }
}

const invokedPath = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) await runCliProcess();
