import assert from "node:assert/strict";
import test from "node:test";
import {
  ERROR_CODES,
  ERROR_SCHEMA,
  JimpError,
  formatError,
  normalizeError,
} from "../src/errors.js";

test("normalizes compiler diagnostics with source locations", () => {
  const error = normalizeError(
    new Error('Variable "value" is not declared at line 4.'),
    ERROR_CODES.COMPILE,
  );

  assert.equal(error.code, "JIMP-1001");
  assert.equal(error.phase, "compile");
  assert.deepEqual(error.location, { kind: "source", line: 4 });
  assert.equal(
    formatError(error),
    'JIMP error JIMP-1001 (compile) at source line 4: Variable "value" is not declared at line 4.\n',
  );
});

test("normalizes bytecode diagnostics with zero-based offsets", () => {
  const error = normalizeError(
    new Error("Unsupported portable opcode 255 at code offset 19."),
    ERROR_CODES.DECODE,
  );

  assert.deepEqual(error.location, { kind: "bytecode", offset: 19 });
});

test("serializes the stable JSON error contract", () => {
  const error = new JimpError(ERROR_CODES.EXECUTE, "Execution failed.");
  const serialized = JSON.parse(formatError(error, "json"));

  assert.deepEqual(serialized, {
    schema: ERROR_SCHEMA,
    code: "JIMP-4001",
    phase: "execute",
    message: "Execution failed.",
  });
});

test("preserves an already normalized error", () => {
  const error = new JimpError(ERROR_CODES.USAGE, "Usage");
  assert.equal(normalizeError(error, ERROR_CODES.INTERNAL), error);
  assert.equal(error.exitCode, 2);
});

test("keeps human output on one line", () => {
  const error = new JimpError(ERROR_CODES.INTERNAL, "first\nsecond\tvalue");
  assert.equal(
    formatError(error),
    "JIMP error JIMP-9001 (internal): first\\nsecond\\tvalue\n",
  );
});
