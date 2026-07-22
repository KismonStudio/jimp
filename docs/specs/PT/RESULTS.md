# Resultados Recuperáveis JIMP v1

[Versão em inglês](../EN/RESULTS.md)

## Status e fronteira

Este documento especifica a convenção de resultados recuperáveis implementada pelo P7.5. Uma falha recuperável é um valor comum de record nominal. Ela não é exceção, `NULL` implícito, exceção oculta da linguagem hospedeira, transferência de controle da VM nem um novo tipo de bytecode.

## Contrato de resultado

Um record de resultado contém estes campos em ordem:

- `ok: BOOL` identifica o resultado ativo;
- `value: T` transporta o valor de sucesso ou um valor alternativo seguro e documentado;
- `error: STRING` fica vazio no sucesso e contém uma mensagem determinística na falha.

Construtores devem inicializar todos os campos. Uma função que retorna resultado não deve encerrar a execução em uma falha normal documentada. O consumidor verifica `ok` explicitamente antes de tratar `value` como sucesso. O valor alternativo permanece tipado corretamente, portanto a leitura de qualquer caminho não causa confusão de tipos.

`std:result` exporta `StringResult`, `stringSuccess` e `stringFailure`. Outros módulos podem definir records nominais para agregados exatos, como `I64ArrayResult` e `JsonResult`. Records de resultado distintos não são estruturalmente intercambiáveis.

## Primitivas de texto

Indexação e intervalos de STRING contam valores escalares Unicode, não bytes UTF-8 nem grafemas:

```jimp
let value = "Olá"
let scalar = value[2]
let prefix = value[0:2]
let joined = prefix + scalar
let count = value.length
```

`value[index]` retorna uma STRING com um valor escalar. `value[start:end]` usa intervalo semiaberto. Índice ou intervalo direto inválido causa falha determinística de execução. `std:text.at` e `std:text.slice` verificam os limites e retornam `StringResult`; `length` e `concat` são totais.

## Primitivas de coleções

Arrays mantêm comprimento, indexação e atualização imutável do P7.3. `std:collections/i64` adiciona `contains`, `indexOf` e `replace` recuperável em JIMP portátil. Uma substituição inválida retorna `I64ArrayResult { ok: false, value: original, error: ... }`; nenhuma atualização parcial ocorre.

## Representação portátil e limites

Resultados e coleções usam a heap genérica e imutável existente. A VM não conhece `Result` nem os nomes das funções de texto ou coleção. O formato 2.9 adiciona somente instruções verificadas independentemente para comprimento, leitura escalar, recorte semiaberto e concatenação de STRING. Strings produzidas continuam sujeitas aos limites de memória lógica dos registradores e de passos.
