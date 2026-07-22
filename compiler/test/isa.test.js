import assert from "node:assert/strict";
import test from "node:test";
import {
  FORMAT_VERSION,
  INSTRUCTIONS,
  NO_REGISTER,
  OPCODES,
  VALUE_TYPES,
} from "../src/generated/isa.js";

test("exposes the portable VM v1 metadata", () => {
  assert.deepEqual(FORMAT_VERSION, { major: 2, minor: 9 });
  assert.equal(NO_REGISTER, 0xffff);
  assert.equal(VALUE_TYPES.STRING, 4);
  assert.equal(VALUE_TYPES.HEAP_REF, 5);
  assert.equal(VALUE_TYPES.VOID, 255);
  assert.equal(OPCODES.LOAD_CONST, 1);
  assert.equal(OPCODES.HOST_CALL, 3);
  assert.equal(OPCODES.HEAP_ALLOC, 4);
  assert.equal(OPCODES.HEAP_LOAD, 5);
  assert.equal(OPCODES.HEAP_LENGTH, 6);
  assert.equal(OPCODES.HEAP_REPLACE, 7);
  assert.equal(OPCODES.HEAP_EQUAL, 8);
  assert.equal(OPCODES.STRING_LENGTH, 60);
  assert.equal(OPCODES.STRING_LOAD, 61);
  assert.equal(OPCODES.STRING_SLICE, 62);
  assert.equal(OPCODES.STRING_CONCAT, 63);
  assert.equal(OPCODES.ADD, 11);
  assert.equal(OPCODES.EQUAL, 20);
  assert.equal(OPCODES.BOOL_OR, 32);
  assert.equal(OPCODES.JUMP, 40);
  assert.equal(OPCODES.JUMP_IF_FALSE, 41);
  assert.equal(OPCODES.JUMP_IF_TRUE, 42);
  assert.equal(OPCODES.CALL, 50);
  assert.equal(OPCODES.RETURN, 51);
  assert.equal(OPCODES.HALT, 255);
});

test("defines generic immutable heap operands", () => {
  const allocate = INSTRUCTIONS.find(({ name }) => name === "HEAP_ALLOC");
  const load = INSTRUCTIONS.find(({ name }) => name === "HEAP_LOAD");
  const replace = INSTRUCTIONS.find(({ name }) => name === "HEAP_REPLACE");
  const equal = INSTRUCTIONS.find(({ name }) => name === "HEAP_EQUAL");

  assert.deepEqual(allocate.operands.map(({ name }) => name), [
    "destination", "value_start", "value_count",
  ]);
  assert.deepEqual(load.operands.map(({ name, type }) => [name, type]), [
    ["destination", "register"],
    ["object", "register"],
    ["index", "register"],
    ["result_type", "value_type_tag"],
  ]);
  assert.deepEqual(replace.operands.map(({ name }) => name), [
    "destination", "object", "index", "value",
  ]);
  assert.deepEqual(equal.operands.map(({ name }) => name), [
    "destination", "left", "right",
  ]);
});

test("defines control-flow operands", () => {
  const jump = INSTRUCTIONS.find(({ name }) => name === "JUMP");
  const conditional = INSTRUCTIONS.find(({ name }) => name === "JUMP_IF_FALSE");

  assert.deepEqual(jump.operands, [{ name: "target", type: "code_offset" }]);
  assert.deepEqual(
    conditional.operands,
    [
      { name: "condition", type: "register" },
      { name: "target", type: "code_offset" },
    ],
  );
});

test("defines typed function call and return operands", () => {
  const call = INSTRUCTIONS.find(({ name }) => name === "CALL");
  const returnInstruction = INSTRUCTIONS.find(({ name }) => name === "RETURN");

  assert.deepEqual(
    call.operands.map(({ name, type }) => [name, type]),
    [
      ["function", "function_index"],
      ["argument_start", "register"],
      ["argument_count", "register_count"],
      ["result", "optional_register"],
    ],
  );
  assert.deepEqual(returnInstruction.operands, [{ name: "result", type: "optional_register" }]);
});

test("defines typed unary and binary expression operands", () => {
  const negate = INSTRUCTIONS.find(({ name }) => name === "NEGATE");
  const add = INSTRUCTIONS.find(({ name }) => name === "ADD");

  assert.deepEqual(negate.operands.map(({ name }) => name), ["destination", "operand"]);
  assert.deepEqual(add.operands.map(({ name }) => name), ["destination", "left", "right"]);
});

test("defines every opcode exactly once", () => {
  const opcodes = INSTRUCTIONS.map(({ opcode }) => opcode);
  assert.equal(new Set(opcodes).size, opcodes.length);
});

test("defines the typed HOST_CALL operands", () => {
  const hostCall = INSTRUCTIONS.find(({ name }) => name === "HOST_CALL");
  assert.deepEqual(
    hostCall.operands.map(({ name, type }) => [name, type]),
    [
      ["import", "import_index"],
      ["argument_start", "register"],
      ["argument_count", "register_count"],
      ["result", "optional_register"],
    ],
  );
});
