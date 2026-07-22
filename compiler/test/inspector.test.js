import assert from "node:assert/strict";
import test from "node:test";
import { compile } from "../src/compiler.js";
import { decodeBytecode, formatInspection } from "../src/inspector.js";
import { encodeInstruction, encodePortableModule } from "../src/portable/module.js";

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
  assert.equal(module.header.format, "2.9");
  assert.equal(module.header.sectionCount, 5);
  assert.equal(module.imports[0].symbol, "std.console.write");
  assert.deepEqual(module.functions[0].instructions[0], {
    index: 0,
    offset: 0,
    size: 7,
    opcode: 1,
    name: "LOAD_CONST",
    operands: { destination: 0, constant: 2 },
    sourceLine: 1,
    sourceModuleId: null,
  });
});

test("formats a readable portable disassembly", () => {
  const output = formatInspection(decodeBytecode(compile('print "Hello!";')));
  assert.match(output, /Format: 2\.9/);
  assert.match(output, /std\.console\.write\(STRING\) -> VOID/);
  assert.match(output, /\[0000\] @code\+0x00000000 LOAD_CONST destination=0 constant=2/);
  assert.match(output, /HOST_CALL import=0 argument_start=0 argument_count=1 result=65535/);
  assert.match(output, /@source:1/);
  assert.match(output, /HALT/);
});

test("disassembles generic heap instructions and type tags", () => {
  const bytecode = encodePortableModule({
    constants: [{ type: "I64", value: 0n }],
    imports: [],
    functions: [{
      name: null,
      code: Buffer.concat([
        encodeInstruction("LOAD_CONST", { destination: 0, constant: 0 }),
        encodeInstruction("HEAP_ALLOC", { destination: 1, value_start: 0, value_count: 1 }),
        encodeInstruction("LOAD_CONST", { destination: 2, constant: 0 }),
        encodeInstruction("HEAP_REPLACE", { destination: 3, object: 1, index: 2, value: 0 }),
        encodeInstruction("HEAP_EQUAL", { destination: 4, left: 1, right: 3 }),
        encodeInstruction("HEAP_LOAD", { destination: 5, object: 3, index: 2, result_type: 2 }),
        encodeInstruction("HEAP_LENGTH", { destination: 5, object: 3 }),
        encodeInstruction("HALT"),
      ]),
      registerCount: 6,
      parameterTypes: [],
      returnType: "VOID",
    }],
  });
  const output = formatInspection(decodeBytecode(bytecode));

  assert.match(output, /HEAP_ALLOC destination=1 value_start=0 value_count=1/);
  assert.match(output, /HEAP_REPLACE destination=3 object=1 index=2 value=0/);
  assert.match(output, /HEAP_EQUAL destination=4 left=1 right=3/);
  assert.match(output, /HEAP_LOAD destination=5 object=3 index=2 result_type=2/);
  assert.match(output, /HEAP_LENGTH destination=5 object=3/);
});

test("displays reproducible build metadata", () => {
  const bytecode = encodePortableModule({
    constants: [],
    imports: [],
    functions: [{
      name: null,
      code: encodeInstruction("HALT"),
      registerCount: 0,
      parameterTypes: [],
      returnType: "VOID",
    }],
    build: {
      targetProfile: "portable",
      standardLibraryMajor: 1,
      entryModuleId: "main.jimp",
      guaranteedCapabilities: [],
    },
  });
  const output = formatInspection(decodeBytecode(bytecode));
  assert.match(output, /Build target: portable/);
  assert.match(output, /Standard library: v1/);
  assert.match(output, /Entry module: main\.jimp/);
  assert.match(output, /Guaranteed capabilities: none/);
});

test("maps instructions in different functions back to source lines", () => {
  const module = decodeBytecode(compile(`
    call();
    function call(): VOID {
      1 / 0;
    }
  `));

  assert(module.debug.length > 0);
  assert(module.functions[0].instructions.some(({ sourceLine }) => sourceLine === 2));
  assert(module.functions[1].instructions.some(({ sourceLine }) => sourceLine === 4));
});

test("formats typed scalar constants", () => {
  const output = formatInspection(decodeBytecode(compile("42;\n-3.5;\ntrue;\nnull;")));

  assert.match(output, /\[0\] I64 42/);
  assert.match(output, /\[1\] F64 -3\.5/);
  assert.match(output, /\[2\] BOOL true/);
  assert.match(output, /\[3\] NULL null/);
});

test("disassembles expression instructions", () => {
  const output = formatInspection(decodeBytecode(compile("(2 + 3) * 4 >= 20 && !false;")));

  assert.match(output, /ADD destination=/);
  assert.match(output, /MULTIPLY destination=/);
  assert.match(output, /GREATER_EQUAL destination=/);
  assert.match(output, /BOOL_NOT destination=/);
  assert.match(output, /JUMP_IF_FALSE condition=/);
});

test("disassembles generic string instructions", () => {
  const output = formatInspection(decodeBytecode(compile(`
    let value = "A😀B";
    value.length;
    value[1];
    value[1:3];
    value + "!";
  `)));

  assert.match(output, /STRING_LENGTH destination=/);
  assert.match(output, /STRING_LOAD destination=/);
  assert.match(output, /STRING_SLICE destination=/);
  assert.match(output, /STRING_CONCAT destination=/);
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
