import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, test } from "node:test";
import { decodePortableModule } from "../src/portable/module.js";
import { decodeBytecode, formatInspection } from "../src/inspector.js";
import {
  assertProjectUnchanged,
  resolveProject,
  validateModuleSpecifier,
} from "../src/project-resolver.js";
import {
  compileProject,
  compileResolvedProject,
} from "../src/linker.js";

const temporaryDirectories = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

function project() {
  const root = mkdtempSync(join(tmpdir(), "jimp-project-"));
  temporaryDirectories.push(root);
  return root;
}

function write(root, path, source) {
  const target = join(root, ...path.split("/"));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source);
  return target;
}

test("resolves source-order dependencies into a deterministic topological graph", async () => {
  const root = project();
  const entry = write(root, "main.jimp", [
    'import { twice } from "./lib/calculate.jimp";',
    "if twice(21) == 42 {",
    '  print "linked";',
    "}",
  ].join("\n"));
  write(root, "lib/calculate.jimp", [
    'import { add } from "../math.jimp";',
    "export function twice(value: I64): I64 {",
    "  return add(value, value);",
    "}",
  ].join("\n"));
  write(root, "math.jimp", [
    "export function add(left: I64, right: I64): I64 {",
    "  return left + right;",
    "}",
  ].join("\n"));

  const graph = await resolveProject(entry);
  assert.equal(graph.entryId, "main.jimp");
  assert.deepEqual(graph.modules.map(({ id }) => id), [
    "math.jimp",
    "lib/calculate.jimp",
    "main.jimp",
  ]);

  const first = await compileResolvedProject(graph);
  const second = await compileProject(entry);
  assert(first.equals(second));
  const module = decodePortableModule(first);
  assert.equal(module.header.minor, 9);
  assert.equal(module.functions.length, 3);
  assert.deepEqual(
    [...new Set(module.debug.map(({ moduleId }) => moduleId))],
    ["main.jimp", "math.jimp", "lib/calculate.jimp"],
  );
  assert(module.functions[1].instructions.some(({ name }) => name === "RETURN"));
  assert(module.functions[2].instructions.some(({ name, operands }) =>
    name === "CALL" && operands.function === 1));
  assert(module.functions[0].instructions.some(({ name, operands }) =>
    name === "CALL" && operands.function === 2));
  const inspection = formatInspection(decodeBytecode(first));
  assert.match(inspection, /@source:math\.jimp:2/);
  assert.match(inspection, /@source:lib\/calculate\.jimp:3/);
});

test("derives portable IDs from an explicit project root", async () => {
  const root = project();
  const entry = write(root, "src/main.jimp", "1;");
  const graph = await resolveProject(entry, { projectRoot: root });

  assert.equal(graph.entryId, "src/main.jimp");
  assert.deepEqual(graph.modules.map(({ id }) => id), ["src/main.jimp"]);
});

test("links nominal records across module and function boundaries", async () => {
  const root = project();
  const entry = write(root, "main.jimp", [
    'import { Point, move } from "./model.jimp";',
    "let origin = Point { x: 0, y: 0 };",
    "let moved = move(origin);",
    "if moved.x == 4 && origin.x == 0 {",
    '  print "records linked";',
    "}",
  ].join("\n"));
  write(root, "model.jimp", [
    "export record Point {",
    "  x: I64,",
    "  y: I64,",
    "}",
    "export function move(point: Point): Point {",
    "  return point with { x: 4 };",
    "}",
  ].join("\n"));

  const module = decodePortableModule(await compileProject(entry));

  assert.equal(module.functions[1].parameterTypes[0], "HEAP_REF");
  assert.equal(module.functions[1].returnType, "HEAP_REF");
  assert(module.functions[0].instructions.some(({ name }) => name === "CALL"));
  assert(module.functions[1].instructions.some(({ name }) => name === "HEAP_REPLACE"));
});

test("links exported generic variants and functions without monomorphization", async () => {
  const root = project();
  const entry = write(root, "main.jimp", [
    'import { Option, unwrapOr } from "./option.jimp";',
    "let value: Option<I64> = Option::Some(42);",
    "unwrapOr(value, 0);",
  ].join("\n"));
  write(root, "option.jimp", [
    "export variant Option<T> {",
    "  None,",
    "  Some(value: T),",
    "}",
    "export function unwrapOr<T>(value: Option<T>, fallback: T): T {",
    "  return match(value) { Some(item) => item, None => fallback };",
    "}",
  ].join("\n"));

  const module = decodePortableModule(await compileProject(entry));

  assert.equal(module.functions.length, 2);
  assert.deepEqual(module.functions[1].parameterTypes, ["HEAP_REF", "HEAP_REF"]);
  assert.equal(module.functions[1].returnType, "HEAP_REF");
  assert(module.functions[0].instructions.some(({ name }) => name === "CALL"));
});

test("resolves standard Option and Result generic variants", async () => {
  const root = project();
  const entry = write(root, "main.jimp", [
    'import { Option } from "std:option";',
    'import { Result } from "std:result";',
    "let optional: Option<I64> = Option::Some(42);",
    'let result: Result<I64, STRING> = Result::Error("failed");',
    "match(optional) { Some(value) => value, None => 0 };",
    "match(result) { Ok(value) => value, Error(_) => 0 };",
  ].join("\n"));

  const module = decodePortableModule(await compileProject(entry));

  assert.equal(module.functions.length, 1);
  assert(module.functions[0].instructions.some(({ name }) => name === "HEAP_ALLOC"));
});

test("canonicalizes a project-root alias before resolving dependencies", async (context) => {
  const physicalRoot = project();
  write(
    physicalRoot,
    "dependency.jimp",
    "export function value(): I64 {\n  return 42;\n}",
  );
  write(physicalRoot, "main.jimp", [
    'import { value } from "./dependency.jimp";',
    "value();",
  ].join("\n"));
  const aliasContainer = project();
  const aliasRoot = join(aliasContainer, "project-alias");
  try {
    symlinkSync(
      physicalRoot,
      aliasRoot,
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if (error.code === "EPERM" || error.code === "EACCES") {
      context.skip("Directory links are unavailable in this environment.");
      return;
    }
    throw error;
  }

  const graph = await resolveProject(join(aliasRoot, "main.jimp"), {
    projectRoot: aliasRoot,
  });

  assert.equal(graph.entryId, "main.jimp");
  assert.deepEqual(graph.modules.map(({ id }) => id), [
    "dependency.jimp",
    "main.jimp",
  ]);
});

test("rejects unsupported source specifiers before filesystem lookup", () => {
  for (const specifier of [
    "math.jimp",
    "/math.jimp",
    "C:/math.jimp",
    "file:math.jimp",
    "https://example.test/math.jimp",
    "./math",
    "./math.JIMP",
    "./nested//math.jimp",
    ".\\math.jimp",
    "./encoded%2fmath.jimp",
    "std:Math/i64",
    "std:math//i64",
    "std:math/i64.jimp",
  ]) {
    assert.throws(
      () => validateModuleSpecifier(specifier, "main.jimp", 3),
      /Module "main\.jimp".*line 3/,
    );
  }
  assert.equal(validateModuleSpecifier("std:math/i64", "main.jimp", 3), "standard");
});

test("links used standard-library exports from the embedded catalog", async () => {
  const root = project();
  const entry = write(root, "main.jimp", [
    'import { absolute, minimum } from "std:math/i64";',
    'import { write, writeLine } from "std:console";',
    "let magnitude = absolute(-5);",
    'write("value=");',
    'writeLine("five");',
  ].join("\n"));

  const graph = await resolveProject(entry);
  assert.deepEqual(graph.modules.map(({ id }) => id), [
    "std:math/i64",
    "std:console",
    "main.jimp",
  ]);
  assert(graph.modules.slice(0, 2).every(({ standard }) => standard));

  const module = decodePortableModule(await compileResolvedProject(graph));
  assert.equal(module.functions.length, 3);
  assert.deepEqual(module.imports.map((hostImport) =>
    `${module.constants[hostImport.namespace].value}.${module.constants[hostImport.name].value}`), [
    "std.console.write",
  ]);
  assert.equal(module.functions[0].instructions.filter(({ name }) => name === "CALL").length, 2);
  assert.equal(module.functions[0].instructions.filter(({ name }) => name === "HOST_CALL").length, 1);
  assert.equal(module.functions[2].instructions.filter(({ name }) => name === "HOST_CALL").length, 2);
});

test("rejects unknown standard modules and unsupported catalog majors", async () => {
  const root = project();
  const unknown = write(root, "unknown.jimp", 'import { value } from "std:unknown";');
  await assert.rejects(
    () => compileProject(unknown),
    /Unknown standard-library module "std:unknown"/,
  );

  const known = write(root, "known.jimp", 'import { absolute } from "std:math\/i64";');
  await assert.rejects(
    () => compileProject(known, { standardLibraryMajor: 2 }),
    /Unsupported standard-library major version 2/,
  );
});

test("selects optional native standard exports only for an explicit target", async () => {
  const root = project();
  const entry = write(root, "main.jimp", [
    'import { absolute } from "std:math/i64";',
    "absolute(-7);",
  ].join("\n"));

  const portable = decodePortableModule(await compileProject(entry));
  assert.equal(portable.functions.length, 2);
  assert.equal(portable.imports.length, 0);
  assert.equal(portable.build.targetProfile, "portable");
  assert.deepEqual(portable.build.guaranteedCapabilities, []);

  const native = decodePortableModule(await compileProject(entry, {
    targetProfile: "reference-native-i64",
  }));
  assert.equal(native.functions.length, 1);
  assert.deepEqual(native.imports.map((hostImport) =>
    `${native.constants[hostImport.namespace].value}.${native.constants[hostImport.name].value}`), [
    "std.math.i64.absolute",
  ]);
  assert.equal(native.functions[0].instructions.at(-2).name, "HOST_CALL");
  assert.equal(native.build.targetProfile, "reference-native-i64");
  assert.deepEqual(native.build.guaranteedCapabilities, [
    "std.math.i64.absolute",
    "std.math.i64.maximum",
    "std.math.i64.minimum",
    "std.math.i64.sign",
  ]);

  await assert.rejects(
    () => compileProject(entry, { targetProfile: "missing" }),
    /Unknown target profile "missing"/,
  );
});

test("rejects root traversal, missing files, invalid UTF-8, and non-regular sources", async () => {
  const root = project();
  const cases = [
    ["traversal.jimp", 'import { value } from "../outside.jimp";', /escapes the project root/],
    ["missing.jimp", 'import { value } from "./absent.jimp";', /Cannot resolve source module/],
  ];
  for (const [name, source, pattern] of cases) {
    const entry = write(root, name, source);
    await assert.rejects(() => compileProject(entry), pattern);
  }

  writeFileSync(join(root, "invalid.jimp"), Buffer.from([0xff, 0xfe]));
  const invalidEntry = write(root, "invalid-entry.jimp", 'import { value } from "./invalid.jimp";');
  await assert.rejects(() => compileProject(invalidEntry), /not valid UTF-8/);

  mkdirSync(join(root, "directory.jimp"));
  const directoryEntry = write(root, "directory-entry.jimp", 'import { value } from "./directory.jimp";');
  await assert.rejects(() => compileProject(directoryEntry), /not a regular file|Cannot read source path/);
});

test("rejects cycles with the portable module path that closes the cycle", async () => {
  const root = project();
  const entry = write(root, "main.jimp", 'import { fromA } from "./a.jimp";');
  write(root, "a.jimp", [
    'import { fromB } from "./b.jimp";',
    "export function fromA(): I64 {",
    "  return fromB();",
    "}",
  ].join("\n"));
  write(root, "b.jimp", [
    'import { fromA } from "./a.jimp";',
    "export function fromB(): I64 {",
    "  return fromA();",
    "}",
  ].join("\n"));

  await assert.rejects(
    () => compileProject(entry),
    /Dependency cycle detected: a\.jimp -> b\.jimp -> a\.jimp/,
  );
});

test("rejects changed snapshots before linking", async () => {
  const root = project();
  const entry = write(root, "main.jimp", "1;");
  const graph = await resolveProject(entry);
  writeFileSync(entry, "2;");

  await assert.rejects(() => assertProjectUnchanged(graph), /changed after graph loading/);
  await assert.rejects(() => compileResolvedProject(graph), /changed after graph loading/);
});

test("rejects missing and private exports with importing-module context", async () => {
  const root = project();
  const entry = write(root, "main.jimp", 'import { hidden } from "./lib.jimp";\nhidden();');
  write(root, "lib.jimp", "function hidden(): VOID {\n}");
  const graph = await resolveProject(entry);

  await assert.rejects(
    () => compileResolvedProject(graph),
    /Module "main\.jimp": Import "hidden".*does not name an exported declaration at line 1/,
  );
});

test("rejects two portable IDs for one physical file", async (context) => {
  const root = project();
  const physicalDirectory = join(root, "physical");
  write(
    root,
    "physical/target.jimp",
    "export function value(): I64 {\n return 1;\n}",
  );
  try {
    symlinkSync(
      physicalDirectory,
      join(root, "alias"),
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if (error.code === "EPERM" || error.code === "EACCES") {
      context.skip("Directory links are unavailable in this environment.");
      return;
    }
    throw error;
  }
  const entry = write(root, "main.jimp", [
    'import { value as direct } from "./physical/target.jimp";',
    'import { value as aliased } from "./alias/target.jimp";',
    "direct() + aliased();",
  ].join("\n"));

  await assert.rejects(
    () => compileProject(entry),
    /resolve to the same physical file/,
  );
});

test("rejects symbolic-link traversal outside the real project root", async (context) => {
  const root = project();
  const outsideRoot = project();
  write(
    outsideRoot,
    "outside.jimp",
    "export function value(): I64 {\n return 1;\n}",
  );
  try {
    symlinkSync(
      outsideRoot,
      join(root, "escape"),
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if (error.code === "EPERM" || error.code === "EACCES") {
      context.skip("Directory links are unavailable in this environment.");
      return;
    }
    throw error;
  }
  const entry = write(root, "main.jimp", 'import { value } from "./escape/outside.jimp";');

  await assert.rejects(
    () => compileProject(entry),
    /resolves outside the real project root/,
  );
});

test("rejects case-conflicting portable IDs on case-insensitive filesystems", async (context) => {
  if (process.platform !== "win32" && process.platform !== "darwin") {
    context.skip("The active filesystem is case-sensitive.");
    return;
  }
  const root = project();
  write(root, "target.jimp", "export function value(): I64 {\n return 1;\n}");
  const entry = write(root, "main.jimp", [
    'import { value as lower } from "./target.jimp";',
    'import { value as upper } from "./TARGET.jimp";',
    "lower() + upper();",
  ].join("\n"));

  await assert.rejects(() => compileProject(entry), /conflict by case/);
});
