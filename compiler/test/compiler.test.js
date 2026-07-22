import assert from "node:assert/strict";
import test from "node:test";
import { compile } from "../src/compiler.js";
import { decodePortableModule } from "../src/portable/module.js";

test("compiles print statements into portable bytecode", () => {
  const bytecode = compile('// greeting\nprint "Hello, JIMP!";\n');
  const module = decodePortableModule(bytecode);
  assert.equal(bytecode.subarray(0, 4).toString(), "JIMP");
  assert.equal(bytecode.readUInt16LE(4), 2);
  assert.equal(bytecode.readUInt16LE(6), 9);
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

test("lowers comparison, equality, unary, and short-circuit boolean expressions", () => {
  const module = decodePortableModule(compile(`
    let condition = 1 + 2 * 3 >= 7 && !false || 4 != 5;
    condition;
    "same" == "same";
    null != null;
  `));
  const names = module.functions[0].instructions.map(({ name }) => name);

  for (const expected of [
    "MULTIPLY", "ADD", "GREATER_EQUAL", "BOOL_NOT", "JUMP_IF_FALSE",
    "NOT_EQUAL", "JUMP_IF_TRUE", "EQUAL",
  ]) {
    assert(names.includes(expected), `Expected ${expected} in ${names.join(", ")}`);
  }
  assert(!names.includes("BOOL_AND"));
  assert(!names.includes("BOOL_OR"));
});

test("lowers nested if and else blocks to forward generic jumps", () => {
  const module = decodePortableModule(compile(`
    var message = "initial";
    if true {
      if false {
        message = "wrong";
      } else {
        message = "nested";
      }
    } else {
      message = "other";
    }
    print message;
  `));
  const instructions = module.functions[0].instructions;
  const names = instructions.map(({ name }) => name);

  assert.equal(names.filter((name) => name === "JUMP_IF_FALSE").length, 2);
  assert.equal(names.filter((name) => name === "JUMP").length, 2);
  for (const instruction of instructions.filter(({ name }) => name.startsWith("JUMP"))) {
    assert(instruction.operands.target > instruction.offset);
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

test("rejects non-boolean conditions and unjoined conditional type changes", () => {
  assert.throws(
    () => compile("if 1 {\n}\n"),
    /if requires a BOOL condition, received I64 at line 1/,
  );
  assert.throws(
    () => compile(`
      var value = 1;
      if true {
        value = "changed";
      }
    `),
    /Variable "value" has incompatible types across conditional paths/,
  );
});

test("allows mutable variables to converge to a new type across if and else", () => {
  const module = decodePortableModule(compile(`
    var value = 1;
    if false {
      value = "then";
    } else {
      let previous = value + 1;
      value = "else";
    }
    print value;
  `));
  const names = module.functions[0].instructions.map(({ name }) => name);

  assert(names.includes("JUMP_IF_FALSE"));
  assert(names.includes("JUMP"));
  assert(names.includes("ADD"));
  assert.equal(module.functions[0].registerCount >= 3, true);
});

test("rejects divergent types after if and else", () => {
  assert.throws(
    () => compile(`
      var value = 1;
      if true {
        value = "text";
      } else {
        value = false;
      }
    `),
    /Variable "value" has incompatible types across conditional paths/,
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

test("lowers typed and recursive functions to CALL and RETURN", () => {
  const module = decodePortableModule(compile(`
    factorial(5);
    function factorial(value: I64): I64 {
      if value <= 1 {
        return 1;
      } else {
        return value * factorial(value - 1);
      }
    }
  `));

  assert.equal(module.functions.length, 2);
  assert.deepEqual(module.functions[1].parameterTypes, ["I64"]);
  assert.equal(module.functions[1].returnType, "I64");
  assert(module.functions[0].instructions.some(({ name }) => name === "CALL"));
  assert(module.functions[1].instructions.some(({ name }) => name === "CALL"));
  assert.equal(module.functions[1].instructions.at(-1).name, "RETURN");
});

test("reuses consecutive argument registers across calls", () => {
  const module = decodePortableModule(compile(`
    identity(1);
    identity(2);
    identity(3);
    function identity(value: I64): I64 {
      return value;
    }
  `));

  assert.equal(module.functions[0].registerCount, 2);
});

test("lowers while, break, and continue to generic jumps", () => {
  const module = decodePortableModule(compile(`
    var value = 0;
    while value < 5 {
      value = value + 1;
      if value == 2 {
        continue;
      }
      if value == 4 {
        break;
      }
    }
  `));
  const jumps = module.functions[0].instructions.filter(({ name }) => name === "JUMP");

  assert(jumps.length >= 3);
  assert(jumps.some(({ offset, operands }) => operands.target < offset));
});

test("lowers arrays and records to generic immutable heap instructions", () => {
  const module = decodePortableModule(compile(`
    record Point {
      x: I64,
      y: I64,
    }
    let values: [I64] = [1, 2];
    let changed = values with [0] = 3;
    let point = Point { x: 1, y: 2 };
    let moved = point with { y: 4 };
    let equal = changed == [3, 2];
    changed[0];
    changed.length;
    moved.y;
  `));
  const names = module.functions[0].instructions.map(({ name }) => name);

  for (const name of ["HEAP_ALLOC", "HEAP_REPLACE", "HEAP_LOAD", "HEAP_LENGTH", "HEAP_EQUAL"]) {
    assert(names.includes(name), `Expected ${name} in aggregate lowering.`);
  }
});

test("lowers portable Unicode string operations", () => {
  const module = decodePortableModule(compile(`
    let value = "Olá";
    value.length;
    value[2];
    value[0:2];
    value + " mundo";
  `));
  const names = module.functions[0].instructions.map(({ name }) => name);

  for (const name of ["STRING_LENGTH", "STRING_LOAD", "STRING_SLICE", "STRING_CONCAT"]) {
    assert(names.includes(name), `Expected ${name} in string lowering.`);
  }
});
