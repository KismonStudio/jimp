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
  assert.deepEqual(FORMAT_VERSION, { major: 2, minor: 1 });
  assert.equal(NO_REGISTER, 0xffff);
  assert.equal(VALUE_TYPES.STRING, 4);
  assert.equal(VALUE_TYPES.VOID, 255);
  assert.equal(OPCODES.LOAD_CONST, 1);
  assert.equal(OPCODES.HOST_CALL, 3);
  assert.equal(OPCODES.ADD, 11);
  assert.equal(OPCODES.EQUAL, 20);
  assert.equal(OPCODES.BOOL_OR, 32);
  assert.equal(OPCODES.HALT, 255);
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
