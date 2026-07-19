import { analyzeProgram } from "./analyzer.js";
import { NO_REGISTER } from "./generated/isa.js";
import { parseProgram } from "./parser.js";
import { encodeInstruction, encodePortableModule } from "./portable/module.js";

const UNARY_INSTRUCTIONS = Object.freeze({
  "-": "NEGATE",
  "!": "BOOL_NOT",
});

const BINARY_INSTRUCTIONS = Object.freeze({
  "+": "ADD",
  "-": "SUBTRACT",
  "*": "MULTIPLY",
  "/": "DIVIDE",
  "%": "REMAINDER",
  "==": "EQUAL",
  "!=": "NOT_EQUAL",
  "<": "LESS_THAN",
  "<=": "LESS_EQUAL",
  ">": "GREATER_THAN",
  ">=": "GREATER_EQUAL",
  "&&": "BOOL_AND",
  "||": "BOOL_OR",
});

class RegisterAllocator {
  constructor(variableCount) {
    this.variableCount = variableCount;
    this.nextRegister = variableCount;
    this.maximumRegisterCount = variableCount;
    this.available = [];
  }

  allocate() {
    const register = this.available.pop() ?? this.nextRegister++;
    if (register >= NO_REGISTER) {
      throw new Error("Program requires more virtual registers than the portable VM supports.");
    }
    this.maximumRegisterCount = Math.max(this.maximumRegisterCount, register + 1);
    return register;
  }

  release(register) {
    if (register < this.variableCount) {
      throw new Error("Internal compiler error: attempted to release a variable register.");
    }
    this.available.push(register);
  }
}

export function compile(source) {
  const program = analyzeProgram(parseProgram(source));
  const hasPrintStatement = program.statements.some(({ kind }) => kind === "print");
  const constants = [];
  const imports = [];
  const code = [];
  const registers = new RegisterAllocator(program.variableCount);

  if (hasPrintStatement) {
    constants.push(
      { type: "STRING", value: "std.console" },
      { type: "STRING", value: "write" },
    );
    imports.push({
      namespace: 0,
      name: 1,
      parameterTypes: ["STRING"],
      returnType: "VOID",
    });
  }

  function compileExpression(expression) {
    if (expression.kind === "literal") {
      const destination = registers.allocate();
      const constant = constants.length;
      constants.push(expression.value);
      code.push(encodeInstruction("LOAD_CONST", { destination, constant }));
      return destination;
    }

    if (expression.kind === "identifier") {
      const destination = registers.allocate();
      code.push(encodeInstruction("MOVE", {
        destination,
        source: expression.register,
      }));
      return destination;
    }

    if (expression.kind === "unaryExpression") {
      const operand = compileExpression(expression.operand);
      code.push(encodeInstruction(UNARY_INSTRUCTIONS[expression.operator], {
        destination: operand,
        operand,
      }));
      return operand;
    }

    const left = compileExpression(expression.left);
    const right = compileExpression(expression.right);
    code.push(encodeInstruction(BINARY_INSTRUCTIONS[expression.operator], {
      destination: left,
      left,
      right,
    }));
    registers.release(right);
    return left;
  }

  for (const statement of program.statements) {
    const expression = statement.kind === "variableDeclaration"
      ? statement.initializer
      : statement.expression;
    const result = compileExpression(expression);

    if (statement.kind === "variableDeclaration" || statement.kind === "variableAssignment") {
      code.push(encodeInstruction("MOVE", {
        destination: statement.register,
        source: result,
      }));
    } else if (statement.kind === "print") {
      code.push(encodeInstruction("HOST_CALL", {
        import: 0,
        argument_start: result,
        argument_count: 1,
        result: NO_REGISTER,
      }));
      const newline = constants.length;
      constants.push({ type: "STRING", value: "\n" });
      code.push(
        encodeInstruction("LOAD_CONST", { destination: result, constant: newline }),
        encodeInstruction("HOST_CALL", {
          import: 0,
          argument_start: result,
          argument_count: 1,
          result: NO_REGISTER,
        }),
      );
    }
    registers.release(result);
  }
  code.push(encodeInstruction("HALT"));

  return encodePortableModule({
    constants,
    imports,
    functions: [{
      name: null,
      code: Buffer.concat(code),
      registerCount: registers.maximumRegisterCount,
      parameterTypes: [],
      returnType: "VOID",
    }],
  });
}
