import assert from "node:assert/strict";
import test from "node:test";
import { analyzeProgram } from "../src/analyzer.js";
import { parseProgram } from "../src/parser.js";

function shape(expression) {
  if (expression.kind === "binaryExpression") {
    return [expression.operator, shape(expression.left), shape(expression.right)];
  }
  if (expression.kind === "unaryExpression") {
    return [expression.operator, shape(expression.operand)];
  }
  if (expression.kind === "literal") return expression.value.value;
  return expression.name;
}

test("parses arithmetic precedence and left associativity", () => {
  const arithmetic = parseProgram("1 + 2 * 3;").statements[0].expression;
  const division = parseProgram("8 / 4 / 2;").statements[0].expression;

  assert.deepEqual(shape(arithmetic), ["+", 1n, ["*", 2n, 3n]]);
  assert.deepEqual(shape(division), ["/", ["/", 8n, 4n], 2n]);
});

test("parses comparison and boolean precedence", () => {
  const expression = parseProgram("1 < 2 == true || false && !false;")
    .statements[0].expression;

  assert.deepEqual(
    shape(expression),
    ["||", ["==", ["<", 1n, 2n], true], ["&&", false, ["!", false]]],
  );
});

test("tracks mutable variable types in source order", () => {
  const program = analyzeProgram(parseProgram(`
    var value = 1;
    value = true;
    value && false;
  `));

  assert.equal(program.statements[0].type, "I64");
  assert.equal(program.statements[1].type, "BOOL");
  assert.equal(program.statements[2].type, "BOOL");
});

test("parses nested conditional blocks and both else layouts", () => {
  const program = parseProgram(`
    if true {
      if false {
      } else {
      }
    }
    else {
      print "fallback";
    }
  `);
  const conditional = program.statements[0];

  assert.equal(conditional.kind, "ifStatement");
  assert.equal(conditional.consequent.statements[0].kind, "ifStatement");
  assert.equal(conditional.alternate.statements[0].kind, "print");
});

test("enforces lexical block scope", () => {
  const program = analyzeProgram(parseProgram(`
    let value = 1;
    if true {
      let value = "shadow";
      print value;
    }
    value + 1;
  `));

  assert.notEqual(
    program.statements[0].register,
    program.statements[1].consequent.statements[0].register,
  );
  assert.equal(program.statements[2].type, "I64");
  assert.throws(
    () => analyzeProgram(parseProgram("if true {\n let local = 1;\n}\nlocal;")),
    /Variable "local" is not declared at line 4/,
  );
});

test("joins mutable variable types after conditional paths", () => {
  const program = analyzeProgram(parseProgram(`
    var value = 1;
    if true {
      value = "left";
    } else {
      value = "right";
    }
    print value;
  `));

  assert.equal(program.statements[1].kind, "ifStatement");
  assert.equal(program.statements[2].type, "STRING");
  assert.throws(
    () => analyzeProgram(parseProgram(`
      var value = 1;
      if true {
        value = "changed";
      }
      print value;
    `)),
    /incompatible types across conditional paths/,
  );
});

test("parses and analyzes typed functions, calls, and returns", () => {
  const program = analyzeProgram(parseProgram(`
    let answer = add(20, 22);
    function add(left: I64, right: I64): I64 {
      return left + right;
    }
  `));

  assert.equal(program.statements[0].initializer.kind, "callExpression");
  assert.equal(program.statements[0].initializer.type, "I64");
  assert.equal(program.functions[0].name, "add");
  assert.deepEqual(program.functions[0].parameterTypes, ["I64", "I64"]);
  assert.equal(program.functions[0].body.statements[0].kind, "returnStatement");
});

test("supports recursion and requires exact function contracts", () => {
  assert.doesNotThrow(() => analyzeProgram(parseProgram(`
    function countdown(value: I64): I64 {
      if value == 0 {
        return 0;
      } else {
        return countdown(value - 1);
      }
    }
    countdown(3);
  `)));
  assert.throws(
    () => analyzeProgram(parseProgram("function missing(): I64 {\n  1;\n}")),
    /does not return I64 on every path/,
  );
  assert.throws(
    () => analyzeProgram(parseProgram("function identity(value: I64): I64 {\n return value;\n}\nidentity(true);")),
    /argument 0 requires I64, received BOOL/,
  );
});

test("analyzes loops with break and continue", () => {
  const program = analyzeProgram(parseProgram(`
    var value = 0;
    while value < 10 {
      value = value + 1;
      if value == 2 {
        continue;
      }
      if value == 4 {
        break;
      }
    }
  `));

  assert.equal(program.statements[1].kind, "whileStatement");
  assert.equal(program.statements[1].body.statements[1].consequent.statements[0].kind, "continueStatement");
  assert.throws(
    () => analyzeProgram(parseProgram("break;")),
    /break is only valid inside a loop/,
  );
  assert.throws(
    () => analyzeProgram(parseProgram("var value = 1;\nwhile true {\n value = false;\n}")),
    /must preserve type I64 inside a loop/,
  );
});

test("parses and analyzes typed arrays with functional updates", () => {
  const program = analyzeProgram(parseProgram(`
    let empty: [I64] = [];
    let nested: [[I64]] = [empty, [1, 2]];
    let changed = nested with [0] = [3];
    changed[0][0];
    changed.length;
  `));

  assert.equal(program.statements[0].type, "[I64]");
  assert.equal(program.statements[1].type, "[[I64]]");
  assert.equal(program.statements[2].initializer.kind, "arrayUpdateExpression");
  assert.equal(program.statements[3].type, "I64");
  assert.equal(program.statements[4].type, "I64");
});

test("parses and analyzes nominal records with ordered fields", () => {
  const program = analyzeProgram(parseProgram(`
    record Point {
      x: I64,
      y: I64,
    }
    let point = Point { y: 2, x: 1 };
    let moved = point with { x: 4 };
    moved.x;
  `));

  assert.equal(program.records[0].name, "Point");
  assert.deepEqual(
    program.statements[0].initializer.fields.map(({ name, index }) => [name, index]),
    [["x", 0], ["y", 1]],
  );
  assert.equal(program.statements[1].type, program.records[0].type);
  assert.equal(program.statements[2].type, "I64");
});

test("rejects invalid aggregate construction and mutation", () => {
  for (const [source, diagnostic] of [
    ["let values = [];", /requires a contextual array type/],
    ["let values = [1, true];", /requires I64 elements/],
    ["let values = [1];\nvalues[0] = 2;", /Unexpected token in expression/],
    ["record Pair {\n left: I64\n right: I64\n}\nPair { left: 1 };", /missing field "right"/],
    ["record Pair {\n left: I64\n}\nPair { left: 1, left: 2 };", /duplicated/],
  ]) {
    assert.throws(() => analyzeProgram(parseProgram(source)), diagnostic);
  }
});

test("analyzes Unicode string length, indexing, slicing, and concatenation", () => {
  const program = analyzeProgram(parseProgram(`
    let value = "Olá";
    value.length;
    value[2];
    value[0:2];
    value + " mundo";
  `));

  assert.equal(program.statements[1].expression.memberKind, "stringLength");
  assert.equal(program.statements[2].expression.indexKind, "string");
  assert.equal(program.statements[3].expression.kind, "sliceExpression");
  assert.equal(program.statements[4].expression.operationKind, "stringConcat");
  assert(program.statements.slice(1).every(({ type }) => ["I64", "STRING"].includes(type)));
});
