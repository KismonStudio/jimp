import { analyzeProgram } from "./analyzer.js";
import { NO_REGISTER, VALUE_TYPES } from "./generated/isa.js";
import { SANDBOX_LIMITS } from "./generated/sandbox.js";
import { parseProgram } from "./parser.js";
import { encodeInstruction, encodePortableModule } from "./portable/module.js";
import { isAggregateType, isTypeVariable } from "./type-system.js";

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

function vmType(type) {
  return isAggregateType(type) ? "HEAP_REF" : type;
}

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

export function emitAnalyzedProgram(program, {
  resolveCallTarget = (expression) => ({
    kind: "function",
    index: expression.functionIndex,
  }),
  build,
} = {}) {
  const hasPrintStatement = containsPrint(program.statements)
    || program.functions.some((func) => containsPrint(func.body.statements));
  const constants = [];
  const imports = [];
  const hostImports = new Map();
  const hostStringConstants = new Map();

  function ensureHostStringConstant(value) {
    if (!hostStringConstants.has(value)) {
      hostStringConstants.set(value, constants.length);
      constants.push({ type: "STRING", value });
    }
    return hostStringConstants.get(value);
  }

  function ensureHostImport({ capability, parameterTypes, returnType }) {
    const separator = capability.lastIndexOf(".");
    if (separator <= 0 || separator === capability.length - 1) {
      throw new Error(`Internal compiler error: invalid Host ABI capability "${capability}".`);
    }
    const key = JSON.stringify([capability, parameterTypes, returnType]);
    if (hostImports.has(key)) return hostImports.get(key);
    const index = imports.length;
    imports.push({
      namespace: ensureHostStringConstant(capability.slice(0, separator)),
      name: ensureHostStringConstant(capability.slice(separator + 1)),
      parameterTypes: [...parameterTypes],
      returnType,
    });
    hostImports.set(key, index);
    return index;
  }

  if (hasPrintStatement) {
    ensureHostImport({
      capability: "std.console.write",
      parameterTypes: ["STRING"],
      returnType: "VOID",
    });
  }

  const functionNameConstants = new Map();
  for (const func of program.functions) {
    functionNameConstants.set(func, constants.length);
    constants.push({ type: "STRING", value: func.linkedName ?? func.name });
  }

  function compileFunction(
    statements,
    variableCount,
    { entry, returnType, fallbackLine, moduleId },
  ) {
    const assembler = new Assembler();
    const registers = new RegisterAllocator(variableCount);
    const loopStack = [];

    function emitIndexConstant(value) {
      const constant = constants.length;
      constants.push({ type: "I64", value: BigInt(value) });
      const index = registers.allocate();
      assembler.emit("LOAD_CONST", { destination: index, constant });
      return index;
    }

    function boxRegister(register) {
      assembler.emit("HEAP_ALLOC", {
        destination: register,
        value_start: register,
        value_count: 1,
      });
      return register;
    }

    function unboxRegister(register, type) {
      const index = emitIndexConstant(0);
      assembler.emit("HEAP_LOAD", {
        destination: register,
        object: register,
        index,
        result_type: VALUE_TYPES[vmType(type)],
      });
      registers.release(index);
      return register;
    }

    function compileCall(expression) {
      const argumentsList = expression.arguments.map((argument, index) => {
        const register = compileExpression(argument);
        return expression.boxArguments?.[index] ? boxRegister(register) : register;
      });
      const argumentStart = registers.allocateRange(argumentsList.length);
      for (let index = 0; index < argumentsList.length; index += 1) {
        assembler.emit("MOVE", {
          destination: argumentStart + index,
          source: argumentsList[index],
        });
        registers.release(argumentsList[index]);
      }
      const result = expression.type === "VOID" ? NO_REGISTER : registers.allocate();
      const target = resolveCallTarget(expression, moduleId);
      if (target.kind === "host") {
        assembler.emit("HOST_CALL", {
          import: ensureHostImport(target),
          argument_start: argumentStart,
          argument_count: argumentsList.length,
          result,
        });
      } else {
        assembler.emit("CALL", {
          function: target.index,
          argument_start: argumentStart,
          argument_count: argumentsList.length,
          result,
        });
      }
      registers.releaseRange(argumentStart, argumentsList.length);
      if (result !== NO_REGISTER && expression.unboxResult) unboxRegister(result, expression.type);
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
      if (expression.kind === "arrayLiteral" || expression.kind === "recordLiteral") {
        const values = expression.kind === "arrayLiteral"
          ? expression.elements.map(compileExpression)
          : expression.fields.map((field) => {
            const register = compileExpression(field.expression);
            return field.boxed && !isTypeVariable(field.expression.type)
              ? boxRegister(register)
              : register;
          });
        const valueStart = registers.allocateRange(values.length);
        for (let index = 0; index < values.length; index += 1) {
          assembler.emit("MOVE", { destination: valueStart + index, source: values[index] });
          registers.release(values[index]);
        }
        const destination = registers.allocate();
        assembler.emit("HEAP_ALLOC", {
          destination,
          value_start: valueStart,
          value_count: values.length,
        });
        registers.releaseRange(valueStart, values.length);
        return destination;
      }
      if (expression.kind === "variantLiteral") {
        const values = [emitIndexConstant(expression.alternative.tag)];
        for (const argument of expression.arguments) {
          const register = compileExpression(argument.expression);
          values.push(argument.boxed && !isTypeVariable(argument.expression.type)
            ? boxRegister(register)
            : register);
        }
        const valueStart = registers.allocateRange(values.length);
        for (let index = 0; index < values.length; index += 1) {
          assembler.emit("MOVE", { destination: valueStart + index, source: values[index] });
          registers.release(values[index]);
        }
        const destination = registers.allocate();
        assembler.emit("HEAP_ALLOC", {
          destination,
          value_start: valueStart,
          value_count: values.length,
        });
        registers.releaseRange(valueStart, values.length);
        return destination;
      }
      if (expression.kind === "matchExpression") {
        const object = compileExpression(expression.value);
        const tagIndex = emitIndexConstant(0);
        const tag = registers.allocate();
        assembler.emit("HEAP_LOAD", {
          destination: tag,
          object,
          index: tagIndex,
          result_type: VALUE_TYPES.I64,
        });
        registers.release(tagIndex);
        const result = registers.allocate();
        const end = assembler.createLabel();
        for (let armIndex = 0; armIndex < expression.arms.length; armIndex += 1) {
          const arm = expression.arms[armIndex];
          const last = armIndex === expression.arms.length - 1;
          let next = null;
          if (!last) {
            const expectedTag = emitIndexConstant(arm.alternative.tag);
            const matches = registers.allocate();
            assembler.emit("EQUAL", { destination: matches, left: tag, right: expectedTag });
            registers.release(expectedTag);
            next = assembler.createLabel();
            assembler.emit("JUMP_IF_FALSE", { condition: matches, target: next });
            registers.release(matches);
          }
          for (let index = 0; index < arm.bindings.length; index += 1) {
            const binding = arm.bindings[index];
            if (binding.ignored) continue;
            const fieldIndex = emitIndexConstant(index + 1);
            const loaded = registers.allocate();
            assembler.emit("HEAP_LOAD", {
              destination: loaded,
              object,
              index: fieldIndex,
              result_type: VALUE_TYPES[binding.field.boxed ? "HEAP_REF" : vmType(binding.type)],
            });
            registers.release(fieldIndex);
            if (binding.field.boxed && !isTypeVariable(binding.type)) {
              unboxRegister(loaded, binding.type);
            }
            assembler.emit("MOVE", { destination: binding.register, source: loaded });
            registers.release(loaded);
          }
          const armResult = compileExpression(arm.expression);
          assembler.emit("MOVE", { destination: result, source: armResult });
          registers.release(armResult);
          if (!last) {
            assembler.emit("JUMP", { target: end });
            assembler.mark(next);
          }
        }
        assembler.mark(end);
        registers.release(tag);
        registers.release(object);
        return result;
      }
      if (expression.kind === "indexExpression") {
        const object = compileExpression(expression.object);
        const index = compileExpression(expression.index);
        if (expression.indexKind === "string") {
          assembler.emit("STRING_LOAD", { destination: object, value: object, index });
        } else {
          assembler.emit("HEAP_LOAD", {
            destination: object,
            object,
            index,
            result_type: VALUE_TYPES[vmType(expression.type)],
          });
        }
        registers.release(index);
        return object;
      }
      if (expression.kind === "sliceExpression") {
        const object = compileExpression(expression.object);
        const start = compileExpression(expression.start);
        const end = compileExpression(expression.end);
        assembler.emit("STRING_SLICE", { destination: object, value: object, start, end });
        registers.release(start);
        registers.release(end);
        return object;
      }
      if (expression.kind === "memberExpression") {
        const object = compileExpression(expression.object);
        if (expression.memberKind === "arrayLength") {
          assembler.emit("HEAP_LENGTH", { destination: object, object });
          return object;
        }
        if (expression.memberKind === "stringLength") {
          assembler.emit("STRING_LENGTH", { destination: object, value: object });
          return object;
        }
        const constant = constants.length;
        constants.push({ type: "I64", value: BigInt(expression.field.index) });
        const index = registers.allocate();
        assembler.emit("LOAD_CONST", { destination: index, constant });
        assembler.emit("HEAP_LOAD", {
          destination: object,
          object,
          index,
          result_type: VALUE_TYPES[expression.boxed ? "HEAP_REF" : vmType(expression.type)],
        });
        registers.release(index);
        if (expression.boxed && !isTypeVariable(expression.type)) {
          unboxRegister(object, expression.type);
        }
        return object;
      }
      if (expression.kind === "arrayUpdateExpression") {
        const object = compileExpression(expression.object);
        const index = compileExpression(expression.index);
        const value = compileExpression(expression.value);
        assembler.emit("HEAP_REPLACE", { destination: object, object, index, value });
        registers.release(index);
        registers.release(value);
        return object;
      }
      if (expression.kind === "recordUpdateExpression") {
        const object = compileExpression(expression.object);
        for (const field of expression.fields) {
          const constant = constants.length;
          constants.push({ type: "I64", value: BigInt(field.index) });
          const index = registers.allocate();
          assembler.emit("LOAD_CONST", { destination: index, constant });
          const value = compileExpression(field.expression);
          if (field.boxed && !isTypeVariable(field.expression.type)) boxRegister(value);
          assembler.emit("HEAP_REPLACE", { destination: object, object, index, value });
          registers.release(index);
          registers.release(value);
        }
        return object;
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
      if (expression.operationKind === "stringConcat") {
        assembler.emit("STRING_CONCAT", { destination: left, left, right });
        registers.release(right);
        return left;
      }
      if (isAggregateType(expression.left.type)) {
        assembler.emit("HEAP_EQUAL", { destination: left, left, right });
        if (expression.operator === "!=") {
          assembler.emit("BOOL_NOT", { destination: left, operand: left });
        }
        registers.release(right);
        return left;
      }
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
    moduleId: program.moduleId ?? null,
  });
  const functions = [{
    name: null,
    moduleId: program.moduleId ?? null,
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
      moduleId: func.moduleId ?? program.moduleId ?? null,
    });
    functions.push({
      name: functionNameConstants.get(func),
      moduleId: func.moduleId ?? program.moduleId ?? null,
      code: compiled.code,
      debug: compiled.debug,
      registerCount: compiled.registerCount,
      parameterTypes: func.parameterTypes.map(vmType),
      returnType: vmType(func.returnType),
    });
  }

  return encodePortableModule({ constants, imports, functions, build });
}

export function compile(source) {
  const parsed = parseProgram(source);
  if (parsed.imports.length > 0) {
    throw new Error(
      `Source imports require project graph compilation at line ${parsed.imports[0].line}.`,
    );
  }
  return emitAnalyzedProgram(analyzeProgram(parsed));
}
