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
