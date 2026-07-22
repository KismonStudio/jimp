# Roadmap P8 de Sistema de Tipos e Dados Binários

[Versão em inglês](../EN/P8_TYPES.md)

## Status

Este documento é o roadmap de implementação aprovado para o P8. Ele não é um contrato de linguagem já implementado. Sintaxe, codificações de bytecode e APIs públicas permanecem indisponíveis até que suas tarefas individuais orientadas por especificação sejam concluídas e passem pelo gate completo de qualidade.

O P8 fornece os pré-requisitos de sistema de tipos e modelo de valores para JSON estruturado, dados binários e I/O assíncrono posterior. Ele deve preservar semântica de valores imutáveis, tipagem estática exata, contabilização determinística de recursos, verificação independente em JavaScript/Rust e a regra de que nomes de APIs da biblioteca padrão nunca se tornam instruções da VM.

## P8.1 — Variantes etiquetadas

Especificar e implementar variantes nominais etiquetadas capazes de transportar payloads de tipos diferentes. O projeto deve definir sintaxe de declaração e construção, visibilidade entre módulos, identidade nominal, igualdade, aninhamento, contratos de funções, junções de fluxo de controle e representação no bytecode portátil.

A aceitação exige construção e transporte válidos entre módulos, rejeição determinística de alternativas desconhecidas ou duplicadas, tipos exatos de payload, redução verificada independentemente e nenhuma identidade de armazenamento ou ponteiro nativo exposto.

## P8.2 — Correspondência exaustiva de padrões

Especificar e implementar correspondência de padrões sobre variantes etiquetadas. A correspondência deve ser estaticamente exaustiva, exceto se uma forma curinga explícita for aprovada. O contrato deve definir escopo de bindings, ordem das alternativas, padrões inalcançáveis, padrões aninhados, guards caso existam, junções do tipo resultante e avaliação da esquerda para a direita.

A aceitação exige que o compilador rejeite alternativas ausentes, duplicadas, impossíveis, incompatíveis em tipo e inalcançáveis antes da emissão do bytecode. A redução deve usar fluxo de controle e acesso a valores genéricos, não um opcode para `match` nem nomes públicos de variantes.

## P8.3 — Tipos e funções paramétricos

Especificar e implementar genéricos em tempo de compilação para records, variantes e funções. As primeiras abstrações públicas obrigatórias são `Option<T>` e `Result<T, E>`. O projeto deve escolher e documentar monomorfização ou outra representação estaticamente verificável, restrições genéricas, limites de inferência, identidade de exports entre módulos, regras de recursão, apresentação de diagnósticos e limites de tamanho do código.

Não existe reflexão em runtime nem cast apagado e não verificado. Toda chamada e valor instanciado deve possuir contrato exato e verificável. Os records nominais de resultado do P7 continuam suportados até a entrega de uma política documentada de compatibilidade e migração.

## P8.4 — Valores recursivos imutáveis e limitados

Especificar declarações de tipos recursivos e valores finitos e imutáveis em runtime sem permitir grafos cíclicos de objetos. O compilador deve rejeitar declarações inválidas de tamanho infinito ou exigir uma indireção aprovada por uma alternativa etiquetada. O runtime deve aplicar limites de profundidade, alocação, travessia, igualdade e serialização sem depender da pilha nativa para profundidade não confiável.

A aceitação exige construção, correspondência, igualdade e transporte por funções para valores recursivos finitos; rejeição determinística ou falha limitada para profundidade excessiva; e testes que comprovem que o bytecode não consegue fabricar um ciclo nem falsificar uma referência da heap.

## P8.5 — `BYTES` imutável

Especificar e implementar `BYTES` como uma sequência imutável e contabilizada de octetos, distinta de STRING e `[I64]`. A superfície aprovada deve cobrir literais ou construtores, comprimento, leitura indexada, recorte semiaberto, concatenação, igualdade, codificação/decodificação UTF-8 com falhas tipadas, contratos de funções e módulos e saída do inspetor.

Os limites usam índices I64. Acesso direto inválido falha deterministicamente, enquanto auxiliares da biblioteca padrão expõem resultados recuperáveis. O bytecode adiciona somente primitivas genéricas de valores binários exigidas pelo modelo de valores; formatos de arquivo, corpos HTTP, compressão, imagens e outros domínios permanecem responsabilidades da biblioteca padrão ou do host.

## P8.6 — `JsonValue` estruturado

Evoluir `std:json` da fronteira `JsonDocument` baseada em texto do P7 para um valor JSON recursivo e tipado construído com variantes, coleções imutáveis e texto numérico exato. O contrato deve preservar as decisões existentes de chaves duplicadas, ordenação, Unicode, canonicalização, lexemas numéricos, diagnósticos e limites de recursos.

A migração deve manter um caminho documentado para `JsonDocument`. Análise, serialização e conversão continuam como APIs definidas pelo catálogo; JSON não se torna palavra-chave, intrínseco de fonte, tipo de bytecode nem opcode.

## P8.7 — Compatibilidade e conformidade

Publicar especificações normativas bilíngues, artefatos gerados quando aplicável, consequências de compatibilidade, fixtures positivas e negativas de conformidade, casos de bytecode malformado, testes de limites de recursos e cobertura de empacotamento/instalação para toda a superfície do P8.

O P8 somente está concluído quando variantes etiquetadas, correspondência exaustiva, genéricos, valores recursivos, `BYTES` e JSON estruturado funcionarem entre módulos-fonte e no runtime com validação independente sob limites determinísticos.

## Ordem de entrega e restrições

A ordem obrigatória é P8.1, P8.2, P8.3, P8.4, P8.5, P8.6 e então P8.7. Uma tarefa pode refinar um projeto anterior, mas a implementação não deve ignorar um pré-requisito não atendido. Mudanças de formato permanecem exatas e pré-estáveis; um novo minor do bytecode é introduzido somente quando alterações de representação portátil ou instruções o exigirem.

O P8 não adiciona execução assíncrona, autoridade de arquivos ou rede, registry de pacotes, reflexão de tipos em runtime, exceções, nulabilidade implícita nem instruções de VM específicas de domínio.
