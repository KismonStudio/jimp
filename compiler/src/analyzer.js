import { SANDBOX_LIMITS } from "./generated/sandbox.js";

const RESERVED_WORDS = new Set([
  "break", "continue", "else", "false", "function", "if", "let", "null",
  "print", "return", "true", "var", "while",
]);
const PARAMETER_TYPES = new Set(["BOOL", "I64", "F64", "STRING"]);
const RETURN_TYPES = new Set(["NULL", "BOOL", "I64", "F64", "STRING", "VOID"]);
const NUMERIC_TYPES = new Set(["I64", "F64"]);
const ARITHMETIC_OPERATORS = new Set(["+", "-", "*", "/", "%"]);
const EQUALITY_OPERATORS = new Set(["==", "!="]);
const COMPARISON_OPERATORS = new Set(["<", "<=", ">", ">="]);
const BOOLEAN_OPERATORS = new Set(["&&", "||"]);

function assertName(name, line, kind, functions) {
  if (RESERVED_WORDS.has(name)) {
    throw new Error(`Reserved word "${name}" cannot be used as a ${kind} name at line ${line}.`);
  }
  if (kind === "variable" && functions.has(name)) {
    throw new Error(`Variable "${name}" conflicts with a function name at line ${line}.`);
  }
}

function cloneState(state) {
  return {
    ...state,
    scopes: state.scopes.map((scope) => new Map(
      [...scope].map(([name, variable]) => [name, { ...variable }]),
    )),
    loopTypeGuards: [...state.loopTypeGuards],
  };
}

function findVariableByRegister(state, register) {
  for (const scope of state.scopes) {
    for (const variable of scope.values()) {
      if (variable.register === register) return variable;
    }
  }
  return null;
}

function requireVariable(state, name, line) {
  for (let index = state.scopes.length - 1; index >= 0; index -= 1) {
    const variable = state.scopes[index].get(name);
    if (variable) return variable;
  }
  throw new Error(`Variable "${name}" is not declared at line ${line}.`);
}

function typeError(operator, leftType, rightType, line) {
  const operands = rightType ? `${leftType} and ${rightType}` : leftType;
  throw new Error(`Operator "${operator}" does not accept ${operands} at line ${line}.`);
}

function analyzeCall(expression, state) {
  const signature = state.functions.get(expression.callee);
  if (!signature) {
    throw new Error(`Function "${expression.callee}" is not declared at line ${expression.line}.`);
  }
  const argumentsList = expression.arguments.map((argument) => analyzeExpression(argument, state));
  if (argumentsList.length !== signature.parameterTypes.length) {
    throw new Error(
      `Function "${expression.callee}" expects ${signature.parameterTypes.length} argument(s), `
      + `received ${argumentsList.length} at line ${expression.line}.`,
    );
  }
  for (let index = 0; index < argumentsList.length; index += 1) {
    if (argumentsList[index].type !== signature.parameterTypes[index]) {
      throw new Error(
        `Function "${expression.callee}" argument ${index} requires `
        + `${signature.parameterTypes[index]}, received ${argumentsList[index].type} `
        + `at line ${expression.line}.`,
      );
    }
  }
  return {
    ...expression,
    arguments: argumentsList,
    functionIndex: signature.index,
    type: signature.returnType,
  };
}

function analyzeExpression(expression, state) {
  if (expression.kind === "literal") {
    return { ...expression, type: expression.value.type };
  }
  if (expression.kind === "identifier") {
    const variable = requireVariable(state, expression.name, expression.line);
    return { ...expression, register: variable.register, type: variable.type };
  }
  if (expression.kind === "callExpression") return analyzeCall(expression, state);
  if (expression.kind === "unaryExpression") {
    const operand = analyzeExpression(expression.operand, state);
    if (expression.operator === "-" && NUMERIC_TYPES.has(operand.type)) {
      return { ...expression, operand, type: operand.type };
    }
    if (expression.operator === "!" && operand.type === "BOOL") {
      return { ...expression, operand, type: "BOOL" };
    }
    return typeError(expression.operator, operand.type, null, expression.line);
  }

  const left = analyzeExpression(expression.left, state);
  const right = analyzeExpression(expression.right, state);
  const sameType = left.type === right.type;
  if (ARITHMETIC_OPERATORS.has(expression.operator)) {
    if (!sameType || !NUMERIC_TYPES.has(left.type)) {
      return typeError(expression.operator, left.type, right.type, expression.line);
    }
    return { ...expression, left, right, type: left.type };
  }
  if (EQUALITY_OPERATORS.has(expression.operator)) {
    if (!sameType || left.type === "VOID") {
      return typeError(expression.operator, left.type, right.type, expression.line);
    }
    return { ...expression, left, right, type: "BOOL" };
  }
  if (COMPARISON_OPERATORS.has(expression.operator)) {
    if (!sameType || !NUMERIC_TYPES.has(left.type)) {
      return typeError(expression.operator, left.type, right.type, expression.line);
    }
    return { ...expression, left, right, type: "BOOL" };
  }
  if (BOOLEAN_OPERATORS.has(expression.operator)) {
    if (!sameType || left.type !== "BOOL") {
      return typeError(expression.operator, left.type, right.type, expression.line);
    }
    return { ...expression, left, right, type: "BOOL" };
  }
  throw new Error(`Unsupported operator "${expression.operator}" at line ${expression.line}.`);
}

function visibleTypes(state) {
  const types = new Map();
  for (const scope of state.scopes) {
    for (const variable of scope.values()) types.set(variable.register, variable.type);
  }
  return types;
}

function copyVisibleTypes(destination, source) {
  for (const scope of destination.scopes) {
    for (const variable of scope.values()) {
      const sourceVariable = findVariableByRegister(source, variable.register);
      if (sourceVariable) variable.type = sourceVariable.type;
    }
  }
}

function mergeConditionalState(state, consequent, alternate, line) {
  if (consequent.terminates && alternate.terminates) return;
  if (consequent.terminates) {
    copyVisibleTypes(state, alternate.state);
    return;
  }
  if (alternate.terminates) {
    copyVisibleTypes(state, consequent.state);
    return;
  }
  for (const scope of state.scopes) {
    for (const [name, variable] of scope) {
      const left = findVariableByRegister(consequent.state, variable.register);
      const right = findVariableByRegister(alternate.state, variable.register);
      if (!left || !right || left.type !== right.type) {
        throw new Error(
          `Variable "${name}" has incompatible types across conditional paths at line ${line}.`,
        );
      }
      variable.type = left.type;
    }
  }
}

function analyzeBlock(block, state) {
  state.scopes.push(new Map());
  const result = analyzeStatements(block.statements, state);
  state.scopes.pop();
  return { block: { ...block, statements: result.statements }, terminates: result.terminates, state };
}

function analyzeDeclaration(statement, state) {
  assertName(statement.name, statement.line, "variable", state.functions);
  const scope = state.scopes.at(-1);
  const previous = scope.get(statement.name);
  if (previous) {
    throw new Error(
      `Variable "${statement.name}" is already declared at line ${statement.line}; `
      + `the first declaration is at line ${previous.line}.`,
    );
  }
  const initializer = analyzeExpression(statement.initializer, state);
  if (initializer.type === "VOID") {
    throw new Error(`Variable "${statement.name}" cannot be initialized with VOID at line ${statement.line}.`);
  }
  if (state.context.nextRegister >= SANDBOX_LIMITS.MAX_REGISTERS_PER_FUNCTION) {
    throw new Error(
      `Function scope exceeds the sandbox limit of ${SANDBOX_LIMITS.MAX_REGISTERS_PER_FUNCTION} variables at line ${statement.line}.`,
    );
  }
  const variable = {
    line: statement.line,
    mutable: statement.mutable,
    register: state.context.nextRegister,
    type: initializer.type,
  };
  state.context.nextRegister += 1;
  scope.set(statement.name, variable);
  return {
    statement: { ...statement, initializer, register: variable.register, type: initializer.type },
    terminates: false,
  };
}

function analyzeAssignment(statement, state) {
  const variable = requireVariable(state, statement.name, statement.line);
  if (!variable.mutable) {
    throw new Error(`Cannot assign to immutable variable "${statement.name}" at line ${statement.line}.`);
  }
  const expression = analyzeExpression(statement.expression, state);
  if (expression.type === "VOID") {
    throw new Error(`Variable "${statement.name}" cannot be assigned VOID at line ${statement.line}.`);
  }
  for (const guard of state.loopTypeGuards) {
    const guardedType = guard.get(variable.register);
    if (guardedType && guardedType !== expression.type) {
      throw new Error(
        `Variable "${statement.name}" must preserve type ${guardedType} inside a loop at line ${statement.line}.`,
      );
    }
  }
  variable.type = expression.type;
  return {
    statement: { ...statement, expression, register: variable.register, type: expression.type },
    terminates: false,
  };
}

function analyzeConditional(statement, state) {
  const condition = analyzeExpression(statement.condition, state);
  if (condition.type !== "BOOL") {
    throw new Error(`if requires a BOOL condition, received ${condition.type} at line ${statement.line}.`);
  }
  const consequent = analyzeBlock(statement.consequent, cloneState(state));
  const alternate = statement.alternate
    ? analyzeBlock(statement.alternate, cloneState(state))
    : { block: null, terminates: false, state: cloneState(state) };
  mergeConditionalState(state, consequent, alternate, statement.line);
  return {
    statement: {
      ...statement,
      condition,
      consequent: consequent.block,
      alternate: alternate.block,
      terminates: consequent.terminates && alternate.terminates,
    },
    terminates: consequent.terminates && alternate.terminates,
  };
}

function analyzeLoop(statement, state) {
  const condition = analyzeExpression(statement.condition, state);
  if (condition.type !== "BOOL") {
    throw new Error(`while requires a BOOL condition, received ${condition.type} at line ${statement.line}.`);
  }
  const bodyState = cloneState(state);
  bodyState.loopDepth += 1;
  bodyState.loopTypeGuards.push(visibleTypes(state));
  const body = analyzeBlock(statement.body, bodyState);
  return {
    statement: { ...statement, condition, body: body.block, terminates: false },
    terminates: false,
  };
}

function analyzeReturn(statement, state) {
  if (!state.currentFunction) {
    throw new Error(`return is only valid inside a function at line ${statement.line}.`);
  }
  const expected = state.currentFunction.returnType;
  const expression = statement.expression ? analyzeExpression(statement.expression, state) : null;
  if (expected === "VOID" && expression) {
    throw new Error(`VOID function "${state.currentFunction.name}" cannot return a value at line ${statement.line}.`);
  }
  if (expected !== "VOID" && !expression) {
    throw new Error(
      `Function "${state.currentFunction.name}" must return ${expected} at line ${statement.line}.`,
    );
  }
  if (expression && expression.type !== expected) {
    throw new Error(
      `Function "${state.currentFunction.name}" must return ${expected}, `
      + `received ${expression.type} at line ${statement.line}.`,
    );
  }
  return { statement: { ...statement, expression, type: expected }, terminates: true };
}

function analyzeStatement(statement, state) {
  if (statement.kind === "variableDeclaration") return analyzeDeclaration(statement, state);
  if (statement.kind === "variableAssignment") return analyzeAssignment(statement, state);
  if (statement.kind === "ifStatement") return analyzeConditional(statement, state);
  if (statement.kind === "whileStatement") return analyzeLoop(statement, state);
  if (statement.kind === "returnStatement") return analyzeReturn(statement, state);
  if (statement.kind === "breakStatement" || statement.kind === "continueStatement") {
    if (state.loopDepth === 0) {
      const keyword = statement.kind === "breakStatement" ? "break" : "continue";
      throw new Error(`${keyword} is only valid inside a loop at line ${statement.line}.`);
    }
    return { statement, terminates: true };
  }

  const expression = analyzeExpression(statement.expression, state);
  if (statement.kind === "print" && expression.type !== "STRING") {
    throw new Error(
      `print requires a STRING expression, received ${expression.type} at line ${statement.line}.`,
    );
  }
  return { statement: { ...statement, expression, type: expression.type }, terminates: false };
}

function analyzeStatements(statements, state) {
  const analyzed = [];
  let terminates = false;
  for (const statement of statements) {
    if (terminates) throw new Error(`Unreachable statement at line ${statement.line}.`);
    const result = analyzeStatement(statement, state);
    analyzed.push(result.statement);
    terminates = result.terminates;
  }
  return { statements: analyzed, terminates };
}

function collectFunctions(program) {
  const functions = new Map();
  let index = 1;
  for (const declaration of program.statements.filter(({ kind }) => kind === "functionDeclaration")) {
    if (index >= SANDBOX_LIMITS.MAX_FUNCTIONS) {
      throw new Error(
        `Program exceeds the sandbox limit of ${SANDBOX_LIMITS.MAX_FUNCTIONS} functions at line ${declaration.line}.`,
      );
    }
    assertName(declaration.name, declaration.line, "function", functions);
    if (functions.has(declaration.name)) {
      throw new Error(`Function "${declaration.name}" is already declared at line ${declaration.line}.`);
    }
    if (!RETURN_TYPES.has(declaration.returnType)) {
      throw new Error(`Invalid return type for function "${declaration.name}" at line ${declaration.line}.`);
    }
    const parameterNames = new Set();
    if (declaration.parameters.length > SANDBOX_LIMITS.MAX_PARAMETERS) {
      throw new Error(
        `Function "${declaration.name}" exceeds the sandbox limit of ${SANDBOX_LIMITS.MAX_PARAMETERS} parameters at line ${declaration.line}.`,
      );
    }
    for (const parameter of declaration.parameters) {
      assertName(parameter.name, parameter.line, "parameter", functions);
      if (!PARAMETER_TYPES.has(parameter.type)) {
        throw new Error(
          `Parameter "${parameter.name}" cannot use type ${parameter.type} at line ${parameter.line}.`,
        );
      }
      if (parameterNames.has(parameter.name)) {
        throw new Error(`Duplicate parameter "${parameter.name}" at line ${parameter.line}.`);
      }
      parameterNames.add(parameter.name);
    }
    functions.set(declaration.name, {
      declaration,
      index,
      parameterTypes: declaration.parameters.map(({ type }) => type),
      returnType: declaration.returnType,
    });
    index += 1;
  }
  return functions;
}

function analyzeFunction(signature, functions) {
  const context = { nextRegister: signature.parameterTypes.length };
  const scope = new Map();
  const parameters = signature.declaration.parameters.map((parameter, register) => {
    scope.set(parameter.name, {
      line: parameter.line,
      mutable: false,
      register,
      type: parameter.type,
    });
    return { ...parameter, register };
  });
  const state = {
    context,
    scopes: [scope],
    functions,
    currentFunction: { name: signature.declaration.name, returnType: signature.returnType },
    loopDepth: 0,
    loopTypeGuards: [],
  };
  const body = analyzeStatements(signature.declaration.body.statements, state);
  if (signature.returnType !== "VOID" && !body.terminates) {
    throw new Error(
      `Function "${signature.declaration.name}" does not return ${signature.returnType} on every path.`,
    );
  }
  return {
    ...signature.declaration,
    index: signature.index,
    parameters,
    parameterTypes: signature.parameterTypes,
    body: { ...signature.declaration.body, statements: body.statements },
    variableCount: context.nextRegister,
  };
}

export function analyzeProgram(program) {
  const functions = collectFunctions(program);
  const entryContext = { nextRegister: 0 };
  const entryState = {
    context: entryContext,
    scopes: [new Map()],
    functions,
    currentFunction: null,
    loopDepth: 0,
    loopTypeGuards: [],
  };
  const entryStatements = program.statements.filter(({ kind }) => kind !== "functionDeclaration");
  const entry = analyzeStatements(entryStatements, entryState);
  const analyzedFunctions = [...functions.values()].map((signature) =>
    analyzeFunction(signature, functions));
  return {
    kind: "analyzedProgram",
    statements: entry.statements,
    functions: analyzedFunctions,
    variableCount: entryContext.nextRegister,
  };
}
