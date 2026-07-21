#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const suiteRoot = join(packageRoot, "conformance", "v1");
const manifest = JSON.parse(await readFile(join(suiteRoot, "manifest.json"), "utf8"));
const temporaryDirectory = await mkdtemp(join(tmpdir(), "jimp-conformance-"));

function option(name) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return match?.slice(prefix.length);
}

const cliPath = resolve(option("jimp") ?? join(packageRoot, "bin", "jimp.js"));
const explicitRuntime = option("runtime");

function invoke(argumentsList, runtimeOverride = explicitRuntime) {
  const needsRuntime = ["run", "check"].includes(argumentsList[0]);
  const finalArguments = [
    ...argumentsList,
    ...(needsRuntime && runtimeOverride ? [`--runtime=${resolve(runtimeOverride)}`] : []),
  ];
  const script = extname(cliPath) === ".js";
  return spawnSync(script ? process.execPath : cliPath, script ? [cliPath, ...finalArguments] : finalArguments, {
    cwd: packageRoot,
    encoding: "utf8",
    windowsHide: true,
  });
}

async function compileFixture(testCase, outputPath, argumentsList = []) {
  const fixturePath = join(suiteRoot, testCase.fixture);
  const result = invoke(["compile", fixturePath, "-o", outputPath, ...argumentsList], undefined);
  if (result.status !== 0) throw new Error(`Preparation failed for ${testCase.id}: ${result.stderr}`);
}

async function prepare(testCase) {
  if (testCase.base64) {
    const bytecodePath = join(temporaryDirectory, `${testCase.id}.jbc`);
    await writeFile(bytecodePath, Buffer.from(testCase.base64, "base64"));
    return { inputPath: bytecodePath };
  }
  const fixturePath = join(suiteRoot, testCase.fixture);
  if (!testCase.prepare) return { inputPath: fixturePath };
  const bytecodePath = join(temporaryDirectory, `${testCase.id}.jbc`);
  if (testCase.prepare === "native-profile-bytecode") {
    await compileFixture(testCase, bytecodePath, ["--target-profile=reference-native-i64"]);
    return { inputPath: bytecodePath };
  }
  if (["unsupported-format-version", "denied-host-capability"].includes(testCase.prepare)) {
    await compileFixture(testCase, bytecodePath);
    const bytecode = await readFile(bytecodePath);
    if (testCase.prepare === "unsupported-format-version") {
      bytecode.writeUInt16LE(0xffff, 6);
    } else {
      const original = Buffer.from("std.console");
      const replacement = Buffer.from("std.network");
      const offset = bytecode.indexOf(original);
      if (offset < 0) throw new Error("Cannot locate the capability namespace to mutate.");
      replacement.copy(bytecode, offset);
    }
    await writeFile(bytecodePath, bytecode);
    return { inputPath: bytecodePath };
  }
  if (testCase.prepare === "incompatible-runtime") {
    return { inputPath: fixturePath, runtimePath: process.execPath };
  }
  throw new Error(`Unknown preparation "${testCase.prepare}".`);
}

function assertResult(testCase, result) {
  const stdout = result.stdout.replaceAll("\r\n", "\n");
  const stderr = result.stderr.replaceAll("\r\n", "\n");
  if (result.status !== testCase.expected.status) {
    throw new Error(`Expected status ${testCase.expected.status}, received ${result.status}: ${stderr}`);
  }
  if (testCase.expected.stdout !== undefined && stdout !== testCase.expected.stdout) {
    throw new Error(`Unexpected stdout: ${JSON.stringify(stdout)}`);
  }
  if (testCase.expected.error) {
    let diagnostic;
    try {
      diagnostic = JSON.parse(stderr);
    } catch {
      throw new Error(`Expected one JSON diagnostic, received: ${JSON.stringify(stderr)}`);
    }
    for (const field of ["code", "phase"]) {
      if (diagnostic[field] !== testCase.expected.error[field]) {
        throw new Error(`Expected ${field} ${testCase.expected.error[field]}, received ${diagnostic[field]}.`);
      }
    }
    if (testCase.expected.error.source && diagnostic.location?.kind !== "source") {
      throw new Error("Expected source location metadata.");
    }
    const message = testCase.expected.error.messageIncludes;
    if (message && !diagnostic.message.includes(message)) {
      throw new Error(`Expected diagnostic message to include "${message}".`);
    }
    if (stdout !== "") throw new Error(`Rejected case produced stdout: ${JSON.stringify(stdout)}`);
  }
  return { stdout, stderr, status: result.status };
}

let failed = 0;
try {
  if (manifest.schema !== "jimp-conformance-v1" || manifest.suiteVersion !== 1) {
    throw new Error("Unsupported conformance manifest.");
  }
  for (const testCase of manifest.cases) {
    try {
      const prepared = await prepare(testCase);
      let previous;
      for (let attempt = 0; attempt < (testCase.repeat ?? 1); attempt += 1) {
        const result = invoke([
          testCase.command,
          prepared.inputPath,
          ...(testCase.arguments ?? []),
          ...(testCase.expected.error ? ["--error-format=json"] : []),
        ], prepared.runtimePath ?? explicitRuntime);
        const observed = assertResult(testCase, result);
        if (previous && JSON.stringify(observed) !== JSON.stringify(previous)) {
          throw new Error("Repeated execution was not deterministic.");
        }
        previous = observed;
      }
      process.stdout.write(`PASS ${testCase.contract}/${testCase.id}\n`);
    } catch (error) {
      failed += 1;
      process.stderr.write(`FAIL ${testCase.contract}/${testCase.id}: ${error.message}\n`);
    }
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

if (failed > 0) {
  process.stderr.write(`${failed} conformance case(s) failed.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${manifest.cases.length} conformance case(s) passed.\n`);
}
