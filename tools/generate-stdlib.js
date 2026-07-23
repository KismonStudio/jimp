import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "../compiler/src/compiler.js";
import { parseProgram } from "../compiler/src/parser.js";
import { decodePortableModule } from "../compiler/src/portable/module.js";
import { parseTypeSyntax } from "../compiler/src/type-system.js";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const standardLibraryRoot = resolve(repositoryRoot, "stdlib");
const definitionPath = resolve(repositoryRoot, "stdlib/v1.json");
const checkOnly = process.argv.slice(2).includes("--check");
const scalarParameterTypes = new Set(["BOOL", "I64", "F64", "STRING"]);
const scalarReturnTypes = new Set([...scalarParameterTypes, "NULL", "VOID"]);

function invariant(condition, message) {
  if (!condition) throw new Error(`Invalid standard library definition: ${message}`);
}

function validSourceType(type, { allowNull = false, allowVoid = false } = {}) {
  if (!allowNull && type === "NULL") return false;
  if (!allowVoid && type === "VOID") return false;
  try {
    parseTypeSyntax(type);
    return true;
  } catch {
    return false;
  }
}

function validateTypeParameters(exported, identity) {
  const parameters = exported.typeParameters ?? [];
  invariant(Array.isArray(parameters), `${identity} type parameters must be an array`);
  invariant(new Set(parameters).size === parameters.length,
    `${identity} contains duplicate type parameters`);
  for (const parameter of parameters) {
    invariant(/^[A-Z][A-Za-z0-9]*$/.test(parameter)
      && !scalarReturnTypes.has(parameter),
    `invalid type parameter ${identity}.${parameter}`);
  }
}

function validatePortableSources(sourceRecords) {
  for (const [sourcePath, record] of sourceRecords) {
    const { expectedExports, allowedCapabilities } = record;
    const absolutePath = resolve(standardLibraryRoot, sourcePath);
    invariant(existsSync(absolutePath), `portable source does not exist: ${sourcePath}`);
    const source = readFileSync(absolutePath, "utf8");
    let parsed;
    try {
      parsed = parseProgram(source, { moduleId: `<stdlib:${sourcePath}>`, isEntry: false });
    } catch (error) {
      throw new Error(`Invalid standard library definition: portable source ${sourcePath} does not parse: ${error.message}`);
    }
    const declarations = parsed.statements.filter(({ exported }) => exported);
    const exportedNames = declarations.map(({ name }) => name);
    invariant(parsed.statements.every(({ kind }) =>
      kind === "functionDeclaration" || kind === "recordDeclaration"
        || kind === "variantDeclaration"),
      `portable source ${sourcePath} cannot contain entry statements`);
    invariant(new Set(exportedNames).size === exportedNames.length,
      `portable source ${sourcePath} contains duplicate exports`);
    invariant(exportedNames.length === expectedExports.size
      && exportedNames.every((name) => expectedExports.has(name)),
    `portable source ${sourcePath} exports do not match its catalog fallbacks`);
    const declarationsByName = new Map(declarations.map((declaration) =>
      [declaration.name, declaration]));
    for (const [name, expected] of expectedExports) {
      const actual = declarationsByName.get(name);
      const kind = expected.kind ?? "function";
      invariant(actual?.kind === `${kind}Declaration`,
        `portable source ${sourcePath} does not define ${kind} ${name}`);
      invariant(JSON.stringify(actual.typeParameters ?? [])
        === JSON.stringify(expected.typeParameters ?? []),
      `portable source ${sourcePath} has the wrong type parameters for ${name}`);
      if (kind === "record") {
        invariant(actual.fields.length === expected.fields.length,
          `portable source ${sourcePath} has the wrong field count for ${name}`);
        for (let index = 0; index < expected.fields.length; index += 1) {
          invariant(actual.fields[index].name === expected.fields[index].name
            && actual.fields[index].type === expected.fields[index].type,
          `portable source ${sourcePath} has the wrong field ${index} for ${name}`);
        }
      } else if (kind === "variant") {
        invariant(actual.alternatives.length === expected.alternatives.length,
          `portable source ${sourcePath} has the wrong alternative count for ${name}`);
        for (let alternativeIndex = 0;
          alternativeIndex < expected.alternatives.length;
          alternativeIndex += 1) {
          const actualAlternative = actual.alternatives[alternativeIndex];
          const expectedAlternative = expected.alternatives[alternativeIndex];
          invariant(actualAlternative.name === expectedAlternative.name
            && actualAlternative.fields.length === expectedAlternative.fields.length,
          `portable source ${sourcePath} has the wrong alternative ${alternativeIndex} for ${name}`);
          for (let fieldIndex = 0;
            fieldIndex < expectedAlternative.fields.length;
            fieldIndex += 1) {
            invariant(actualAlternative.fields[fieldIndex].name
                === expectedAlternative.fields[fieldIndex].name
              && actualAlternative.fields[fieldIndex].type
                === expectedAlternative.fields[fieldIndex].type,
            `portable source ${sourcePath} has the wrong alternative field ${fieldIndex} for ${name}`);
          }
        }
      } else {
        invariant(actual.returnType === expected.returnType,
          `portable source ${sourcePath} has the wrong return type for ${name}`);
        invariant(actual.parameters.length === expected.parameters.length,
          `portable source ${sourcePath} has the wrong parameter count for ${name}`);
        for (let index = 0; index < expected.parameters.length; index += 1) {
          invariant(actual.parameters[index].name === expected.parameters[index].name
            && actual.parameters[index].type === expected.parameters[index].type,
          `portable source ${sourcePath} has the wrong parameter ${index} for ${name}`);
        }
      }
    }
    if (parsed.imports.length === 0) {
      let module;
      try {
        module = decodePortableModule(compile(source));
      } catch (error) {
        throw new Error(`Invalid standard library definition: portable source ${sourcePath} does not compile: ${error.message}`);
      }
      invariant(module.imports.every(({ symbol }) => allowedCapabilities.has(symbol)),
        `portable source ${sourcePath} uses a host import outside its catalog module`);
    }
  }
}

function validateDefinition(definition) {
  invariant(definition.name === "aureon-standard-library", "unexpected catalog name");
  invariant(definition.version === 1, "unsupported catalog version");
  invariant(definition.fallbackPolicy?.selection === "link-time",
    "fallback selection must be link-time");
  invariant(definition.fallbackPolicy?.defaultImplementation === "portable",
    "fallback default must be portable");
  invariant(definition.fallbackPolicy?.nativeEligibility === "target-guaranteed",
    "native implementations must require a target guarantee");
  invariant(definition.fallbackPolicy?.runtimeFallback === false,
    "runtime fallback must be disabled");
  invariant(Array.isArray(definition.modules) && definition.modules.length > 0,
    "modules must be a non-empty array");
  const moduleSpecifiers = new Set();
  const capabilities = new Set();
  const sourceRecords = new Map();
  for (const module of definition.modules) {
    invariant(/^std:[a-z][a-z0-9]*(?:\/[a-z][a-z0-9]*)*$/.test(module.specifier),
      `invalid module specifier ${module.specifier}`);
    invariant(!moduleSpecifiers.has(module.specifier), `duplicate module ${module.specifier}`);
    moduleSpecifiers.add(module.specifier);
    invariant(["portable", "host-bridge", "hybrid"].includes(module.kind),
      `invalid kind for ${module.specifier}`);
    if (module.source !== undefined) {
      invariant(/^src\/[a-z][a-z0-9]*(?:\/[a-z][a-z0-9]*)*\.aur$/.test(module.source),
        `invalid module source for ${module.specifier}`);
    }
    invariant(module.description?.en && module.description?.pt,
      `missing descriptions for ${module.specifier}`);
    invariant(Array.isArray(module.exports) && module.exports.length > 0,
      `${module.specifier} must export at least one function`);
    const exportNames = new Set();
    let hasPortable = false;
    let hasHost = false;
    for (const exported of module.exports) {
      const exportKind = exported.kind ?? "function";
      invariant(["function", "record", "variant"].includes(exportKind),
        `invalid export kind for ${module.specifier}.${exported.name}`);
      invariant(exportKind === "record" || exportKind === "variant"
        ? /^[A-Z][A-Za-z0-9]*$/.test(exported.name)
        : /^[a-z][A-Za-z0-9]*$/.test(exported.name),
        `invalid export name ${module.specifier}.${exported.name}`);
      invariant(!exportNames.has(exported.name),
        `duplicate export ${module.specifier}.${exported.name}`);
      exportNames.add(exported.name);
      invariant(exported.description?.en && exported.description?.pt,
        `missing descriptions for ${module.specifier}.${exported.name}`);
      validateTypeParameters(exported, `${module.specifier}.${exported.name}`);
      if (exportKind === "record" || exportKind === "variant") {
        hasPortable = true;
        invariant(module.source !== undefined,
          `${exportKind} export ${module.specifier}.${exported.name} requires a module source`);
        const fieldGroups = exportKind === "record"
          ? [exported.fields]
          : exported.alternatives?.map((alternative) => alternative.fields);
        invariant(Array.isArray(fieldGroups) && fieldGroups.every(Array.isArray),
          `${exportKind} export ${module.specifier}.${exported.name} requires its fields`);
        const alternativeNames = new Set();
        if (exportKind === "variant") {
          invariant(exported.alternatives.length > 0,
            `variant export ${module.specifier}.${exported.name} requires alternatives`);
          for (const alternative of exported.alternatives) {
            invariant(/^[A-Z][A-Za-z0-9]*$/.test(alternative.name)
              && !alternativeNames.has(alternative.name),
            `invalid alternative ${module.specifier}.${exported.name}.${alternative.name}`);
            alternativeNames.add(alternative.name);
          }
        }
        for (const fields of fieldGroups) {
          const fieldNames = new Set();
          for (const field of fields) {
            invariant(/^[a-z][A-Za-z0-9]*$/.test(field.name)
              && !fieldNames.has(field.name)
              && validSourceType(field.type, { allowNull: true }),
            `invalid field ${module.specifier}.${exported.name}.${field.name}`);
            fieldNames.add(field.name);
          }
        }
        invariant(exported.parameters === undefined && exported.returnType === undefined
          && exported.implementation === undefined,
        `${exportKind} export ${module.specifier}.${exported.name} cannot define a function contract`);
        const record = sourceRecords.get(module.source) ?? {
          expectedExports: new Map(),
          allowedCapabilities: new Set(),
        };
        invariant(!record.expectedExports.has(exported.name),
          `duplicate fallback ${module.source}:${exported.name}`);
        record.expectedExports.set(exported.name, exported);
        sourceRecords.set(module.source, record);
        continue;
      }
      invariant(Array.isArray(exported.parameters),
        `missing parameters for ${module.specifier}.${exported.name}`);
      const parameterNames = new Set();
      for (const parameter of exported.parameters) {
        invariant(/^[a-z][A-Za-z0-9]*$/.test(parameter.name),
          `invalid parameter ${module.specifier}.${exported.name}.${parameter.name}`);
        invariant(!parameterNames.has(parameter.name),
          `duplicate parameter ${module.specifier}.${exported.name}.${parameter.name}`);
        parameterNames.add(parameter.name);
        invariant(validSourceType(parameter.type),
          `invalid parameter type for ${module.specifier}.${exported.name}.${parameter.name}`);
      }
      invariant(validSourceType(exported.returnType, { allowNull: true, allowVoid: true }),
        `invalid return type for ${module.specifier}.${exported.name}`);
      const implementation = exported.implementation;
      invariant(["portable", "host"].includes(implementation?.kind),
        `invalid implementation for ${module.specifier}.${exported.name}`);
      if (implementation.kind === "host") {
        hasHost = true;
        invariant(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/.test(implementation.capability ?? ""),
          `invalid host capability for ${module.specifier}.${exported.name}`);
        invariant(!capabilities.has(implementation.capability),
          `duplicate capability ${implementation.capability}`);
        capabilities.add(implementation.capability);
        invariant(implementation.source === undefined && implementation.optionalNative === undefined,
          `host export ${module.specifier}.${exported.name} cannot declare portable source or optional native replacement`);
      } else {
        hasPortable = true;
        invariant(implementation.capability === undefined,
          `portable export ${module.specifier}.${exported.name} cannot declare a host capability`);
        if (implementation.source !== undefined) {
          invariant(/^src\/[a-z][a-z0-9]*(?:\/[a-z][a-z0-9]*)*\.aur$/.test(implementation.source),
            `invalid portable source for ${module.specifier}.${exported.name}`);
        }
        if (implementation.optionalNative !== undefined) {
          invariant(implementation.source !== undefined,
            `optional native export ${module.specifier}.${exported.name} requires a portable source`);
          const capability = implementation.optionalNative.capability;
          invariant(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/.test(capability ?? ""),
            `invalid optional native capability for ${module.specifier}.${exported.name}`);
          invariant(!capabilities.has(capability), `duplicate capability ${capability}`);
          capabilities.add(capability);
        }
        invariant(implementation.source !== undefined || module.source !== undefined,
          `portable export ${module.specifier}.${exported.name} requires a canonical source`);
        const sourcePath = implementation.source ?? module.source;
        invariant(module.source === undefined || implementation.source === undefined
          || module.source === implementation.source,
        `portable export ${module.specifier}.${exported.name} conflicts with its module source`);
        const record = sourceRecords.get(sourcePath) ?? {
          expectedExports: new Map(),
          allowedCapabilities: new Set(),
        };
        invariant(!record.expectedExports.has(exported.name),
          `duplicate fallback ${sourcePath}:${exported.name}`);
        record.expectedExports.set(exported.name, exported);
        for (const candidate of module.exports) {
          if (candidate.implementation?.kind === "host") {
            record.allowedCapabilities.add(candidate.implementation.capability);
          }
        }
        sourceRecords.set(sourcePath, record);
      }
    }
    invariant(module.kind === (hasPortable && hasHost ? "hybrid" : hasHost ? "host-bridge" : "portable"),
      `${module.specifier} kind does not match its implementations`);
  }
  validatePortableSources(sourceRecords);
}

function generateJavaScript(definition) {
  const sources = {};
  for (const module of definition.modules) {
    if (module.source !== undefined && sources[module.source] === undefined) {
      sources[module.source] = readFileSync(resolve(standardLibraryRoot, module.source), "utf8");
    }
    for (const exported of module.exports) {
      const source = exported.implementation?.source;
      if (source !== undefined && sources[source] === undefined) {
        sources[source] = readFileSync(resolve(standardLibraryRoot, source), "utf8");
      }
    }
  }
  return `// Generated by tools/generate-stdlib.js from stdlib/v1.json. Do not edit.\n\n`
    + `export const STANDARD_LIBRARY = Object.freeze(${JSON.stringify(definition, null, 2)});\n\n`
    + `export const STANDARD_LIBRARY_SOURCES = Object.freeze(${JSON.stringify(sources, null, 2)});\n`;
}

function signature(exported) {
  const kind = exported.kind ?? "function";
  const typeParameters = exported.typeParameters?.length > 0
    ? `<${exported.typeParameters.join(", ")}>`
    : "";
  if (kind === "record") {
    return `record ${exported.name}${typeParameters} { ${exported.fields
      .map((field) => `${field.name}: ${field.type}`)
      .join(", ")} }`;
  }
  if (kind === "variant") {
    return `variant ${exported.name}${typeParameters} { ${exported.alternatives
      .map((alternative) => `${alternative.name}(${alternative.fields
        .map((field) => `${field.name}: ${field.type}`).join(", ")})`)
      .join(", ")} }`;
  }
  const parameters = exported.parameters
    .map((parameter) => `${parameter.name}: ${parameter.type}`)
    .join(", ");
  return `${exported.name}(${parameters}): ${exported.returnType}`;
}

function generateDocumentation(definition, language) {
  const english = language === "en";
  const title = english ? "# AUREON Standard Library v1" : "# Biblioteca Padrão AUREON v1";
  const alternate = english
    ? "[Portuguese version](../PT/STDLIB.md)"
    : "[Versão em inglês](../EN/STDLIB.md)";
  const warning = english
    ? "This file is generated from [`stdlib/v1.json`](../../../stdlib/v1.json). Do not edit it manually."
    : "Este arquivo é gerado a partir de [`stdlib/v1.json`](../../../stdlib/v1.json). Não o edite manualmente.";
  const status = english
    ? "This document specifies the standard-library catalog and portable-source contract implemented through P8.3. The compiler resolves these embedded modules without project-filesystem lookup and statically links only used exports."
    : "Este documento especifica o catálogo da biblioteca padrão e o contrato de código-fonte portátil implementados até o P8.3. O compilador resolve esses módulos embutidos sem consultar o sistema de arquivos do projeto e vincula estaticamente apenas os exports usados.";
  const principles = english
    ? [
      "Standard modules are resolved by the compiler from a selected toolchain catalog; they are never searched in the project filesystem.",
      "Portable exports are ordinary AUREON functions statically linked into the output module.",
      "Host-backed exports lower through typed Host ABI imports and generic `HOST_CALL`; the VM contains no console, math, JSON, network, or standard-library opcode.",
      "Importing a standard module includes only the transitively used exports and their dependencies.",
      "A compiled `.abc` does not require the standard-library source package at runtime.",
      "Portable implementations are the default; optional native replacements are a link-time optimization selected only for an explicitly compatible target.",
    ]
    : [
      "Módulos padrão são resolvidos pelo compilador a partir de um catálogo selecionado do conjunto de ferramentas; eles nunca são pesquisados no sistema de arquivos do projeto.",
      "Exports portáteis são funções AUREON comuns vinculadas estaticamente ao módulo de saída.",
      "Exports apoiados pelo host são reduzidos a imports tipados da Host ABI e `HOST_CALL` genérico; a VM não contém opcode de console, matemática, JSON, rede ou biblioteca padrão.",
      "Importar um módulo padrão inclui somente os exports usados transitivamente e suas dependências.",
      "Um `.abc` compilado não exige o pacote de fontes da biblioteca padrão em runtime.",
      "Implementações portáteis são o padrão; substituições nativas opcionais são uma otimização de vinculação selecionada somente para um destino explicitamente compatível.",
    ];
  const moduleKinds = english
    ? { portable: "Portable AUREON", "host-bridge": "Host ABI bridge", hybrid: "Hybrid" }
    : { portable: "AUREON portátil", "host-bridge": "Ponte da Host ABI", hybrid: "Híbrido" };
  const implementation = (exported) => {
    if ((exported.kind ?? "function") === "record"
      || (exported.kind ?? "function") === "variant") {
      return english ? "Nominal portable type" : "Tipo nominal portátil";
    }
    if (exported.implementation.kind === "host") {
      return `Host ABI: \`${exported.implementation.capability}\``;
    }
    if (exported.implementation.source === undefined) {
      return english ? "Portable AUREON" : "AUREON portátil";
    }
    const source = `[\`${exported.implementation.source}\`](../../../stdlib/${exported.implementation.source})`;
    return `${english ? "Portable AUREON" : "AUREON portátil"}: ${source}`;
  };
  const optionalNative = (exported) => exported.implementation?.optionalNative
    ? `\`${exported.implementation.optionalNative.capability}\``
    : "—";
  const tableHeader = english
    ? "| Module | Kind | Export signature | Default implementation | Optional native capability | Contract |\n| --- | --- | --- | --- | --- | --- |"
    : "| Módulo | Tipo | Assinatura do export | Implementação padrão | Capacidade nativa opcional | Contrato |\n| --- | --- | --- | --- | --- | --- |";
  const rows = definition.modules.flatMap((module) => module.exports.map((exported) =>
    `| \`${module.specifier}\` | ${moduleKinds[module.kind]} | \`${signature(exported)}\` | ${implementation(exported)} | ${optionalNative(exported)} | ${exported.description[language]} |`)).join("\n");
  const sections = english
    ? {
      status: "## Status", principles: "## Architecture", catalog: "## Current catalog",
      resolution: "## Resolution and versioning", behavior: "## Linking and behavior",
      fallbacks: "## Portable fallback selection", equivalence: "## Native equivalence requirements",
      security: "## Security and capability policy", exclusions: "## Deliberate exclusions",
      acceptanceP42: "## P4.2 design acceptance", acceptanceP43: "## P4.3 design acceptance",
    }
    : {
      status: "## Status", principles: "## Arquitetura", catalog: "## Catálogo atual",
      resolution: "## Resolução e versionamento", behavior: "## Vinculação e comportamento",
      fallbacks: "## Seleção de implementações alternativas portáteis",
      equivalence: "## Requisitos de equivalência nativa",
      security: "## Segurança e política de capacidades", exclusions: "## Exclusões intencionais",
      acceptanceP42: "## Aceitação do projeto P4.2", acceptanceP43: "## Aceitação do projeto P4.3",
    };
  const resolution = english
    ? "The `std:` namespace is reserved by the source-module contract. Specifiers have no inline version. A compiler selects exactly one standard-library major profile through its toolchain or lock configuration and records that choice in reproducible build metadata. Unknown modules and exports are compile errors. Project files cannot shadow `std:` modules. Catalog major versions may remove or incompatibly change exports; compatible additions remain in the same major profile."
    : "O namespace `std:` é reservado pelo contrato de módulos-fonte. Os especificadores não possuem versão embutida. Um compilador seleciona exatamente um perfil principal da biblioteca padrão por meio do conjunto de ferramentas ou da configuração de versões e registra essa escolha nos metadados de compilação reproduzível. Módulos e exports desconhecidos são erros de compilação. Arquivos do projeto não podem sobrescrever módulos `std:`. Versões principais do catálogo podem remover ou alterar exports de forma incompatível; adições compatíveis permanecem no mesmo perfil principal.";
  const behavior = english
    ? "Standard-library calls obey the same exact parameter and return typing as project-module calls. Portable implementations use existing language semantics and sandbox budgets. Host bridges declare their capability and signature as catalog data, so compiler lowering does not identify APIs by hardcoded function names. The linker deduplicates one implementation per selected export identity and emits ordinary functions, constants, typed host imports, and generic instructions."
    : "Chamadas da biblioteca padrão seguem a mesma tipagem exata de parâmetros e retorno das chamadas entre módulos do projeto. Implementações portáteis usam a semântica existente da linguagem e os limites do sandbox. Pontes do host declaram sua capacidade e assinatura como dados do catálogo, portanto a redução do compilador não identifica APIs por nomes de funções codificados diretamente. O vinculador elimina duplicações por identidade de export selecionado e emite funções, constantes, imports tipados do host e instruções genéricas comuns.";
  const fallbacks = english
    ? [
      "The linker selects the portable source by default and emits ordinary AUREON functions and `CALL` instructions.",
      "A native replacement may be selected only when an explicit target profile guarantees the catalog capability with the exact declared signature and semantics.",
      "Selection occurs before `.abc` emission. Exactly one implementation of each export is linked; unused alternatives and host imports are omitted.",
      "The runtime does not probe for an optional import, retry a failed host call, or switch implementations during execution.",
      "If a native-targeted `.abc` reaches a host without the promised capability, normal Host ABI resolution rejects the module before execution. It does not fall back dynamically.",
      "Build metadata must record the selected target profile. The default portable target remains independent of optional native capabilities.",
    ]
    : [
      "O vinculador seleciona o código-fonte portátil por padrão e emite funções AUREON comuns e instruções `CALL`.",
      "Uma substituição nativa pode ser selecionada somente quando um perfil de destino explícito garante a capacidade do catálogo com a assinatura e a semântica exatas declaradas.",
      "A seleção ocorre antes da emissão do `.abc`. Exatamente uma implementação de cada export é vinculada; alternativas e imports do host não utilizados são omitidos.",
      "O runtime não procura um import opcional, não repete uma chamada ao host que falhou e não troca implementações durante a execução.",
      "Se um `.abc` direcionado a uma implementação nativa chegar a um host sem a capacidade prometida, a resolução normal da Host ABI rejeita o módulo antes da execução. Não ocorre substituição dinâmica.",
      "Os metadados de compilação devem registrar o perfil de destino selecionado. O destino portátil padrão permanece independente de capacidades nativas opcionais.",
    ];
  const equivalence = english
    ? "A native replacement must preserve the public signature, returned value, checked-I64 overflow behavior, deterministic error boundary, and absence of observable side effects of its portable source. It may use fewer execution steps, but it remains subject to Host ABI authorization and runtime policy. Native replacement is forbidden for an export whose behavior cannot be made observably equivalent, including inherently external effects such as console output. The standard-library major catalog pins this semantic contract."
    : "Uma substituição nativa deve preservar a assinatura pública, o valor retornado, o comportamento de overflow verificado de I64, o limite determinístico de erros e a ausência de efeitos colaterais observáveis do seu código-fonte portátil. Ela pode usar menos passos de execução, mas continua sujeita à autorização da Host ABI e à política do runtime. A substituição nativa é proibida para um export cujo comportamento não possa ser observavelmente equivalente, incluindo efeitos inerentemente externos, como saída no console. O catálogo principal da biblioteca padrão fixa esse contrato semântico.";
  const security = english
    ? "Importing a host-backed export does not grant authority. The resulting Host ABI import must still be available, signature-compatible, and allowed by runtime policy before execution. Portable functions receive no ambient authority. Unused host bridges must not appear in the linked `.abc`. The complete trust and effect boundary is defined by the [sandbox and security model](SECURITY.md)."
    : "Importar um export apoiado pelo host não concede autoridade. O import resultante da Host ABI ainda deve estar disponível, possuir assinatura compatível e ser permitido pela política do runtime antes da execução. Funções portáteis não recebem autoridade implícita. Pontes do host não utilizadas não devem aparecer no `.abc` vinculado. A fronteira completa de confiança e efeitos é definida pelo [modelo de sandbox e segurança](SECURITY.md).";
  const exclusions = english
    ? "Files, networking, time, randomness, and asynchronous I/O are not exposed by the current catalog. Their future contracts require explicit capability, binary-value, cancellation, and deterministic-limit semantics described in [IO_CAPABILITIES.md](IO_CAPABILITIES.md). They must not be simulated through new VM opcodes."
    : "Arquivos, rede, tempo, aleatoriedade e I/O assíncrono não são expostos pelo catálogo atual. Seus contratos futuros exigem semânticas explícitas de capacidades, valores binários, cancelamento e limites determinísticos descritas em [IO_CAPABILITIES.md](IO_CAPABILITIES.md). Eles não devem ser simulados por novos opcodes da VM.";
  const acceptanceP42 = english
    ? "The catalog remains the single reviewed source for the public standard-module surface, its generated EN/PT references are current, and the VM-independent lowering boundary is explicit. P7.5 adds portable result, text, and I64 collection modules. P7.6 adds the typed `std:json` wrapper and its data-defined pure Host ABI support bridge."
    : "O catálogo permanece como a única fonte revisada da superfície pública dos módulos padrão, suas referências geradas EN/PT estão atualizadas e a fronteira de redução independente da VM está explícita. O P7.5 adiciona módulos portáteis de resultados, texto e coleções de I64. O P7.6 adiciona o wrapper tipado `std:json` e sua ponte pura de suporte definida por dados na Host ABI.";
  const acceptanceP43 = english
    ? "Every portable function export has catalog-linked canonical source whose syntax, semantics, allowed host imports, dependencies, and exact public signature pass generation checks. Nominal record and variant exports are validated from the same source contract. The compiler and linker consume that data without optional-import flags, runtime probes, or standard-library opcodes."
    : "Todo export de função portátil possui código-fonte canônico associado pelo catálogo cuja sintaxe, semântica, imports permitidos do host, dependências e assinatura pública exata passam pelas verificações de geração. Exports nominais de records e variants são validados pelo mesmo contrato de código-fonte. O compilador e o vinculador consomem esses dados sem flags de import opcional, sondagens em runtime ou opcodes de biblioteca padrão.";
  const moduleDescriptions = definition.modules.map((module) =>
    `- \`${module.specifier}\`: ${module.description[language]}`).join("\n");
  return `${title}\n\n${alternate}\n\n> ${warning}\n\n${sections.status}\n\n${status}\n\n${sections.principles}\n\n${principles.map((principle) => `- ${principle}`).join("\n")}\n\n${sections.catalog}\n\n${moduleDescriptions}\n\n${tableHeader}\n${rows}\n\n${sections.resolution}\n\n${resolution}\n\n${sections.behavior}\n\n${behavior}\n\n${sections.fallbacks}\n\n${fallbacks.map((rule) => `- ${rule}`).join("\n")}\n\n${sections.equivalence}\n\n${equivalence}\n\n${sections.security}\n\n${security}\n\n${sections.exclusions}\n\n${exclusions}\n\n${sections.acceptanceP42}\n\n${acceptanceP42}\n\n${sections.acceptanceP43}\n\n${acceptanceP43}\n`;
}

const definition = JSON.parse(readFileSync(definitionPath, "utf8"));
validateDefinition(definition);

const outputs = new Map([
  [resolve(repositoryRoot, "compiler/src/generated/stdlib.js"), generateJavaScript(definition)],
  [resolve(repositoryRoot, "docs/specs/EN/STDLIB.md"), generateDocumentation(definition, "en")],
  [resolve(repositoryRoot, "docs/specs/PT/STDLIB.md"), generateDocumentation(definition, "pt")],
]);

const staleFiles = [];
for (const [outputPath, content] of outputs) {
  if (checkOnly) {
    if (!existsSync(outputPath) || readFileSync(outputPath, "utf8") !== content) {
      staleFiles.push(relative(repositoryRoot, outputPath));
    }
    continue;
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content);
}

if (staleFiles.length > 0) {
  throw new Error(`Generated standard library files are stale:\n${staleFiles.join("\n")}\nRun npm run generate:stdlib.`);
}

process.stdout.write(checkOnly
  ? "Generated standard library files are up to date.\n"
  : "Generated standard library files updated.\n");
