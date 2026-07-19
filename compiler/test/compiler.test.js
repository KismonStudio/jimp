import assert from "node:assert/strict";
import test from "node:test";
import { compile } from "../src/compiler.js";
import { decodePortableModule } from "../src/portable/module.js";

test("compiles print statements into portable bytecode", () => {
  const bytecode = compile('// greeting\nprint "Hello, JIMP!";\n');
  const module = decodePortableModule(bytecode);
  assert.equal(bytecode.subarray(0, 4).toString(), "JIMP");
  assert.equal(bytecode.readUInt16LE(4), 2);
  assert.equal(bytecode.readUInt16LE(6), 0);
  assert.equal(module.imports[0].symbol, "std.console.write");
  assert.deepEqual(
    module.functions[0].instructions.map(({ name }) => name),
    ["LOAD_CONST", "HOST_CALL", "HALT"],
  );
});

test("reports the source line for unsupported syntax", () => {
  assert.throws(() => compile("let answer = 42;"), /line 1/);
});

test("accepts the complete v1 surface syntax", () => {
  const bytecode = compile(`
    // Standalone comments and blank lines are valid.
    print "Semicolon";
    print "Optional semicolon and escapes: \\\\ \\" \\n \\r \\t"
  `);

  const module = decodePortableModule(bytecode);
  assert.deepEqual(
    module.functions[0].instructions.map(({ name }) => name),
    ["LOAD_CONST", "HOST_CALL", "LOAD_CONST", "HOST_CALL", "HALT"],
  );
});

test("rejects syntax excluded from v1", () => {
  const invalidSources = [
    'PRINT "Case-sensitive";',
    'print"Whitespace is required";',
    'print "Inline comment"; // invalid',
    'print "Unsupported escape: \\u0041";',
    'print "One"; print "Two";',
  ];

  for (const source of invalidSources) {
    assert.throws(() => compile(source), /Syntax error at line 1/);
  }
});
