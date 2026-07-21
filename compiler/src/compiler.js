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

class Assembler {
  constructor() {
    this.items = [];
  }

  createLabel() {
    return { offset: null };
  }

  mark(label) {
    if (label.offset !== null || this.items.some((item) => item.label === label)) {
      throw new Error("Internal compiler error: label was marked more than once.");
    }
    this.items.push({ kind: "label", label });
  }

  emit(name, operands = {}) {
    this.items.push({ kind: "instruction", name, operands });
  }

  encodeOperands(operands, placeholder) {
    return Object.fromEntries(Object.entries(operands).map(([name, value]) => {
      if (typeof value !== "object" || value === null) return [name, value];
      if (placeholder) return [name, 0];
      if (value.offset === null) {
        throw new Error("Internal compiler error: instruction references an unmarked label.");
      }
      return [name, value.offset];
    }));
  }

  assemble() {
    let offset = 0;
    for (const item of this.items) {
      if (item.kind === "label") {
        item.label.offset = offset;
      } else {
        offset += encodeInstruction(
          item.name,
          this.encodeOperands(item.operands, true),
        ).length;
      }
    }
    return Buffer.concat(this.items
      .filter(({ kind }) => kind === "instruction")
      .map((item) => encodeInstruction(
        item.name,
        this.encodeOperands(item.operands, false),
      )));
  }
}

function containsPrint(statements) {
  return statements.some((statement) => statement.kind === "print"
    || (statement.kind === "ifStatement" && (
      containsPrint(statement.consequent.statements)
      || (statement.alternate && containsPrint(statement.alternate.statements))
    )));
}

export function compile(source) {
  const program = analyzeProgram(parseProgram(source));
  const hasPrintStatement = containsPrint(program.statements);
  const constants = [];
  const imports = [];
  const assembler = new Assembler();
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
      assembler.emit("LOAD_CONST", { destination, constant });
      return destination;
    }

    if (expression.kind === "identifier") {
      const destination = registers.allocate();
      assembler.emit("MOVE", {
        destination,
        source: expression.register,
      });
      return destination;
    }

    if (expression.kind === "unaryExpression") {
      const operand = compileExpression(expression.operand);
      assembler.emit(UNARY_INSTRUCTIONS[expression.operator], {
        destination: operand,
        operand,
      });
      return operand;
    }

    if (expression.operator === "&&" || expression.operator === "||") {
      const left = compileExpression(expression.left);
      const end = assembler.createLabel();
      assembler.emit(
        expression.operator === "&&" ? "JUMP_IF_FALSE" : "JUMP_IF_TRUE",
        { condition: left, target: end },
      );
      const right = compileExpression(expression.right);
      assembler.emit("MOVE", { destination: left, source: right });
      registers.release(right);
      assembler.mark(end);
      return left;
    }

    const left = compileExpression(expression.left);
    const right = compileExpression(expression.right);
    assembler.emit(BINARY_INSTRUCTIONS[expression.operator], {
      destination: left,
      left,
      right,
    });
    registers.release(right);
    return left;
  }

  function compileStatement(statement) {
    if (statement.kind === "ifStatement") {
      const condition = compileExpression(statement.condition);
      const alternate = assembler.createLabel();
      const end = statement.alternate ? assembler.createLabel() : alternate;
      assembler.emit("JUMP_IF_FALSE", { condition, target: alternate });
      registers.release(condition);
      compileStatements(statement.consequent.statements);
      if (statement.alternate) {
        assembler.emit("JUMP", { target: end });
        assembler.mark(alternate);
        compileStatements(statement.alternate.statements);
      }
      assembler.mark(end);
      return;
    }

    const expression = statement.kind === "variableDeclaration"
      ? statement.initializer
      : statement.expression;
    const result = compileExpression(expression);

    if (statement.kind === "variableDeclaration" || statement.kind === "variableAssignment") {
      assembler.emit("MOVE", {
        destination: statement.register,
        source: result,
      });
    } else if (statement.kind === "print") {
      assembler.emit("HOST_CALL", {
        import: 0,
        argument_start: result,
        argument_count: 1,
        result: NO_REGISTER,
      });
      const newline = constants.length;
      constants.push({ type: "STRING", value: "\n" });
      assembler.emit("LOAD_CONST", { destination: result, constant: newline });
      assembler.emit("HOST_CALL", {
        import: 0,
        argument_start: result,
        argument_count: 1,
        result: NO_REGISTER,
      });
    }
    registers.release(result);
  }

  function compileStatements(statements) {
    for (const statement of statements) compileStatement(statement);
  }

  compileStatements(program.statements);
  assembler.emit("HALT");

  return encodePortableModule({
    constants,
    imports,
    functions: [{
      name: null,
      code: assembler.assemble(),
      registerCount: registers.maximumRegisterCount,
      parameterTypes: [],
      returnType: "VOID",
    }],
  });
}
