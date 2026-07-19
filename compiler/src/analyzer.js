const RESERVED_WORDS = new Set(["false", "let", "null", "print", "true", "var"]);
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

function requireVariable(variables, name, line) {
  const variable = variables.get(name);
  if (!variable) {
    throw new Error(`Variable "${name}" is not declared at line ${line}.`);
  }
  return variable;
}

function typeError(operator, leftType, rightType, line) {
  const operands = rightType ? `${leftType} and ${rightType}` : leftType;
  throw new Error(`Operator "${operator}" does not accept ${operands} at line ${line}.`);
}

function analyzeExpression(expression, variables) {
  if (expression.kind === "literal") {
    return { ...expression, type: expression.value.type };
  }

  if (expression.kind === "identifier") {
    const variable = requireVariable(variables, expression.name, expression.line);
    return {
      ...expression,
      register: variable.register,
      type: variable.type,
    };
  }

  if (expression.kind === "unaryExpression") {
    const operand = analyzeExpression(expression.operand, variables);
    if (expression.operator === "-" && NUMERIC_TYPES.has(operand.type)) {
      return { ...expression, operand, type: operand.type };
    }
    if (expression.operator === "!" && operand.type === "BOOL") {
      return { ...expression, operand, type: "BOOL" };
    }
    return typeError(expression.operator, operand.type, null, expression.line);
  }

  const left = analyzeExpression(expression.left, variables);
  const right = analyzeExpression(expression.right, variables);
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

export function analyzeProgram(program) {
  const variables = new Map();
  const statements = [];

  for (const statement of program.statements) {
    if (statement.kind === "variableDeclaration") {
      assertVariableName(statement.name, statement.line);
      const previous = variables.get(statement.name);
      if (previous) {
        throw new Error(
          `Variable "${statement.name}" is already declared at line ${statement.line}; `
          + `the first declaration is at line ${previous.line}.`,
        );
      }
      const initializer = analyzeExpression(statement.initializer, variables);
      const variable = {
        line: statement.line,
        mutable: statement.mutable,
        register: variables.size,
        type: initializer.type,
      };
      variables.set(statement.name, variable);
      statements.push({
        ...statement,
        initializer,
        register: variable.register,
        type: initializer.type,
      });
      continue;
    }

    if (statement.kind === "variableAssignment") {
      const variable = requireVariable(variables, statement.name, statement.line);
      if (!variable.mutable) {
        throw new Error(
          `Cannot assign to immutable variable "${statement.name}" at line ${statement.line}.`,
        );
      }
      const expression = analyzeExpression(statement.expression, variables);
      variable.type = expression.type;
      statements.push({
        ...statement,
        expression,
        register: variable.register,
        type: expression.type,
      });
      continue;
    }

    const expression = analyzeExpression(statement.expression, variables);
    if (statement.kind === "print" && expression.type !== "STRING") {
      throw new Error(
        `print requires a STRING expression, received ${expression.type} at line ${statement.line}.`,
      );
    }
    statements.push({ ...statement, expression, type: expression.type });
  }

  return {
    kind: "analyzedProgram",
    statements,
    variableCount: variables.size,
  };
}
