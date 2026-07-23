import assert from "node:assert/strict";
import test from "node:test";
import { analyzeProgram } from "../src/analyzer.js";
import { compile } from "../src/compiler.js";
import { ERROR_CODES, formatError, normalizeError } from "../src/errors.js";
import { parseProgram } from "../src/parser.js";

const mathImport = Object.freeze({
  specifier: "./math.jimp",
  imported: "add",
  local: "sum",
  moduleId: "math.jimp",
  parameterTypes: ["I64", "I64"],
  returnType: "I64",
});

test("parses named imports, aliases, and exported functions", () => {
  const program = parseProgram(`
    // Imports may follow trivia.
    import { add, multiply as mul } from "./math.jimp";

    export function calculate(value: I64): I64 {
      return mul(add(value, 1), 2);
    }
  `, { moduleId: "lib/calculate.jimp", isEntry: false });

  assert.equal(program.moduleId, "lib/calculate.jimp");
  assert.equal(program.isEntry, false);
  assert.deepEqual(program.imports, [{
    kind: "importDeclaration",
    line: 3,
    specifier: "./math.jimp",
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
    "import {} from \"./math.jimp\";",
    "import { add, } from \"./math.jimp\";",
    "import { add } from ./math.jimp;",
    "import { add as } from \"./math.jimp\";",
    "export let value = 1;",
    "function local(): VOID {\n}\nimport { add } from \"./math.jimp\";",
    "function local(): VOID {\n import { add } from \"./math.jimp\";\n}",
  ];

  for (const source of invalidSources) {
    assert.throws(() => parseProgram(source), /line/);
  }
});

test("analyzes imported calls and publishes exact export contracts", () => {
  const parsed = parseProgram(`
    import { add as sum } from "./math.jimp";
    export function answer(): I64 {
      return sum(20, 22);
    }
    answer();
  `, { moduleId: "main.jimp" });
  const program = analyzeProgram(parsed, { resolvedImports: [mathImport] });
  const importedCall = program.functions[0].body.statements[0].expression;

  assert.deepEqual(program.imports, [{
    kind: "imported",
    line: 2,
    localName: "sum",
    importedName: "add",
    specifier: "./math.jimp",
    identity: { moduleId: "math.jimp", exportName: "add" },
    parameterTypes: ["I64", "I64"],
    returnType: "I64",
  }]);
  assert.deepEqual(program.exports, [{
    kind: "function",
    name: "answer",
    moduleId: "main.jimp",
    functionIndex: 1,
    parameterTypes: [],
    returnType: "I64",
  }]);
  assert.equal(importedCall.functionIndex, null);
  assert.deepEqual(importedCall.functionIdentity, {
    moduleId: "math.jimp",
    exportName: "add",
  });
  assert.equal(importedCall.type, "I64");
});

test("enforces imported binding conflicts and exact call contracts", () => {
  const analyze = (source, resolvedImports = [mathImport]) => analyzeProgram(
    parseProgram(source, { moduleId: "main.jimp" }),
    { resolvedImports },
  );

  assert.throws(
    () => analyze("import { add as sum } from \"./math.jimp\";\nsum(true, 1);"),
    /Module "main\.jimp".*argument 0 requires I64, received BOOL/,
  );
  assert.throws(
    () => analyze("import { add as sum } from \"./math.jimp\";\nlet sum = 1;"),
    /conflicts with an imported function binding/,
  );
  assert.throws(
    () => analyze("import { add as sum } from \"./math.jimp\";\nfunction sum(): VOID {\n}"),
    /conflicts with an imported function binding/,
  );
  assert.throws(
    () => analyze("import { add as sum } from \"./math.jimp\";\nfunction local(sum: I64): VOID {\n}"),
    /Parameter "sum" conflicts with an imported function binding/,
  );
  assert.throws(
    () => analyze(
      "import { add, subtract as add } from \"./math.jimp\";",
      [{ ...mathImport, local: "add" }],
    ),
    /Imported binding "add" is already declared/,
  );
  assert.throws(
    () => analyze("import { add as import } from \"./math.jimp\";", [{
      ...mathImport,
      local: "import",
    }]),
    /Reserved word "import"/,
  );
});

test("rejects unresolved or extraneous import resolutions", () => {
  const parsed = parseProgram(
    "import { add as sum } from \"./math.jimp\";",
    { moduleId: "main.jimp" },
  );

  assert.throws(
    () => analyzeProgram(parsed),
    /Module "main\.jimp": Import "add".*is unresolved at line 1/,
  );
  assert.throws(
    () => analyzeProgram(parseProgram("", { moduleId: "main.jimp" }), {
      resolvedImports: [mathImport],
    }),
    /Resolved import "sum".*is not declared by the module/,
  );
});

test("rejects executable statements in non-entry modules", () => {
  assert.doesNotThrow(() => analyzeProgram(parseProgram(
    "export function value(): I64 {\n return 1;\n}",
    { moduleId: "lib/value.jimp", isEntry: false },
  )));
  assert.throws(
    () => analyzeProgram(parseProgram("1;", {
      moduleId: "lib/effect.jimp",
      isEntry: false,
    })),
    /Module "lib\/effect\.jimp": Executable statements are only valid in the entry module at line 1/,
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
    () => compile("import { add } from \"./math.jimp\";\nadd(1, 2);"),
    /Source imports require project graph compilation at line 1/,
  );
});

test("qualifies parser diagnostics with the portable module ID", () => {
  let diagnostic;
  try {
    parseProgram("export let value = 1;", { moduleId: "lib/value.jimp" });
  } catch (error) {
    diagnostic = error;
  }
  assert.match(
    diagnostic.message,
    /Module "lib\/value\.jimp": Only a top-level function, record, or variant declaration may be exported at line 1/,
  );
  const normalized = normalizeError(diagnostic, ERROR_CODES.COMPILE);
  assert.deepEqual(normalized.location, {
    kind: "source",
    line: 1,
    moduleId: "lib/value.jimp",
  });
  assert.match(formatError(normalized), /at source lib\/value\.jimp:1/);
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
  `, { moduleId: "model.jimp", isEntry: false }));
  const record = model.exports.find(({ kind }) => kind === "record");
  const move = model.exports.find(({ kind }) => kind === "function");
  const main = analyzeProgram(parseProgram(`
    import { Point, move } from "./model.jimp";
    let point = move(Point { x: 0, y: 0 });
    point.x;
  `, { moduleId: "main.jimp" }), {
    resolvedImports: [
      {
        specifier: "./model.jimp",
        imported: "Point",
        local: "Point",
        moduleId: "model.jimp",
        ...record,
      },
      {
        specifier: "./model.jimp",
        imported: "move",
        local: "move",
        moduleId: "model.jimp",
        ...move,
      },
    ],
  });

  assert.equal(main.statements[0].type, record.type);
  assert.equal(main.statements[1].type, "I64");
  assert.deepEqual(move.parameterTypes, [record.type]);
  assert.equal(move.returnType, record.type);
});
