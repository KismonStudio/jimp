import { analyzeProgram } from "./analyzer.js";
import { NO_REGISTER } from "./generated/isa.js";
import { SANDBOX_LIMITS } from "./generated/sandbox.js";
import { parseProgram } from "./parser.js";
import { encodeInstruction, encodePortableModule } from "./portable/module.js";

const UNARY_INSTRUCTIONS = Object.freeze({ "-": "NEGATE", "!": "BOOL_NOT" });
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
    if (register >= SANDBOX_LIMITS.MAX_REGISTERS_PER_FUNCTION) {
      throw new Error(
        `Program exceeds the sandbox limit of ${SANDBOX_LIMITS.MAX_REGISTERS_PER_FUNCTION} virtual registers per function.`,
      );
    }
    this.maximumRegisterCount = Math.max(this.maximumRegisterCount, register + 1);
    return register;
  }

  allocateRange(count) {
    if (count === 0) return 0;
    const start = this.nextRegister;
    const end = start + count;
    if (end > SANDBOX_LIMITS.MAX_REGISTERS_PER_FUNCTION) {
      throw new Error(
        `Program exceeds the sandbox limit of ${SANDBOX_LIMITS.MAX_REGISTERS_PER_FUNCTION} virtual registers per function.`,
      );
    }
    this.nextRegister = end;
    this.maximumRegisterCount = Math.max(this.maximumRegisterCount, end);
    return start;
  }

  release(register) {
    if (register === NO_REGISTER) return;
    if (register < this.variableCount) {
      throw new Error("Internal compiler error: attempted to release a variable register.");
    }
    this.available.push(register);
  }

  releaseRange(start, count) {
    if (count > 0 && start + count === this.nextRegister) {
      this.nextRegister = start;
      this.available = this.available.filter((register) => register < start);
      return;
    }
    for (let index = 0; index < count; index += 1) this.release(start + index);
  }
}

class Assembler {
  constructor() {
    this.items = [];
    this.sourceLine = null;
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

  setSourceLine(line) {
    if (!Number.isInteger(line) || line < 1) {
      throw new Error("Internal compiler error: source line must be a positive integer.");
    }
    this.sourceLine = line;
  }

  emit(name, operands = {}) {
    if (this.sourceLine === null) {
      throw new Error("Internal compiler error: instruction has no source line.");
    }
    this.items.push({ kind: "instruction", name, operands, sourceLine: this.sourceLine });
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
        offset += encodeInstruction(item.name, this.encodeOperands(item.operands, true)).length;
      }
    }
    const code = [];
    const debug = [];
    offset = 0;
    for (const item of this.items.filter(({ kind }) => kind === "instruction")) {
      const instruction = encodeInstruction(
        item.name,
        this.encodeOperands(item.operands, false),
      );
      code.push(instruction);
      debug.push({ offset, line: item.sourceLine });
      offset += instruction.length;
    }
    return { code: Buffer.concat(code), debug };
  }
}

function containsPrint(statements) {
  return statements.some((statement) => {
    if (statement.kind === "print") return true;
    if (statement.kind === "ifStatement") {
      return containsPrint(statement.consequent.statements)
        || (statement.alternate && containsPrint(statement.alternate.statements));
    }
    if (statement.kind === "whileStatement") return containsPrint(statement.body.statements);
    return false;
  });
}

export function compile(source) {
  const program = analyzeProgram(parseProgram(source));
  const hasPrintStatement = containsPrint(program.statements)
    || program.functions.some((func) => containsPrint(func.body.statements));
  const constants = [];
  const imports = [];

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

  const functionNameConstants = new Map();
  for (const func of program.functions) {
    functionNameConstants.set(func.index, constants.length);
    constants.push({ type: "STRING", value: func.name });
  }

  function compileFunction(statements, variableCount, { entry, returnType, fallbackLine }) {
    const assembler = new Assembler();
    const registers = new RegisterAllocator(variableCount);
    const loopStack = [];

    function compileCall(expression) {
      const argumentsList = expression.arguments.map(compileExpression);
      const argumentStart = registers.allocateRange(argumentsList.length);
      for (let index = 0; index < argumentsList.length; index += 1) {
        assembler.emit("MOVE", {
          destination: argumentStart + index,
          source: argumentsList[index],
        });
        registers.release(argumentsList[index]);
      }
      const result = expression.type === "VOID" ? NO_REGISTER : registers.allocate();
      assembler.emit("CALL", {
        function: expression.functionIndex,
        argument_start: argumentStart,
        argument_count: argumentsList.length,
        result,
      });
      registers.releaseRange(argumentStart, argumentsList.length);
      return result;
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
        assembler.emit("MOVE", { destination, source: expression.register });
        return destination;
      }
      if (expression.kind === "callExpression") return compileCall(expression);
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

    function compileConditional(statement) {
      const condition = compileExpression(statement.condition);
      const alternate = assembler.createLabel();
      assembler.emit("JUMP_IF_FALSE", { condition, target: alternate });
      registers.release(condition);
      const consequentTerminates = compileStatements(statement.consequent.statements);

      if (!statement.alternate) {
        assembler.mark(alternate);
        return false;
      }

      const end = assembler.createLabel();
      if (!consequentTerminates) {
        assembler.setSourceLine(statement.line);
        assembler.emit("JUMP", { target: end });
      }
      assembler.mark(alternate);
      const alternateTerminates = compileStatements(statement.alternate.statements);
      if (!consequentTerminates || !alternateTerminates) assembler.mark(end);
      return consequentTerminates && alternateTerminates;
    }

    function compileLoop(statement) {
      const start = assembler.createLabel();
      const end = assembler.createLabel();
      assembler.mark(start);
      const condition = compileExpression(statement.condition);
      assembler.emit("JUMP_IF_FALSE", { condition, target: end });
      registers.release(condition);
      loopStack.push({ breakTarget: end, continueTarget: start });
      const bodyTerminates = compileStatements(statement.body.statements);
      loopStack.pop();
      if (!bodyTerminates) {
        assembler.setSourceLine(statement.line);
        assembler.emit("JUMP", { target: start });
      }
      assembler.mark(end);
      return false;
    }

    function compileStatement(statement) {
      assembler.setSourceLine(statement.line);
      if (statement.kind === "ifStatement") return compileConditional(statement);
      if (statement.kind === "whileStatement") return compileLoop(statement);
      if (statement.kind === "breakStatement") {
        assembler.emit("JUMP", { target: loopStack.at(-1).breakTarget });
        return true;
      }
      if (statement.kind === "continueStatement") {
        assembler.emit("JUMP", { target: loopStack.at(-1).continueTarget });
        return true;
      }
      if (statement.kind === "returnStatement") {
        const result = statement.expression ? compileExpression(statement.expression) : NO_REGISTER;
        assembler.emit("RETURN", { result });
        registers.release(result);
        return true;
      }

      const expression = statement.kind === "variableDeclaration"
        ? statement.initializer
        : statement.expression;
      const result = compileExpression(expression);
      if (statement.kind === "variableDeclaration" || statement.kind === "variableAssignment") {
        assembler.emit("MOVE", { destination: statement.register, source: result });
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
      return false;
    }

    function compileStatements(blockStatements) {
      let terminates = false;
      for (const statement of blockStatements) terminates = compileStatement(statement);
      return terminates;
    }

    const terminates = compileStatements(statements);
    assembler.setSourceLine(statements.at(-1)?.line ?? fallbackLine);
    if (entry) {
      assembler.emit("HALT");
    } else if (returnType === "VOID" && !terminates) {
      assembler.emit("RETURN", { result: NO_REGISTER });
    }
    return {
      ...assembler.assemble(),
      registerCount: registers.maximumRegisterCount,
    };
  }

  const entry = compileFunction(program.statements, program.variableCount, {
    entry: true,
    returnType: "VOID",
    fallbackLine: 1,
  });
  const functions = [{
    name: null,
    code: entry.code,
    debug: entry.debug,
    registerCount: entry.registerCount,
    parameterTypes: [],
    returnType: "VOID",
  }];

  for (const func of program.functions) {
    const compiled = compileFunction(func.body.statements, func.variableCount, {
      entry: false,
      returnType: func.returnType,
      fallbackLine: func.line,
    });
    functions.push({
      name: functionNameConstants.get(func.index),
      code: compiled.code,
      debug: compiled.debug,
      registerCount: compiled.registerCount,
      parameterTypes: func.parameterTypes,
      returnType: func.returnType,
    });
  }

  return encodePortableModule({ constants, imports, functions });
}
