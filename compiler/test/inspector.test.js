import assert from "node:assert/strict";
import test from "node:test";
import { compile } from "../src/compiler.js";
import { decodeBytecode, formatInspection } from "../src/inspector.js";

test("decodes a valid program with offsets and operands", () => {
  const program = decodeBytecode(compile('print "Hello!";'));

  assert.deepEqual(program.header, {
    magic: "JIMP",
    version: 1,
    instructionCount: 2,
    headerSize: 10,
    fileSize: 20,
  });
  assert.deepEqual(program.instructions[0], {
    index: 0,
    offset: 10,
    size: 9,
    opcode: 1,
    name: "PRINT",
    operand: { byteLength: 6, value: "Hello!" },
  });
  assert.equal(program.instructions[1].name, "HALT");
});

test("formats a readable disassembly", () => {
  const output = formatInspection(decodeBytecode(compile('print "Hello!";')));
  assert.match(output, /Version: 1/);
  assert.match(output, /\[0000\] @0x0000000a PRINT length=6 value="Hello!"/);
  assert.match(output, /\[0001\] @0x00000013 HALT/);
});

test("rejects instructions declared after HALT", () => {
  const bytecode = compile("");
  bytecode.writeUInt32LE(2, 6);
  assert.throws(() => decodeBytecode(bytecode), /HALT must be the final instruction/);
});

test("rejects an instruction count beyond the available bytes", () => {
  const bytecode = compile("").subarray(0, 10);
  assert.throws(() => decodeBytecode(bytecode), /Unexpected end of bytecode/);
});

test("rejects trailing data", () => {
  const bytecode = Buffer.concat([compile(""), Buffer.from([0])]);
  assert.throws(() => decodeBytecode(bytecode), /Trailing data/);
});
