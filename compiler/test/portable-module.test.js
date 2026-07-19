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
    minor: 0,
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
