import assert from "node:assert/strict";
import test from "node:test";
import { compile } from "../src/compiler.js";
import { decodeBytecode, formatInspection } from "../src/inspector.js";

function sectionOffset(bytecode, expectedKind) {
  const sectionCount = bytecode.readUInt16LE(16);
  for (let index = 0; index < sectionCount; index += 1) {
    const entry = 20 + index * 12;
    if (bytecode.readUInt16LE(entry) === expectedKind) {
      return bytecode.readUInt32LE(entry + 4);
    }
  }
  throw new Error(`Missing section ${expectedKind}.`);
}

test("decodes portable headers, imports, and instructions", () => {
  const module = decodeBytecode(compile('print "Hello!";'));

  assert.equal(module.header.magic, "JIMP");
  assert.equal(module.header.format, "2.0");
  assert.equal(module.header.sectionCount, 4);
  assert.equal(module.imports[0].symbol, "std.console.write");
  assert.deepEqual(module.functions[0].instructions[0], {
    index: 0,
    offset: 0,
    size: 7,
    opcode: 1,
    name: "LOAD_CONST",
    operands: { destination: 0, constant: 2 },
  });
});

test("formats a readable portable disassembly", () => {
  const output = formatInspection(decodeBytecode(compile('print "Hello!";')));
  assert.match(output, /Format: 2\.0/);
  assert.match(output, /std\.console\.write\(STRING\) -> VOID/);
  assert.match(output, /\[0000\] @code\+0x00000000 LOAD_CONST destination=0 constant=2/);
  assert.match(output, /HOST_CALL import=0 argument_start=0 argument_count=1 result=65535/);
  assert.match(output, /HALT/);
});

test("rejects a constant index outside the pool", () => {
  const bytecode = compile('print "Hello!";');
  const codeOffset = sectionOffset(bytecode, 4);
  bytecode.writeUInt32LE(0xffffffff, codeOffset + 3);
  assert.throws(() => decodeBytecode(bytecode), /constant index is out of range/);
});

test("rejects a truncated portable module", () => {
  const bytecode = compile("").subarray(0, 19);
  assert.throws(() => decodeBytecode(bytecode), /Unexpected end of bytecode/);
});

test("rejects trailing data", () => {
  const bytecode = Buffer.concat([compile(""), Buffer.from([0])]);
  assert.throws(() => decodeBytecode(bytecode), /Unreferenced bytes follow/);
});
