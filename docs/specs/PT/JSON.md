# Módulo Padrão JSON AUREON v1

[Versão em inglês](../EN/JSON.md)

## Status e API

O P7.6 implementa `std:json` sem palavra-chave JSON, intrínseco de fonte, tipo de bytecode ou opcode JSON.

- `parse(source: STRING): JsonResult` valida e canonicaliza a entrada.
- `stringify(document: JsonDocument): StringResult` valida e serializa um documento.
- `JsonDocument { text: STRING }` armazena JSON UTF-8 compacto e canônico.
- `JsonResult { ok: BOOL, value: JsonDocument, error: STRING }` expõe falhas como dados.

Na falha de análise, `ok` é falso, `value.text` contém o valor alternativo seguro `null` e `error` é determinístico. Nenhuma exceção da linguagem é lançada.

## Dados e canonicalização

O parser aceita a gramática JSON de nulo, booleano, número, string, array e objeto. Não existe conversão implícita para escalares AUREON: números JSON permanecem lexemas numéricos exatos e validados dentro de `JsonDocument`, evitando overflow de I64 e perda de precisão de F64.

A saída canônica remove espaços insignificantes, preserva lexemas numéricos e a ordem dos membros, usa uma vírgula ou dois-pontos quando exigido e escapa deterministicamente aspas, barra invertida e caracteres de controle. Escapes Unicode válidos são convertidos em valores escalares; pares substitutos são combinados e substitutos isolados são rejeitados.

Chaves duplicadas são rejeitadas após a decodificação dos escapes. A ordem dos arrays é preservada. Chaves de objetos não são ordenadas porque a ordem de origem é observável nesta representação v1.

## Limites de recursos

A implementação de referência rejeita entradas acima de `MAX_JSON_INPUT_BYTES`, saídas acima de `MAX_JSON_OUTPUT_BYTES`, aninhamento além de `MAX_JSON_DEPTH` e documentos acima de `MAX_JSON_VALUES`. Falhas de limite são retornadas por `JsonResult` ou `StringResult` e não executam efeito externo no host.

## Ponte do host e portabilidade

O wrapper público é AUREON portátil comum. Seu módulo escalar de suporte declara as capacidades puras e totais `std.json.validate`, `std.json.canonicalize` e `std.json.diagnostic` como dados do catálogo; chamadas usam `HOST_CALL` genérico. Entrada inválida não causa falha nessas chamadas: elas retornam falso, valor vazio alternativo ou diagnóstico.

Uma árvore JSON completa ainda não pode ser implementada como fonte portátil canônica porque AUREON v1 não possui tipos soma recursivos, variantes paramétricas nem primitivas de conversão entre números e texto. A limitação é explícita, não escondida em opcodes de domínio. Hosts conformes que fornecem `std:json` devem implementar exatamente a semântica e os limites acima; um host pode rejeitar o módulo na resolução quando o suporte não estiver disponível.
