import assert from "node:assert/strict";
import test from "node:test";
import { compile } from "../src/compiler.js";
import { decodePortableModule } from "../src/portable/module.js";

test("compiles print statements into portable bytecode", () => {
  const bytecode = compile('// greeting\nprint "Hello, JIMP!";\n');
  const module = decodePortableModule(bytecode);
  assert.equal(bytecode.subarray(0, 4).toString(), "JIMP");
  assert.equal(bytecode.readUInt16LE(4), 2);
  assert.equal(bytecode.readUInt16LE(6), 1);
  assert.equal(module.imports[0].symbol, "std.console.write");
  assert.deepEqual(
    module.functions[0].instructions.map(({ name }) => name),
    ["LOAD_CONST", "HOST_CALL", "LOAD_CONST", "HOST_CALL", "HALT"],
  );
});

test("reports the source line for unsupported syntax", () => {
  assert.throws(() => compile("function answer() {}"), /line 1/);
});

test("compiles integer, floating-point, boolean, and null literals", () => {
  const module = decodePortableModule(compile(`
    42;
    -3.5
    6.02e23;
    true;
    false;
    null;
  `));

  assert.deepEqual(module.constants, [
    { type: "I64", value: 42n },
    { type: "F64", value: -3.5 },
    { type: "F64", value: 6.02e23 },
    { type: "BOOL", value: true },
    { type: "BOOL", value: false },
    { type: "NULL", value: null },
  ]);
  assert.deepEqual(
    module.functions[0].instructions.map(({ name }) => name),
    ["LOAD_CONST", "LOAD_CONST", "LOAD_CONST", "LOAD_CONST", "LOAD_CONST", "LOAD_CONST", "HALT"],
  );
  assert.equal(module.functions[0].registerCount, 1);
});

test("accepts the complete signed i64 range", () => {
  const module = decodePortableModule(compile(`
    -9223372036854775808;
    9223372036854775807;
  `));

  assert.deepEqual(module.constants, [
    { type: "I64", value: -9223372036854775808n },
    { type: "I64", value: 9223372036854775807n },
  ]);
});

test("rejects scalar literals outside their portable ranges", () => {
  assert.throws(
    () => compile("9223372036854775808;"),
    /outside the i64 range at line 1/,
  );
  assert.throws(
    () => compile("1e309;"),
    /outside the finite f64 range at line 1/,
  );
});

test("allocates persistent registers for immutable and mutable variables", () => {
  const module = decodePortableModule(compile(`
    let answer = 42;
    answer;
    var state = false;
    state = true;
    state;
  `));
  const func = module.functions[0];

  assert.deepEqual(module.constants, [
    { type: "I64", value: 42n },
    { type: "BOOL", value: false },
    { type: "BOOL", value: true },
  ]);
  assert.equal(func.registerCount, 3);
  assert.deepEqual(
    func.instructions.map(({ name, operands }) => ({ name, operands })),
    [
      { name: "LOAD_CONST", operands: { destination: 2, constant: 0 } },
      { name: "MOVE", operands: { destination: 0, source: 2 } },
      { name: "MOVE", operands: { destination: 2, source: 0 } },
      { name: "LOAD_CONST", operands: { destination: 2, constant: 1 } },
      { name: "MOVE", operands: { destination: 1, source: 2 } },
      { name: "LOAD_CONST", operands: { destination: 2, constant: 2 } },
      { name: "MOVE", operands: { destination: 1, source: 2 } },
      { name: "MOVE", operands: { destination: 2, source: 1 } },
      { name: "HALT", operands: {} },
    ],
  );
});

test("supports string initializers and reuses a temporary register", () => {
  const module = decodePortableModule(compile(`
    let greeting = "Hello";
    var count = 1;
    count = 2;
  `));

  assert.deepEqual(module.constants, [
    { type: "STRING", value: "Hello" },
    { type: "I64", value: 1n },
    { type: "I64", value: 2n },
  ]);
  assert.equal(module.functions[0].registerCount, 3);
});

test("lowers arithmetic expressions with deterministic precedence", () => {
  const module = decodePortableModule(compile(`
    let result = 2 + 3 * 4 - 5 % 2;
    result;
  `));
  const func = module.functions[0];

  assert.deepEqual(
    func.instructions.map(({ name }) => name),
    [
      "LOAD_CONST", "LOAD_CONST", "LOAD_CONST", "MULTIPLY", "ADD",
      "LOAD_CONST", "LOAD_CONST", "REMAINDER", "SUBTRACT", "MOVE", "MOVE", "HALT",
    ],
  );
  assert.equal(func.registerCount, 4);
});

test("lowers comparison, equality, unary, and eager boolean expressions", () => {
  const module = decodePortableModule(compile(`
    let condition = 1 + 2 * 3 >= 7 && !false || 4 != 5;
    condition;
    "same" == "same";
    null != null;
  `));
  const names = module.functions[0].instructions.map(({ name }) => name);

  for (const expected of [
    "MULTIPLY", "ADD", "GREATER_EQUAL", "BOOL_NOT", "BOOL_AND", "NOT_EQUAL", "BOOL_OR", "EQUAL",
  ]) {
    assert(names.includes(expected), `Expected ${expected} in ${names.join(", ")}`);
  }
});

test("uses variables and parentheses inside expressions", () => {
  const module = decodePortableModule(compile(`
    var total = 2;
    total = -(total + 3) * -2;
    total == 10;
  `));
  const names = module.functions[0].instructions.map(({ name }) => name);

  assert(names.includes("NEGATE"));
  assert(names.includes("MULTIPLY"));
  assert(names.includes("EQUAL"));
});

test("rejects incompatible expression operand types", () => {
  const invalidExpressions = [
    ["1 + true;", /Operator "\+" does not accept I64 and BOOL/],
    ["1 + 1.0;", /Operator "\+" does not accept I64 and F64/],
    ['"a" < "b";', /Operator "<" does not accept STRING and STRING/],
    ["true && 1;", /Operator "&&" does not accept BOOL and I64/],
    ["!1;", /Operator "!" does not accept I64/],
    ["print 1;", /print requires a STRING expression, received I64/],
  ];

  for (const [source, diagnostic] of invalidExpressions) {
    assert.throws(() => compile(source), diagnostic);
  }
});

test("rejects duplicate declarations and use before declaration", () => {
  assert.throws(
    () => compile("let value = 1;\nvar value = 2;"),
    /already declared at line 2.*first declaration is at line 1/,
  );
  assert.throws(
    () => compile("value;\nlet value = 1;"),
    /Variable "value" is not declared at line 1/,
  );
  assert.throws(
    () => compile("value = 1;"),
    /Variable "value" is not declared at line 1/,
  );
});

test("rejects reassignment of immutable variables and reserved names", () => {
  assert.throws(
    () => compile("let value = 1;\nvalue = 2;"),
    /Cannot assign to immutable variable "value" at line 2/,
  );
  assert.throws(
    () => compile("let null = 1;"),
    /Reserved word "null" cannot be used as a variable name at line 1/,
  );
});

test("accepts the complete v1 surface syntax", () => {
  const bytecode = compile(`
    // Standalone comments and blank lines are valid.
    print "Semicolon";
    print "Optional semicolon and escapes: \\\\ \\" \\n \\r \\t"
  `);

  const module = decodePortableModule(bytecode);
  assert.deepEqual(
    module.functions[0].instructions.map(({ name }) => name),
    [
      "LOAD_CONST", "HOST_CALL", "LOAD_CONST", "HOST_CALL",
      "LOAD_CONST", "HOST_CALL", "LOAD_CONST", "HOST_CALL", "HALT",
    ],
  );
});

test("rejects syntax excluded from v1", () => {
  const invalidSources = [
    'PRINT "Case-sensitive";',
    'print"Whitespace is required";',
    'print "Inline comment"; // invalid',
    'print "Unsupported escape: \\u0041";',
    'print "One"; print "Two";',
    "01;",
    ".5;",
    "true false;",
    "let missingInitializer;",
    "var value = other;",
  ];

  for (const source of invalidSources) {
    assert.throws(() => compile(source), /line 1/);
  }
});
