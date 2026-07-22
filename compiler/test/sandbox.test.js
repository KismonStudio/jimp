import assert from "node:assert/strict";
import test from "node:test";
import { OPCODES } from "../src/generated/isa.js";
import { SANDBOX_LIMITS, SANDBOX_PROFILE } from "../src/generated/sandbox.js";
import {
  decodePortableModule,
  encodeInstruction,
  encodePortableModule,
  SECTION_KINDS,
} from "../src/portable/module.js";

function createMinimalModule(overrides = {}) {
  return encodePortableModule({
    constants: [],
    imports: [],
    functions: [{
      name: null,
      code: encodeInstruction("HALT"),
      registerCount: 0,
      parameterTypes: [],
      returnType: "VOID",
    }],
    ...overrides,
  });
}

function findSection(bytecode, expectedKind) {
  const sectionCount = bytecode.readUInt16LE(16);
  for (let index = 0; index < sectionCount; index += 1) {
    const directoryOffset = 20 + index * 12;
    if (bytecode.readUInt16LE(directoryOffset) === expectedKind) {
      return {
        offset: bytecode.readUInt32LE(directoryOffset + 4),
        length: bytecode.readUInt32LE(directoryOffset + 8),
      };
    }
  }
  throw new Error(`Section kind ${expectedKind} was not found.`);
}

test("exposes the generated reference sandbox profile", () => {
  assert.deepEqual(SANDBOX_PROFILE, { name: "jimp-reference-sandbox", version: 1 });
  assert.equal(SANDBOX_LIMITS.MAX_MODULE_BYTES, 16 * 1024 * 1024);
  assert.equal(SANDBOX_LIMITS.MAX_RUNTIME_VALUE_BYTES, 32 * 1024 * 1024);
  assert.equal(SANDBOX_LIMITS.MAX_HEAP_BYTES, 4 * 1024 * 1024);
  assert.equal(SANDBOX_LIMITS.MAX_HEAP_DEPTH, 128);
  assert.equal(SANDBOX_LIMITS.MAX_HEAP_EQUALITY_VISITS, 65_536);
  assert.equal(SANDBOX_LIMITS.MAX_JSON_INPUT_BYTES, 1024 * 1024);
  assert.equal(SANDBOX_LIMITS.MAX_JSON_OUTPUT_BYTES, 1024 * 1024);
  assert.equal(SANDBOX_LIMITS.MAX_JSON_DEPTH, 128);
  assert.equal(SANDBOX_LIMITS.MAX_JSON_VALUES, 65_536);
  assert.equal(SANDBOX_LIMITS.MAX_EXECUTION_STEPS, 1_000_000);
  assert.equal(SANDBOX_LIMITS.MAX_CALL_FRAMES, 1_024);
});

test("rejects module and section counts above sandbox limits", () => {
  assert.throws(
    () => decodePortableModule(Buffer.alloc(SANDBOX_LIMITS.MAX_MODULE_BYTES + 1)),
    /Module size exceeds the sandbox limit/,
  );

  const bytecode = createMinimalModule();
  bytecode.writeUInt16LE(SANDBOX_LIMITS.MAX_SECTION_COUNT + 1, 16);
  assert.throws(
    () => decodePortableModule(bytecode),
    /Section count exceeds the sandbox limit/,
  );
});

test("rejects oversized constant pools and strings", () => {
  const bytecode = createMinimalModule();
  const constants = findSection(bytecode, SECTION_KINDS.CONSTANTS);
  bytecode.writeUInt32LE(SANDBOX_LIMITS.MAX_CONSTANTS + 1, constants.offset);
  assert.throws(
    () => decodePortableModule(bytecode),
    /Constant count exceeds the sandbox limit/,
  );

  assert.throws(
    () => createMinimalModule({
      constants: [{
        type: "STRING",
        value: "x".repeat(SANDBOX_LIMITS.MAX_CONSTANT_STRING_BYTES + 1),
      }],
    }),
    /exceeds the sandbox string limit/,
  );
});

test("rejects oversized symbols independently from ordinary string constants", () => {
  const symbol = "s".repeat(SANDBOX_LIMITS.MAX_SYMBOL_BYTES + 1);

  assert.throws(
    () => createMinimalModule({
      constants: [
        { type: "STRING", value: symbol },
        { type: "STRING", value: "write" },
      ],
      imports: [{
        namespace: 0,
        name: 1,
        parameterTypes: [],
        returnType: "VOID",
      }],
    }),
    /exceeds the sandbox symbol limit/,
  );
});

test("rejects excessive imports, functions, parameters, and registers before allocation", () => {
  const importBytecode = createMinimalModule();
  const imports = findSection(importBytecode, SECTION_KINDS.HOST_IMPORTS);
  importBytecode.writeUInt32LE(SANDBOX_LIMITS.MAX_HOST_IMPORTS + 1, imports.offset);
  assert.throws(
    () => decodePortableModule(importBytecode),
    /Host import count exceeds the sandbox limit/,
  );

  const functionBytecode = createMinimalModule();
  const functions = findSection(functionBytecode, SECTION_KINDS.FUNCTIONS);
  functionBytecode.writeUInt32LE(SANDBOX_LIMITS.MAX_FUNCTIONS + 1, functions.offset);
  assert.throws(
    () => decodePortableModule(functionBytecode),
    /Function count exceeds the sandbox limit/,
  );

  const registerBytecode = createMinimalModule();
  const registerFunctions = findSection(registerBytecode, SECTION_KINDS.FUNCTIONS);
  registerBytecode.writeUInt16LE(
    SANDBOX_LIMITS.MAX_REGISTERS_PER_FUNCTION + 1,
    registerFunctions.offset + 16,
  );
  assert.throws(
    () => decodePortableModule(registerBytecode),
    /register count exceeds the sandbox limit/,
  );

  const parameterBytecode = createMinimalModule();
  const parameterFunctions = findSection(parameterBytecode, SECTION_KINDS.FUNCTIONS);
  parameterBytecode.writeUInt16LE(
    SANDBOX_LIMITS.MAX_PARAMETERS + 1,
    parameterFunctions.offset + 18,
  );
  assert.throws(
    () => decodePortableModule(parameterBytecode),
    /parameter count exceeds the sandbox limit/,
  );
});

test("rejects code and decoded instruction counts above sandbox limits", () => {
  assert.throws(
    () => createMinimalModule({
      functions: [{
        name: null,
        code: Buffer.alloc(SANDBOX_LIMITS.MAX_CODE_BYTES + 1, OPCODES.HALT),
        registerCount: 0,
        parameterTypes: [],
        returnType: "VOID",
      }],
    }),
    /Combined code length exceeds the sandbox limit/,
  );

  const move = encodeInstruction("MOVE", { destination: 0, source: 0 });
  const excessiveInstructions = Buffer.concat([
    Buffer.alloc(move.length * SANDBOX_LIMITS.MAX_TOTAL_INSTRUCTIONS, move),
    encodeInstruction("HALT"),
  ]);
  const instructionBytecode = createMinimalModule({
    functions: [{
      name: null,
      code: excessiveInstructions,
      registerCount: 1,
      parameterTypes: [],
      returnType: "VOID",
    }],
  });
  assert.throws(
    () => decodePortableModule(instructionBytecode),
    /Instruction count exceeds the sandbox limit/,
  );
});

test("rejects type-flow matrices above the verification budget", () => {
  const instructionCount = Math.floor(
    SANDBOX_LIMITS.MAX_VERIFICATION_TYPE_CELLS
      / SANDBOX_LIMITS.MAX_REGISTERS_PER_FUNCTION,
  ) + 1;
  const loads = Array.from({ length: instructionCount - 1 }, () =>
    encodeInstruction("LOAD_CONST", { destination: 0, constant: 0 }));
  const bytecode = createMinimalModule({
    constants: [{ type: "NULL", value: null }],
    functions: [{
      name: null,
      code: Buffer.concat([...loads, encodeInstruction("HALT")]),
      registerCount: SANDBOX_LIMITS.MAX_REGISTERS_PER_FUNCTION,
      parameterTypes: [],
      returnType: "VOID",
    }],
  });

  assert.throws(
    () => decodePortableModule(bytecode),
    /type-flow analysis exceeds the sandbox limit/,
  );
});
