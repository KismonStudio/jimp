# Biblioteca Padrão JIMP v1

[Versão em inglês](../EN/STDLIB.md)

> Este arquivo é gerado a partir de [`stdlib/v1.json`](../../../stdlib/v1.json). Não o edite manualmente.

## Status

Este documento especifica o catálogo da biblioteca padrão e o contrato de código-fonte portátil implementados até o P7.6. O compilador resolve esses módulos embutidos sem consultar o sistema de arquivos do projeto e vincula estaticamente apenas os exports usados.

## Arquitetura

- Módulos padrão são resolvidos pelo compilador a partir de um catálogo selecionado do conjunto de ferramentas; eles nunca são pesquisados no sistema de arquivos do projeto.
- Exports portáteis são funções JIMP comuns vinculadas estaticamente ao módulo de saída.
- Exports apoiados pelo host são reduzidos a imports tipados da Host ABI e `HOST_CALL` genérico; a VM não contém opcode de console, matemática, JSON, rede ou biblioteca padrão.
- Importar um módulo padrão inclui somente os exports usados transitivamente e suas dependências.
- Um `.jbc` compilado não exige o pacote de fontes da biblioteca padrão em runtime.
- Implementações portáteis são o padrão; substituições nativas opcionais são uma otimização de vinculação selecionada somente para um destino explicitamente compatível.

## Catálogo atual

- `std:console`: Saída explícita no console por uma ponte tipada da Host ABI e funções auxiliares portáteis.
- `std:math/i64`: Funções determinísticas para inteiros de 64 bits com sinal implementadas em JIMP portátil.
- `std:result`: Valores nominais e explícitos de resultado para operações recuperáveis que produzem strings.
- `std:text`: Comprimento, concatenação, acesso indexado e recorte portáteis por valores escalares Unicode.
- `std:collections/i64`: Operações portáteis de busca e substituição recuperável para arrays imutáveis de I64.
- `std:json/support`: Primitivas escalares totais da Host ABI usadas pelo wrapper tipado de std:json.
- `std:json`: Análise recuperável tipada de JSON e serialização determinística de documentos validados.

| Módulo | Tipo | Assinatura do export | Implementação padrão | Capacidade nativa opcional | Contrato |
| --- | --- | --- | --- | --- | --- |
| `std:console` | Híbrido | `write(message: STRING): VOID` | Host ABI: `std.console.write` | — | Escreve a mensagem exatamente e não acrescenta uma quebra de linha. |
| `std:console` | Híbrido | `writeLine(message: STRING): VOID` | JIMP portátil: [`src/console.jimp`](../../../stdlib/src/console.jimp) | — | Escreve a mensagem seguida por um caractere de quebra de linha por meio de write. |
| `std:math/i64` | JIMP portátil | `absolute(value: I64): I64` | JIMP portátil: [`src/math/i64.jimp`](../../../stdlib/src/math/i64.jimp) | `std.math.i64.absolute` | Retorna a magnitude não negativa; o menor valor I64 segue o comportamento de overflow da negação verificada. |
| `std:math/i64` | JIMP portátil | `minimum(left: I64, right: I64): I64` | JIMP portátil: [`src/math/i64.jimp`](../../../stdlib/src/math/i64.jimp) | `std.math.i64.minimum` | Retorna left quando left é menor ou igual a right; caso contrário, retorna right. |
| `std:math/i64` | JIMP portátil | `maximum(left: I64, right: I64): I64` | JIMP portátil: [`src/math/i64.jimp`](../../../stdlib/src/math/i64.jimp) | `std.math.i64.maximum` | Retorna left quando left é maior ou igual a right; caso contrário, retorna right. |
| `std:math/i64` | JIMP portátil | `sign(value: I64): I64` | JIMP portátil: [`src/math/i64.jimp`](../../../stdlib/src/math/i64.jimp) | `std.math.i64.sign` | Retorna -1 para valores negativos, 0 para zero e 1 para valores positivos. |
| `std:result` | JIMP portátil | `record StringResult { ok: BOOL, value: STRING, error: STRING }` | Tipo nominal portátil | — | Transporta um indicador explícito de sucesso, uma string e uma mensagem determinística de erro. |
| `std:result` | JIMP portátil | `stringSuccess(value: STRING): StringResult` | JIMP portátil: [`src/result.jimp`](../../../stdlib/src/result.jimp) | — | Cria um StringResult bem-sucedido. |
| `std:result` | JIMP portátil | `stringFailure(error: STRING): StringResult` | JIMP portátil: [`src/result.jimp`](../../../stdlib/src/result.jimp) | — | Cria um StringResult com falha e valor alternativo vazio. |
| `std:text` | JIMP portátil | `length(value: STRING): I64` | JIMP portátil: [`src/text.jimp`](../../../stdlib/src/text.jimp) | — | Retorna a quantidade de valores escalares Unicode. |
| `std:text` | JIMP portátil | `concat(left: STRING, right: STRING): STRING` | JIMP portátil: [`src/text.jimp`](../../../stdlib/src/text.jimp) | — | Concatena duas strings. |
| `std:text` | JIMP portátil | `at(value: STRING, index: I64): StringResult` | JIMP portátil: [`src/text.jimp`](../../../stdlib/src/text.jimp) | — | Retorna um valor escalar Unicode ou um erro explícito de limite. |
| `std:text` | JIMP portátil | `slice(value: STRING, start: I64, end: I64): StringResult` | JIMP portátil: [`src/text.jimp`](../../../stdlib/src/text.jimp) | — | Retorna um intervalo semiaberto de valores Unicode ou um erro explícito de limite. |
| `std:collections/i64` | JIMP portátil | `record I64ArrayResult { ok: BOOL, value: [I64], error: STRING }` | Tipo nominal portátil | — | Transporta um array imutável de I64 ou um erro recuperável. |
| `std:collections/i64` | JIMP portátil | `contains(values: [I64], expected: I64): BOOL` | JIMP portátil: [`src/collections/i64.jimp`](../../../stdlib/src/collections/i64.jimp) | — | Informa se o array contém o valor esperado. |
| `std:collections/i64` | JIMP portátil | `indexOf(values: [I64], expected: I64): I64` | JIMP portátil: [`src/collections/i64.jimp`](../../../stdlib/src/collections/i64.jimp) | — | Retorna o primeiro índice ou -1 quando ausente. |
| `std:collections/i64` | JIMP portátil | `replace(values: [I64], index: I64, replacement: I64): I64ArrayResult` | JIMP portátil: [`src/collections/i64.jimp`](../../../stdlib/src/collections/i64.jimp) | — | Retorna um array atualizado ou um erro explícito de limite, preservando a entrada. |
| `std:json/support` | Ponte da Host ABI | `validate(source: STRING): BOOL` | Host ABI: `std.json.validate` | — | Informa se a entrada é válida e respeita os limites de recursos de JSON. |
| `std:json/support` | Ponte da Host ABI | `canonicalize(source: STRING): STRING` | Host ABI: `std.json.canonicalize` | — | Retorna JSON compacto e determinístico, ou uma string vazia para entrada inválida. |
| `std:json/support` | Ponte da Host ABI | `diagnostic(source: STRING): STRING` | Host ABI: `std.json.diagnostic` | — | Retorna um diagnóstico determinístico, ou uma string vazia quando a entrada é válida. |
| `std:json` | JIMP portátil | `record JsonDocument { text: STRING }` | Tipo nominal portátil | — | Um documento JSON representado por texto UTF-8 compacto e determinístico. |
| `std:json` | JIMP portátil | `record JsonResult { ok: BOOL, value: JsonDocument, error: STRING }` | Tipo nominal portátil | — | Transporta um documento validado ou um erro de análise determinístico e recuperável. |
| `std:json` | JIMP portátil | `parse(source: STRING): JsonResult` | JIMP portátil: [`src/json.jimp`](../../../stdlib/src/json.jimp) | — | Valida e canonicaliza JSON sem lançar uma exceção no nível da linguagem. |
| `std:json` | JIMP portátil | `stringify(document: JsonDocument): StringResult` | JIMP portátil: [`src/json.jimp`](../../../stdlib/src/json.jimp) | — | Serializa um documento ou informa um erro explícito de validação. |

## Resolução e versionamento

O namespace `std:` é reservado pelo contrato de módulos-fonte. Os especificadores não possuem versão embutida. Um compilador seleciona exatamente um perfil principal da biblioteca padrão por meio do conjunto de ferramentas ou da configuração de versões e registra essa escolha nos metadados de compilação reproduzível. Módulos e exports desconhecidos são erros de compilação. Arquivos do projeto não podem sobrescrever módulos `std:`. Versões principais do catálogo podem remover ou alterar exports de forma incompatível; adições compatíveis permanecem no mesmo perfil principal.

## Vinculação e comportamento

Chamadas da biblioteca padrão seguem a mesma tipagem exata de parâmetros e retorno das chamadas entre módulos do projeto. Implementações portáteis usam a semântica existente da linguagem e os limites do sandbox. Pontes do host declaram sua capacidade e assinatura como dados do catálogo, portanto a redução do compilador não identifica APIs por nomes de funções codificados diretamente. O vinculador elimina duplicações por identidade de export selecionado e emite funções, constantes, imports tipados do host e instruções genéricas comuns.

## Seleção de implementações alternativas portáteis

- O vinculador seleciona o código-fonte portátil por padrão e emite funções JIMP comuns e instruções `CALL`.
- Uma substituição nativa pode ser selecionada somente quando um perfil de destino explícito garante a capacidade do catálogo com a assinatura e a semântica exatas declaradas.
- A seleção ocorre antes da emissão do `.jbc`. Exatamente uma implementação de cada export é vinculada; alternativas e imports do host não utilizados são omitidos.
- O runtime não procura um import opcional, não repete uma chamada ao host que falhou e não troca implementações durante a execução.
- Se um `.jbc` direcionado a uma implementação nativa chegar a um host sem a capacidade prometida, a resolução normal da Host ABI rejeita o módulo antes da execução. Não ocorre substituição dinâmica.
- Os metadados de compilação devem registrar o perfil de destino selecionado. O destino portátil padrão permanece independente de capacidades nativas opcionais.

## Requisitos de equivalência nativa

Uma substituição nativa deve preservar a assinatura pública, o valor retornado, o comportamento de overflow verificado de I64, o limite determinístico de erros e a ausência de efeitos colaterais observáveis do seu código-fonte portátil. Ela pode usar menos passos de execução, mas continua sujeita à autorização da Host ABI e à política do runtime. A substituição nativa é proibida para um export cujo comportamento não possa ser observavelmente equivalente, incluindo efeitos inerentemente externos, como saída no console. O catálogo principal da biblioteca padrão fixa esse contrato semântico.

## Segurança e política de capacidades

Importar um export apoiado pelo host não concede autoridade. O import resultante da Host ABI ainda deve estar disponível, possuir assinatura compatível e ser permitido pela política do runtime antes da execução. Funções portáteis não recebem autoridade implícita. Pontes do host não utilizadas não devem aparecer no `.jbc` vinculado. A fronteira completa de confiança e efeitos é definida pelo [modelo de sandbox e segurança](SECURITY.md).

## Exclusões intencionais

Arquivos, rede, tempo, aleatoriedade e I/O assíncrono não são expostos pelo catálogo atual. Seus contratos futuros exigem semânticas explícitas de capacidades, valores binários, cancelamento e limites determinísticos descritas em [IO_CAPABILITIES.md](IO_CAPABILITIES.md). Eles não devem ser simulados por novos opcodes da VM.

## Aceitação do projeto P4.2

O catálogo permanece como a única fonte revisada da superfície pública dos módulos padrão, suas referências geradas EN/PT estão atualizadas e a fronteira de redução independente da VM está explícita. O P7.5 adiciona módulos portáteis de resultados, texto e coleções de I64. O P7.6 adiciona o wrapper tipado `std:json` e sua ponte pura de suporte definida por dados na Host ABI.

## Aceitação do projeto P4.3

Todo export de função portátil possui código-fonte canônico associado pelo catálogo cuja sintaxe, semântica, imports permitidos do host, dependências e assinatura pública exata passam pelas verificações de geração. Exports de records nominais são validados pelo mesmo contrato de código-fonte. O compilador e o vinculador consomem esses dados sem flags de import opcional, sondagens em runtime ou opcodes de biblioteca padrão.
