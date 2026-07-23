import { withModuleContext } from "./module-context.js";
import { SANDBOX_LIMITS } from "./generated/sandbox.js";
import { parseTypeSyntax, splitTypeArguments } from "./type-system.js";

const IDENTIFIER_SOURCE = String.raw`[A-Za-z_][A-Za-z0-9_]*`;
const VARIABLE_DECLARATION = new RegExp(
  String.raw`^(let|var)\s+(${IDENTIFIER_SOURCE})(?:\s*:\s*(.+?))?\s*=\s*(.+)$`,
);
const VARIABLE_ASSIGNMENT = new RegExp(
  String.raw`^(${IDENTIFIER_SOURCE})\s*=(?!=)\s*(.+)$`,
);
const FUNCTION_HEADER = new RegExp(
  String.raw`^function\s+(${IDENTIFIER_SOURCE})(?:\s*<\s*([^>]+)\s*>)?\s*\((.*)\)\s*:\s*(.+?)\s*\{\s*$`,
);
const RECORD_HEADER = new RegExp(
  String.raw`^record\s+(${IDENTIFIER_SOURCE})(?:\s*<\s*([^>]+)\s*>)?\s*\{\s*$`,
);
const VARIANT_HEADER = new RegExp(
  String.raw`^variant\s+(${IDENTIFIER_SOURCE})(?:\s*<\s*([^>]+)\s*>)?\s*\{\s*$`,
);
const PRINT_STATEMENT = /^print\s+(.+)$/;
const RETURN_STATEMENT = /^return(?:\s+(.+))?$/;
const NUMBER_PREFIX = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+(?:[eE][+-]?[0-9]+)?|[eE][+-]?[0-9]+)?/;
const I64_MIN = -(1n << 63n);
const I64_MAX = (1n << 63n) - 1n;
const TWO_CHARACTER_OPERATORS = new Set(["==", "!=", "<=", ">=", "&&", "||"]);
const ONE_CHARACTER_OPERATORS = new Set(["+", "-", "*", "/", "%", "!", "<", ">"]);
const SCALAR_TYPES = new Set(["NULL", "BOOL", "I64", "F64", "STRING", "VOID"]);
const STRING_ESCAPES = Object.freeze({
  "\\": "\\",
  '"': '"',
  n: "\n",
  r: "\r",
  t: "\t",
});

function parseNumber(source, line) {
  if (source.includes(".") || /[eE]/.test(source)) {
    const value = Number(source);
    if (!Number.isFinite(value)) {
      throw new Error(`Floating-point literal is outside the finite f64 range at line ${line}.`);
    }
    return { type: "F64", value };
  }

  const value = BigInt(source);
  if (value < I64_MIN || value > I64_MAX) {
    throw new Error(`Integer literal is outside the i64 range at line ${line}.`);
  }
  return { type: "I64", value };
}

function readString(source, start, line) {
  let offset = start + 1;
  let decoded = "";
  while (offset < source.length) {
    const character = source[offset];
    if (character === '"') {
      return { nextOffset: offset + 1, value: decoded };
    }
    if (character === "\\") {
      const escaped = source[offset + 1];
      if (!escaped || !'\\"nrt'.includes(escaped)) {
        throw new Error(`Invalid string escape at line ${line}.`);
      }
      decoded += STRING_ESCAPES[escaped];
      offset += 2;
      continue;
    }
    decoded += character;
    offset += 1;
  }
  throw new Error(`Unterminated string literal at line ${line}.`);
}

function canStartSignedNumber(tokens) {
  const previous = tokens.at(-1);
  return !previous
    || previous.kind === "operator"
    || previous.kind === "leftParenthesis"
    || previous.kind === "leftBracket"
    || previous.kind === "comma";
}

function parseType(source, line) {
  return parseTypeSyntax(source, line);
}

function parseTypeParameters(source, line) {
  if (source === undefined) return [];
  const names = splitTypeArguments(source).map((item) => item.trim());
  if (names.length > SANDBOX_LIMITS.MAX_TYPE_PARAMETERS) {
    throw new Error(
      `Type parameter count exceeds the sandbox limit of ${SANDBOX_LIMITS.MAX_TYPE_PARAMETERS} at line ${line}.`,
    );
  }
  const seen = new Set();
  for (const name of names) {
    if (!new RegExp(`^${IDENTIFIER_SOURCE}$`).test(name)) {
      throw new Error(`Invalid type parameter at line ${line}.`);
    }
    if (SCALAR_TYPES.has(name) || seen.has(name)) {
      throw new Error(`Type parameter "${name}" is duplicated or reserved at line ${line}.`);
    }
    seen.add(name);
  }
  return names;
}

function tokenizeExpression(source, line) {
  const tokens = [];
  let offset = 0;
  while (offset < source.length) {
    const character = source[offset];
    if (/\s/.test(character)) {
      offset += 1;
      continue;
    }
    if (character === '"') {
      const string = readString(source, offset, line);
      tokens.push({ kind: "literal", value: { type: "STRING", value: string.value } });
      offset = string.nextOffset;
      continue;
    }

    const signedNumber = character === "-"
      && /[0-9]/.test(source[offset + 1] ?? "")
      && canStartSignedNumber(tokens);
    if (/[0-9]/.test(character) || signedNumber) {
      const match = source.slice(offset).match(NUMBER_PREFIX);
      if (!match || (!signedNumber && match[0].startsWith("-"))) {
        throw new Error(`Invalid numeric literal at line ${line}.`);
      }
      tokens.push({ kind: "literal", value: parseNumber(match[0], line) });
      offset += match[0].length;
      continue;
    }

    const identifier = source.slice(offset).match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0];
    if (identifier) {
      if (identifier === "true" || identifier === "false") {
        tokens.push({ kind: "literal", value: { type: "BOOL", value: identifier === "true" } });
      } else if (identifier === "null") {
        tokens.push({ kind: "literal", value: { type: "NULL", value: null } });
      } else {
        tokens.push({ kind: "identifier", value: identifier });
      }
      offset += identifier.length;
      continue;
    }

    const pair = source.slice(offset, offset + 2);
    if (pair === "=>" || pair === "::") {
      tokens.push({ kind: pair === "=>" ? "fatArrow" : "doubleColon", value: pair });
      offset += 2;
      continue;
    }
    if (TWO_CHARACTER_OPERATORS.has(pair)) {
      tokens.push({ kind: "operator", value: pair });
      offset += 2;
      continue;
    }
    if (ONE_CHARACTER_OPERATORS.has(character)) {
      tokens.push({ kind: "operator", value: character });
      offset += 1;
      continue;
    }
    const punctuation = {
      "(": "leftParenthesis",
      ")": "rightParenthesis",
      "[": "leftBracket",
      "]": "rightBracket",
      "{": "leftBrace",
      "}": "rightBrace",
      ",": "comma",
      ":": "colon",
      ".": "dot",
      "=": "equals",
    }[character];
    if (punctuation) {
      tokens.push({ kind: punctuation, value: character });
      offset += 1;
      continue;
    }
    throw new Error(`Unexpected character ${JSON.stringify(character)} at line ${line}.`);
  }
  tokens.push({ kind: "end", value: null });
  return tokens;
}

class ExpressionParser {
  constructor(tokens, line) {
    this.tokens = tokens;
    this.line = line;
    this.offset = 0;
  }

  current() {
    return this.tokens[this.offset];
  }

  parse() {
    const expression = this.parseUpdate();
    if (this.current().kind !== "end") {
      throw new Error(`Unexpected token in expression at line ${this.line}.`);
    }
    return expression;
  }

  parseUpdate() {
    let expression = this.parseOr();
    while (this.current().kind === "identifier" && this.current().value === "with") {
      this.offset += 1;
      if (this.current().kind === "leftBracket") {
        this.offset += 1;
        const index = this.parseUpdate();
        if (this.current().kind !== "rightBracket") {
          throw new Error(`Expected closing bracket for array update at line ${this.line}.`);
        }
        this.offset += 1;
        if (this.current().kind !== "equals") {
          throw new Error(`Expected = in array update at line ${this.line}.`);
        }
        this.offset += 1;
        expression = {
          kind: "arrayUpdateExpression",
          line: this.line,
          object: expression,
          index,
          value: this.parseUpdate(),
        };
        continue;
      }
      if (this.current().kind !== "leftBrace") {
        throw new Error(`Expected [ or { after with at line ${this.line}.`);
      }
      expression = {
        kind: "recordUpdateExpression",
        line: this.line,
        object: expression,
        fields: this.parseFieldInitializers("record update"),
      };
    }
    return expression;
  }

  parseOr() {
    return this.parseBinary(() => this.parseAnd(), ["||"]);
  }

  parseAnd() {
    return this.parseBinary(() => this.parseEquality(), ["&&"]);
  }

  parseEquality() {
    return this.parseBinary(() => this.parseComparison(), ["==", "!="]);
  }

  parseComparison() {
    return this.parseBinary(() => this.parseAdditive(), ["<", "<=", ">", ">="]);
  }

  parseAdditive() {
    return this.parseBinary(() => this.parseMultiplicative(), ["+", "-"]);
  }

  parseMultiplicative() {
    return this.parseBinary(() => this.parseUnary(), ["*", "/", "%"]);
  }

  parseBinary(parseOperand, operators) {
    let expression = parseOperand();
    while (operators.includes(this.current().value)) {
      const operator = this.current().value;
      this.offset += 1;
      expression = {
        kind: "binaryExpression",
        line: this.line,
        operator,
        left: expression,
        right: parseOperand(),
      };
    }
    return expression;
  }

  parseUnary() {
    const token = this.current();
    if (token.kind === "operator" && (token.value === "!" || token.value === "-")) {
      this.offset += 1;
      return {
        kind: "unaryExpression",
        line: this.line,
        operator: token.value,
        operand: this.parseUnary(),
      };
    }
    return this.parsePrimary();
  }

  parseArguments(name) {
    const argumentsList = [];
    this.offset += 1;
    if (this.current().kind !== "rightParenthesis") {
      while (true) {
        argumentsList.push(this.parseUpdate());
        if (this.current().kind !== "comma") break;
        this.offset += 1;
      }
    }
    if (this.current().kind !== "rightParenthesis") {
      throw new Error(`Expected closing parenthesis for call to "${name}" at line ${this.line}.`);
    }
    this.offset += 1;
    return argumentsList;
  }

  parseFieldInitializers(context) {
    const fields = [];
    this.offset += 1;
    if (this.current().kind !== "rightBrace") {
      while (true) {
        const name = this.current();
        if (name.kind !== "identifier") {
          throw new Error(`Expected a field name in ${context} at line ${this.line}.`);
        }
        this.offset += 1;
        if (this.current().kind !== "colon") {
          throw new Error(`Expected : after field "${name.value}" at line ${this.line}.`);
        }
        this.offset += 1;
        fields.push({ name: name.value, expression: this.parseUpdate(), line: this.line });
        if (this.current().kind !== "comma") break;
        this.offset += 1;
        if (this.current().kind === "rightBrace") break;
      }
    }
    if (this.current().kind !== "rightBrace") {
      throw new Error(`Expected closing brace for ${context} at line ${this.line}.`);
    }
    this.offset += 1;
    return fields;
  }

  parsePostfix(expression) {
    while (true) {
      if (this.current().kind === "leftBracket") {
        this.offset += 1;
        const index = this.parseUpdate();
        if (this.current().kind === "colon") {
          this.offset += 1;
          const end = this.parseUpdate();
          if (this.current().kind !== "rightBracket") {
            throw new Error(`Expected closing bracket for sliced access at line ${this.line}.`);
          }
          this.offset += 1;
          expression = {
            kind: "sliceExpression",
            line: this.line,
            object: expression,
            start: index,
            end,
          };
          continue;
        }
        if (this.current().kind !== "rightBracket") {
          throw new Error(`Expected closing bracket for indexed access at line ${this.line}.`);
        }
        this.offset += 1;
        expression = { kind: "indexExpression", line: this.line, object: expression, index };
        continue;
      }
      if (this.current().kind === "dot") {
        this.offset += 1;
        const member = this.current();
        if (member.kind !== "identifier") {
          throw new Error(`Expected a member name after . at line ${this.line}.`);
        }
        this.offset += 1;
        expression = {
          kind: "memberExpression",
          line: this.line,
          object: expression,
          member: member.value,
        };
        continue;
      }
      return expression;
    }
  }

  parsePrimary() {
    const token = this.current();
    if (token.kind === "literal") {
      this.offset += 1;
      return this.parsePostfix({ kind: "literal", line: this.line, value: token.value });
    }
    if (token.kind === "leftBracket") {
      this.offset += 1;
      const elements = [];
      if (this.current().kind !== "rightBracket") {
        while (true) {
          elements.push(this.parseUpdate());
          if (this.current().kind !== "comma") break;
          this.offset += 1;
          if (this.current().kind === "rightBracket") break;
        }
      }
      if (this.current().kind !== "rightBracket") {
        throw new Error(`Expected closing bracket for array literal at line ${this.line}.`);
      }
      this.offset += 1;
      return this.parsePostfix({ kind: "arrayLiteral", line: this.line, elements });
    }
    if (token.kind === "identifier") {
      if (token.value === "match") return this.parseMatchExpression();
      this.offset += 1;
      if (this.current().kind === "doubleColon") {
        this.offset += 1;
        const alternative = this.current();
        if (alternative.kind !== "identifier") {
          throw new Error(`Expected a variant alternative after :: at line ${this.line}.`);
        }
        this.offset += 1;
        if (this.current().kind !== "leftParenthesis") {
          throw new Error(`Variant construction requires parentheses at line ${this.line}.`);
        }
        return this.parsePostfix({
          kind: "variantLiteral",
          line: this.line,
          variantName: token.value,
          alternative: alternative.value,
          arguments: this.parseArguments(`${token.value}::${alternative.value}`),
        });
      }
      if (this.current().kind === "leftParenthesis") {
        return this.parsePostfix({
          kind: "callExpression",
          line: this.line,
          callee: token.value,
          arguments: this.parseArguments(token.value),
        });
      }
      if (this.current().kind === "leftBrace") {
        return this.parsePostfix({
          kind: "recordLiteral",
          line: this.line,
          recordName: token.value,
          fields: this.parseFieldInitializers(`record literal ${token.value}`),
        });
      }
      return this.parsePostfix({ kind: "identifier", line: this.line, name: token.value });
    }
    if (token.kind === "leftParenthesis") {
      this.offset += 1;
      const expression = this.parseUpdate();
      if (this.current().kind !== "rightParenthesis") {
        throw new Error(`Expected closing parenthesis at line ${this.line}.`);
      }
      this.offset += 1;
      return this.parsePostfix(expression);
    }
    throw new Error(`Expected an expression at line ${this.line}.`);
  }

  parseMatchExpression() {
    this.offset += 1;
    if (this.current().kind !== "leftParenthesis") {
      throw new Error(`match requires a parenthesized value at line ${this.line}.`);
    }
    this.offset += 1;
    const value = this.parseUpdate();
    if (this.current().kind !== "rightParenthesis") {
      throw new Error(`Expected ) after match value at line ${this.line}.`);
    }
    this.offset += 1;
    if (this.current().kind !== "leftBrace") {
      throw new Error(`Expected { after match value at line ${this.line}.`);
    }
    this.offset += 1;
    const arms = [];
    while (this.current().kind !== "rightBrace") {
      const alternative = this.current();
      if (alternative.kind !== "identifier") {
        throw new Error(`Expected a variant alternative in match at line ${this.line}.`);
      }
      this.offset += 1;
      const bindings = [];
      if (this.current().kind === "leftParenthesis") {
        this.offset += 1;
        while (this.current().kind !== "rightParenthesis") {
          const binding = this.current();
          if (binding.kind !== "identifier") {
            throw new Error(`Expected a match binding at line ${this.line}.`);
          }
          bindings.push(binding.value);
          this.offset += 1;
          if (this.current().kind !== "comma") break;
          this.offset += 1;
        }
        if (this.current().kind !== "rightParenthesis") {
          throw new Error(`Expected ) after match bindings at line ${this.line}.`);
        }
        this.offset += 1;
      }
      if (this.current().kind !== "fatArrow") {
        throw new Error(`Expected => in match arm at line ${this.line}.`);
      }
      this.offset += 1;
      arms.push({
        alternative: alternative.value,
        bindings,
        expression: this.parseUpdate(),
        line: this.line,
      });
      if (arms.length > SANDBOX_LIMITS.MAX_MATCH_ARMS) {
        throw new Error(
          `Match arm count exceeds the sandbox limit of ${SANDBOX_LIMITS.MAX_MATCH_ARMS} at line ${this.line}.`,
        );
      }
      if (this.current().kind !== "comma") break;
      this.offset += 1;
      if (this.current().kind === "rightBrace") break;
    }
    if (this.current().kind !== "rightBrace") {
      throw new Error(`Expected } after match arms at line ${this.line}.`);
    }
    this.offset += 1;
    return this.parsePostfix({ kind: "matchExpression", line: this.line, value, arms });
  }
}

function parseExpression(source, line) {
  return new ExpressionParser(tokenizeExpression(source, line), line).parse();
}

function removeOptionalSemicolon(line) {
  return line.endsWith(";") ? line.slice(0, -1).trimEnd() : line;
}

function parseSimpleStatement(source, line) {
  const statement = removeOptionalSemicolon(source);
  if (statement === "break" || statement === "continue") {
    return { kind: `${statement}Statement`, line };
  }
  const returnMatch = statement.match(RETURN_STATEMENT);
  if (returnMatch) {
    return {
      kind: "returnStatement",
      line,
      expression: returnMatch[1] ? parseExpression(returnMatch[1], line) : null,
    };
  }
  const printMatch = statement.match(PRINT_STATEMENT);
  if (printMatch) {
    return { kind: "print", line, expression: parseExpression(printMatch[1], line) };
  }
  const declarationMatch = statement.match(VARIABLE_DECLARATION);
  if (declarationMatch) {
    return {
      kind: "variableDeclaration",
      line,
      mutable: declarationMatch[1] === "var",
      name: declarationMatch[2],
      annotation: declarationMatch[3] ? parseType(declarationMatch[3], line) : null,
      initializer: parseExpression(declarationMatch[4], line),
    };
  }
  const assignmentMatch = statement.match(VARIABLE_ASSIGNMENT);
  if (assignmentMatch) {
    return {
      kind: "variableAssignment",
      line,
      name: assignmentMatch[1],
      expression: parseExpression(assignmentMatch[2], line),
    };
  }
  return {
    kind: "expressionStatement",
    line,
    expression: parseExpression(statement, line),
  };
}

function parseParameters(source, line) {
  if (source.trim() === "") return [];
  const parameters = splitTypeArguments(source);
  if (parameters.length > SANDBOX_LIMITS.MAX_PARAMETERS) {
    throw new Error(
      `Parameter count exceeds the sandbox limit of ${SANDBOX_LIMITS.MAX_PARAMETERS} at line ${line}.`,
    );
  }
  return parameters.map((parameter) => {
    const match = parameter.trim().match(
      new RegExp(String.raw`^(${IDENTIFIER_SOURCE})\s*:\s*(.+)$`),
    );
    if (!match) throw new Error(`Invalid function parameter at line ${line}.`);
    return { name: match[1], type: parseType(match[2], line), line };
  });
}

function parseImportDeclaration(source, line) {
  const match = source.match(/^import\s+\{([^}]*)\}\s+from\s+(.+)$/);
  if (!match) throw new Error(`Invalid import declaration at line ${line}.`);
  const itemSource = match[1].trim();
  if (itemSource === "") throw new Error(`Import list cannot be empty at line ${line}.`);
  const items = itemSource.split(",").map((item) => {
    const itemMatch = item.trim().match(
      new RegExp(String.raw`^(${IDENTIFIER_SOURCE})(?:\s+as\s+(${IDENTIFIER_SOURCE}))?$`),
    );
    if (!itemMatch) throw new Error(`Invalid import item at line ${line}.`);
    return {
      imported: itemMatch[1],
      local: itemMatch[2] ?? itemMatch[1],
      line,
    };
  });
  const specifierSource = match[2].trim();
  if (!specifierSource.startsWith('"')) {
    throw new Error(`Import specifier must be a string at line ${line}.`);
  }
  const specifier = readString(specifierSource, 0, line);
  const remainder = specifierSource.slice(specifier.nextOffset).trim();
  if (remainder !== "" && remainder !== ";") {
    throw new Error(`Invalid import declaration at line ${line}.`);
  }
  return {
    kind: "importDeclaration",
    line,
    specifier: specifier.value,
    items,
  };
}

class ProgramParser {
  constructor(source, { moduleId = null, isEntry = true } = {}) {
    this.lines = source.replaceAll("\r\n", "\n").split("\n").map((text, index) => ({
      line: index + 1,
      text: text.trim(),
    }));
    this.offset = 0;
    this.moduleId = moduleId;
    this.isEntry = isEntry;
  }

  skipTrivia() {
    while (this.offset < this.lines.length) {
      const { text } = this.lines[this.offset];
      if (text !== "" && !text.startsWith("//")) return;
      this.offset += 1;
    }
  }

  parseStatementList(openingLine = null) {
    const statements = [];
    while (true) {
      this.skipTrivia();
      if (this.offset >= this.lines.length) {
        if (openingLine !== null) {
          throw new Error(`Expected closing brace for block opened at line ${openingLine}.`);
        }
        return { statements, terminator: null };
      }

      const current = this.lines[this.offset];
      if (current.text === "}" || current.text === "} else {") {
        if (openingLine === null) {
          throw new Error(`Unexpected closing brace at line ${current.line}.`);
        }
        this.offset += 1;
        return { statements, terminator: current.text === "} else {" ? "else" : "close" };
      }
      if (/^else\s*\{\s*$/.test(current.text)) {
        throw new Error(`Unexpected else at line ${current.line}.`);
      }

      if (/^import(?:\s|$)/.test(current.text)) {
        const scope = openingLine === null ? "before every declaration or statement" : "at program scope";
        throw new Error(`Imports must appear ${scope} at line ${current.line}.`);
      }

      const exportMatch = current.text.match(/^export\s+(.+)$/);
      const declarationSource = exportMatch ? exportMatch[1] : current.text;
      const functionMatch = declarationSource.match(FUNCTION_HEADER);
      if (functionMatch) {
        if (openingLine !== null) {
          throw new Error(`Functions must be declared at program scope at line ${current.line}.`);
        }
        statements.push(this.parseFunction(current, functionMatch, exportMatch !== null));
        continue;
      }
      const recordMatch = declarationSource.match(RECORD_HEADER);
      if (recordMatch) {
        if (openingLine !== null) {
          throw new Error(`Records must be declared at program scope at line ${current.line}.`);
        }
        statements.push(this.parseRecord(current, recordMatch, exportMatch !== null));
        continue;
      }
      const variantMatch = declarationSource.match(VARIANT_HEADER);
      if (variantMatch) {
        if (openingLine !== null) {
          throw new Error(`Variants must be declared at program scope at line ${current.line}.`);
        }
        statements.push(this.parseVariant(current, variantMatch, exportMatch !== null));
        continue;
      }
      if (/^export(?:\s|$)/.test(current.text)) {
        throw new Error(`Only a top-level function, record, or variant declaration may be exported at line ${current.line}.`);
      }
      if (/^function(?:\s|$)/.test(current.text)) {
        throw new Error(`Invalid function declaration at line ${current.line}.`);
      }
      if (/^record(?:\s|$)/.test(current.text)) {
        throw new Error(`Invalid record declaration at line ${current.line}.`);
      }
      if (/^variant(?:\s|$)/.test(current.text)) {
        throw new Error(`Invalid variant declaration at line ${current.line}.`);
      }

      const conditionalMatch = current.text.match(/^if\s+(.+?)\s*\{\s*$/);
      if (conditionalMatch) {
        statements.push(this.parseConditional(current, conditionalMatch[1]));
        continue;
      }
      if (/^if(?:\s|$)/.test(current.text)) {
        throw new Error(`Expected an opening brace for if at line ${current.line}.`);
      }

      const loopMatch = current.text.match(/^while\s+(.+?)\s*\{\s*$/);
      if (loopMatch) {
        statements.push(this.parseLoop(current, loopMatch[1]));
        continue;
      }
      if (/^while(?:\s|$)/.test(current.text)) {
        throw new Error(`Expected an opening brace for while at line ${current.line}.`);
      }

      this.offset += 1;
      statements.push(parseSimpleStatement(current.text, current.line));
    }
  }

  parseFunction(opening, match, exported) {
    this.offset += 1;
    const body = this.parseStatementList(opening.line);
    if (body.terminator === "else") {
      throw new Error(`Unexpected else after function at line ${opening.line}.`);
    }
    return {
      kind: "functionDeclaration",
      line: opening.line,
      name: match[1],
      exported,
      typeParameters: parseTypeParameters(match[2], opening.line),
      parameters: parseParameters(match[3], opening.line),
      returnType: parseType(match[4], opening.line),
      body: { kind: "block", line: opening.line, statements: body.statements },
    };
  }

  parseRecord(opening, match, exported) {
    this.offset += 1;
    const fields = [];
    while (true) {
      this.skipTrivia();
      const current = this.lines[this.offset];
      if (!current) {
        throw new Error(`Expected closing brace for record opened at line ${opening.line}.`);
      }
      if (current.text === "}") {
        this.offset += 1;
        break;
      }
      const field = current.text.match(
        new RegExp(String.raw`^(${IDENTIFIER_SOURCE})\s*:\s*(.+?)\s*,?\s*$`),
      );
      if (!field) throw new Error(`Invalid record field at line ${current.line}.`);
      fields.push({ name: field[1], type: parseType(field[2], current.line), line: current.line });
      if (fields.length > SANDBOX_LIMITS.MAX_NOMINAL_FIELDS) {
        throw new Error(
          `Record field count exceeds the sandbox limit of ${SANDBOX_LIMITS.MAX_NOMINAL_FIELDS} at line ${opening.line}.`,
        );
      }
      this.offset += 1;
    }
    return {
      kind: "recordDeclaration",
      line: opening.line,
      name: match[1],
      exported,
      typeParameters: parseTypeParameters(match[2], opening.line),
      fields,
    };
  }

  parseVariant(opening, match, exported) {
    this.offset += 1;
    const alternatives = [];
    while (true) {
      this.skipTrivia();
      const current = this.lines[this.offset];
      if (!current) {
        throw new Error(`Expected closing brace for variant opened at line ${opening.line}.`);
      }
      if (current.text === "}") {
        this.offset += 1;
        break;
      }
      const alternative = current.text.match(
        new RegExp(String.raw`^(${IDENTIFIER_SOURCE})(?:\s*\((.*)\))?\s*,?\s*$`),
      );
      if (!alternative) throw new Error(`Invalid variant alternative at line ${current.line}.`);
      alternatives.push({
        name: alternative[1],
        fields: alternative[2] === undefined
          ? []
          : parseParameters(alternative[2], current.line),
        line: current.line,
      });
      if (alternatives.at(-1).fields.length > SANDBOX_LIMITS.MAX_NOMINAL_FIELDS) {
        throw new Error(
          `Variant field count exceeds the sandbox limit of ${SANDBOX_LIMITS.MAX_NOMINAL_FIELDS} at line ${current.line}.`,
        );
      }
      if (alternatives.length > SANDBOX_LIMITS.MAX_VARIANT_ALTERNATIVES) {
        throw new Error(
          `Variant alternative count exceeds the sandbox limit of ${SANDBOX_LIMITS.MAX_VARIANT_ALTERNATIVES} at line ${opening.line}.`,
        );
      }
      this.offset += 1;
    }
    if (alternatives.length === 0) {
      throw new Error(`Variant "${match[1]}" requires at least one alternative at line ${opening.line}.`);
    }
    return {
      kind: "variantDeclaration",
      line: opening.line,
      name: match[1],
      exported,
      typeParameters: parseTypeParameters(match[2], opening.line),
      alternatives,
    };
  }

  parseConditional(opening, conditionSource) {
    this.offset += 1;
    const consequent = this.parseStatementList(opening.line);
    let hasAlternate = consequent.terminator === "else";
    if (!hasAlternate) {
      this.skipTrivia();
      const candidate = this.lines[this.offset];
      if (candidate && /^else\s*\{\s*$/.test(candidate.text)) {
        hasAlternate = true;
        this.offset += 1;
      }
    }

    let alternate = null;
    if (hasAlternate) {
      const alternateBlock = this.parseStatementList(opening.line);
      if (alternateBlock.terminator === "else") {
        throw new Error(`Unexpected second else for if at line ${opening.line}.`);
      }
      alternate = { kind: "block", line: opening.line, statements: alternateBlock.statements };
    }
    return {
      kind: "ifStatement",
      line: opening.line,
      condition: parseExpression(conditionSource, opening.line),
      consequent: { kind: "block", line: opening.line, statements: consequent.statements },
      alternate,
    };
  }

  parseLoop(opening, conditionSource) {
    this.offset += 1;
    const body = this.parseStatementList(opening.line);
    if (body.terminator === "else") {
      throw new Error(`Unexpected else after while at line ${opening.line}.`);
    }
    return {
      kind: "whileStatement",
      line: opening.line,
      condition: parseExpression(conditionSource, opening.line),
      body: { kind: "block", line: opening.line, statements: body.statements },
    };
  }

  parse() {
    const imports = [];
    while (true) {
      this.skipTrivia();
      const current = this.lines[this.offset];
      if (!current || !/^import(?:\s|$)/.test(current.text)) break;
      imports.push(parseImportDeclaration(current.text, current.line));
      this.offset += 1;
    }
    const result = this.parseStatementList();
    return {
      kind: "program",
      moduleId: this.moduleId,
      isEntry: this.isEntry,
      imports,
      statements: result.statements,
    };
  }
}

export function parseProgram(source, options) {
  const parser = new ProgramParser(source, options);
  try {
    return parser.parse();
  } catch (error) {
    throw withModuleContext(error, parser.moduleId);
  }
}
