const RESERVED_WORDS = new Set([
  "else", "false", "if", "let", "null", "print", "true", "var",
]);
const NUMERIC_TYPES = new Set(["I64", "F64"]);
const ARITHMETIC_OPERATORS = new Set(["+", "-", "*", "/", "%"]);
const EQUALITY_OPERATORS = new Set(["==", "!="]);
const COMPARISON_OPERATORS = new Set(["<", "<=", ">", ">="]);
const BOOLEAN_OPERATORS = new Set(["&&", "||"]);

function assertVariableName(name, line) {
  if (RESERVED_WORDS.has(name)) {
    throw new Error(`Reserved word "${name}" cannot be used as a variable name at line ${line}.`);
  }
}

function cloneState(state) {
  return {
    context: state.context,
    scopes: state.scopes.map((scope) => new Map(
      [...scope].map(([name, variable]) => [name, { ...variable }]),
    )),
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

function analyzeExpression(expression, state) {
  if (expression.kind === "literal") {
    return { ...expression, type: expression.value.type };
  }

  if (expression.kind === "identifier") {
    const variable = requireVariable(state, expression.name, expression.line);
    return {
      ...expression,
      register: variable.register,
      type: variable.type,
    };
  }

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
    if (!sameType) {
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

function analyzeBlock(block, state) {
  state.scopes.push(new Map());
  const statements = analyzeStatements(block.statements, state);
  state.scopes.pop();
  return { ...block, statements };
}

function mergeConditionalState(state, consequentState, alternateState, line) {
  for (const scope of state.scopes) {
    for (const [name, variable] of scope) {
      const consequent = findVariableByRegister(consequentState, variable.register);
      const alternate = findVariableByRegister(alternateState, variable.register);
      if (!consequent || !alternate || consequent.type !== alternate.type) {
        throw new Error(
          `Variable "${name}" has incompatible types across conditional paths at line ${line}.`,
        );
      }
      variable.type = consequent.type;
    }
  }
}

function analyzeStatement(statement, state) {
  if (statement.kind === "variableDeclaration") {
    assertVariableName(statement.name, statement.line);
    const scope = state.scopes.at(-1);
    const previous = scope.get(statement.name);
    if (previous) {
      throw new Error(
        `Variable "${statement.name}" is already declared at line ${statement.line}; `
        + `the first declaration is at line ${previous.line}.`,
      );
    }
    const initializer = analyzeExpression(statement.initializer, state);
    const variable = {
      line: statement.line,
      mutable: statement.mutable,
      register: state.context.nextRegister,
      type: initializer.type,
    };
    state.context.nextRegister += 1;
    scope.set(statement.name, variable);
    return {
      ...statement,
      initializer,
      register: variable.register,
      type: initializer.type,
    };
  }

  if (statement.kind === "variableAssignment") {
    const variable = requireVariable(state, statement.name, statement.line);
    if (!variable.mutable) {
      throw new Error(
        `Cannot assign to immutable variable "${statement.name}" at line ${statement.line}.`,
      );
    }
    const expression = analyzeExpression(statement.expression, state);
    variable.type = expression.type;
    return {
      ...statement,
      expression,
      register: variable.register,
      type: expression.type,
    };
  }

  if (statement.kind === "ifStatement") {
    const condition = analyzeExpression(statement.condition, state);
    if (condition.type !== "BOOL") {
      throw new Error(
        `if requires a BOOL condition, received ${condition.type} at line ${statement.line}.`,
      );
    }

    const consequentState = cloneState(state);
    const consequent = analyzeBlock(statement.consequent, consequentState);
    const alternateState = cloneState(state);
    const alternate = statement.alternate
      ? analyzeBlock(statement.alternate, alternateState)
      : null;
    mergeConditionalState(state, consequentState, alternateState, statement.line);
    return { ...statement, condition, consequent, alternate };
  }

  const expression = analyzeExpression(statement.expression, state);
  if (statement.kind === "print" && expression.type !== "STRING") {
    throw new Error(
      `print requires a STRING expression, received ${expression.type} at line ${statement.line}.`,
    );
  }
  return { ...statement, expression, type: expression.type };
}

function analyzeStatements(statements, state) {
  return statements.map((statement) => analyzeStatement(statement, state));
}

export function analyzeProgram(program) {
  const state = {
    context: { nextRegister: 0 },
    scopes: [new Map()],
  };
  const statements = analyzeStatements(program.statements, state);
  return {
    kind: "analyzedProgram",
    statements,
    variableCount: state.context.nextRegister,
  };
}
