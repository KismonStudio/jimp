# Variantes, Correspondência, Genéricos e Valores Recursivos do AUREON

[Versão em inglês](../EN/VARIANTS_AND_GENERICS.md)

## Status e escopo

Este documento especifica o contrato de linguagem de P8.1–P8.4 implementado pelo compilador, vinculador, catálogo padrão e runtime `.abc` 2.9. Os termos **deve**, **não deve**, **obrigatório** e **inválido** são normativos.

## Declarações e tipos

Records, variants e funções podem declarar até `MAX_TYPE_PARAMETERS` parâmetros de tipo únicos:

```aureon
record Box<T> {
  value: T,
}

variant Result<T, E> {
  Ok(value: T),
  Error(error: E),
}

function identity<T>(value: T): T {
  return value;
}
```

Um tipo nominal genérico deve fornecer exatamente a quantidade declarada de argumentos de tipo, por exemplo `Box<I64>` ou `Result<STRING, I64>`. Tipos genéricos podem ser aninhados até `MAX_TYPE_NESTING`. Parâmetros de tipo não possuem constraints e são invariantes. Eles não existem como valores refletíveis em runtime.

A identidade nominal inclui o tipo da declaração, a identidade portátil do módulo, o nome declarado e os argumentos de tipo exatos. Duas declarações estruturalmente iguais ou tipos instanciados de forma diferente não são intercambiáveis.

## Construção de variants

Um valor é construído com `Type::Alternative(arguments)`. Os argumentos são posicionais e devem corresponder exatamente aos campos do payload da alternativa.

```aureon
let success: Result<I64, STRING> = Result::Ok(42);
let failure: Result<I64, STRING> = Result::Error("failed");
```

Argumentos de tipo são inferidos pelos argumentos do payload e pelo tipo esperado. A construção é inválida se algum parâmetro de tipo permanecer não resolvido; portanto, uma alternativa vazia como `Option::None()` normalmente exige anotação de tipo ou outro contexto esperado exato.

Os nomes de alternativas devem ser únicos dentro de uma variant. Uma variant deve possuir ao menos uma alternativa e no máximo `MAX_VARIANT_ALTERNATIVES`. Cada alternativa é limitada a `MAX_NOMINAL_FIELDS` campos de payload.

## Correspondência exaustiva

Uma expressão match avalia seu objeto uma vez, seleciona uma alternativa, associa seu payload da esquerda para a direita e avalia exatamente uma expressão de resultado:

```aureon
let value = match(result) { Ok(item) => item, Error(_) => 0 };
```

Cada alternativa declarada deve ocorrer exatamente uma vez. Alternativas desconhecidas, duplicadas, ausentes ou associadas incorretamente causam erro de compilação. Todas as expressões de resultado devem possuir o mesmo tipo exato. Um binding de braço é imutável e visível somente naquele braço. `_` descarta uma posição do payload e não introduz binding.

A sintaxe atual aceita somente padrões simples de alternativas. Padrões aninhados, guards, braços catch-all, fallthrough explícito e expressões match multilinha não estão definidos. Um match possui no máximo `MAX_MATCH_ARMS` braços.

## Inferência e representação de genéricos

Argumentos de tipo de funções genéricas são inferidos pela unificação exata dos tipos declarados dos parâmetros com os tipos dos argumentos da chamada e, quando disponível, pelo tipo de retorno esperado. Argumentos de tipo explícitos na chamada, overloads, subtipagem, conversões implícitas e inferência parcial não estão definidos. Substituições inconsistentes ou não resolvidas causam erro de compilação.

Um único corpo de função portátil é emitido para cada declaração genérica. Uma variável de tipo isolada usa `HEAP_REF` na fronteira da função no bytecode. Valores concretos são empacotados em objetos imutáveis de um slot antes dessas chamadas e desempacotados depois. Campos de payload nominal dependentes de genéricos usam a mesma representação verificada. Essa representação uniforme evita crescimento por monomorfização e preserva a verificação exata no código-fonte.

O runtime não conhece nomes genéricos e não executa casts não verificados. O compilador reduz variants e genéricos às instruções existentes `HEAP_ALLOC`, `HEAP_LOAD`, `HEAP_REPLACE`, `HEAP_EQUAL`, `CALL`, comparação, movimento e saltos. Não existe opcode `MATCH`, `OPTION`, `RESULT` ou específico de uma alternativa pública.

Acesso indexado e atualização funcional indexada são inválidos quando o tipo do elemento do array é um parâmetro de tipo isolado e não resolvido. Arrays concretos e valores nominais genéricos continuam suportados.

## Valores recursivos imutáveis

O payload de uma variant pode conter recursivamente uma instância de seu próprio tipo:

```aureon
variant List<T> {
  Nil,
  Cons(head: T, tail: List<T>),
}
```

Somente valores finitos podem ser construídos em runtime. Objetos da heap são imutáveis após a alocação, referências são handles criados pelo verificador em vez de ponteiros nativos e nenhuma instrução pode falsificar um handle ou introduzir uma aresta retroativa mutável. Portanto, grafos cíclicos não podem ser expressos por bytecode válido.

Construção, transporte, correspondência e igualdade estrutural são limitados pelos limites gerados do sandbox, incluindo `MAX_HEAP_OBJECTS`, `MAX_TOTAL_HEAP_SLOTS`, `MAX_HEAP_BYTES`, `MAX_HEAP_DEPTH`, `MAX_HEAP_EQUALITY_VISITS`, `MAX_CALL_FRAMES` e `MAX_EXECUTION_STEPS`. Exceder um limite de runtime encerra a execução deterministicamente.

## Variants genéricas padrão

`std:option` exporta `Option<T>` com `None` e `Some(value: T)`. `std:result` exporta `Result<T, E>` com `Ok(value: T)` e `Error(error: E)`. Essas são declarações portáteis comuns definidas pelo catálogo; seus nomes não recebem privilégio do compilador ou da VM. `StringResult` e outros records de resultado do P7 continuam disponíveis para compatibilidade.

## Contrato de módulos

Funções, records e variants genéricos podem ser exportados e importados por nome. Os metadados de export contêm parâmetros de tipo, identidade nominal, schemas de payload e dependências transitivas de tipos. A vinculação preserva um único corpo de função genérica e identidades nominais qualificadas pelo módulo. Um `.abc` compilado permanece autocontido e não exige metadados de tipos do código-fonte em runtime.
