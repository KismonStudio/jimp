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
    minor: 9,
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

test("verifies generic immutable heap allocation and typed access", () => {
  const code = Buffer.concat([
    encodeInstruction("LOAD_CONST", { destination: 0, constant: 0 }),
    encodeInstruction("HEAP_ALLOC", { destination: 1, value_start: 0, value_count: 1 }),
    encodeInstruction("LOAD_CONST", { destination: 2, constant: 1 }),
    encodeInstruction("LOAD_CONST", { destination: 3, constant: 2 }),
    encodeInstruction("HEAP_REPLACE", { destination: 4, object: 1, index: 2, value: 3 }),
    encodeInstruction("HEAP_EQUAL", { destination: 5, left: 1, right: 4 }),
    encodeInstruction("HEAP_LOAD", { destination: 6, object: 4, index: 2, result_type: 2 }),
    encodeInstruction("HEAP_LENGTH", { destination: 6, object: 4 }),
    encodeInstruction("HALT"),
  ]);
  const module = decodePortableModule(encodePortableModule({
    constants: [
      { type: "I64", value: 7n },
      { type: "I64", value: 0n },
      { type: "I64", value: 8n },
    ],
    imports: [],
    functions: [{
      name: null,
      code,
      registerCount: 7,
      parameterTypes: [],
      returnType: "VOID",
    }],
  }));

  assert.deepEqual(module.functions[0].instructions.map(({ name }) => name), [
    "LOAD_CONST", "HEAP_ALLOC", "LOAD_CONST", "LOAD_CONST", "HEAP_REPLACE",
    "HEAP_EQUAL", "HEAP_LOAD", "HEAP_LENGTH", "HALT",
  ]);
});

test("keeps heap references outside constants and the Host ABI", () => {
  assert.throws(
    () => encodePortableModule({
      constants: [{ type: "HEAP_REF", value: 0 }],
      imports: [],
      functions: [{
        name: null,
        code: encodeInstruction("HALT"),
        registerCount: 0,
        parameterTypes: [],
        returnType: "VOID",
      }],
    }),
    /unsupported type HEAP_REF/,
  );
  assert.throws(
    () => encodePortableModule({
      constants: [
        { type: "STRING", value: "host" },
        { type: "STRING", value: "leak" },
      ],
      imports: [{
        namespace: 0,
        name: 1,
        parameterTypes: ["HEAP_REF"],
        returnType: "VOID",
      }],
      functions: [{
        name: null,
        code: encodeInstruction("HALT"),
        registerCount: 0,
        parameterTypes: [],
        returnType: "VOID",
      }],
    }),
    /cannot expose VM heap references through the Host ABI/,
  );
});

test("rejects malformed heap type tags before execution", () => {
  const code = Buffer.concat([
    encodeInstruction("HEAP_ALLOC", { destination: 0, value_start: 0, value_count: 0 }),
    encodeInstruction("LOAD_CONST", { destination: 1, constant: 0 }),
    encodeInstruction("HEAP_LOAD", { destination: 2, object: 0, index: 1, result_type: 255 }),
    encodeInstruction("HALT"),
  ]);

  assert.throws(
    () => decodePortableModule(encodePortableModule({
      constants: [{ type: "I64", value: 0n }],
      imports: [],
      functions: [{
        name: null,
        code,
        registerCount: 3,
        parameterTypes: [],
        returnType: "VOID",
      }],
    })),
    /HEAP_LOAD result type cannot use VOID/,
  );
});

test("rejects replacement and equality over non-heap operands", () => {
  const createModule = (instruction) => encodePortableModule({
    constants: [{ type: "I64", value: 0n }],
    imports: [],
    functions: [{
      name: null,
      code: Buffer.concat([
        encodeInstruction("LOAD_CONST", { destination: 0, constant: 0 }),
        encodeInstruction("LOAD_CONST", { destination: 1, constant: 0 }),
        instruction,
        encodeInstruction("HALT"),
      ]),
      registerCount: 3,
      parameterTypes: [],
      returnType: "VOID",
    }],
  });

  assert.throws(
    () => decodePortableModule(createModule(encodeInstruction("HEAP_REPLACE", {
      destination: 2,
      object: 0,
      index: 1,
      value: 0,
    }))),
    /HEAP_REPLACE object must be HEAP_REF/,
  );
  assert.throws(
    () => decodePortableModule(createModule(encodeInstruction("HEAP_EQUAL", {
      destination: 2,
      left: 0,
      right: 1,
    }))),
    /HEAP_EQUAL operands must be HEAP_REF/,
  );
});

test("verifies generic string instructions and rejects invalid operand types", () => {
  const validCode = Buffer.concat([
    encodeInstruction("LOAD_CONST", { destination: 0, constant: 0 }),
    encodeInstruction("LOAD_CONST", { destination: 1, constant: 1 }),
    encodeInstruction("STRING_LENGTH", { destination: 2, value: 0 }),
    encodeInstruction("STRING_LOAD", { destination: 3, value: 0, index: 1 }),
    encodeInstruction("STRING_SLICE", { destination: 4, value: 0, start: 1, end: 2 }),
    encodeInstruction("STRING_CONCAT", { destination: 5, left: 0, right: 3 }),
    encodeInstruction("HALT"),
  ]);
  const module = decodePortableModule(encodePortableModule({
    constants: [
      { type: "STRING", value: "A😀B" },
      { type: "I64", value: 1n },
    ],
    imports: [],
    functions: [{
      name: null,
      code: validCode,
      registerCount: 6,
      parameterTypes: [],
      returnType: "VOID",
    }],
  }));
  assert.deepEqual(module.functions[0].instructions.slice(2, 6).map(({ name }) => name), [
    "STRING_LENGTH", "STRING_LOAD", "STRING_SLICE", "STRING_CONCAT",
  ]);

  const invalidCode = Buffer.concat([
    encodeInstruction("LOAD_CONST", { destination: 0, constant: 0 }),
    encodeInstruction("STRING_LENGTH", { destination: 1, value: 0 }),
    encodeInstruction("HALT"),
  ]);
  assert.throws(
    () => decodePortableModule(encodePortableModule({
      constants: [{ type: "I64", value: 0n }],
      imports: [],
      functions: [{
        name: null,
        code: invalidCode,
        registerCount: 2,
        parameterTypes: [],
        returnType: "VOID",
      }],
    })),
    /STRING_LENGTH value must be STRING/,
  );
});

test("round-trips validated optional build metadata", () => {
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
      targetProfile: "reference-native-i64",
      standardLibraryMajor: 1,
      entryModuleId: "src/main.aur",
      guaranteedCapabilities: [
        "std.math.i64.absolute",
        "std.math.i64.sign",
      ],
    },
  });
  const module = decodePortableModule(bytecode);
  assert.equal(module.header.sectionCount, 5);
  assert.deepEqual(module.build, {
    targetProfile: "reference-native-i64",
    standardLibraryMajor: 1,
    entryModuleId: "src/main.aur",
    guaranteedCapabilities: [
      "std.math.i64.absolute",
      "std.math.i64.sign",
    ],
  });

  const buildDirectory = 20 + 4 * 12;
  const buildOffset = bytecode.readUInt32LE(buildDirectory + 4);
  bytecode.writeUInt16LE(0, buildOffset + 4);
  assert.throws(
    () => decodePortableModule(bytecode),
    /standard-library major must be positive/,
  );
});

test("round-trips optional source-line debug mappings", () => {
  const load = encodeInstruction("LOAD_CONST", { destination: 0, constant: 0 });
  const halt = encodeInstruction("HALT");
  const bytecode = encodePortableModule({
    constants: [{ type: "I64", value: 1n }],
    imports: [],
    functions: [{
      name: null,
      code: Buffer.concat([load, halt]),
      debug: [
        { offset: 0, line: 3 },
        { offset: load.length, line: 4 },
      ],
      registerCount: 1,
      parameterTypes: [],
      returnType: "VOID",
    }],
  });
  const module = decodePortableModule(bytecode);

  assert.equal(module.header.sectionCount, 5);
  assert.deepEqual(module.debug, [
    { offset: 0, moduleId: null, line: 3 },
    { offset: load.length, moduleId: null, line: 4 },
  ]);
  assert.deepEqual(
    module.functions[0].instructions.map(({ sourceLine }) => sourceLine),
    [3, 4],
  );
});

test("rejects invalid debug mappings without affecting modules that omit them", () => {
  const code = encodeInstruction("HALT");
  const createDebugModule = () => encodePortableModule({
    constants: [],
    imports: [],
    functions: [{
      name: null,
      code,
      debug: [{ offset: 0, line: 1 }],
      registerCount: 0,
      parameterTypes: [],
      returnType: "VOID",
    }],
  });
  const debugSection = (bytecode) => {
    const sectionCount = bytecode.readUInt16LE(16);
    for (let index = 0; index < sectionCount; index += 1) {
      const directoryOffset = 20 + index * 12;
      if (bytecode.readUInt16LE(directoryOffset) === 5) {
        return {
          directoryOffset,
          payloadOffset: bytecode.readUInt32LE(directoryOffset + 4),
        };
      }
    }
    throw new Error("Missing debug section.");
  };

  const requiredDebug = createDebugModule();
  const required = debugSection(requiredDebug);
  requiredDebug.writeUInt16LE(0, required.directoryOffset + 2);
  assert.throws(() => decodePortableModule(requiredDebug), /Debug section must be optional/);

  const invalidLine = createDebugModule();
  const lineSection = debugSection(invalidLine);
  invalidLine.writeUInt32LE(0, lineSection.payloadOffset + 20);
  assert.throws(() => decodePortableModule(invalidLine), /source line must be one-based/);

  const invalidBoundary = createDebugModule();
  const boundarySection = debugSection(invalidBoundary);
  invalidBoundary.writeUInt32LE(1, boundarySection.payloadOffset + 12);
  assert.throws(() => decodePortableModule(invalidBoundary), /instruction boundary/);

  const invalidSource = createDebugModule();
  const sourceSection = debugSection(invalidSource);
  invalidSource.writeUInt32LE(0, sourceSection.payloadOffset + 16);
  assert.throws(() => decodePortableModule(invalidSource), /source index is out of range/);

  assert.throws(() => encodePortableModule({
    constants: [],
    imports: [],
    functions: [{
      name: null,
      code,
      debug: [{ offset: 0, line: 0 }],
      registerCount: 0,
      parameterTypes: [],
      returnType: "VOID",
    }],
  }), /source line must be one-based/);
  assert.deepEqual(decodePortableModule(createPortableModule()).debug, []);
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

test("accepts backward jumps and rejects unaligned jump targets", () => {
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

  const loopCode = Buffer.concat([
    encodeInstruction("LOAD_CONST", { destination: 0, constant: 0 }),
    encodeInstruction("JUMP_IF_TRUE", { condition: 0, target: 0 }),
    encodeInstruction("HALT"),
  ]);
  const loopModule = encodePortableModule({
    constants: [{ type: "BOOL", value: true }],
    imports: [],
    functions: [{
      name: null,
      code: loopCode,
      registerCount: 1,
      parameterTypes: [],
      returnType: "VOID",
    }],
  });

  assert.doesNotThrow(() => decodePortableModule(loopModule));
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

test("verifies typed CALL and RETURN contracts", () => {
  const bytecode = encodePortableModule({
    constants: [{ type: "I64", value: 42n }],
    imports: [],
    functions: [
      {
        name: null,
        code: Buffer.concat([
          encodeInstruction("LOAD_CONST", { destination: 0, constant: 0 }),
          encodeInstruction("CALL", {
            function: 1,
            argument_start: 0,
            argument_count: 1,
            result: 1,
          }),
          encodeInstruction("HALT"),
        ]),
        registerCount: 2,
        parameterTypes: [],
        returnType: "VOID",
      },
      {
        name: null,
        code: encodeInstruction("RETURN", { result: 0 }),
        registerCount: 1,
        parameterTypes: ["I64"],
        returnType: "I64",
      },
    ],
  });
  const module = decodePortableModule(bytecode);

  assert.equal(module.functions[0].instructions[1].name, "CALL");
  assert.equal(module.functions[1].instructions[0].name, "RETURN");
});

test("rejects incompatible CALL arguments", () => {
  const bytecode = encodePortableModule({
    constants: [{ type: "BOOL", value: true }],
    imports: [],
    functions: [
      {
        name: null,
        code: Buffer.concat([
          encodeInstruction("LOAD_CONST", { destination: 0, constant: 0 }),
          encodeInstruction("CALL", {
            function: 1,
            argument_start: 0,
            argument_count: 1,
            result: 1,
          }),
          encodeInstruction("HALT"),
        ]),
        registerCount: 2,
        parameterTypes: [],
        returnType: "VOID",
      },
      {
        name: null,
        code: encodeInstruction("RETURN", { result: 0 }),
        registerCount: 1,
        parameterTypes: ["I64"],
        returnType: "I64",
      },
    ],
  });

  assert.throws(
    () => decodePortableModule(bytecode),
    /CALL argument 0 type does not match the function signature/,
  );
});
