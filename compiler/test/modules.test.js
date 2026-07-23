import assert from "node:assert/strict";
import test from "node:test";
import { analyzeProgram } from "../src/analyzer.js";
import { compile } from "../src/compiler.js";
import { ERROR_CODES, formatError, normalizeError } from "../src/errors.js";
import { parseProgram } from "../src/parser.js";

const mathImport = Object.freeze({
  specifier: "./math.aur",
  imported: "add",
  local: "sum",
  moduleId: "math.aur",
  parameterTypes: ["I64", "I64"],
  returnType: "I64",
});

test("parses named imports, aliases, and exported functions", () => {
  const program = parseProgram(`
    // Imports may follow trivia.
    import { add, multiply as mul } from "./math.aur";

    export function calculate(value: I64): I64 {
      return mul(add(value, 1), 2);
    }
  `, { moduleId: "lib/calculate.aur", isEntry: false });

  assert.equal(program.moduleId, "lib/calculate.aur");
  assert.equal(program.isEntry, false);
  assert.deepEqual(program.imports, [{
    kind: "importDeclaration",
    line: 3,
    specifier: "./math.aur",
    items: [
      { imported: "add", local: "add", line: 3 },
      { imported: "multiply", local: "mul", line: 3 },
    ],
  }]);
  assert.equal(program.statements[0].kind, "functionDeclaration");
  assert.equal(program.statements[0].exported, true);
});

test("rejects invalid module declaration forms and misplaced imports", () => {
  const invalidSources = [
    "import {} from \"./math.aur\";",
    "import { add, } from \"./math.aur\";",
    "import { add } from ./math.aur;",
    "import { add as } from \"./math.aur\";",
    "export let value = 1;",
    "function local(): VOID {\n}\nimport { add } from \"./math.aur\";",
    "function local(): VOID {\n import { add } from \"./math.aur\";\n}",
  ];

  for (const source of invalidSources) {
    assert.throws(() => parseProgram(source), /line/);
  }
});

test("analyzes imported calls and publishes exact export contracts", () => {
  const parsed = parseProgram(`
    import { add as sum } from "./math.aur";
    export function answer(): I64 {
      return sum(20, 22);
    }
    answer();
  `, { moduleId: "main.aur" });
  const program = analyzeProgram(parsed, { resolvedImports: [mathImport] });
  const importedCall = program.functions[0].body.statements[0].expression;

  assert.deepEqual(program.imports, [{
    kind: "imported",
    line: 2,
    localName: "sum",
    importedName: "add",
    specifier: "./math.aur",
    identity: { moduleId: "math.aur", exportName: "add" },
    parameterTypes: ["I64", "I64"],
    returnType: "I64",
  }]);
  assert.deepEqual(program.exports, [{
    kind: "function",
    name: "answer",
    moduleId: "main.aur",
    functionIndex: 1,
    parameterTypes: [],
    returnType: "I64",
  }]);
  assert.equal(importedCall.functionIndex, null);
  assert.deepEqual(importedCall.functionIdentity, {
    moduleId: "math.aur",
    exportName: "add",
  });
  assert.equal(importedCall.type, "I64");
});

test("enforces imported binding conflicts and exact call contracts", () => {
  const analyze = (source, resolvedImports = [mathImport]) => analyzeProgram(
    parseProgram(source, { moduleId: "main.aur" }),
    { resolvedImports },
  );

  assert.throws(
    () => analyze("import { add as sum } from \"./math.aur\";\nsum(true, 1);"),
    /Module "main\.aur".*argument 0 requires I64, received BOOL/,
  );
  assert.throws(
    () => analyze("import { add as sum } from \"./math.aur\";\nlet sum = 1;"),
    /conflicts with an imported function binding/,
  );
  assert.throws(
    () => analyze("import { add as sum } from \"./math.aur\";\nfunction sum(): VOID {\n}"),
    /conflicts with an imported function binding/,
  );
  assert.throws(
    () => analyze("import { add as sum } from \"./math.aur\";\nfunction local(sum: I64): VOID {\n}"),
    /Parameter "sum" conflicts with an imported function binding/,
  );
  assert.throws(
    () => analyze(
      "import { add, subtract as add } from \"./math.aur\";",
      [{ ...mathImport, local: "add" }],
    ),
    /Imported binding "add" is already declared/,
  );
  assert.throws(
    () => analyze("import { add as import } from \"./math.aur\";", [{
      ...mathImport,
      local: "import",
    }]),
    /Reserved word "import"/,
  );
});

test("rejects unresolved or extraneous import resolutions", () => {
  const parsed = parseProgram(
    "import { add as sum } from \"./math.aur\";",
    { moduleId: "main.aur" },
  );

  assert.throws(
    () => analyzeProgram(parsed),
    /Module "main\.aur": Import "add".*is unresolved at line 1/,
  );
  assert.throws(
    () => analyzeProgram(parseProgram("", { moduleId: "main.aur" }), {
      resolvedImports: [mathImport],
    }),
    /Resolved import "sum".*is not declared by the module/,
  );
});

test("rejects executable statements in non-entry modules", () => {
  assert.doesNotThrow(() => analyzeProgram(parseProgram(
    "export function value(): I64 {\n return 1;\n}",
    { moduleId: "lib/value.aur", isEntry: false },
  )));
  assert.throws(
    () => analyzeProgram(parseProgram("1;", {
      moduleId: "lib/effect.aur",
      isEntry: false,
    })),
    /Module "lib\/effect\.aur": Executable statements are only valid in the entry module at line 1/,
  );
});

test("keeps single-file lowering compatible and blocks unresolved graph lowering", () => {
  assert.doesNotThrow(() => compile(`
    export function identity(value: I64): I64 {
      return value;
    }
    identity(1);
  `));
  assert.throws(
    () => compile("import { add } from \"./math.aur\";\nadd(1, 2);"),
    /Source imports require project graph compilation at line 1/,
  );
});

test("qualifies parser diagnostics with the portable module ID", () => {
  let diagnostic;
  try {
    parseProgram("export let value = 1;", { moduleId: "lib/value.aur" });
  } catch (error) {
    diagnostic = error;
  }
  assert.match(
    diagnostic.message,
    /Module "lib\/value\.aur": Only a top-level function, record, or variant declaration may be exported at line 1/,
  );
  const normalized = normalizeError(diagnostic, ERROR_CODES.COMPILE);
  assert.deepEqual(normalized.location, {
    kind: "source",
    line: 1,
    moduleId: "lib/value.aur",
  });
  assert.match(formatError(normalized), /at source lib\/value\.aur:1/);
});

test("publishes and consumes exact nominal record contracts", () => {
  const model = analyzeProgram(parseProgram(`
    export record Point {
      x: I64,
      y: I64,
    }
    export function move(point: Point): Point {
      return point with { x: 4 };
    }
  `, { moduleId: "model.aur", isEntry: false }));
  const record = model.exports.find(({ kind }) => kind === "record");
  const move = model.exports.find(({ kind }) => kind === "function");
  const main = analyzeProgram(parseProgram(`
    import { Point, move } from "./model.aur";
    let point = move(Point { x: 0, y: 0 });
    point.x;
  `, { moduleId: "main.aur" }), {
    resolvedImports: [
      {
        specifier: "./model.aur",
        imported: "Point",
        local: "Point",
        moduleId: "model.aur",
        ...record,
      },
      {
        specifier: "./model.aur",
        imported: "move",
        local: "move",
        moduleId: "model.aur",
        ...move,
      },
    ],
  });

  assert.equal(main.statements[0].type, record.type);
  assert.equal(main.statements[1].type, "I64");
  assert.deepEqual(move.parameterTypes, [record.type]);
  assert.equal(move.returnType, record.type);
});
