#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { constants as fileConstants } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rm, rmdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const packageDefinition = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
const protocolVersion = 1;

function option(name) {
  const prefix = `--${name}=`;
  const argument = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return argument?.slice(prefix.length);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

const platform = option("platform");
const runtimeArgument = option("runtime");
const outputArgument = option("output") ?? "release-artifacts";
if (!platform || !runtimeArgument) {
  fail("Usage: node tools/package-release.js --platform=<name> --runtime=<path> [--output=<directory>]");
} else {
  const runtimePath = resolve(repositoryRoot, runtimeArgument);
  const outputDirectory = resolve(repositoryRoot, outputArgument);
  const runtimeName = process.platform === "win32" ? "jimp-runtime.exe" : "jimp-runtime";
  const bundledRuntime = join(repositoryRoot, "runtime", "bin", runtimeName);
  const expectedHandshake = `jimp-runtime ${packageDefinition.version} protocol ${protocolVersion}`;
  const handshake = spawnSync(runtimePath, ["--version"], {
    encoding: "utf8",
    timeout: 5_000,
    windowsHide: true,
  });
  if (handshake.status !== 0 || handshake.stdout.trim() !== expectedHandshake) {
    fail(`Runtime handshake mismatch; expected "${expectedHandshake}".`);
  } else {
    await mkdir(outputDirectory, { recursive: true });
    await mkdir(join(repositoryRoot, "runtime", "bin"), { recursive: true });
    let runtimeCopied = false;
    try {
      await copyFile(runtimePath, bundledRuntime, fileConstants.COPYFILE_EXCL);
      runtimeCopied = true;
      const pack = spawnSync("npm", ["pack", "--pack-destination", outputDirectory], {
        cwd: repositoryRoot,
        encoding: "utf8",
        shell: process.platform === "win32",
        windowsHide: true,
      });
      if (pack.status !== 0) throw new Error(pack.stderr.trim() || "npm pack failed");
      const packedName = pack.stdout.trim().split(/\r?\n/u).at(-1);
      const sourceArchive = join(outputDirectory, packedName);
      const archiveName = `jimp-language-${packageDefinition.version}-${platform}.tgz`;
      const archivePath = join(outputDirectory, archiveName);
      await rm(archivePath, { force: true });
      const archive = await readFile(sourceArchive);
      await writeFile(archivePath, archive);
      if (basename(sourceArchive) !== archiveName) await rm(sourceArchive, { force: true });
      const digest = createHash("sha256").update(archive).digest("hex");
      await writeFile(join(outputDirectory, `${archiveName}.sha256`), `${digest}  ${archiveName}\n`);
      await writeFile(join(outputDirectory, `${archiveName}.json`), `${JSON.stringify({
        schema: "jimp-release-artifact-v1",
        package: packageDefinition.name,
        version: packageDefinition.version,
        platform,
        runtimeProtocol: protocolVersion,
        runtimeHandshake: expectedHandshake,
        archive: archiveName,
        sha256: digest,
      }, null, 2)}\n`);
      process.stdout.write(`Created ${archivePath}\n`);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    } finally {
      if (runtimeCopied) await rm(bundledRuntime, { force: true });
      const entries = await readdir(join(repositoryRoot, "runtime", "bin"));
      if (entries.length === 0) await rmdir(join(repositoryRoot, "runtime", "bin"));
    }
  }
}
