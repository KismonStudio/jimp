import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { compile } from "../compiler/src/compiler.js";
import { NO_REGISTER } from "../compiler/src/generated/isa.js";
import {
  encodeInstruction,
  encodePortableModule,
} from "../compiler/src/portable/module.js";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const runtimeManifest = join(repositoryRoot, "runtime", "Cargo.toml");
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
  bytecode[code.offset] = 42;
  assertRejectedWithoutOutput(bytecode, /Unsupported portable opcode 42/);
});

test("rejects a truncated operand", () => {
  const bytecode = compile('print "truncated";');
  const code = findSection(bytecode, 4);
  bytecode[code.offset + code.length - 1] = 1;
  assertRejectedWithoutOutput(bytecode, /Unexpected end of bytecode/);
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
