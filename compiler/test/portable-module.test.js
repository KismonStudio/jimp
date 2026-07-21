import assert from "node:assert/strict";
import test from "node:test";
import { NO_REGISTER } from "../src/generated/isa.js";
import {
  decodePortableModule,
  encodeInstruction,
  encodePortableModule,
} from "../src/portable/module.js";

function createPortableModule() {
  const constants = [
    { type: "STRING", value: "std.console" },
    { type: "STRING", value: "write" },
    { type: "STRING", value: "Hello, portable VM!\n" },
    { type: "BOOL", value: true },
    { type: "I64", value: -42n },
    { type: "F64", value: 3.5 },
    { type: "NULL", value: null },
  ];
  const code = Buffer.concat([
    encodeInstruction("LOAD_CONST", { destination: 0, constant: 2 }),
    encodeInstruction("MOVE", { destination: 1, source: 0 }),
    encodeInstruction("HOST_CALL", {
      import: 0,
      argument_start: 1,
      argument_count: 1,
      result: NO_REGISTER,
    }),
    encodeInstruction("HALT"),
  ]);
  return encodePortableModule({
    constants,
    imports: [{
      namespace: 0,
      name: 1,
      parameterTypes: ["STRING"],
      returnType: "VOID",
    }],
    functions: [{
      name: null,
      code,
      registerCount: 2,
      parameterTypes: [],
      returnType: "VOID",
    }],
  });
}

test("round-trips portable constants and typed host imports", () => {
  const bytecode = createPortableModule();
  const module = decodePortableModule(bytecode);

  assert.deepEqual(module.header, {
    major: 2,
    minor: 2,
    entryFunction: 0,
    sectionCount: 4,
  });
  assert.deepEqual(module.constants, [
    { type: "STRING", value: "std.console" },
    { type: "STRING", value: "write" },
    { type: "STRING", value: "Hello, portable VM!\n" },
    { type: "BOOL", value: true },
    { type: "I64", value: -42n },
    { type: "F64", value: 3.5 },
    { type: "NULL", value: null },
  ]);
  assert.deepEqual(module.imports, [{
    namespace: 0,
    name: 1,
    symbol: "std.console.write",
    parameterTypes: ["STRING"],
    returnType: "VOID",
  }]);
  assert.equal(module.functions[0].registerCount, 2);
  assert(module.code.length > 0);
});

test("rejects host names that are not non-empty string constants", () => {
  assert.throws(() => encodePortableModule({
    constants: [{ type: "NULL", value: null }],
    imports: [{ namespace: 0, name: 0, parameterTypes: [], returnType: "VOID" }],
    functions: [{
      name: null,
      code: encodeInstruction("HALT"),
      registerCount: 0,
      parameterTypes: [],
      returnType: "VOID",
    }],
  }), /must reference a non-empty string constant/);
});

test("rejects overlapping module sections", () => {
  const bytecode = createPortableModule();
  const firstSectionOffset = bytecode.readUInt32LE(24);
  bytecode.writeUInt32LE(firstSectionOffset, 36);
  assert.throws(() => decodePortableModule(bytecode), /overlaps another section/);
});

test("encodes operands from generated ISA metadata", () => {
  assert.deepEqual(
    encodeInstruction("LOAD_CONST", { destination: 2, constant: 7 }),
    Buffer.from([1, 2, 0, 7, 0, 0, 0]),
  );
  assert.throws(
    () => encodeInstruction("MOVE", { destination: NO_REGISTER, source: 0 }),
    /cannot use NO_REGISTER/,
  );
});

test("rejects invalid typed arithmetic during portable verification", () => {
  const code = Buffer.concat([
    encodeInstruction("LOAD_CONST", { destination: 0, constant: 0 }),
    encodeInstruction("LOAD_CONST", { destination: 1, constant: 1 }),
    encodeInstruction("ADD", { destination: 0, left: 0, right: 1 }),
    encodeInstruction("HALT"),
  ]);
  const bytecode = encodePortableModule({
    constants: [
      { type: "BOOL", value: true },
      { type: "BOOL", value: false },
    ],
    imports: [],
    functions: [{
      name: null,
      code,
      registerCount: 2,
      parameterTypes: [],
      returnType: "VOID",
    }],
  });

  assert.throws(() => decodePortableModule(bytecode), /ADD operands must be I64 or F64/);
});

test("rejects backward and unaligned jump targets", () => {
  const createModule = (target) => encodePortableModule({
    constants: [],
    imports: [],
    functions: [{
      name: null,
      code: Buffer.concat([
        encodeInstruction("JUMP", { target }),
        encodeInstruction("HALT"),
      ]),
      registerCount: 0,
      parameterTypes: [],
      returnType: "VOID",
    }],
  });

  assert.throws(
    () => decodePortableModule(createModule(0)),
    /target must be a forward instruction offset/,
  );
  assert.throws(
    () => decodePortableModule(createModule(2)),
    /target must reference an instruction boundary/,
  );
});

test("rejects register types that are unsafe on a conditional path", () => {
  const code = Buffer.concat([
    encodeInstruction("LOAD_CONST", { destination: 0, constant: 2 }),
    encodeInstruction("JUMP_IF_FALSE", { condition: 0, target: 21 }),
    encodeInstruction("LOAD_CONST", { destination: 1, constant: 3 }),
    encodeInstruction("HOST_CALL", {
      import: 0,
      argument_start: 1,
      argument_count: 1,
      result: NO_REGISTER,
    }),
    encodeInstruction("HALT"),
  ]);
  const bytecode = encodePortableModule({
    constants: [
      { type: "STRING", value: "std.console" },
      { type: "STRING", value: "write" },
      { type: "BOOL", value: false },
      { type: "STRING", value: "unsafe" },
    ],
    imports: [{
      namespace: 0,
      name: 1,
      parameterTypes: ["STRING"],
      returnType: "VOID",
    }],
    functions: [{
      name: null,
      code,
      registerCount: 2,
      parameterTypes: [],
      returnType: "VOID",
    }],
  });

  assert.throws(
    () => decodePortableModule(bytecode),
    /HOST_CALL argument 0 type does not match the import signature/,
  );
});
