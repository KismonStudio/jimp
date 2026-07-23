# Heap Portatil AUREON v1

[Versao em ingles](../EN/HEAP.md)

## Escopo

O formato `2.7` introduziu a base generica, imutavel e limitada da heap, e o formato `2.8` adicionou substituicao funcional e igualdade estrutural genericas para arrays tipados e records. O formato ativo `2.9` preserva esse contrato da heap, adiciona operacoes genericas de STRING e e suficiente para a reducao de variants, genericos e valores recursivos do P8.1–P8.4 sem novas instrucoes. A VM continua sem definir JSON, arquivos, rede, handles do host ou ponteiros nativos.

O compilador representa uma variant como um objeto imutavel cujo primeiro slot e uma etiqueta I64 da alternativa e cujos slots restantes sao o payload ordenado. Payloads dependentes de genericos e variaveis de tipo isoladas usam boxes verificados de um slot nas fronteiras uniformes de funcoes. Match e reduzido a leituras tipadas, igualdade da etiqueta e saltos genericos. Esses layouts sao convencoes do compilador, nao novos tipos da VM nem comportamento especifico de nomes publicos.

## Representacao e instrucoes

`HEAP_REF` e um valor opaco da VM. Pode aparecer em assinaturas de funcoes e registradores, mas nunca em constantes ou assinaturas da Host ABI.

- `HEAP_ALLOC destination, value_start, value_count` captura atomicamente registradores tipados consecutivos em um novo objeto ordenado e imutavel e armazena sua referencia opaca. Zero valores exige `value_start = 0`.
- `HEAP_LOAD destination, object, index, result_type` le um slot. `object` deve ser `HEAP_REF`, `index` deve ser I64 e o tipo do slot no runtime deve corresponder exatamente ao tipo de resultado verificado.
- `HEAP_LENGTH destination, object` retorna como I64 a quantidade de slots.
- `HEAP_REPLACE destination, object, index, value` cria um novo objeto com um slot substituido e preserva o original.
- `HEAP_EQUAL destination, left, right` compara estruturalmente grafos imutaveis e retorna BOOL sem expor a identidade dos handles.

O verificador confere toda a estrutura das instrucoes, faixas de registradores, largura da alocacao, tipos de fluxo, tags de resultado, contratos de chamada e terminacao antes que a execucao ou resolucao da Host ABI possa produzir um efeito. Indice invalido ou tipo defensivo divergente falha deterministicamente.

`EQUAL` e `NOT_EQUAL` rejeitam operandos `HEAP_REF` brutos porque identidade de referencia nao e observavel. P7.3 e P7.4 geram `HEAP_EQUAL` para comparacoes aprovadas entre agregados do mesmo tipo; `!=` aplica tambem negacao booleana.

## Seguranca e propriedade

Referencias sao handles inteiros para uma arena local a uma unica execucao, e nao enderecos. Handles nao podem ser codificados, forjados por constantes, enviados ao host, desreferenciados fora da arena ou reutilizados por outra execucao.

Objetos sao imutaveis e alocacoes podem referenciar somente objetos alocados anteriormente. Essa ordem de construcao impede ciclos e referencias futuras. O runtime de referencia retem os objetos ate o fim da execucao; os orcamentos sao cumulativos e independem do momento de uma coleta de lixo.

## Contabilizacao de recursos

O contrato gerado do sandbox define limites de objetos, slots por objeto, slots cumulativos, bytes logicos, profundidade e visitas de igualdade estrutural. Os bytes logicos cobram um cabecalho por objeto, cada slot e os conteudos diretos de strings UTF-8. Objetos aninhados sao cobrados uma vez na alocacao, enquanto uma referencia consome somente seu slot. Uma alocacao rejeitada nao aloca parcialmente nem altera o registrador de destino.

Memoria de registradores e memoria da heap possuem orcamentos separados. Copiar `HEAP_REF` nao duplica o objeto; alocar um novo objeto sempre consome o orcamento cumulativo. O limite de passos continua aplicavel a cada instrucao de heap.

## Inspetor

O inspetor de bytecode mostra instrucoes de heap e todos os operandos codificados. Ele nunca percorre ou exibe referencias de runtime porque arquivos `.abc` nao podem conter objetos ou handles da heap.
