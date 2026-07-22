# Valores Agregados JIMP v1

[Versao em ingles](../EN/AGGREGATES.md)

## Status e escopo

Este documento e o contrato normativo dos valores agregados. O P7.2 introduziu a base generica da heap, o P7.3 implementou arrays tipados e o P7.4 implementou records nominais.

## Tipos e sintaxe

Arrays usam `[T]`, contem um unico tipo de elemento e preservam a ordem de insercao. Records sao declaracoes nominais no escopo do modulo, cuja identidade e formada pelo modulo declarante e pelo nome do record.

```jimp
record Point {
  x: I64,
  y: I64,
}

let values: [I64] = [10, 20]
let origin: Point = Point { x: 0, y: 0 }
```

Uma anotacao opcional `: Type` e permitida em `let` e `var`. Um array vazio exige um tipo de elemento fornecido pelo contexto. O acesso usa `values[index]`, o comprimento I64 usa `values.length` e o acesso a record usa `origin.x`. Literais de record devem inicializar cada campo exatamente uma vez; apos a analise, a ordem e a da declaracao.

Atualizacoes de agregados sao expressoes e nunca alteram um valor existente:

```jimp
let changed = values with [0] = 11
let moved = origin with { x: 4 }
```

O indice e I64. Uma atualizacao de record pode nomear um ou mais campos distintos. A avaliacao ocorre da esquerda para a direita: base, indice quando existir e expressoes substitutas na ordem do codigo-fonte.

## Tipagem estatica

- Literais de array devem possuir um unico tipo de elemento estaticamente exato. Arrays aninhados sao permitidos.
- Records possuem tipagem nominal. Records com campos identicos, mas declaracoes qualificadas diferentes, possuem tipos diferentes.
- Tipos agregados podem aparecer recursivamente em anotacoes, campos, parametros e retornos de funcoes.
- Assinaturas de funcoes representam o tipo completo do codigo-fonte. A VM portatil pode apagar os detalhes para `HEAP_REF`, mas o compilador deve provar todas as operacoes e chamadas contra a assinatura completa antes da codificacao.
- Uma juncao de fluxo mantem o tipo somente quando todos os caminhos alcancaveis de entrada possuem exatamente o mesmo tipo. Nao existem unioes de agregados, nulabilidade implicita, ampliacao numerica ou coercao estrutural de records.
- `NULL` nao e array nem record e nao e um valor inicial implicito para agregados.

Sao rejeitados antes da emissao: arrays heterogeneos, arrays vazios sem tipo contextual, indices nao I64, campos ausentes, duplicados, privados ou desconhecidos, atribuicao direta em indice ou campo, juncoes de fluxo incompativeis e chamadas ou retornos com tipos agregados nao exatos.

## Propriedade, aliasing e ciclo de vida

Arrays e records possuem semantica de valor imutavel. Atribuicao, passagem de argumento, retorno e atualizacao funcional se comportam como uma copia completa. Implementacoes podem compartilhar armazenamento imutavel, mas identidade, endereco, contagem de referencias e momento da liberacao nao sao observaveis.

`var` permite apenas reatribuicao. Nem `value[index] = replacement` nem `value.field = replacement` sao validos. Uma atualizacao funcional retorna um novo valor e deixa inalterados todos os aliases do valor anterior.

Objetos da heap sao criados atomicamente a partir de valores existentes. Um objeto nao pode conter sua propria referencia ainda nao criada, e nenhuma instrucao altera o objeto apos a criacao. Assim, o grafo alcancavel e aciclico. O P7 nao exige coleta de ciclos. Um runtime pode reter objetos ate o fim da execucao, sujeito aos limites cumulativos do sandbox.

## Igualdade e comportamento observavel

`==` e `!=` usam igualdade estrutural entre agregados do mesmo tipo:

- arrays sao iguais quando seus comprimentos e elementos correspondentes sao iguais recursivamente;
- records sao iguais somente quando seus tipos nominais coincidem e todos os campos declarados sao iguais recursivamente;
- folhas escalares mantem as regras de igualdade existentes;
- a avaliacao e deterministica e deve terminar dentro dos limites de trabalho e profundidade do sandbox.

Nao existe operador de identidade de referencia. Compartilhar armazenamento nao pode alterar igualdade, atualizacoes, ordem de iteracao, diagnosticos ou resultados dos limites de recursos definidos pelo sandbox de referencia.

Arrays sao percorridos deterministicamente ao combinar seu `length` I64 com indices I64 crescentes. O P7 nao adiciona uma instrucao separada para iteracao de colecoes.

Um acesso ou atualizacao fora dos limites do array e uma falha deterministica de runtime ate que P7.5 forneca uma alternativa explicitamente tipada. A falha nao executa efeito no host nem retorna `NULL`.

## Exemplos validos e rejeitados

Validos:

```jimp
let empty: [String] = []
let matrix: [[I64]] = [[1, 2], [3, 4]]
let next = matrix with [0] = [5, 6]
```

Rejeitados:

```jimp
let unknown = []
let mixed = [1, "two"]
matrix[0] = [5, 6]
let bad = Point { x: 1 }
```

## Modulos e compatibilidade

Uma declaracao de record exportada expoe seu tipo nominal e o esquema completo de campos. Modulos consumidores devem importar explicitamente o nome do record para construir valores. Funcoes exportadas podem usar tipos agregados em seus contratos exatos de codigo-fonte; o linker transporta transitivamente os esquemas necessarios para que chamadas, retornos e acessos a campos sejam validados sem enfraquecer a identidade nominal. Construtores de records privados permanecem locais ao modulo.

O P7.2 alterou o formato portatil pre-estavel de `2.6` para `2.7`, adicionando `HEAP_REF` e as instrucoes iniciais de heap. O P7.3 e o P7.4 completaram a semantica de valores agregados no formato `2.8`, com substituicao imutavel generica e igualdade estrutural. O formato ativo `2.9` preserva essa semantica e adiciona operacoes genericas de STRING sem relacao com a heap. Runtimes de versao exata rejeitam todas as versoes minor anteriores. `HEAP_REF` nao pode ocorrer no pool de constantes nem em assinaturas da Host ABI e nunca expoe um ponteiro nativo ou do host.
