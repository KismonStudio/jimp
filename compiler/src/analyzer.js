import { SANDBOX_LIMITS } from "./generated/sandbox.js";
import { withModuleContext } from "./module-context.js";

const RESERVED_WORDS = new Set([
  "as", "break", "continue", "else", "export", "false", "from", "function",
  "if", "import", "let", "null", "print", "record", "return", "true", "var", "while", "with",
]);
const VALUE_TYPES = new Set(["NULL", "BOOL", "I64", "F64", "STRING"]);
const NUMERIC_TYPES = new Set(["I64", "F64"]);
const ARITHMETIC_OPERATORS = new Set(["+", "-", "*", "/", "%"]);
const EQUALITY_OPERATORS = new Set(["==", "!="]);
const COMPARISON_OPERATORS = new Set(["<", "<=", ">", ">="]);
const BOOLEAN_OPERATORS = new Set(["&&", "||"]);

function isArrayType(type) {
  return typeof type === "string" && type.startsWith("[") && type.endsWith("]");
}

function arrayElementType(type) {
  return type.slice(1, -1);
}

function isRecordType(type) {
  return typeof type === "string" && type.startsWith("RECORD<") && type.endsWith(">");
}

function isAggregateType(type) {
  return isArrayType(type) || isRecordType(type);
}

function canonicalRecordType(moduleId, name) {
  return `RECORD<${moduleId ?? "<entry>"}::${name}>`;
}

function resolveType(type, state, line, { allowNull = true, allowVoid = false } = {}) {
  if (isArrayType(type)) {
    const element = resolveType(arrayElementType(type), state, line, {
      allowNull: false,
      allowVoid: false,
    });
    return `[${element}]`;
  }
  if (VALUE_TYPES.has(type)) {
    if (!allowNull && type === "NULL") throw new Error(`Type NULL is not valid here at line ${line}.`);
    return type;
  }
  if (type === "VOID") {
    if (allowVoid) return type;
    throw new Error(`Type VOID is not valid here at line ${line}.`);
  }
  const record = state.types.get(type);
  if (!record) throw new Error(`Type "${type}" is not declared at line ${line}.`);
  return record.type;
}

function requireRecord(state, type, line) {
  const record = state.recordsByType.get(type);
  if (!record) throw new Error(`Expected a record value, received ${type} at line ${line}.`);
  return record;
}

function assertName(name, line, kind, functions) {
  if (RESERVED_WORDS.has(name)) {
    throw new Error(`Reserved word "${name}" cannot be used as a ${kind} name at line ${line}.`);
  }
  if (kind === "variable" && functions.has(name)) {
    const binding = functions.get(name);
    const target = binding.kind === "imported" ? "an imported function binding" : "a function name";
    throw new Error(`Variable "${name}" conflicts with ${target} at line ${line}.`);
  }
  if (kind === "parameter" && functions.get(name)?.kind === "imported") {
    throw new Error(`Parameter "${name}" conflicts with an imported function binding at line ${line}.`);
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
  if (expression.arguments.length !== signature.parameterTypes.length) {
    throw new Error(
      `Function "${expression.callee}" expects ${signature.parameterTypes.length} argument(s), `
      + `received ${expression.arguments.length} at line ${expression.line}.`,
    );
  }
  const argumentsList = expression.arguments.map((argument, index) =>
    analyzeExpression(argument, state, signature.parameterTypes[index]));
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
    functionIndex: signature.kind === "local" ? signature.index : null,
    functionIdentity: signature.kind === "imported" ? signature.identity : null,
    type: signature.returnType,
  };
}

function analyzeExpression(expression, state, expectedType = null) {
  if (expression.kind === "literal") {
    return { ...expression, type: expression.value.type };
  }
  if (expression.kind === "identifier") {
    const variable = requireVariable(state, expression.name, expression.line);
    return { ...expression, register: variable.register, type: variable.type };
  }
  if (expression.kind === "callExpression") return analyzeCall(expression, state);
  if (expression.kind === "arrayLiteral") {
    const contextualElement = expectedType && isArrayType(expectedType)
      ? arrayElementType(expectedType)
      : null;
    if (expression.elements.length === 0 && contextualElement === null) {
      throw new Error(`Empty array literal requires a contextual array type at line ${expression.line}.`);
    }
    const elements = [];
    let elementType = contextualElement;
    for (const element of expression.elements) {
      const analyzed = analyzeExpression(element, state, elementType);
      elementType ??= analyzed.type;
      if (analyzed.type !== elementType) {
        throw new Error(
          `Array literal requires ${elementType} elements, received ${analyzed.type} at line ${expression.line}.`,
        );
      }
      elements.push(analyzed);
    }
    const type = `[${elementType}]`;
    if (expectedType !== null && type !== expectedType) {
      throw new Error(`Expected ${expectedType}, received ${type} at line ${expression.line}.`);
    }
    return { ...expression, elements, elementType, type };
  }
  if (expression.kind === "recordLiteral") {
    const record = state.types.get(expression.recordName);
    if (!record || record.kind !== "record") {
      throw new Error(`Record "${expression.recordName}" is not declared at line ${expression.line}.`);
    }
    if (expectedType !== null && expectedType !== record.type) {
      throw new Error(`Expected ${expectedType}, received ${record.type} at line ${expression.line}.`);
    }
    const provided = new Map();
    for (const field of expression.fields) {
      if (provided.has(field.name)) {
        throw new Error(`Record field "${field.name}" is duplicated at line ${field.line}.`);
      }
      provided.set(field.name, field);
    }
    const fields = record.fields.map((definition, index) => {
      const field = provided.get(definition.name);
      if (!field) {
        throw new Error(`Record "${record.name}" is missing field "${definition.name}" at line ${expression.line}.`);
      }
      provided.delete(definition.name);
      const analyzed = analyzeExpression(field.expression, state, definition.type);
      if (analyzed.type !== definition.type) {
        throw new Error(
          `Record field "${definition.name}" requires ${definition.type}, received ${analyzed.type} at line ${field.line}.`,
        );
      }
      return { ...field, expression: analyzed, type: definition.type, index };
    });
    if (provided.size > 0) {
      const field = provided.values().next().value;
      throw new Error(`Record "${record.name}" has no field "${field.name}" at line ${field.line}.`);
    }
    return { ...expression, fields, record, type: record.type };
  }
  if (expression.kind === "indexExpression") {
    const object = analyzeExpression(expression.object, state);
    const index = analyzeExpression(expression.index, state, "I64");
    if (index.type !== "I64") {
      throw new Error(`Indexed access requires an I64 index, received ${index.type} at line ${expression.line}.`);
    }
    if (isArrayType(object.type)) {
      return {
        ...expression,
        object,
        index,
        type: arrayElementType(object.type),
        indexKind: "array",
      };
    }
    if (object.type === "STRING") {
      return { ...expression, object, index, type: "STRING", indexKind: "string" };
    }
    throw new Error(
      `Indexed access requires an array or STRING, received ${object.type} at line ${expression.line}.`,
    );
  }
  if (expression.kind === "sliceExpression") {
    const object = analyzeExpression(expression.object, state, "STRING");
    if (object.type !== "STRING") {
      throw new Error(`Sliced access requires STRING, received ${object.type} at line ${expression.line}.`);
    }
    const start = analyzeExpression(expression.start, state, "I64");
    const end = analyzeExpression(expression.end, state, "I64");
    if (start.type !== "I64" || end.type !== "I64") {
      throw new Error(`String slice bounds require I64 at line ${expression.line}.`);
    }
    return { ...expression, object, start, end, type: "STRING" };
  }
  if (expression.kind === "memberExpression") {
    const object = analyzeExpression(expression.object, state);
    if (isArrayType(object.type)) {
      if (expression.member !== "length") {
        throw new Error(`Array has no member "${expression.member}" at line ${expression.line}.`);
      }
      return { ...expression, object, type: "I64", memberKind: "arrayLength" };
    }
    if (object.type === "STRING") {
      if (expression.member !== "length") {
        throw new Error(`STRING has no member "${expression.member}" at line ${expression.line}.`);
      }
      return { ...expression, object, type: "I64", memberKind: "stringLength" };
    }
    const record = requireRecord(state, object.type, expression.line);
    const index = record.fields.findIndex(({ name }) => name === expression.member);
    if (index < 0) {
      throw new Error(`Record "${record.name}" has no field "${expression.member}" at line ${expression.line}.`);
    }
    return {
      ...expression,
      object,
      field: { ...record.fields[index], index },
      type: record.fields[index].type,
      memberKind: "recordField",
    };
  }
  if (expression.kind === "arrayUpdateExpression") {
    const object = analyzeExpression(expression.object, state);
    if (!isArrayType(object.type)) {
      throw new Error(`Array update requires an array, received ${object.type} at line ${expression.line}.`);
    }
    const index = analyzeExpression(expression.index, state, "I64");
    if (index.type !== "I64") {
      throw new Error(`Array update index requires I64, received ${index.type} at line ${expression.line}.`);
    }
    const elementType = arrayElementType(object.type);
    const value = analyzeExpression(expression.value, state, elementType);
    if (value.type !== elementType) {
      throw new Error(`Array update requires ${elementType}, received ${value.type} at line ${expression.line}.`);
    }
    return { ...expression, object, index, value, type: object.type };
  }
  if (expression.kind === "recordUpdateExpression") {
    const object = analyzeExpression(expression.object, state);
    const record = requireRecord(state, object.type, expression.line);
    if (expression.fields.length === 0) {
      throw new Error(`Record update requires at least one field at line ${expression.line}.`);
    }
    const names = new Set();
    const fields = expression.fields.map((field) => {
      if (names.has(field.name)) {
        throw new Error(`Record update field "${field.name}" is duplicated at line ${field.line}.`);
      }
      names.add(field.name);
      const index = record.fields.findIndex(({ name }) => name === field.name);
      if (index < 0) {
        throw new Error(`Record "${record.name}" has no field "${field.name}" at line ${field.line}.`);
      }
      const definition = record.fields[index];
      const value = analyzeExpression(field.expression, state, definition.type);
      if (value.type !== definition.type) {
        throw new Error(
          `Record field "${field.name}" requires ${definition.type}, received ${value.type} at line ${field.line}.`,
        );
      }
      return { ...field, expression: value, type: definition.type, index };
    });
    return { ...expression, object, fields, record, type: object.type };
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
    if (expression.operator === "+" && sameType && left.type === "STRING") {
      return { ...expression, left, right, type: "STRING", operationKind: "stringConcat" };
    }
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
  if (state.types.has(statement.name)) {
    throw new Error(`Variable "${statement.name}" conflicts with a record name at line ${statement.line}.`);
  }
  const scope = state.scopes.at(-1);
  const previous = scope.get(statement.name);
  if (previous) {
    throw new Error(
      `Variable "${statement.name}" is already declared at line ${statement.line}; `
      + `the first declaration is at line ${previous.line}.`,
    );
  }
  const annotation = statement.annotation === null
    ? null
    : resolveType(statement.annotation, state, statement.line, { allowNull: true });
  const initializer = analyzeExpression(statement.initializer, state, annotation);
  if (initializer.type === "VOID") {
    throw new Error(`Variable "${statement.name}" cannot be initialized with VOID at line ${statement.line}.`);
  }
  if (annotation !== null && initializer.type !== annotation) {
    throw new Error(
      `Variable "${statement.name}" requires ${annotation}, received ${initializer.type} at line ${statement.line}.`,
    );
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
    declaredType: annotation,
  };
  state.context.nextRegister += 1;
  scope.set(statement.name, variable);
  return {
    statement: {
      ...statement,
      annotation,
      initializer,
      register: variable.register,
      type: initializer.type,
    },
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
  if (variable.declaredType !== null && variable.declaredType !== expression.type) {
    throw new Error(
      `Variable "${statement.name}" requires ${variable.declaredType}, received ${expression.type} at line ${statement.line}.`,
    );
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

function validateImportedResolution(resolution, declaration, item) {
  if (typeof resolution.moduleId !== "string" || resolution.moduleId.length === 0) {
    throw new Error(
      `Import "${item.imported}" from "${declaration.specifier}" has no module identity at line ${item.line}.`,
    );
  }
  const kind = resolution.kind ?? "function";
  if (kind === "function") {
    if (!Array.isArray(resolution.parameterTypes)
      || typeof resolution.returnType !== "string") {
      throw new Error(
        `Import "${item.imported}" from "${declaration.specifier}" has an invalid function contract at line ${item.line}.`,
      );
    }
    return;
  }
  if (kind === "record"
    && typeof resolution.type === "string"
    && Array.isArray(resolution.fields)) return;
  throw new Error(
    `Import "${item.imported}" from "${declaration.specifier}" has an invalid export contract at line ${item.line}.`,
  );
}

function importResolutionKey({ specifier, imported, local }) {
  return JSON.stringify([specifier, imported, local]);
}

function collectDeclarations(program, resolvedImports) {
  const resolutions = new Map();
  for (const resolution of resolvedImports) {
    const key = importResolutionKey(resolution);
    if (resolutions.has(key)) {
      throw new Error(
        `Import resolution for "${resolution.local}" from "${resolution.specifier}" is duplicated.`,
      );
    }
    resolutions.set(key, resolution);
  }

  const functions = new Map();
  const imports = [];
  const types = new Map();
  const recordsByType = new Map();
  for (const declaration of program.imports) {
    for (const item of declaration.items) {
      if (functions.has(item.local) || types.has(item.local)) {
        throw new Error(`Imported binding "${item.local}" is already declared at line ${item.line}.`);
      }
      const key = importResolutionKey({
        specifier: declaration.specifier,
        imported: item.imported,
        local: item.local,
      });
      const resolution = resolutions.get(key);
      if (!resolution) {
        throw new Error(
          `Import "${item.imported}" from "${declaration.specifier}" is unresolved at line ${item.line}.`,
        );
      }
      validateImportedResolution(resolution, declaration, item);
      resolutions.delete(key);
      if (resolution.kind === "record") {
        const record = {
          kind: "record",
          name: resolution.name,
          localName: item.local,
          moduleId: resolution.moduleId,
          type: resolution.type,
          fields: resolution.fields.map((field) => ({ ...field })),
          imported: true,
          line: item.line,
        };
        types.set(item.local, record);
        recordsByType.set(record.type, record);
        for (const dependency of resolution.dependencies ?? []) {
          if (!recordsByType.has(dependency.type)) {
            recordsByType.set(dependency.type, {
              ...dependency,
              kind: "record",
              imported: true,
            });
          }
        }
      } else {
        assertName(item.local, item.line, "import", functions);
        const signature = {
          kind: "imported",
          line: item.line,
          localName: item.local,
          importedName: item.imported,
          specifier: declaration.specifier,
          identity: {
            moduleId: resolution.moduleId,
            exportName: item.imported,
          },
          parameterTypes: [...resolution.parameterTypes],
          returnType: resolution.returnType,
        };
        functions.set(item.local, signature);
        imports.push(signature);
        for (const dependency of resolution.dependencies ?? []) {
          if (!recordsByType.has(dependency.type)) {
            recordsByType.set(dependency.type, {
              ...dependency,
              kind: "record",
              imported: true,
            });
          }
        }
      }
    }
  }
  if (resolutions.size > 0) {
    const resolution = resolutions.values().next().value;
    throw new Error(
      `Resolved import "${resolution.local}" from "${resolution.specifier}" is not declared by the module.`,
    );
  }
  const localRecords = program.statements.filter(({ kind }) => kind === "recordDeclaration");
  for (const declaration of localRecords) {
    assertName(declaration.name, declaration.line, "record", functions);
    if (types.has(declaration.name) || functions.has(declaration.name)) {
      throw new Error(`Record "${declaration.name}" is already declared at line ${declaration.line}.`);
    }
    const record = {
      kind: "record",
      name: declaration.name,
      moduleId: program.moduleId,
      type: canonicalRecordType(program.moduleId, declaration.name),
      fields: [],
      declaration,
      imported: false,
      line: declaration.line,
    };
    types.set(declaration.name, record);
    recordsByType.set(record.type, record);
  }
  const typeState = { types };
  for (const declaration of localRecords) {
    const record = types.get(declaration.name);
    const names = new Set();
    record.fields = declaration.fields.map((field) => {
      assertName(field.name, field.line, "field", functions);
      if (names.has(field.name)) {
        throw new Error(`Record field "${field.name}" is duplicated at line ${field.line}.`);
      }
      names.add(field.name);
      return {
        name: field.name,
        type: resolveType(field.type, typeState, field.line, { allowNull: true }),
        line: field.line,
      };
    });
  }

  let index = 1;
  for (const declaration of program.statements.filter(({ kind }) => kind === "functionDeclaration")) {
    if (index >= SANDBOX_LIMITS.MAX_FUNCTIONS) {
      throw new Error(
        `Program exceeds the sandbox limit of ${SANDBOX_LIMITS.MAX_FUNCTIONS} functions at line ${declaration.line}.`,
      );
    }
    assertName(declaration.name, declaration.line, "function", functions);
    if (types.has(declaration.name)) {
      throw new Error(`Function "${declaration.name}" conflicts with a record name at line ${declaration.line}.`);
    }
    if (functions.has(declaration.name)) {
      const previous = functions.get(declaration.name);
      if (previous.kind === "imported") {
        throw new Error(
          `Function "${declaration.name}" conflicts with an imported function binding at line ${declaration.line}.`,
        );
      }
      throw new Error(`Function "${declaration.name}" is already declared at line ${declaration.line}.`);
    }
    const returnType = resolveType(declaration.returnType, typeState, declaration.line, {
      allowNull: true,
      allowVoid: true,
    });
    const parameterNames = new Set();
    if (declaration.parameters.length > SANDBOX_LIMITS.MAX_PARAMETERS) {
      throw new Error(
        `Function "${declaration.name}" exceeds the sandbox limit of ${SANDBOX_LIMITS.MAX_PARAMETERS} parameters at line ${declaration.line}.`,
      );
    }
    for (const parameter of declaration.parameters) {
      assertName(parameter.name, parameter.line, "parameter", functions);
      if (types.has(parameter.name)) {
        throw new Error(`Parameter "${parameter.name}" conflicts with a record name at line ${parameter.line}.`);
      }
      parameter.type = resolveType(parameter.type, typeState, parameter.line, {
        allowNull: false,
      });
      if (parameterNames.has(parameter.name)) {
        throw new Error(`Duplicate parameter "${parameter.name}" at line ${parameter.line}.`);
      }
      parameterNames.add(parameter.name);
    }
    functions.set(declaration.name, {
      kind: "local",
      declaration,
      index,
      parameterTypes: declaration.parameters.map(({ type }) => type),
      returnType,
    });
    index += 1;
  }
  return { functions, imports, types, recordsByType };
}

function analyzeFunction(signature, functions, types, recordsByType) {
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
    types,
    recordsByType,
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
    returnType: signature.returnType,
    body: { ...signature.declaration.body, statements: body.statements },
    variableCount: context.nextRegister,
  };
}

function analyzeProgramInternal(program, { resolvedImports = [] } = {}) {
  if (!Array.isArray(resolvedImports)) {
    throw new Error("resolvedImports must be an array.");
  }
  const { functions, imports, types, recordsByType } = collectDeclarations(program, resolvedImports);
  const entryContext = { nextRegister: 0 };
  const entryState = {
    context: entryContext,
    scopes: [new Map()],
    functions,
    types,
    recordsByType,
    currentFunction: null,
    loopDepth: 0,
    loopTypeGuards: [],
  };
  const entryStatements = program.statements.filter(({ kind }) =>
    kind !== "functionDeclaration" && kind !== "recordDeclaration");
  if (program.isEntry === false && entryStatements.length > 0) {
    throw new Error(
      `Executable statements are only valid in the entry module at line ${entryStatements[0].line}.`,
    );
  }
  const entry = analyzeStatements(entryStatements, entryState);
  const localFunctions = [...functions.values()].filter(({ kind }) => kind === "local");
  const analyzedFunctions = localFunctions.map((signature) =>
    analyzeFunction(signature, functions, types, recordsByType));
  const functionExports = localFunctions
    .filter(({ declaration }) => declaration.exported)
    .map((signature) => ({
      kind: "function",
      name: signature.declaration.name,
      moduleId: program.moduleId,
      functionIndex: signature.index,
      parameterTypes: [...signature.parameterTypes],
      returnType: signature.returnType,
      ...(recordsByType.size === 0 ? {} : {
        dependencies: [...recordsByType.values()].map((dependency) => ({
          name: dependency.name,
          moduleId: dependency.moduleId,
          type: dependency.type,
          fields: dependency.fields.map(({ name, type }) => ({ name, type })),
        })),
      }),
    }));
  const recordExports = [...types.values()]
    .filter((record) => !record.imported && record.declaration.exported)
    .map((record) => ({
      kind: "record",
      name: record.name,
      moduleId: program.moduleId,
      type: record.type,
      fields: record.fields.map(({ name, type }) => ({ name, type })),
      dependencies: [...recordsByType.values()].map((dependency) => ({
        name: dependency.name,
        moduleId: dependency.moduleId,
        type: dependency.type,
        fields: dependency.fields.map(({ name, type }) => ({ name, type })),
      })),
    }));
  return {
    kind: "analyzedProgram",
    moduleId: program.moduleId,
    isEntry: program.isEntry,
    imports,
    exports: [...functionExports, ...recordExports],
    records: [...types.values()].filter((record) => !record.imported).map((record) => ({
      name: record.name,
      type: record.type,
      fields: record.fields.map(({ name, type }) => ({ name, type })),
      exported: record.declaration.exported,
      line: record.line,
    })),
    statements: entry.statements,
    functions: analyzedFunctions,
    variableCount: entryContext.nextRegister,
  };
}

export function analyzeProgram(program, options) {
  try {
    return analyzeProgramInternal(program, options);
  } catch (error) {
    throw withModuleContext(error, program.moduleId);
  }
}
