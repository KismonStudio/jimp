import { analyzeProgram } from "./analyzer.js";
import { emitAnalyzedProgram } from "./compiler.js";
import { SANDBOX_LIMITS } from "./generated/sandbox.js";
import { TARGET_PROFILES } from "./generated/targets.js";
import { withModuleContext } from "./module-context.js";
import { assertProjectUnchanged, resolveProject } from "./project-resolver.js";
import { standardExportSignature } from "./standard-library.js";

function identityKey(moduleId, name) {
  return JSON.stringify([moduleId, name]);
}

function visitCalls(value, visitor) {
  if (Array.isArray(value)) {
    for (const item of value) visitCalls(item, visitor);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (value.kind === "callExpression") visitor(value);
  for (const child of Object.values(value)) visitCalls(child, visitor);
}

function targetProfileNamed(name) {
  const profile = TARGET_PROFILES.find((candidate) => candidate.name === name);
  if (!profile) throw new Error(`Unknown target profile "${name}".`);
  return profile;
}

function linkProject(graph, { targetProfile = "portable" } = {}) {
  const target = targetProfileNamed(targetProfile);
  const targetCapabilities = new Map(target.guaranteedCapabilities
    .map((capability) => [capability.symbol, capability]));
  const exportTables = new Map();
  const analyzedModules = [];

  for (const module of graph.modules) {
    const resolvedImports = [];
    for (const dependency of module.dependencies) {
      const dependencyExports = exportTables.get(dependency.moduleId);
      for (const item of dependency.declaration.items) {
        const exported = dependencyExports.get(item.imported);
        if (!exported) {
          throw withModuleContext(
            new Error(
              `Import "${item.imported}" from "${dependency.declaration.specifier}" does not name an exported declaration at line ${item.line}.`,
            ),
            module.id,
          );
        }
        resolvedImports.push({
          kind: exported.kind,
          specifier: dependency.declaration.specifier,
          imported: item.imported,
          local: item.local,
          moduleId: dependency.moduleId,
          ...(exported.kind === "record" || exported.kind === "variant" ? {
            name: exported.name,
            type: exported.type,
            typeParameters: exported.typeParameters,
            fields: exported.fields ?? [],
            alternatives: exported.alternatives ?? [],
            dependencies: exported.dependencies,
          } : {
            parameterTypes: exported.parameterTypes,
            returnType: exported.returnType,
            typeParameters: exported.typeParameters ?? [],
            dependencies: exported.dependencies,
          }),
        });
      }
    }
    const program = analyzeProgram(module.parsed, { resolvedImports });
    const moduleExports = new Map(program.exports.map((exported) => [exported.name, exported]));
    if (module.standard) {
      for (const catalogExport of module.catalogModule.exports) {
        const analyzed = moduleExports.get(catalogExport.name);
        if ((catalogExport.kind ?? "function") === "record"
          || (catalogExport.kind ?? "function") === "variant") {
          if (analyzed?.kind !== catalogExport.kind) {
            throw withModuleContext(
              new Error(`Standard type export "${catalogExport.name}" is missing.`),
              module.id,
            );
          }
          continue;
        }
        const signature = standardExportSignature(catalogExport);
        moduleExports.set(catalogExport.name, {
          kind: "function",
          name: catalogExport.name,
          moduleId: module.id,
          parameterTypes: analyzed?.parameterTypes ?? signature.parameterTypes,
          returnType: analyzed?.returnType ?? signature.returnType,
          functionIndex: analyzed?.functionIndex ?? null,
          dependencies: analyzed?.dependencies ?? [],
          standardDefinition: catalogExport,
        });
      }
    }
    exportTables.set(module.id, moduleExports);
    analyzedModules.push({
      module,
      program,
    });
  }

  const analyzedById = new Map(analyzedModules.map((item) => [item.module.id, item]));
  const standardHostTargets = new Map();
  const selectedStandardFunctions = new Set();
  const pendingExports = [];
  const pendingFunctions = [];
  const visitedExports = new Set();

  function enqueueCall(expression, sourceModuleId) {
    if (expression.functionIdentity?.moduleId.startsWith("std:")) {
      pendingExports.push(expression.functionIdentity);
    } else if (sourceModuleId.startsWith("std:") && expression.functionIndex !== null) {
      pendingFunctions.push({ moduleId: sourceModuleId, functionIndex: expression.functionIndex });
    }
  }

  for (const { module, program } of analyzedModules) {
    if (module.standard) continue;
    visitCalls(program.statements, (expression) => enqueueCall(expression, module.id));
    for (const func of program.functions) {
      visitCalls(func.body.statements, (expression) => enqueueCall(expression, module.id));
    }
  }

  while (pendingExports.length > 0 || pendingFunctions.length > 0) {
    while (pendingExports.length > 0) {
      const identity = pendingExports.shift();
      const key = identityKey(identity.moduleId, identity.exportName);
      if (visitedExports.has(key)) continue;
      visitedExports.add(key);
      const exported = exportTables.get(identity.moduleId)?.get(identity.exportName);
      if (!exported?.standardDefinition) {
        throw withModuleContext(new Error("Internal linker error: standard export is unresolved."), identity.moduleId);
      }
      const implementation = exported.standardDefinition.implementation;
      const nativeCapability = implementation.optionalNative?.capability;
      const selectedCapability = implementation.kind === "host"
        ? implementation.capability
        : nativeCapability && targetCapabilities.has(nativeCapability)
          ? nativeCapability
          : null;
      if (selectedCapability !== null) {
        standardHostTargets.set(key, {
          kind: "host",
          capability: selectedCapability,
          parameterTypes: exported.parameterTypes,
          returnType: exported.returnType,
        });
        continue;
      }
      const analyzed = analyzedById.get(identity.moduleId)?.program;
      const programExport = analyzed?.exports.find(({ name, kind }) =>
        kind === "function" && name === identity.exportName);
      if (!programExport) {
        throw withModuleContext(new Error("Internal linker error: portable standard export is missing."), identity.moduleId);
      }
      pendingFunctions.push({
        moduleId: identity.moduleId,
        functionIndex: programExport.functionIndex,
      });
    }
    while (pendingFunctions.length > 0) {
      const identity = pendingFunctions.shift();
      const key = identityKey(identity.moduleId, identity.functionIndex);
      if (selectedStandardFunctions.has(key)) continue;
      selectedStandardFunctions.add(key);
      const func = analyzedById.get(identity.moduleId)?.program.functions
        .find(({ index }) => index === identity.functionIndex);
      if (!func) {
        throw withModuleContext(new Error("Internal linker error: standard function is missing."), identity.moduleId);
      }
      visitCalls(func.body.statements, (expression) => enqueueCall(expression, identity.moduleId));
    }
  }

  const functionIndices = new Map();
  const linkedFunctions = [];
  let nextFunctionIndex = 1;
  for (const { module, program } of analyzedModules) {
    for (const func of program.functions) {
      if (module.standard
        && !selectedStandardFunctions.has(identityKey(module.id, func.index))) continue;
      if (nextFunctionIndex >= SANDBOX_LIMITS.MAX_FUNCTIONS) {
        throw withModuleContext(
          new Error(
            `Linked program exceeds the sandbox limit of ${SANDBOX_LIMITS.MAX_FUNCTIONS} functions at line ${func.line}.`,
          ),
          module.id,
        );
      }
      functionIndices.set(identityKey(module.id, func.index), nextFunctionIndex);
      linkedFunctions.push({
        ...func,
        index: nextFunctionIndex,
        moduleId: module.id,
        linkedName: `${module.id}::${func.name}`,
        localFunctionIndex: func.index,
      });
      nextFunctionIndex += 1;
    }
  }

  const exportedFunctionIndices = new Map();
  for (const { module, program } of analyzedModules) {
    for (const exported of program.exports) {
      if (exported.kind !== "function") continue;
      const globalIndex = functionIndices.get(identityKey(module.id, exported.functionIndex));
      exportedFunctionIndices.set(identityKey(module.id, exported.name), globalIndex);
    }
  }

  const entry = analyzedModules.find(({ module }) => module.id === graph.entryId);
  if (!entry) throw new Error("Internal linker error: entry module is missing from the graph.");
  const resolveCallTarget = (expression, moduleId) => {
    if (expression.functionIdentity) {
      const hostTarget = standardHostTargets.get(identityKey(
        expression.functionIdentity.moduleId,
        expression.functionIdentity.exportName,
      ));
      if (hostTarget) return hostTarget;
    }
    const index = expression.functionIdentity
      ? exportedFunctionIndices.get(identityKey(
        expression.functionIdentity.moduleId,
        expression.functionIdentity.exportName,
      ))
      : functionIndices.get(identityKey(moduleId, expression.functionIndex));
    if (index === undefined) {
      throw withModuleContext(new Error("Internal linker error: function identity is unresolved."), moduleId);
    }
    return { kind: "function", index };
  };
  const linkedProgram = {
    kind: "linkedProgram",
    moduleId: graph.entryId,
    statements: entry.program.statements,
    variableCount: entry.program.variableCount,
    functions: linkedFunctions,
  };
  return emitAnalyzedProgram(linkedProgram, {
    resolveCallTarget,
    build: {
      targetProfile: target.name,
      standardLibraryMajor: graph.standardLibraryMajor,
      entryModuleId: graph.entryId,
      guaranteedCapabilities: target.guaranteedCapabilities.map(({ symbol }) => symbol),
    },
  });
}

export async function compileResolvedProject(graph, options) {
  await assertProjectUnchanged(graph);
  return linkProject(graph, options);
}

export async function compileProject(entryPath, options) {
  const graph = await resolveProject(entryPath, options);
  return compileResolvedProject(graph, options);
}
