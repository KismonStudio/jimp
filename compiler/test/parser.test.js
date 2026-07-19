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
