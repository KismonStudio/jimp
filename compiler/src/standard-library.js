import {
  STANDARD_LIBRARY,
  STANDARD_LIBRARY_SOURCES,
} from "./generated/stdlib.js";

export function standardLibraryCatalog(major) {
  if (major !== STANDARD_LIBRARY.version) {
    throw new Error(`Unsupported standard-library major version ${major}.`);
  }
  return STANDARD_LIBRARY;
}

export function resolveStandardModule(specifier, major = STANDARD_LIBRARY.version) {
  const catalog = standardLibraryCatalog(major);
  return catalog.modules.find((module) => module.specifier === specifier) ?? null;
}

export function standardModuleSource(module) {
  const paths = [...new Set([module.source, ...module.exports
    .map((exported) => exported.implementation?.source)
    .filter((source) => source !== undefined)].filter((source) => source !== undefined))];
  if (paths.length > 1) {
    throw new Error(`Standard module "${module.specifier}" uses multiple canonical source files.`);
  }
  return paths.length === 0 ? "" : STANDARD_LIBRARY_SOURCES[paths[0]];
}

export function standardExportSignature(exported) {
  if ((exported.kind ?? "function") !== "function") {
    throw new Error(`Standard export "${exported.name}" is not a function.`);
  }
  return {
    parameterTypes: exported.parameters.map(({ type }) => type),
    returnType: exported.returnType,
  };
}

export const DEFAULT_STANDARD_LIBRARY_MAJOR = STANDARD_LIBRARY.version;
