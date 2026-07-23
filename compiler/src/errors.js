import { ERROR_CODES, ERROR_SCHEMA } from "./generated/errors.js";

function inferLocation(message, phase) {
  if (phase === "compile") {
    const match = message.match(/\bat line (\d+)\b/);
    if (match) return { kind: "source", line: Number(match[1]) };
  }
  if (phase === "decode" || phase === "verify") {
    const match = message.match(/\b(?:code )?offset (\d+)\b/);
    if (match) return { kind: "bytecode", offset: Number(match[1]) };
  }
  return undefined;
}

function singleLine(message) {
  return message.replaceAll("\r", "\\r").replaceAll("\n", "\\n").replaceAll("\t", "\\t");
}

export class AureonError extends Error {
  constructor(definition, message, { location, cause } = {}) {
    super(String(message), cause === undefined ? undefined : { cause });
    this.name = "AureonError";
    this.code = definition.code;
    this.phase = definition.phase;
    this.exitCode = definition.exitCode;
    this.location = location;
  }

  toJSON() {
    return {
      schema: ERROR_SCHEMA,
      code: this.code,
      phase: this.phase,
      message: this.message,
      ...(this.location === undefined ? {} : { location: this.location }),
    };
  }
}

export function normalizeError(error, definition) {
  if (error instanceof AureonError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const inferredLocation = inferLocation(message, definition.phase);
  const location = inferredLocation?.kind === "source"
    && typeof error?.moduleId === "string"
    ? { ...inferredLocation, moduleId: error.moduleId }
    : inferredLocation;
  return new AureonError(definition, message, {
    location,
    cause: error,
  });
}

export function formatError(error, format = "human") {
  if (format === "json") return `${JSON.stringify(error.toJSON())}\n`;
  const location = error.location?.kind === "source"
    ? error.location.moduleId
      ? ` at source ${error.location.moduleId}:${error.location.line}`
      : ` at source line ${error.location.line}`
    : error.location?.kind === "bytecode"
      ? ` at bytecode offset ${error.location.offset}`
      : "";
  return `AUREON error ${error.code} (${error.phase})${location}: ${singleLine(error.message)}\n`;
}

export { ERROR_CODES, ERROR_SCHEMA };
