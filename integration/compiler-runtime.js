import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { compile } from "../compiler/src/compiler.js";
import { compileProject } from "../compiler/src/linker.js";
import { NO_REGISTER, OPCODES } from "../compiler/src/generated/isa.js";
import { SANDBOX_LIMITS } from "../compiler/src/generated/sandbox.js";
import {
  encodeInstruction,
  encodePortableModule,
} from "../compiler/src/portable/module.js";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const runtimeManifest = join(repositoryRoot, "runtime", "Cargo.toml");
const compilerCli = join(repositoryRoot, "compiler", "src", "cli.js");
const publicCli = join(repositoryRoot, "bin", "jimp.js");
const portableMathSource = readFileSync(
  join(repositoryRoot, "stdlib", "src", "math", "i64.jimp"),
  "utf8",
).replace(/^(\s*)export\s+(?=function\b)/gm, "$1");
const runtimeBinary = join(
  repositoryRoot,
  "runtime",
  "target",
  "debug",
  process.platform === "win32" ? "jimp-runtime.exe" : "jimp-runtime",
);

let temporaryDirectory;
let programCounter = 0;

before(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "jimp-integration-"));
  const build = spawnSync(
    "cargo",
    ["build", "--quiet", "--manifest-path", runtimeManifest],
    { cwd: repositoryRoot, encoding: "utf8", windowsHide: true },
  );
  assert.equal(build.status, 0, `Failed to build the runtime:\n${build.stderr}`);
});

after(() => {
  if (temporaryDirectory) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

function runBytecode(bytecode, runtimeArguments = []) {
  programCounter += 1;
  const bytecodePath = join(temporaryDirectory, `program-${programCounter}.jbc`);
  writeFileSync(bytecodePath, bytecode);
  return spawnSync(runtimeBinary, [...runtimeArguments, bytecodePath], {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
  });
}

function runPublicCli(argumentsList, cwd = repositoryRoot, input) {
  return spawnSync(process.execPath, [publicCli, ...argumentsList], {
    cwd,
    encoding: "utf8",
    input,
    windowsHide: true,
  });
}

function parseStandardError(result) {
  assert.notEqual(result.stderr, "", "Expected a structured diagnostic on stderr.");
  return JSON.parse(result.stderr);
}

function assertStandardError(result, code, phase, status = 1) {
  const error = parseStandardError(result);
  assert.equal(result.status, status);
  assert.equal(result.stdout, "");
  assert.equal(error.schema, "jimp-error-v1");
  assert.equal(error.code, code);
  assert.equal(error.phase, phase);
  return error;
}

function createPortableModule({
  namespace = "std.console",
  name = "write",
  parameterType = "STRING",
} = {}) {
  const constants = [
    { type: "STRING", value: namespace },
    { type: "STRING", value: name },
    parameterType === "I64"
      ? { type: "I64", value: 1n }
      : { type: "STRING", value: "Portable runtime validation\n" },
  ];
  const code = Buffer.concat([
    encodeInstruction("LOAD_CONST", { destination: 0, constant: 2 }),
    encodeInstruction("HOST_CALL", {
      import: 0,
      argument_start: 0,
      argument_count: 1,
      result: NO_REGISTER,
    }),
    encodeInstruction("HALT"),
  ]);
  return encodePortableModule({
    constants,
    imports: [{
      namespace: 0,
      name: 1,
      parameterTypes: [parameterType],
      returnType: "VOID",
    }],
    functions: [{
      name: null,
      code,
      registerCount: 1,
      parameterTypes: [],
      returnType: "VOID",
    }],
  });
}

function createInvalidBooleanAddModule() {
  const code = Buffer.concat([
    encodeInstruction("LOAD_CONST", { destination: 0, constant: 0 }),
    encodeInstruction("LOAD_CONST", { destination: 1, constant: 1 }),
    encodeInstruction("ADD", { destination: 0, left: 0, right: 1 }),
    encodeInstruction("HALT"),
  ]);
  return encodePortableModule({
    constants: [
      { type: "BOOL", value: true },
      { type: "BOOL", value: false },
    ],
    imports: [],
    functions: [{
      name: null,
      code,
      registerCount: 2,
      parameterTypes: [],
      returnType: "VOID",
    }],
  });
}

function createInvalidConditionalHostModule() {
  const code = Buffer.concat([
    encodeInstruction("LOAD_CONST", { destination: 0, constant: 2 }),
    encodeInstruction("JUMP_IF_FALSE", { condition: 0, target: 21 }),
    encodeInstruction("LOAD_CONST", { destination: 1, constant: 3 }),
    encodeInstruction("HOST_CALL", {
      import: 0,
      argument_start: 1,
      argument_count: 1,
      result: NO_REGISTER,
    }),
    encodeInstruction("HALT"),
  ]);
  return encodePortableModule({
    constants: [
      { type: "STRING", value: "std.console" },
      { type: "STRING", value: "write" },
      { type: "BOOL", value: false },
      { type: "STRING", value: "must not be written" },
    ],
    imports: [{
      namespace: 0,
      name: 1,
      parameterTypes: ["STRING"],
      returnType: "VOID",
    }],
    functions: [{
      name: null,
      code,
      registerCount: 2,
      parameterTypes: [],
      returnType: "VOID",
    }],
  });
}

function findSection(bytecode, expectedKind) {
  const sectionCount = bytecode.readUInt16LE(16);
  for (let index = 0; index < sectionCount; index += 1) {
    const directoryOffset = 20 + index * 12;
    if (bytecode.readUInt16LE(directoryOffset) === expectedKind) {
      return {
        offset: bytecode.readUInt32LE(directoryOffset + 4),
        length: bytecode.readUInt32LE(directoryOffset + 8),
      };
    }
  }
  throw new Error(`Section kind ${expectedKind} was not found.`);
}

function assertRejectedWithoutOutput(bytecode, diagnostic) {
  const result = runBytecode(bytecode);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, diagnostic);
}

test("executes compiler output in the Rust runtime", () => {
  const bytecode = compile('print "First";\nprint "Second";');
  const result = runBytecode(bytecode);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.replaceAll("\r\n", "\n"), "First\nSecond\n");
  assert.equal(result.stderr, "");
});

test("reports compiler failures through the standard JSON error contract", () => {
  programCounter += 1;
  const sourcePath = join(temporaryDirectory, `invalid-${programCounter}.jimp`);
  writeFileSync(sourcePath, "var value = ;");
  const result = spawnSync(
    process.execPath,
    [compilerCli, "compile", sourcePath, "--error-format=json"],
    { cwd: repositoryRoot, encoding: "utf8", windowsHide: true },
  );
  const error = assertStandardError(result, "JIMP-1001", "compile");
  assert.deepEqual(error.location, {
    kind: "source",
    line: 1,
    moduleId: "invalid-" + programCounter + ".jimp",
  });

  const usageResult = spawnSync(
    process.execPath,
    [compilerCli, "--error-format=json"],
    { cwd: repositoryRoot, encoding: "utf8", windowsHide: true },
  );
  assertStandardError(usageResult, "JIMP-0001", "usage", 2);
});

test("exposes the unified public command surface", () => {
  const version = runPublicCli(["--version"], temporaryDirectory);
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), "jimp 0.1.0 runtime-protocol 1");

  const help = runPublicCli(["--help"], temporaryDirectory);
  assert.equal(help.status, 0, help.stderr);
  for (const command of ["run", "compile", "check", "inspect", "init"]) {
    assert.match(help.stdout, new RegExp(`jimp ${command}`));
  }

  const runtimeVersion = spawnSync(runtimeBinary, ["--version"], {
    cwd: temporaryDirectory,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(runtimeVersion.status, 0, runtimeVersion.stderr);
  assert.equal(runtimeVersion.stdout.trim(), "jimp-runtime 0.1.0 protocol 1");
});

test("runs, checks, compiles, and inspects through public commands", () => {
  const helloPath = join(repositoryRoot, "examples", "hello.jimp");
  const runResult = runPublicCli(["run", helloPath], temporaryDirectory);
  assert.equal(runResult.status, 0, runResult.stderr);
  assert.equal(runResult.stdout.replaceAll("\r\n", "\n"), "Hello, JIMP!\n");

  const checkResult = runPublicCli(["check", helloPath, `--runtime=${runtimeBinary}`], temporaryDirectory);
  assert.equal(checkResult.status, 0, checkResult.stderr);
  assert.match(checkResult.stdout, /Portable module valid and execution-ready/);
  assert.doesNotMatch(checkResult.stdout, /Hello, JIMP!/);

  const bytecodePath = join(temporaryDirectory, "public-command.jbc");
  const compileResult = runPublicCli(["compile", helloPath, "-o", bytecodePath], temporaryDirectory);
  assert.equal(compileResult.status, 0, compileResult.stderr);
  const inspectResult = runPublicCli(["inspect", bytecodePath], temporaryDirectory);
  assert.equal(inspectResult.status, 0, inspectResult.stderr);
  assert.match(inspectResult.stdout, /JIMP Portable Bytecode/);
  assert.match(inspectResult.stdout, /Build target: portable/);

  const bytecodeCheck = runPublicCli([
    "check",
    bytecodePath,
    "--target-profile=portable",
    `--runtime=${runtimeBinary}`,
  ], temporaryDirectory);
  assert.equal(bytecodeCheck.status, 0, bytecodeCheck.stderr);
});

test("does not start runtime discovery when source compilation fails", () => {
  const invalidPath = join(temporaryDirectory, "invalid-before-runtime.jimp");
  writeFileSync(invalidPath, "var value = ;");
  const result = runPublicCli([
    "run",
    invalidPath,
    `--runtime=${join(temporaryDirectory, "missing-runtime")}`,
    "--error-format=json",
  ], temporaryDirectory);
  const error = assertStandardError(result, "JIMP-1001", "compile");
  assert.match(error.message, /invalid-before-runtime\.jimp/);
});

test("initializes a project without overwriting an existing directory", () => {
  const projectPath = join(temporaryDirectory, "initialized-project");
  const initialized = runPublicCli(["init", projectPath], temporaryDirectory);
  assert.equal(initialized.status, 0, initialized.stderr);
  assert.match(initialized.stdout, /Initialized JIMP project/);
  const originalSource = readFileSync(join(projectPath, "main.jimp"), "utf8");

  const executed = runPublicCli([
    "run",
    "main.jimp",
    `--runtime=${runtimeBinary}`,
  ], projectPath);
  assert.equal(executed.status, 0, executed.stderr);
  assert.equal(executed.stdout.replaceAll("\r\n", "\n"), "Hello from JIMP!\n");

  const repeated = runPublicCli(["init", projectPath, "--error-format=json"], temporaryDirectory);
  assertStandardError(repeated, "JIMP-0002", "io");
  assert.equal(readFileSync(join(projectPath, "main.jimp"), "utf8"), originalSource);
});

test("executes every reviewed public example", () => {
  const positiveExamples = [
    "conditionals.jimp",
    "expressions.jimp",
    "functions.jimp",
    "hello.jimp",
    "loops.jimp",
    "scalar-values.jimp",
    "variables.jimp",
    "modules/main.jimp",
    "standard-library.jimp",
  ];
  for (const example of positiveExamples) {
    const argumentsList = [
      "run",
      join(repositoryRoot, "examples", ...example.split("/")),
      `--runtime=${runtimeBinary}`,
    ];
    if (example === "modules/main.jimp") {
      argumentsList.push(`--project-root=${join(repositoryRoot, "examples", "modules")}`);
    }
    const result = runPublicCli(argumentsList, temporaryDirectory);
    assert.equal(result.status, 0, `${example}: ${result.stderr}`);
  }

  const nativeResult = runPublicCli([
    "run",
    join(repositoryRoot, "examples", "standard-library.jimp"),
    "--target-profile=reference-native-i64",
    `--runtime=${runtimeBinary}`,
  ], temporaryDirectory);
  assert.equal(nativeResult.status, 0, nativeResult.stderr);
  assert.equal(nativeResult.stdout.replaceAll("\r\n", "\n"), "Standard library: ready\n");

  const errorResult = runPublicCli([
    "run",
    join(repositoryRoot, "examples", "errors", "division-by-zero.jimp"),
    `--runtime=${runtimeBinary}`,
    "--error-format=json",
  ], temporaryDirectory);
  const error = assertStandardError(errorResult, "JIMP-4001", "execute");
  assert.match(error.message, /division by zero/i);
});

test("runs a source-buffer REPL through the public compiler and runtime pipeline", () => {
  const session = [
    'import { writeLine } from "std:console";',
    'writeLine("discarded");',
    ":undo",
    'writeLine("REPL ready");',
    ":show",
    ":run",
    ":clear",
    ":show",
    ":quit",
    "",
  ].join("\n");
  const result = runPublicCli([
    "repl",
    `--project-root=${temporaryDirectory}`,
    `--runtime=${runtimeBinary}`,
  ], temporaryDirectory, session);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.replaceAll("\r\n", "\n"), [
    "JIMP REPL 0.1 - source-buffer session. Type :help for commands.",
    '1: import { writeLine } from "std:console";',
    '2: writeLine("REPL ready");',
    "REPL ready",
    "Source buffer is empty.",
    "",
  ].join("\n"));
});

test("classifies runtime decode, verify, resolve, and execute failures", () => {
  const decodeResult = runBytecode(Buffer.from("not bytecode"), ["--error-format=json"]);
  const verifyResult = runBytecode(createInvalidBooleanAddModule(), ["--error-format=json"]);
  const resolveResult = runBytecode(
    createPortableModule({ namespace: "std.network", name: "fetch" }),
    ["--validate-portable", "--error-format=json"],
  );
  const executeResult = runBytecode(compile("1 / 0;"), ["--error-format=json"]);

  assertStandardError(decodeResult, "JIMP-2001", "decode");
  assertStandardError(verifyResult, "JIMP-2002", "verify");
  assertStandardError(resolveResult, "JIMP-3001", "resolve");
  const executionError = assertStandardError(executeResult, "JIMP-4001", "execute");
  assert.deepEqual(executionError.location, { kind: "source", line: 1 });

  const usageResult = spawnSync(runtimeBinary, ["--error-format=json"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  assertStandardError(usageResult, "JIMP-0001", "usage", 2);
});

test("executes portable scalar literal statements without host output", () => {
  const bytecode = compile("-9223372036854775808;\n3.5;\ntrue;\nfalse;\nnull;");
  const result = runBytecode(bytecode);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("executes analyzed immutable and mutable variables", () => {
  const bytecode = compile(`
    let minimum = -9223372036854775808;
    minimum;
    var current = 1;
    current = 3.5;
    current = null;
    current;
    print "Variables executed";
  `);
  const result = runBytecode(bytecode);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.replaceAll("\r\n", "\n"), "Variables executed\n");
  assert.equal(result.stderr, "");
});

test("executes arithmetic, comparison, and boolean expressions", () => {
  const bytecode = compile(`
    var value = 2;
    value = ((value + 3) * 4 / 2) % 7;
    let comparison = value == 3 && value >= 0;
    !comparison || false;
    let message = "Expressions executed";
    print message;
  `);
  const result = runBytecode(bytecode);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.replaceAll("\r\n", "\n"), "Expressions executed\n");
  assert.equal(result.stderr, "");
});

test("executes conditional blocks and short-circuits boolean expressions", () => {
  const bytecode = compile(`
    false && (1 / 0 == 0);
    true || (1 / 0 == 0);
    var message = "initial";
    if false {
      message = "wrong";
    } else {
      if true {
        message = "conditional path";
      }
    }
    print message;
  `);
  const result = runBytecode(bytecode);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.replaceAll("\r\n", "\n"), "conditional path\n");
  assert.equal(result.stderr, "");
});

test("executes a variable type joined across conditional paths", () => {
  const bytecode = compile(`
    var value = 40;
    if false {
      value = "then";
    } else {
      let calculatedBeforeAssignment = value + 2;
      calculatedBeforeAssignment == 42;
      value = "joined";
    }
    print value;
  `);
  const result = runBytecode(bytecode);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.replaceAll("\r\n", "\n"), "joined\n");
  assert.equal(result.stderr, "");
});

test("executes typed, forward, recursive, and VOID function calls", () => {
  const bytecode = compile(`
    let result = factorial(5);
    if result == 120 {
      announce("Functions executed");
    } else {
      announce("wrong result");
    }
    function factorial(value: I64): I64 {
      if value <= 1 {
        return 1;
      } else {
        return value * factorial(value - 1);
      }
    }
    function announce(message: STRING): VOID {
      print message;
    }
  `);
  const result = runBytecode(bytecode);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.replaceAll("\r\n", "\n"), "Functions executed\n");
  assert.equal(result.stderr, "");
});

test("executes statically linked source modules with module-qualified failures", async () => {
  const projectDirectory = join(temporaryDirectory, "linked-project");
  const libraryDirectory = join(projectDirectory, "lib");
  mkdirSync(libraryDirectory, { recursive: true });
  const entryPath = join(projectDirectory, "main.jimp");
  const libraryPath = join(libraryDirectory, "math.jimp");
  writeFileSync(entryPath, [
    'import { divide, double } from "./lib/math.jimp";',
    "if double(21) == 42 {",
    '  print "Modules executed";',
    "}",
  ].join("\n"));
  writeFileSync(libraryPath, [
    "export function double(value: I64): I64 {",
    "  return value + value;",
    "}",
    "export function divide(left: I64, right: I64): I64 {",
    "  return left / right;",
    "}",
  ].join("\n"));

  const bytecode = await compileProject(entryPath);
  const result = runBytecode(bytecode);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.replaceAll("\r\n", "\n"), "Modules executed\n");

  const cliOutputPath = join(projectDirectory, "linked.jbc");
  const compileResult = spawnSync(
    process.execPath,
    [compilerCli, "compile", entryPath, "-o", cliOutputPath],
    { cwd: repositoryRoot, encoding: "utf8", windowsHide: true },
  );
  assert.equal(compileResult.status, 0, compileResult.stderr);
  const cliResult = runBytecode(readFileSync(cliOutputPath));
  assert.equal(cliResult.status, 0, cliResult.stderr);
  assert.equal(cliResult.stdout.replaceAll("\r\n", "\n"), "Modules executed\n");

  writeFileSync(entryPath, [
    'import { divide } from "./lib/math.jimp";',
    "divide(1, 0);",
  ].join("\n"));
  const failingBytecode = await compileProject(entryPath);
  const failingResult = runBytecode(failingBytecode, ["--error-format=json"]);
  const error = assertStandardError(failingResult, "JIMP-4001", "execute");
  assert.deepEqual(error.location, {
    kind: "source",
    line: 5,
    moduleId: "lib/math.jimp",
  });
});

test("executes while loops with break and continue", () => {
  const bytecode = compile(`
    var value = 0;
    while value < 10 {
      value = value + 1;
      if value == 2 {
        continue;
      }
      if value == 4 {
        break;
      }
    }
    if value == 4 {
      print "Loops executed";
    } else {
      print "wrong result";
    }
  `);
  const result = runBytecode(bytecode);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.replaceAll("\r\n", "\n"), "Loops executed\n");
  assert.equal(result.stderr, "");
});

test("executes the canonical portable i64 standard-library fallbacks", () => {
  const bytecode = compile(`${portableMathSource}
    if absolute(-7) == 7 && minimum(-2, 5) == -2 && maximum(-2, 5) == 5 && sign(-9) == -1 && sign(0) == 0 && sign(9) == 1 {
      print "Portable fallbacks executed";
    } else {
      print "wrong result";
    }
  `);
  const result = runBytecode(bytecode);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.replaceAll("\r\n", "\n"), "Portable fallbacks executed\n");
  assert.equal(result.stderr, "");
});

test("executes standard-library imports with portable and native target parity", async () => {
  const projectDirectory = join(temporaryDirectory, "stdlib-target-project");
  mkdirSync(projectDirectory, { recursive: true });
  const entryPath = join(projectDirectory, "main.jimp");
  writeFileSync(entryPath, [
    'import { absolute, maximum, minimum, sign } from "std:math/i64";',
    'import { writeLine } from "std:console";',
    "if absolute(-7) == 7 && minimum(-2, 5) == -2 && maximum(-2, 5) == 5 && sign(-9) == -1 {",
    '  writeLine("Standard library executed");',
    "}",
  ].join("\n"));

  const portable = await compileProject(entryPath);
  const native = await compileProject(entryPath, { targetProfile: "reference-native-i64" });
  const portableResult = runBytecode(portable);
  const nativeResult = runBytecode(native, ["--target-profile=reference-native-i64"]);
  assert.equal(portableResult.status, 0, portableResult.stderr);
  assert.equal(nativeResult.status, 0, nativeResult.stderr);
  assert.equal(portableResult.stdout.replaceAll("\r\n", "\n"), "Standard library executed\n");
  assert.equal(nativeResult.stdout.replaceAll("\r\n", "\n"), portableResult.stdout.replaceAll("\r\n", "\n"));

  const cliOutputPath = join(projectDirectory, "native.jbc");
  const compileResult = spawnSync(process.execPath, [
    compilerCli,
    "compile",
    entryPath,
    "-o",
    cliOutputPath,
    `--project-root=${projectDirectory}`,
    "--stdlib-major=1",
    "--target-profile=reference-native-i64",
  ], { cwd: repositoryRoot, encoding: "utf8", windowsHide: true });
  assert.equal(compileResult.status, 0, compileResult.stderr);
  const cliResult = runBytecode(readFileSync(cliOutputPath), ["--target-profile=reference-native-i64"]);
  assert.equal(cliResult.status, 0, cliResult.stderr);
  assert.equal(cliResult.stdout.replaceAll("\r\n", "\n"), portableResult.stdout.replaceAll("\r\n", "\n"));

  const mismatched = runBytecode(native, ["--error-format=json"]);
  assertStandardError(mismatched, "JIMP-3001", "resolve");
});

test("preserves native and portable checked-i64 error parity", async () => {
  const projectDirectory = join(temporaryDirectory, "stdlib-overflow-project");
  mkdirSync(projectDirectory, { recursive: true });
  const entryPath = join(projectDirectory, "main.jimp");
  writeFileSync(entryPath, [
    'import { absolute } from "std:math/i64";',
    "absolute(-9223372036854775808);",
  ].join("\n"));
  const portable = runBytecode(await compileProject(entryPath), ["--error-format=json"]);
  const native = runBytecode(
    await compileProject(entryPath, { targetProfile: "reference-native-i64" }),
    ["--target-profile=reference-native-i64", "--error-format=json"],
  );
  const portableError = assertStandardError(portable, "JIMP-4001", "execute");
  const nativeError = assertStandardError(native, "JIMP-4001", "execute");
  assert.equal(nativeError.message, portableError.message);
});

test("preserves checked i64 overflow in the portable absolute fallback", () => {
  const bytecode = compile(`${portableMathSource}
    absolute(-9223372036854775808);
  `);
  const result = runBytecode(bytecode, ["--error-format=json"]);
  const error = assertStandardError(result, "JIMP-4001", "execute");

  assert.match(error.message, /overflow/i);
});

test("stops recursive programs at the call-stack limit", () => {
  const bytecode = compile(`
    recurse();
    function recurse(): VOID {
      recurse();
    }
  `);

  assertRejectedWithoutOutput(bytecode, /Call stack limit of 1024 frame\(s\) was exceeded/);
});

test("stops non-terminating loops at the execution-step limit", () => {
  const bytecode = compile("while true {\n}");

  assertRejectedWithoutOutput(bytecode, /Execution step limit of 1000000 was exceeded/);
});

test("rejects module structure above sandbox limits before host output", () => {
  const excessiveSections = compile('print "must not be written";');
  excessiveSections.writeUInt16LE(SANDBOX_LIMITS.MAX_SECTION_COUNT + 1, 16);
  assertRejectedWithoutOutput(
    excessiveSections,
    /Section count exceeds the sandbox limit/,
  );

  const excessiveRegisters = compile('print "must not be written";');
  const functions = findSection(excessiveRegisters, 3);
  excessiveRegisters.writeUInt16LE(
    SANDBOX_LIMITS.MAX_REGISTERS_PER_FUNCTION + 1,
    functions.offset + 16,
  );
  assertRejectedWithoutOutput(
    excessiveRegisters,
    /register count exceeds the sandbox limit/,
  );
});

test("rejects decoded instruction counts above the Rust verification budget", () => {
  const move = encodeInstruction("MOVE", { destination: 0, source: 0 });
  const excessiveInstructions = Buffer.concat([
    Buffer.alloc(move.length * SANDBOX_LIMITS.MAX_TOTAL_INSTRUCTIONS, move),
    Buffer.from([OPCODES.HALT]),
  ]);
  const bytecode = encodePortableModule({
    constants: [],
    imports: [],
    functions: [{
      name: null,
      code: excessiveInstructions,
      registerCount: 1,
      parameterTypes: [],
      returnType: "VOID",
    }],
  });

  assertRejectedWithoutOutput(
    bytecode,
    /Instruction count exceeds the sandbox limit/,
  );
});

test("rejects invalid expression operand types during Rust verification", () => {
  assertRejectedWithoutOutput(createInvalidBooleanAddModule(), /ADD operands must be I64 or F64/);
});

test("rejects host arguments that are not typed on every conditional path", () => {
  assertRejectedWithoutOutput(
    createInvalidConditionalHostModule(),
    /HOST_CALL argument type must match on every control-flow path/,
  );
});

test("rejects trailing data before producing host output", () => {
  const bytecode = Buffer.concat([
    compile('print "must not be written";'),
    Buffer.from([0]),
  ]);
  assertRejectedWithoutOutput(bytecode, /Unreferenced bytes follow/);
});

test("rejects an unknown opcode", () => {
  const bytecode = compile("");
  const code = findSection(bytecode, 4);
  bytecode[code.offset] = 254;
  assertRejectedWithoutOutput(bytecode, /Unsupported portable opcode 254/);
});

test("rejects a truncated operand", () => {
  const bytecode = compile('print "truncated";');
  const code = findSection(bytecode, 4);
  bytecode[code.offset + code.length - 1] = 1;
  assertRejectedWithoutOutput(bytecode, /Unexpected end of bytecode/);
});

test("rejects malformed debug metadata before execution", () => {
  const zeroLine = compile("1;");
  const zeroLineDebug = findSection(zeroLine, 5);
  zeroLine.writeUInt32LE(0, zeroLineDebug.offset + 20);
  const decodeResult = runBytecode(zeroLine, ["--error-format=json"]);
  assertStandardError(decodeResult, "JIMP-2001", "decode");

  const unalignedOffset = compile("1;");
  const unalignedDebug = findSection(unalignedOffset, 5);
  unalignedOffset.writeUInt32LE(1, unalignedDebug.offset + 12);
  const verifyResult = runBytecode(unalignedOffset, ["--error-format=json"]);
  assertStandardError(verifyResult, "JIMP-2002", "verify");

  const invalidSource = compile("1;");
  const invalidSourceDebug = findSection(invalidSource, 5);
  invalidSource.writeUInt32LE(0, invalidSourceDebug.offset + 16);
  const sourceResult = runBytecode(invalidSource, ["--error-format=json"]);
  assertStandardError(sourceResult, "JIMP-2001", "decode");
});

test("rejects malformed build metadata before capability resolution", async () => {
  const projectDirectory = join(temporaryDirectory, "malformed-build-project");
  mkdirSync(projectDirectory, { recursive: true });
  const entryPath = join(projectDirectory, "main.jimp");
  writeFileSync(entryPath, "1;");
  const bytecode = await compileProject(entryPath);
  const build = findSection(bytecode, 6);
  bytecode.writeUInt16LE(0, build.offset + 4);
  const result = runBytecode(bytecode, ["--error-format=json"]);
  assertStandardError(result, "JIMP-2001", "decode");
});

test("resolves portable host imports across JavaScript and Rust", () => {
  const result = runBytecode(createPortableModule(), ["--validate-portable"]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Portable module valid and execution-ready: 1 host import\(s\) resolved/);
  assert.equal(result.stderr, "");
});

test("rejects a portable capability denied by host policy", () => {
  const bytecode = createPortableModule({ namespace: "std.network", name: "fetch" });
  const result = runBytecode(bytecode, ["--validate-portable"]);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /denied by capability policy/);
});

test("rejects a portable host signature mismatch", () => {
  const bytecode = createPortableModule({ parameterType: "I64" });
  const result = runBytecode(bytecode, ["--validate-portable"]);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /incompatible signature/);
});
