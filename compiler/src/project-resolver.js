import { createHash } from "node:crypto";
import { open, readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseProgram } from "./parser.js";
import { withModuleContext } from "./module-context.js";
import {
  DEFAULT_STANDARD_LIBRARY_MAJOR,
  resolveStandardModule,
  standardLibraryCatalog,
  standardModuleSource,
} from "./standard-library.js";

function fail(message, moduleId, line) {
  const suffix = line === undefined ? "" : ` at line ${line}`;
  throw withModuleContext(new Error(`${message}${suffix}.`), moduleId);
}

function portablePath(value) {
  return value.split(sep).join("/");
}

function isContained(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function physicalKey(path, caseInsensitive) {
  return caseInsensitive ? path.toLowerCase() : path;
}

async function detectCaseInsensitiveFileSystem(path) {
  const name = basename(path);
  const index = [...name].findIndex((character) => /[A-Za-z]/.test(character));
  if (index < 0) return false;
  const original = name[index];
  const replacement = original === original.toLowerCase()
    ? original.toUpperCase()
    : original.toLowerCase();
  const alias = join(dirname(path), `${name.slice(0, index)}${replacement}${name.slice(index + 1)}`);
  try {
    const [originalStat, aliasStat] = await Promise.all([
      stat(path, { bigint: true }),
      stat(alias, { bigint: true }),
    ]);
    return originalStat.dev === aliasStat.dev && originalStat.ino === aliasStat.ino;
  } catch {
    return false;
  }
}

function snapshotKey(snapshot) {
  return [snapshot.dev, snapshot.ino, snapshot.size, snapshot.mtimeNs, snapshot.ctimeNs].join(":");
}

async function readSourceSnapshot(path, moduleId, contextModuleId, line) {
  let handle;
  try {
    const initial = await stat(path, { bigint: true });
    if (!initial.isFile()) {
      fail(`Source path "${moduleId}" is not a regular file`, contextModuleId, line);
    }
    handle = await open(path, "r");
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) {
      fail(`Source path "${moduleId}" is not a regular file`, contextModuleId, line);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    const beforeSnapshot = {
      dev: before.dev,
      ino: before.ino,
      size: before.size,
      mtimeNs: before.mtimeNs,
      ctimeNs: before.ctimeNs,
    };
    const afterSnapshot = {
      dev: after.dev,
      ino: after.ino,
      size: after.size,
      mtimeNs: after.mtimeNs,
      ctimeNs: after.ctimeNs,
    };
    if (snapshotKey(beforeSnapshot) !== snapshotKey(afterSnapshot)) {
      fail(`Source path "${moduleId}" changed while it was being read`, contextModuleId, line);
    }
    let source;
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      fail(`Source path "${moduleId}" is not valid UTF-8`, contextModuleId, line);
    }
    return {
      source,
      snapshot: beforeSnapshot,
      digest: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch (error) {
    if (error?.moduleId !== undefined) throw error;
    fail(`Cannot read source path "${moduleId}": ${error.message}`, contextModuleId, line);
  } finally {
    await handle?.close();
  }
}

export function validateModuleSpecifier(specifier, moduleId, line) {
  if (typeof specifier !== "string" || specifier.length === 0) {
    fail("Source module specifier must be a non-empty string", moduleId, line);
  }
  if (specifier.startsWith("std:")) {
    if (!/^std:[a-z][a-z0-9]*(?:\/[a-z][a-z0-9]*)*$/.test(specifier)) {
      fail(`Standard-library specifier "${specifier}" is invalid`, moduleId, line);
    }
    return "standard";
  }
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
    fail(`Source module specifier "${specifier}" must begin with ./ or ../`, moduleId, line);
  }
  if (
    specifier.includes("\0")
    || specifier.includes("\\")
    || specifier.includes("%")
    || specifier.includes("//")
    || specifier.endsWith("/")
    || extname(specifier) !== ".jimp"
  ) {
    fail(`Source module specifier "${specifier}" is invalid`, moduleId, line);
  }
  const segments = specifier.split("/");
  if (segments.some((segment) => segment.length === 0)) {
    fail(`Source module specifier "${specifier}" contains an empty path segment`, moduleId, line);
  }
  return "project";
}

export async function resolveProject(entryPath, {
  projectRoot,
  standardLibraryMajor = DEFAULT_STANDARD_LIBRARY_MAJOR,
} = {}) {
  standardLibraryCatalog(standardLibraryMajor);
  const requestedEntry = resolve(entryPath);
  const requestedRoot = resolve(projectRoot ?? dirname(requestedEntry));
  if (!isContained(requestedRoot, requestedEntry)) {
    throw new Error(`Entry module escapes the project root "${requestedRoot}".`);
  }
  const entryRelativePath = relative(requestedRoot, requestedEntry);
  let lexicalRoot;
  try {
    lexicalRoot = await realpath(requestedRoot);
    const rootStat = await stat(lexicalRoot);
    if (!rootStat.isDirectory()) throw new Error("project root is not a directory");
  } catch (error) {
    throw new Error(`Cannot use project root "${requestedRoot}": ${error.message}.`);
  }
  const lexicalEntry = resolve(lexicalRoot, entryRelativePath);
  const physicalRoot = lexicalRoot;
  const caseInsensitiveFileSystem = await detectCaseInsensitiveFileSystem(physicalRoot);

  const modulesById = new Map();
  const modulesByPhysicalPath = new Map();
  const caseAliases = new Map();
  const states = new Map();
  const stack = [];
  const orderedModules = [];

  async function loadStandardModule(specifier, importingModule, importLine) {
    const state = states.get(specifier);
    if (state === "visiting") {
      const cycleStart = stack.indexOf(specifier);
      const cycle = [...stack.slice(cycleStart), specifier].join(" -> ");
      fail(`Dependency cycle detected: ${cycle}`, importingModule?.id, importLine);
    }
    if (state === "visited") return modulesById.get(specifier);

    let catalogModule;
    try {
      catalogModule = resolveStandardModule(specifier, standardLibraryMajor);
    } catch (error) {
      fail(error.message, importingModule?.id, importLine);
    }
    if (catalogModule === null) {
      fail(`Unknown standard-library module "${specifier}"`, importingModule?.id, importLine);
    }
    const source = standardModuleSource(catalogModule);
    const module = {
      id: specifier,
      standard: true,
      catalogModule,
      source,
      parsed: null,
      dependencies: [],
    };
    modulesById.set(specifier, module);
    states.set(specifier, "visiting");
    stack.push(specifier);
    module.parsed = parseProgram(source, { moduleId: specifier, isEntry: false });
    for (const declaration of module.parsed.imports) {
      const kind = validateModuleSpecifier(declaration.specifier, module.id, declaration.line);
      if (kind !== "standard") {
        fail("Standard-library modules cannot import project files", module.id, declaration.line);
      }
      const dependency = await loadStandardModule(declaration.specifier, module, declaration.line);
      module.dependencies.push({ declaration, moduleId: dependency.id });
    }
    stack.pop();
    states.set(specifier, "visited");
    orderedModules.push(module);
    return module;
  }

  async function loadModule(lexicalPath, importingModule, importLine) {
    const moduleId = portablePath(relative(lexicalRoot, lexicalPath));
    if (moduleId === "" || moduleId.startsWith("../") || moduleId === "..") {
      fail(`Resolved source path escapes project root "${portablePath(lexicalRoot)}"`, importingModule?.id, importLine);
    }
    if (extname(moduleId) !== ".jimp") {
      fail(`Resolved source path "${moduleId}" must use the exact .jimp extension`, importingModule?.id, importLine);
    }
    const foldedId = moduleId.toLowerCase();
    const existingCase = caseAliases.get(foldedId);
    if (caseInsensitiveFileSystem && existingCase !== undefined && existingCase !== moduleId) {
      fail(`Portable module IDs "${existingCase}" and "${moduleId}" conflict by case`, importingModule?.id, importLine);
    }
    caseAliases.set(foldedId, moduleId);

    let physicalPath;
    try {
      physicalPath = await realpath(lexicalPath);
    } catch (error) {
      fail(`Cannot resolve source module "${moduleId}": ${error.message}`, importingModule?.id, importLine);
    }
    if (!isContained(physicalRoot, physicalPath)) {
      fail(`Source module "${moduleId}" resolves outside the real project root`, importingModule?.id, importLine);
    }
    const key = physicalKey(physicalPath, caseInsensitiveFileSystem);
    const physicalAlias = modulesByPhysicalPath.get(key);
    if (physicalAlias !== undefined && physicalAlias.id !== moduleId) {
      fail(`Portable module IDs "${physicalAlias.id}" and "${moduleId}" resolve to the same physical file`, importingModule?.id, importLine);
    }

    const state = states.get(moduleId);
    if (state === "visiting") {
      const cycleStart = stack.indexOf(moduleId);
      const cycle = [...stack.slice(cycleStart), moduleId].join(" -> ");
      fail(`Dependency cycle detected: ${cycle}`, importingModule?.id, importLine);
    }
    if (state === "visited") return modulesById.get(moduleId);

    const snapshot = await readSourceSnapshot(
      physicalPath,
      moduleId,
      importingModule?.id ?? moduleId,
      importLine,
    );
    const module = {
      id: moduleId,
      lexicalPath,
      physicalPath,
      source: snapshot.source,
      snapshot: snapshot.snapshot,
      digest: snapshot.digest,
      parsed: null,
      dependencies: [],
    };
    modulesById.set(moduleId, module);
    modulesByPhysicalPath.set(key, module);
    states.set(moduleId, "visiting");
    stack.push(moduleId);
    module.parsed = parseProgram(module.source, {
      moduleId,
      isEntry: moduleId === portablePath(relative(lexicalRoot, lexicalEntry)),
    });

    for (const declaration of module.parsed.imports) {
      const kind = validateModuleSpecifier(declaration.specifier, module.id, declaration.line);
      if (kind === "standard") {
        const dependency = await loadStandardModule(declaration.specifier, module, declaration.line);
        module.dependencies.push({ declaration, moduleId: dependency.id });
        continue;
      }
      const candidate = resolve(dirname(module.physicalPath), ...declaration.specifier.split("/"));
      if (!isContained(physicalRoot, candidate)) {
        fail(`Source module specifier "${declaration.specifier}" escapes the project root`, module.id, declaration.line);
      }
      const dependency = await loadModule(candidate, module, declaration.line);
      module.dependencies.push({
        declaration,
        moduleId: dependency.id,
      });
    }
    stack.pop();
    states.set(moduleId, "visited");
    orderedModules.push(module);
    return module;
  }

  const entry = await loadModule(lexicalEntry, null, undefined);
  return {
    projectRoot: physicalRoot,
    standardLibraryMajor,
    entryId: entry.id,
    modules: orderedModules,
  };
}

export async function assertProjectUnchanged(graph) {
  for (const module of graph.modules) {
    if (module.standard) continue;
    let bytes;
    let current;
    try {
      current = await stat(module.physicalPath, { bigint: true });
      bytes = await readFile(module.physicalPath);
    } catch (error) {
      fail(`Cannot verify source module "${module.id}": ${error.message}`, module.id);
    }
    const currentSnapshot = {
      dev: current.dev,
      ino: current.ino,
      size: current.size,
      mtimeNs: current.mtimeNs,
      ctimeNs: current.ctimeNs,
    };
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (snapshotKey(currentSnapshot) !== snapshotKey(module.snapshot) || digest !== module.digest) {
      fail(`Source module "${module.id}" changed after graph loading`, module.id);
    }
  }
}
