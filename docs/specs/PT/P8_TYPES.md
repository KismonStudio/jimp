# Roadmap P8 de Sistema de Tipos e Dados Binários

[Versão em inglês](../EN/P8_TYPES.md)

## Status

P8.1 até P8.4 estão implementados. O contrato normativo de fonte e representação está definido em [VARIANTS_AND_GENERICS.md](VARIANTS_AND_GENERICS.md). P8.5 até P8.7 continuam planejados e indisponíveis.

A implementação preserva semântica de valores imutáveis, tipagem estática exata, contabilização determinística de recursos, identidade nominal entre módulos e uma VM cujas instruções não dependem de nomes públicos da linguagem ou da biblioteca.

## P8.1 — Variantes etiquetadas — concluído

Declarações nominais `variant` aceitam alternativas ordenadas com payloads tipados, construção por `Type::Alternative(...)`, igualdade exata, aninhamento, funções e exports de módulos. Variantes são reduzidas à representação existente da heap imutável como uma etiqueta inteira seguida por slots de payload.

## P8.2 — Correspondência exaustiva de padrões — concluído

`match(value) { Alternative(bindings) => expression, ... }` é estaticamente exaustivo. O compilador rejeita braços ausentes, duplicados, desconhecidos, com bindings incorretos ou tipos de resultado incompatíveis. Bindings são imutáveis e restritos ao braço; `_` descarta um campo do payload. A redução usa `HEAP_LOAD`, igualdade e saltos genéricos.

Padrões aninhados, guards e alternativas catch-all foram intencionalmente adiados. Atualmente, cada expressão match ocupa uma única linha lógica do código-fonte.

## P8.3 — Tipos e funções paramétricos — concluído

Records, variants e funções aceitam parâmetros de tipo. Argumentos de tipo são inferidos a partir dos tipos exatos dos argumentos ou do resultado esperado. Parâmetros não resolvidos causam erro de compilação. Uma função genérica é emitida uma única vez e usa boxing uniforme e verificado na heap nas fronteiras de variáveis de tipo, evitando crescimento por monomorfização, casts em runtime e reflexão.

O catálogo padrão exporta `Option<T>` por `std:option` e `Result<T, E>` por `std:result`. Os records de resultado do P7 continuam suportados. Acesso indexado e atualização funcional indexada sobre um tipo de elemento genérico isolado ainda não são suportados.

## P8.4 — Valores recursivos imutáveis e limitados — concluído

Variants podem referenciar recursivamente seu próprio tipo nominal instanciado, permitindo estruturas finitas como `List<T>`. Os valores permanecem acíclicos porque o bytecode somente aloca objetos imutáveis a partir de valores já verificados e não pode alterar slots da heap nem falsificar referências. Os limites existentes de alocação, slots, bytes, profundidade, visitas de igualdade, frames de chamada e passos de execução limitam construção e travessia.

A complexidade do código-fonte também é limitada por valores gerados para parâmetros de tipo, aninhamento de tipos, campos nominais, alternativas de variant e braços de match.

## P8.5 — `BYTES` imutável — planejado

Especificar e implementar uma sequência imutável e contabilizada de octetos, distinta de `STRING` e `[I64]`, incluindo comprimento, indexação, recorte, concatenação, igualdade, conversão UTF-8, contratos de módulos e saída do inspetor.

## P8.6 — `JsonValue` estruturado — planejado

Evoluir `std:json` da fronteira `JsonDocument` baseada em texto do P7 para um valor JSON recursivo e tipado, preservando o comportamento de chaves duplicadas, ordenação, Unicode, canonicalização, lexemas numéricos, diagnósticos e limites de recursos.

## P8.7 — Compatibilidade e conformidade — planejado

Concluir a cobertura multiplataforma de conformidade, bytecode malformado, limites de recursos, instalação do pacote, compatibilidade e migração para toda a superfície do P8.

## Restrições de entrega

P8.5, P8.6 e P8.7 permanecem indisponíveis até sua implementação. Nenhuma mudança de versão do bytecode foi necessária para P8.1–P8.4, pois a redução do compilador usa as instruções existentes e verificadas de heap imutável e fluxo de controle no `.jbc` 2.9.

O P8 não adiciona execução assíncrona, autoridade de arquivos ou rede, pacotes, reflexão em runtime, exceções, nulabilidade implícita nem instruções de VM específicas de domínio.
