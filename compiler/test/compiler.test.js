import assert from "node:assert/strict";
import test from "node:test";
import { compile } from "../src/compiler.js";

test("compiles print statements into versioned bytecode", () => {
  const bytecode = compile('// greeting\nprint "Hello, JIMP!";\n');
  assert.equal(bytecode.subarray(0, 4).toString(), "JIMP");
  assert.equal(bytecode.readUInt16LE(4), 1);
  assert.equal(bytecode.readUInt32LE(6), 2);
});

test("reports the source line for unsupported syntax", () => {
  assert.throws(() => compile("let answer = 42;"), /line 1/);
});
