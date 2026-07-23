import { SANDBOX_LIMITS } from "./generated/sandbox.js";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

class TypeSyntaxParser {
  constructor(source, line) {
    this.source = source;
    this.line = line;
    this.offset = 0;
  }

  skipWhitespace() {
    while (/\s/.test(this.source[this.offset] ?? "")) this.offset += 1;
  }

  parseIdentifier() {
    this.skipWhitespace();
    const name = this.source.slice(this.offset).match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0];
    if (!name) throw new Error(`Expected a type name at line ${this.line}.`);
    this.offset += name.length;
    return name;
  }

  parseType(depth = 1) {
    if (depth > SANDBOX_LIMITS.MAX_TYPE_NESTING) {
      throw new Error(
        `Type nesting exceeds the sandbox limit of ${SANDBOX_LIMITS.MAX_TYPE_NESTING} at line ${this.line}.`,
      );
    }
    this.skipWhitespace();
    if (this.source[this.offset] === "[") {
      this.offset += 1;
      const element = this.parseType(depth + 1);
      this.skipWhitespace();
      if (this.source[this.offset] !== "]") {
        throw new Error(`Expected ] in array type at line ${this.line}.`);
      }
      this.offset += 1;
      return `[${element}]`;
    }

    const name = this.parseIdentifier();
    this.skipWhitespace();
    if (this.source[this.offset] !== "<") return name;
    this.offset += 1;
    const argumentsList = [];
    while (true) {
      this.skipWhitespace();
      if (this.source[this.offset] === ">") {
        if (argumentsList.length === 0) {
          throw new Error(`Generic type ${name} requires a type argument at line ${this.line}.`);
        }
        this.offset += 1;
        break;
      }
      argumentsList.push(this.parseType(depth + 1));
      this.skipWhitespace();
      if (this.source[this.offset] === ",") {
        this.offset += 1;
        continue;
      }
      if (this.source[this.offset] !== ">") {
        throw new Error(`Expected , or > in generic type ${name} at line ${this.line}.`);
      }
      this.offset += 1;
      break;
    }
    return `${name}<${argumentsList.join(",")}>`;
  }

  parse() {
    const type = this.parseType();
    this.skipWhitespace();
    if (this.offset !== this.source.length) {
      throw new Error(`Unexpected data in type at line ${this.line}.`);
    }
    return type;
  }
}

export function parseTypeSyntax(source, line) {
  return new TypeSyntaxParser(source.trim(), line).parse();
}

export function splitTypeArguments(source) {
  if (source === "") return [];
  const parts = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "<" || character === "[") depth += 1;
    if (character === ">" || character === "]") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(source.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(source.slice(start));
  return parts;
}

export function parseNamedType(type) {
  if (IDENTIFIER.test(type)) return { name: type, arguments: [] };
  const opening = type.indexOf("<");
  if (opening < 1 || !type.endsWith(">")) return null;
  const name = type.slice(0, opening);
  if (!IDENTIFIER.test(name)) return null;
  return {
    name,
    arguments: splitTypeArguments(type.slice(opening + 1, -1)),
  };
}

export function typeVariable(scope, name) {
  return `TYPE<${scope}::${name}>`;
}

export function isTypeVariable(type) {
  return typeof type === "string" && type.startsWith("TYPE<") && type.endsWith(">");
}

export function canonicalNominalType(kind, moduleId, name, argumentsList = []) {
  const suffix = argumentsList.length === 0 ? "" : `<${argumentsList.join(",")}>`;
  return `${kind}<${moduleId ?? "<entry>"}::${name}${suffix}>`;
}

export function parseNominalType(type) {
  const match = /^(RECORD|VARIANT)<(.+)>$/.exec(type);
  if (!match) return null;
  const payload = match[2];
  const separator = payload.indexOf("::");
  if (separator < 0) return null;
  const moduleId = payload.slice(0, separator);
  const local = payload.slice(separator + 2);
  const opening = local.indexOf("<");
  if (opening < 0) {
    return { kind: match[1].toLowerCase(), moduleId, name: local, arguments: [] };
  }
  if (!local.endsWith(">")) return null;
  return {
    kind: match[1].toLowerCase(),
    moduleId,
    name: local.slice(0, opening),
    arguments: splitTypeArguments(local.slice(opening + 1, -1)),
  };
}

export function isArrayType(type) {
  return typeof type === "string" && type.startsWith("[") && type.endsWith("]");
}

export function arrayElementType(type) {
  return type.slice(1, -1);
}

export function isNominalType(type) {
  return parseNominalType(type) !== null;
}

export function isAggregateType(type) {
  return isArrayType(type) || isNominalType(type) || isTypeVariable(type);
}

export function substituteType(type, substitutions) {
  if (isTypeVariable(type)) return substitutions.get(type) ?? type;
  if (isArrayType(type)) return `[${substituteType(arrayElementType(type), substitutions)}]`;
  const nominal = parseNominalType(type);
  if (!nominal) return type;
  return canonicalNominalType(
    nominal.kind.toUpperCase(),
    nominal.moduleId === "<entry>" ? null : nominal.moduleId,
    nominal.name,
    nominal.arguments.map((argument) => substituteType(argument, substitutions)),
  );
}

export function containsTypeVariable(type) {
  if (isTypeVariable(type)) return true;
  if (isArrayType(type)) return containsTypeVariable(arrayElementType(type));
  return parseNominalType(type)?.arguments.some(containsTypeVariable) ?? false;
}

export function unifyType(template, actual, substitutions) {
  if (isTypeVariable(template)) {
    const existing = substitutions.get(template);
    if (existing !== undefined && existing !== actual) return false;
    substitutions.set(template, actual);
    return true;
  }
  if (isArrayType(template)) {
    return isArrayType(actual)
      && unifyType(arrayElementType(template), arrayElementType(actual), substitutions);
  }
  const expectedNominal = parseNominalType(template);
  if (!expectedNominal) return template === actual;
  const actualNominal = parseNominalType(actual);
  if (!actualNominal
    || expectedNominal.kind !== actualNominal.kind
    || expectedNominal.moduleId !== actualNominal.moduleId
    || expectedNominal.name !== actualNominal.name
    || expectedNominal.arguments.length !== actualNominal.arguments.length) return false;
  return expectedNominal.arguments.every((argument, index) =>
    unifyType(argument, actualNominal.arguments[index], substitutions));
}
