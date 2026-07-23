import { SANDBOX_LIMITS } from "./generated/sandbox.js";
import { withModuleContext } from "./module-context.js";
import {
  arrayElementType,
  canonicalNominalType,
  containsTypeVariable,
  isAggregateType,
  isArrayType,
  isTypeVariable,
  parseNamedType,
  parseNominalType,
  substituteType,
  typeVariable,
  unifyType,
} from "./type-system.js";

const RESERVED_WORDS = new Set([
  "as", "break", "continue", "else", "export", "false", "from", "function",
  "if", "import", "let", "match", "null", "print", "record", "return", "true", "var",
  "variant", "while", "with",
]);
const VALUE_TYPES = new Set(["NULL", "BOOL", "I64", "F64", "STRING"]);
const NUMERIC_TYPES = new Set(["I64", "F64"]);
const ARITHMETIC_OPERATORS = new Set(["+", "-", "*", "/", "%"]);
const EQUALITY_OPERATORS = new Set(["==", "!="]);
const COMPARISON_OPERATORS = new Set(["<", "<=", ">", ">="]);
const BOOLEAN_OPERATORS = new Set(["&&", "||"]);

function isRecordType(type) {
  return parseNominalType(type)?.kind === "record";
}

function isVariantType(type) {
  return parseNominalType(type)?.kind === "variant";
}

function canonicalRecordType(moduleId, name) {
  return canonicalNominalType("RECORD", moduleId, name);
}

function canonicalVariantType(moduleId, name) {
  return canonicalNominalType("VARIANT", moduleId, name);
}

function definitionType(definition, argumentsList) {
  return canonicalNominalType(
    definition.kind.toUpperCase(),
    definition.moduleId,
    definition.name,
    argumentsList,
  );
}

function materializeDefinition(instance) {
  const substitutions = new Map(instance.definition.typeParameters
    .map((parameter, index) => [parameter.type, instance.arguments[index]]));
  if (instance.kind === "record") {
    return {
      ...instance,
      fields: instance.definition.fields.map((field) => ({
        ...field,
        type: substituteType(field.type, substitutions),
        boxed: instance.definition.typeParameters.length > 0 && containsTypeVariable(field.type),
      })),
    };
  }
  return {
    ...instance,
    alternatives: instance.definition.alternatives.map((alternative, tag) => ({
      ...alternative,
      tag,
      fields: alternative.fields.map((field) => ({
        ...field,
        type: substituteType(field.type, substitutions),
        boxed: instance.definition.typeParameters.length > 0 && containsTypeVariable(field.type),
      })),
    })),
  };
}

function instantiateDefinition(definition, argumentsList, state) {
  const type = definitionType(definition, argumentsList);
  const instances = definition.kind === "record" ? state.recordsByType : state.variantsByType;
  if (!instances.has(type)) {
    instances.set(type, {
      kind: definition.kind,
      name: definition.name,
      moduleId: definition.moduleId,
      type,
      arguments: [...argumentsList],
      definition,
      imported: definition.imported,
      line: definition.line,
    });
  }
  return materializeDefinition(instances.get(type));
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
  const variable = state.typeVariables?.get(type);
  if (variable) return variable;
  const named = parseNamedType(type);
  if (!named) throw new Error(`Type "${type}" is not declared at line ${line}.`);
  const definition = state.types.get(named.name);
  if (!definition) throw new Error(`Type "${named.name}" is not declared at line ${line}.`);
  if (named.arguments.length !== definition.typeParameters.length) {
    throw new Error(
      `Type "${named.name}" expects ${definition.typeParameters.length} type argument(s), `
      + `received ${named.arguments.length} at line ${line}.`,
    );
  }
  const argumentsList = named.arguments.map((argument) => resolveType(argument, state, line, {
    allowNull: true,
    allowVoid: false,
  }));
  return instantiateDefinition(definition, argumentsList, state).type;
}

function requireRecord(state, type, line) {
  const instance = state.recordsByType.get(type);
  const record = instance && materializeDefinition(instance);
  if (!record) throw new Error(`Expected a record value, received ${type} at line ${line}.`);
  return record;
}

function requireVariant(state, type, line) {
  const instance = state.variantsByType.get(type);
  const variant = instance && materializeDefinition(instance);
  if (!variant) throw new Error(`Expected a variant value, received ${type} at line ${line}.`);
  return variant;
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

function analyzeCall(expression, state, expectedType = null) {
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
  const typeParameters = signature.typeParameters ?? [];
  const substitutions = new Map();
  if (expectedType !== null && typeParameters.length > 0) {
    unifyType(signature.returnType, expectedType, substitutions);
  }
  const argumentsList = expression.arguments.map((argument, index) => {
    const template = signature.parameterTypes[index];
    const contextualType = substituteType(template, substitutions);
    const analyzed = analyzeExpression(
      argument,
      state,
      containsTypeVariable(contextualType) ? null : contextualType,
    );
    if (!unifyType(template, analyzed.type, substitutions)) {
      throw new Error(
        `Function "${expression.callee}" argument ${index} requires ${template}, `
        + `received ${analyzed.type} at line ${expression.line}.`,
      );
    }
    return analyzed;
  });
  for (const parameter of typeParameters) {
    if (!substitutions.has(parameter.type)) {
      throw new Error(
        `Function "${expression.callee}" cannot infer type parameter ${parameter.name} `
        + `at line ${expression.line}.`,
      );
    }
  }
  const parameterTypes = signature.parameterTypes.map((type) => substituteType(type, substitutions));
  const returnType = substituteType(signature.returnType, substitutions);
  for (let index = 0; index < argumentsList.length; index += 1) {
    if (argumentsList[index].type !== parameterTypes[index]) {
      throw new Error(
        `Function "${expression.callee}" argument ${index} requires `
        + `${parameterTypes[index]}, received ${argumentsList[index].type} `
        + `at line ${expression.line}.`,
      );
    }
  }
  return {
    ...expression,
    arguments: argumentsList,
    functionIndex: signature.kind === "local" ? signature.index : null,
    functionIdentity: signature.kind === "imported" ? signature.identity : null,
    typeArguments: typeParameters.map((parameter) => substitutions.get(parameter.type)),
    parameterTypes,
    boxArguments: signature.parameterTypes.map((template, index) =>
      isTypeVariable(template) && !isTypeVariable(argumentsList[index].type)),
    unboxResult: isTypeVariable(signature.returnType) && !isTypeVariable(returnType),
    type: returnType,
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
  if (expression.kind === "callExpression") return analyzeCall(expression, state, expectedType);
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
    const definition = state.types.get(expression.recordName);
    if (!definition || definition.kind !== "record") {
      throw new Error(`Record "${expression.recordName}" is not declared at line ${expression.line}.`);
    }
    const substitutions = new Map();
    if (expectedType !== null) {
      const expected = parseNominalType(expectedType);
      if (!expected
        || expected.kind !== "record"
        || expected.moduleId !== (definition.moduleId ?? "<entry>")
        || expected.name !== definition.name
        || expected.arguments.length !== definition.typeParameters.length) {
        throw new Error(`Expected ${expectedType}, received record ${definition.name} at line ${expression.line}.`);
      }
      definition.typeParameters.forEach((parameter, index) => {
        substitutions.set(parameter.type, expected.arguments[index]);
      });
    }
    const provided = new Map();
    for (const field of expression.fields) {
      if (provided.has(field.name)) {
        throw new Error(`Record field "${field.name}" is duplicated at line ${field.line}.`);
      }
      provided.set(field.name, field);
    }
    const analyzedFields = definition.fields.map((fieldTemplate, index) => {
      const field = provided.get(fieldTemplate.name);
      if (!field) {
        throw new Error(`Record "${definition.name}" is missing field "${fieldTemplate.name}" at line ${expression.line}.`);
      }
      provided.delete(fieldTemplate.name);
      const contextualType = substituteType(fieldTemplate.type, substitutions);
      const analyzed = analyzeExpression(
        field.expression,
        state,
        containsTypeVariable(contextualType) ? null : contextualType,
      );
      if (!unifyType(fieldTemplate.type, analyzed.type, substitutions)) {
        throw new Error(
          `Record field "${fieldTemplate.name}" requires ${fieldTemplate.type}, `
          + `received ${analyzed.type} at line ${field.line}.`,
        );
      }
      return { ...field, expression: analyzed, index };
    });
    if (provided.size > 0) {
      const field = provided.values().next().value;
      throw new Error(`Record "${definition.name}" has no field "${field.name}" at line ${field.line}.`);
    }
    for (const parameter of definition.typeParameters) {
      if (!substitutions.has(parameter.type)) {
        throw new Error(
          `Record "${definition.name}" cannot infer type parameter ${parameter.name} `
          + `at line ${expression.line}.`,
        );
      }
    }
    const record = instantiateDefinition(
      definition,
      definition.typeParameters.map((parameter) => substitutions.get(parameter.type)),
      state,
    );
    const fields = analyzedFields.map((field, index) => {
      const fieldDefinition = record.fields[index];
      if (field.expression.type !== fieldDefinition.type) {
        throw new Error(
          `Record field "${fieldDefinition.name}" requires ${fieldDefinition.type}, `
          + `received ${field.expression.type} at line ${field.line}.`,
        );
      }
      return { ...field, type: fieldDefinition.type, boxed: fieldDefinition.boxed };
    });
    return { ...expression, fields, record, type: record.type };
  }
  if (expression.kind === "variantLiteral") {
    const definition = state.types.get(expression.variantName);
    if (!definition || definition.kind !== "variant") {
      throw new Error(`Variant "${expression.variantName}" is not declared at line ${expression.line}.`);
    }
    const alternativeTemplate = definition.alternatives
      .find(({ name }) => name === expression.alternative);
    if (!alternativeTemplate) {
      throw new Error(
        `Variant "${definition.name}" has no alternative "${expression.alternative}" `
        + `at line ${expression.line}.`,
      );
    }
    if (expression.arguments.length !== alternativeTemplate.fields.length) {
      throw new Error(
        `Variant alternative "${expression.alternative}" expects ${alternativeTemplate.fields.length} `
        + `payload value(s), received ${expression.arguments.length} at line ${expression.line}.`,
      );
    }
    const substitutions = new Map();
    if (expectedType !== null) {
      const expected = parseNominalType(expectedType);
      if (!expected
        || expected.kind !== "variant"
        || expected.moduleId !== (definition.moduleId ?? "<entry>")
        || expected.name !== definition.name
        || expected.arguments.length !== definition.typeParameters.length) {
        throw new Error(`Expected ${expectedType}, received variant ${definition.name} at line ${expression.line}.`);
      }
      definition.typeParameters.forEach((parameter, index) => {
        substitutions.set(parameter.type, expected.arguments[index]);
      });
    }
    const argumentsList = expression.arguments.map((argument, index) => {
      const template = alternativeTemplate.fields[index].type;
      const contextualType = substituteType(template, substitutions);
      const analyzed = analyzeExpression(
        argument,
        state,
        containsTypeVariable(contextualType) ? null : contextualType,
      );
      if (!unifyType(template, analyzed.type, substitutions)) {
        throw new Error(
          `Variant payload ${index} requires ${template}, received ${analyzed.type} `
          + `at line ${expression.line}.`,
        );
      }
      return analyzed;
    });
    for (const parameter of definition.typeParameters) {
      if (!substitutions.has(parameter.type)) {
        throw new Error(
          `Variant "${definition.name}" cannot infer type parameter ${parameter.name} `
          + `at line ${expression.line}.`,
        );
      }
    }
    const variant = instantiateDefinition(
      definition,
      definition.typeParameters.map((parameter) => substitutions.get(parameter.type)),
      state,
    );
    const alternative = variant.alternatives.find(({ name }) => name === expression.alternative);
    return {
      ...expression,
      arguments: argumentsList.map((argument, index) => ({
        expression: argument,
        type: alternative.fields[index].type,
        boxed: alternative.fields[index].boxed,
      })),
      variant,
      alternative,
      type: variant.type,
    };
  }
  if (expression.kind === "matchExpression") {
    const value = analyzeExpression(expression.value, state);
    const variant = requireVariant(state, value.type, expression.line);
    if (expression.arms.length === 0) {
      throw new Error(`match requires at least one arm at line ${expression.line}.`);
    }
    const seen = new Set();
    let resultType = expectedType;
    const arms = expression.arms.map((arm) => {
      if (seen.has(arm.alternative)) {
        throw new Error(`Match alternative "${arm.alternative}" is duplicated at line ${arm.line}.`);
      }
      seen.add(arm.alternative);
      const alternative = variant.alternatives.find(({ name }) => name === arm.alternative);
      if (!alternative) {
        throw new Error(
          `Variant "${variant.name}" has no alternative "${arm.alternative}" at line ${arm.line}.`,
        );
      }
      if (arm.bindings.length !== alternative.fields.length) {
        throw new Error(
          `Match alternative "${arm.alternative}" requires ${alternative.fields.length} binding(s), `
          + `received ${arm.bindings.length} at line ${arm.line}.`,
        );
      }
      const scope = new Map();
      const bindings = arm.bindings.map((name, index) => {
        if (name === "_") return { name, ignored: true, field: alternative.fields[index] };
        assertName(name, arm.line, "match binding", state.functions);
        if (scope.has(name) || state.types.has(name)) {
          throw new Error(`Match binding "${name}" is duplicated or conflicts with a type at line ${arm.line}.`);
        }
        if (state.context.nextRegister >= SANDBOX_LIMITS.MAX_REGISTERS_PER_FUNCTION) {
          throw new Error(
            `Function scope exceeds the sandbox register limit at line ${arm.line}.`,
          );
        }
        const binding = {
          name,
          line: arm.line,
          mutable: false,
          register: state.context.nextRegister,
          type: alternative.fields[index].type,
          field: alternative.fields[index],
        };
        state.context.nextRegister += 1;
        scope.set(name, binding);
        return binding;
      });
      state.scopes.push(scope);
      const analyzed = analyzeExpression(arm.expression, state, resultType);
      state.scopes.pop();
      resultType ??= analyzed.type;
      if (analyzed.type !== resultType) {
        throw new Error(
          `Match arms require one result type ${resultType}, received ${analyzed.type} at line ${arm.line}.`,
        );
      }
      return { ...arm, alternative, bindings, expression: analyzed };
    });
    const missing = variant.alternatives.filter(({ name }) => !seen.has(name));
    if (missing.length > 0) {
      throw new Error(
        `Match for variant "${variant.name}" is not exhaustive; missing `
        + `${missing.map(({ name }) => name).join(", ")} at line ${expression.line}.`,
      );
    }
    return { ...expression, value, variant, arms, type: resultType };
  }
  if (expression.kind === "indexExpression") {
    const object = analyzeExpression(expression.object, state);
    const index = analyzeExpression(expression.index, state, "I64");
    if (index.type !== "I64") {
      throw new Error(`Indexed access requires an I64 index, received ${index.type} at line ${expression.line}.`);
    }
    if (isArrayType(object.type)) {
      if (isTypeVariable(arrayElementType(object.type))) {
        throw new Error(
          `Indexed access over an array of a generic type parameter is not supported at line ${expression.line}.`,
        );
      }
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
      boxed: record.fields[index].boxed,
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
    if (isTypeVariable(elementType)) {
      throw new Error(
        `Array update over a generic type parameter is not supported at line ${expression.line}.`,
      );
    }
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
      return {
        ...field,
        expression: value,
        type: definition.type,
        index,
        boxed: definition.boxed,
      };
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
  if ((kind === "record" || kind === "variant")
    && typeof resolution.type === "string"
    && (resolution.typeParameters === undefined || Array.isArray(resolution.typeParameters))
    && (kind === "record" ? Array.isArray(resolution.fields) : Array.isArray(resolution.alternatives))) return;
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
  const variantsByType = new Map();
  const instanceState = { recordsByType, variantsByType };

  function registerImportedDefinition(source, localName, line) {
    const definition = {
      kind: source.kind,
      name: source.name,
      localName,
      moduleId: source.moduleId,
      type: source.type,
      typeParameters: (source.typeParameters ?? []).map((parameter) => ({ ...parameter })),
      fields: (source.fields ?? []).map((field) => ({ ...field })),
      alternatives: (source.alternatives ?? []).map((alternative) => ({
        ...alternative,
        fields: alternative.fields.map((field) => ({ ...field })),
      })),
      imported: true,
      line,
    };
    types.set(localName, definition);
    const templateArguments = definition.typeParameters.map(({ type }) => type);
    instantiateDefinition(definition, templateArguments, instanceState);
    return definition;
  }

  function registerDependencies(dependencies) {
    for (const dependency of dependencies ?? []) {
      const instances = dependency.kind === "variant" ? variantsByType : recordsByType;
      if (instances.has(dependency.type)) continue;
      const definition = {
        ...dependency,
        typeParameters: (dependency.typeParameters ?? []).map((parameter) => ({ ...parameter })),
        fields: (dependency.fields ?? []).map((field) => ({ ...field })),
        alternatives: (dependency.alternatives ?? []).map((alternative) => ({
          ...alternative,
          fields: alternative.fields.map((field) => ({ ...field })),
        })),
        imported: true,
      };
      const nominal = parseNominalType(dependency.type);
      instances.set(dependency.type, {
        kind: dependency.kind,
        name: dependency.name,
        moduleId: dependency.moduleId,
        type: dependency.type,
        arguments: nominal?.arguments ?? definition.typeParameters.map(({ type }) => type),
        definition,
        imported: true,
        line: dependency.line ?? 1,
      });
    }
  }
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
      if (resolution.kind === "record" || resolution.kind === "variant") {
        registerImportedDefinition(resolution, item.local, item.line);
        registerDependencies(resolution.dependencies);
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
          ...((resolution.typeParameters?.length ?? 0) === 0 ? {} : {
            typeParameters: resolution.typeParameters.map((parameter) => ({ ...parameter })),
          }),
        };
        functions.set(item.local, signature);
        imports.push(signature);
        registerDependencies(resolution.dependencies);
      }
    }
  }
  if (resolutions.size > 0) {
    const resolution = resolutions.values().next().value;
    throw new Error(
      `Resolved import "${resolution.local}" from "${resolution.specifier}" is not declared by the module.`,
    );
  }
  const localTypeDeclarations = program.statements.filter(({ kind }) =>
    kind === "recordDeclaration" || kind === "variantDeclaration");
  for (const declaration of localTypeDeclarations) {
    const kind = declaration.kind === "recordDeclaration" ? "record" : "variant";
    assertName(declaration.name, declaration.line, kind, functions);
    if (types.has(declaration.name) || functions.has(declaration.name)) {
      throw new Error(`Type "${declaration.name}" is already declared at line ${declaration.line}.`);
    }
    const typeParameters = declaration.typeParameters.map((name) => {
      assertName(name, declaration.line, "type parameter", functions);
      return {
        name,
        type: typeVariable(`${program.moduleId ?? "<entry>"}::${declaration.name}`, name),
      };
    });
    const definition = {
      kind,
      name: declaration.name,
      moduleId: program.moduleId,
      type: kind === "record"
        ? canonicalRecordType(program.moduleId, declaration.name)
        : canonicalVariantType(program.moduleId, declaration.name),
      typeParameters,
      fields: [],
      alternatives: [],
      declaration,
      imported: false,
      line: declaration.line,
    };
    types.set(declaration.name, definition);
    instantiateDefinition(definition, typeParameters.map(({ type }) => type), instanceState);
  }
  for (const declaration of localTypeDeclarations) {
    const definition = types.get(declaration.name);
    const typeState = {
      types,
      recordsByType,
      variantsByType,
      typeVariables: new Map(definition.typeParameters.map(({ name, type }) => [name, type])),
    };
    if (definition.kind === "record") {
      const names = new Set();
      definition.fields = declaration.fields.map((field) => {
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
    } else {
      const alternatives = new Set();
      definition.alternatives = declaration.alternatives.map((alternative) => {
        assertName(alternative.name, alternative.line, "variant alternative", functions);
        if (alternatives.has(alternative.name)) {
          throw new Error(
            `Variant alternative "${alternative.name}" is duplicated at line ${alternative.line}.`,
          );
        }
        alternatives.add(alternative.name);
        const fields = new Set();
        return {
          name: alternative.name,
          line: alternative.line,
          fields: alternative.fields.map((field) => {
            assertName(field.name, field.line, "variant field", functions);
            if (fields.has(field.name)) {
              throw new Error(
                `Variant field "${field.name}" is duplicated at line ${field.line}.`,
              );
            }
            fields.add(field.name);
            return {
              name: field.name,
              type: resolveType(field.type, typeState, field.line, { allowNull: true }),
              line: field.line,
            };
          }),
        };
      });
    }
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
    const typeParameters = declaration.typeParameters.map((name) => {
      assertName(name, declaration.line, "type parameter", functions);
      return {
        name,
        type: typeVariable(`${program.moduleId ?? "<entry>"}::function::${declaration.name}`, name),
      };
    });
    const functionTypeState = {
      types,
      recordsByType,
      variantsByType,
      typeVariables: new Map(typeParameters.map(({ name, type }) => [name, type])),
    };
    const returnType = resolveType(declaration.returnType, functionTypeState, declaration.line, {
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
      parameter.type = resolveType(parameter.type, functionTypeState, parameter.line, {
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
      typeParameters,
    });
    index += 1;
  }
  return { functions, imports, types, recordsByType, variantsByType };
}

function analyzeFunction(signature, functions, types, recordsByType, variantsByType) {
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
    variantsByType,
    currentFunction: {
      name: signature.declaration.name,
      returnType: signature.returnType,
      typeParameters: signature.typeParameters,
    },
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
    typeParameters: signature.typeParameters,
    body: { ...signature.declaration.body, statements: body.statements },
    variableCount: context.nextRegister,
  };
}

function analyzeProgramInternal(program, { resolvedImports = [] } = {}) {
  if (!Array.isArray(resolvedImports)) {
    throw new Error("resolvedImports must be an array.");
  }
  const {
    functions, imports, types, recordsByType, variantsByType,
  } = collectDeclarations(program, resolvedImports);
  const entryContext = { nextRegister: 0 };
  const entryState = {
    context: entryContext,
    scopes: [new Map()],
    functions,
    types,
    recordsByType,
    variantsByType,
    currentFunction: null,
    loopDepth: 0,
    loopTypeGuards: [],
  };
  const entryStatements = program.statements.filter(({ kind }) =>
    kind !== "functionDeclaration"
    && kind !== "recordDeclaration"
    && kind !== "variantDeclaration");
  if (program.isEntry === false && entryStatements.length > 0) {
    throw new Error(
      `Executable statements are only valid in the entry module at line ${entryStatements[0].line}.`,
    );
  }
  const entry = analyzeStatements(entryStatements, entryState);
  const localFunctions = [...functions.values()].filter(({ kind }) => kind === "local");
  const analyzedFunctions = localFunctions.map((signature) =>
    analyzeFunction(signature, functions, types, recordsByType, variantsByType));
  const dependencies = [...types.values()].map((dependency) => ({
    kind: dependency.kind,
    name: dependency.name,
    moduleId: dependency.moduleId,
    type: dependency.type,
    typeParameters: dependency.typeParameters.map(({ name, type }) => ({ name, type })),
    fields: dependency.fields.map(({ name, type }) => ({ name, type })),
    alternatives: dependency.alternatives.map((alternative) => ({
      name: alternative.name,
      fields: alternative.fields.map(({ name, type }) => ({ name, type })),
    })),
  }));
  const functionExports = localFunctions
    .filter(({ declaration }) => declaration.exported)
    .map((signature) => ({
      kind: "function",
      name: signature.declaration.name,
      moduleId: program.moduleId,
      functionIndex: signature.index,
      parameterTypes: [...signature.parameterTypes],
      returnType: signature.returnType,
      ...(signature.typeParameters.length === 0 ? {} : {
        typeParameters: signature.typeParameters.map(({ name, type }) => ({ name, type })),
      }),
      ...(dependencies.length === 0 ? {} : { dependencies }),
    }));
  const recordExports = [...types.values()]
    .filter((record) => record.kind === "record" && !record.imported && record.declaration.exported)
    .map((record) => ({
      kind: "record",
      name: record.name,
      moduleId: program.moduleId,
      type: record.type,
      typeParameters: record.typeParameters.map(({ name, type }) => ({ name, type })),
      fields: record.fields.map(({ name, type }) => ({ name, type })),
      dependencies,
    }));
  const variantExports = [...types.values()]
    .filter((variant) => variant.kind === "variant" && !variant.imported && variant.declaration.exported)
    .map((variant) => ({
      kind: "variant",
      name: variant.name,
      moduleId: program.moduleId,
      type: variant.type,
      typeParameters: variant.typeParameters.map(({ name, type }) => ({ name, type })),
      alternatives: variant.alternatives.map((alternative) => ({
        name: alternative.name,
        fields: alternative.fields.map(({ name, type }) => ({ name, type })),
      })),
      dependencies,
    }));
  return {
    kind: "analyzedProgram",
    moduleId: program.moduleId,
    isEntry: program.isEntry,
    imports,
    exports: [...functionExports, ...recordExports, ...variantExports],
    records: [...types.values()].filter((record) => record.kind === "record" && !record.imported).map((record) => ({
      name: record.name,
      type: record.type,
      fields: record.fields.map(({ name, type }) => ({ name, type })),
      exported: record.declaration.exported,
      line: record.line,
    })),
    variants: [...types.values()].filter((variant) =>
      variant.kind === "variant" && !variant.imported).map((variant) => ({
      name: variant.name,
      type: variant.type,
      typeParameters: variant.typeParameters.map(({ name, type }) => ({ name, type })),
      alternatives: variant.alternatives.map((alternative) => ({
        name: alternative.name,
        fields: alternative.fields.map(({ name, type }) => ({ name, type })),
      })),
      exported: variant.declaration.exported,
      line: variant.line,
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
