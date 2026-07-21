import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const npmCli = process.env.npm_execpath;

function command(executable, argumentsList, cwd) {
  return spawnSync(executable, argumentsList, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
}

function npmCommand(argumentsList, cwd) {
  assert(npmCli, "npm_execpath must be available when this test runs through npm.");
  return command(process.execPath, [npmCli, ...argumentsList], cwd);
}

test("installs and runs the source-distributed toolchain outside the repository", () => {
  const root = mkdtempSync(join(tmpdir(), "jimp-package-"));
  try {
    const packageDirectory = join(root, "package");
    const installationDirectory = join(root, "installation");
    mkdirSync(packageDirectory);
    mkdirSync(installationDirectory);

    const packed = npmCommand(
      ["pack", "--pack-destination", packageDirectory, "--json"],
      repositoryRoot,
    );
    assert.equal(packed.status, 0, packed.error?.message ?? packed.stderr);
    const packageName = JSON.parse(packed.stdout)[0].filename;
    const packagePath = join(packageDirectory, packageName);

    const installed = npmCommand([
      "install",
      "--prefix",
      installationDirectory,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      packagePath,
    ], root);
    assert.equal(installed.status, 0, installed.error?.message ?? installed.stderr);

    const installedPackage = join(
      installationDirectory,
      "node_modules",
      "jimp-language",
    );
    const cli = join(installedPackage, "bin", "jimp.js");
    const version = command(process.execPath, [cli, "--version"], root);
    assert.equal(version.status, 0, version.stderr);
    assert.equal(version.stdout.trim(), "jimp 0.1.0 runtime-protocol 1");

    const built = npmCommand([
      "run",
      "build:runtime",
      "--prefix",
      installedPackage,
      "--",
      "--quiet",
    ], root);
    assert.equal(built.status, 0, built.stderr);

    const executed = command(process.execPath, [
      cli,
      "run",
      join(installedPackage, "examples", "hello.jimp"),
    ], root);
    assert.equal(executed.status, 0, executed.stderr);
    assert.equal(executed.stdout.replaceAll("\r\n", "\n"), "Hello, JIMP!\n");

    const packageDefinitionPath = join(installedPackage, "package.json");
    const packageDefinition = JSON.parse(readFileSync(packageDefinitionPath, "utf8"));
    packageDefinition.version = "0.1.1";
    writeFileSync(packageDefinitionPath, `${JSON.stringify(packageDefinition, null, 2)}\n`);
    const incompatible = command(process.execPath, [
      cli,
      "run",
      join(installedPackage, "examples", "hello.jimp"),
      "--error-format=json",
    ], root);
    assert.equal(incompatible.status, 2);
    const error = JSON.parse(incompatible.stderr);
    assert.equal(error.code, "JIMP-0001");
    assert.match(error.message, /expected handshake.*0\.1\.1/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
