# Biblioteca Padrão JIMP v1

[Versão em inglês](../EN/STDLIB.md)

> Este arquivo é gerado a partir de [`stdlib/v1.json`](../../../stdlib/v1.json). Não o edite manualmente.

## Status

Este documento especifica o catálogo aprovado no P4.2 e o contrato de implementações alternativas portáteis do P4.3. Os módulos ainda não são distribuídos pelo compilador nem pelo vinculador.

## Arquitetura

- Módulos padrão são resolvidos pelo compilador a partir de um catálogo selecionado do conjunto de ferramentas; eles nunca são pesquisados no sistema de arquivos do projeto.
- Exports portáteis são funções JIMP comuns vinculadas estaticamente ao módulo de saída.
- Exports apoiados pelo host são reduzidos a imports tipados da Host ABI e `HOST_CALL` genérico; a VM não contém opcode de console, matemática, JSON, rede ou biblioteca padrão.
- Importar um módulo padrão inclui somente os exports usados transitivamente e suas dependências.
- Um `.jbc` compilado não exige o pacote de fontes da biblioteca padrão em runtime.
- Implementações portáteis são o padrão; substituições nativas opcionais são uma otimização de vinculação selecionada somente para um destino explicitamente compatível.

## Catálogo inicial

- `std:console`: Saída explícita no console por uma ponte tipada da Host ABI e funções auxiliares portáteis.
- `std:math/i64`: Funções determinísticas para inteiros de 64 bits com sinal implementadas em JIMP portátil.

| Módulo | Tipo | Assinatura do export | Implementação padrão | Capacidade nativa opcional | Contrato |
| --- | --- | --- | --- | --- | --- |
| `std:console` | Híbrido | `write(message: STRING): VOID` | Host ABI: `std.console.write` | — | Escreve a mensagem exatamente e não acrescenta uma quebra de linha. |
| `std:console` | Híbrido | `writeLine(message: STRING): VOID` | JIMP portátil | — | Escreve a mensagem seguida por um caractere de quebra de linha por meio de write. |
| `std:math/i64` | JIMP portátil | `absolute(value: I64): I64` | JIMP portátil: [`src/math/i64.jimp`](../../../stdlib/src/math/i64.jimp) | `std.math.i64.absolute` | Retorna a magnitude não negativa; o menor valor I64 segue o comportamento de overflow da negação verificada. |
| `std:math/i64` | JIMP portátil | `minimum(left: I64, right: I64): I64` | JIMP portátil: [`src/math/i64.jimp`](../../../stdlib/src/math/i64.jimp) | `std.math.i64.minimum` | Retorna left quando left é menor ou igual a right; caso contrário, retorna right. |
| `std:math/i64` | JIMP portátil | `maximum(left: I64, right: I64): I64` | JIMP portátil: [`src/math/i64.jimp`](../../../stdlib/src/math/i64.jimp) | `std.math.i64.maximum` | Retorna left quando left é maior ou igual a right; caso contrário, retorna right. |
| `std:math/i64` | JIMP portátil | `sign(value: I64): I64` | JIMP portátil: [`src/math/i64.jimp`](../../../stdlib/src/math/i64.jimp) | `std.math.i64.sign` | Retorna -1 para valores negativos, 0 para zero e 1 para valores positivos. |

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

APIs de JSON, fetch/rede, arquivos, tempo, aleatoriedade, coleções e processamento de texto não fazem parte do primeiro catálogo. Seus contratos exigem valores estruturados ou binários, modelos explícitos de capacidades, limites determinísticos ou comportamento assíncrono que a linguagem atual ainda não define. Elas não devem ser simuladas por novos opcodes da VM.

## Aceitação do projeto P4.2

O P4.2 está concluído porque este catálogo é a única fonte revisada da superfície pública inicial dos módulos, suas referências geradas EN/PT estão atualizadas e a fronteira de redução independente da VM está explícita. A distribuição das implementações e o suporte do vinculador permanecem como trabalho de implementação.

## Aceitação do projeto P4.3

O P4.3 está concluído quando toda capacidade nativa opcional possui um código-fonte portátil associado pelo catálogo cuja sintaxe, semântica, ausência de imports do host e assinatura pública exata passam pelas verificações de geração; as regras de seleção padrão e nativa acima são normativas; e nenhuma flag de import opcional, procura em runtime ou opcode de biblioteca padrão é adicionada ao formato portátil. O consumo deste contrato pelo compilador e vinculador permanece como trabalho de implementação posterior.
