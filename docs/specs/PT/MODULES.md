# Contrato de Módulos-Fonte JIMP v1

[Versão em inglês](../EN/MODULES.md)

## Status

Este documento especifica o contrato implementado de módulos-fonte para imports e exports nomeados de funções, records e variants, incluindo declarações genéricas, resolução do grafo e vinculação estática. A CLI carrega com segurança um grafo acíclico de fontes, valida contratos escalares e agregados exatos, vincula identidades qualificadas por módulo deterministicamente e gera um único arquivo `.jbc` 2.9 autocontido com metadados de debug cientes do módulo.

Os termos **deve**, **não deve**, **obrigatório** e **inválido** são normativos.

## Limite arquitetural

Módulos são um conceito do compilador e do vinculador. Eles não são instruções da VM, solicitações ao sistema de arquivos em runtime nem capacidades da Host ABI.

- Um arquivo UTF-8 com extensão `.jimp` define um módulo-fonte.
- A compilação começa por um módulo de entrada e produz um arquivo `.jbc` autocontido.
- Todos os imports de fonte são resolvidos, analisados sintática e semanticamente e vinculados antes da emissão do bytecode.
- Chamadas importadas são reduzidas à instrução genérica `CALL` existente.
- Imports de fonte nunca devem se transformar em instruções `HOST_CALL` apenas por usarem a sintaxe `import`.
- O runtime não pesquisa caminhos de fonte, lê fontes importados, baixa dependências nem executa um carregador dinâmico de módulos.
- Imports da Host ABI permanecem como o mecanismo separado de capacidades tipadas definido em [VM.md](VM.md).

Esse limite permite executar o mesmo `.jbc` vinculado em hosts que não possuem um sistema de arquivos com os fontes.

## Escopo

Compatível:

- imports relativos de arquivos-fonte;
- bindings importados por nome;
- aliases locais opcionais;
- funções tipadas exportadas;
- declarações e esquemas de records nominais exportados;
- declarações de variants nominais e schemas de payload exportados;
- funções, records e variants genéricos exportados;
- funções privadas locais ao módulo;
- records privados locais ao módulo;
- grafos transitivos e acíclicos de dependências;
- vinculação estática determinística em um único módulo portátil.

Adiado:

- variáveis ou constantes exportadas;
- estado mutável de módulo e inicializadores de módulo;
- imports default, wildcard, de namespace, apenas por efeito ou dinâmicos;
- reexports e listas de exports;
- grafos cíclicos de módulos;
- pacotes, restrições de versão, registros, URLs e resolução por rede;
- carregamento de módulos em runtime e vinculação de vários `.jbc`;
- declarações da Host ABI no código-fonte.

Um módulo importado que não seja o de entrada deve conter somente imports e declarações de records, variants e funções. Instruções executáveis são válidas apenas no módulo de entrada. Essa regra evita ordem oculta de inicialização e efeitos observáveis durante o import.

## Sintaxe

Imports ocupam uma linha lógica e devem aparecer antes de toda declaração de record, variant, função ou instrução executável, exceto linhas vazias e comentários.

```jimp
import { add, multiply as mul } from "./math.jimp";

let answer = add(20, 22);
mul(answer, 2);
```

Exports são escritos diretamente nas declarações de funções, records ou variants:

```jimp
export function add(left: I64, right: I64): I64 {
  return left + right;
}

function privateHelper(value: I64): I64 {
  return value;
}

export record Point {
  x: I64,
  y: I64,
}

export variant Option<T> {
  None,
  Some(value: T),
}
```

Quando a sintaxe de módulos for habilitada, `import`, `export`, `from` e `as` serão palavras reservadas e sensíveis a maiúsculas e minúsculas. O ponto e vírgula na linha de import é opcional, de forma consistente com as outras linhas simples.

As formas seguintes são inválidas no contrato de módulos v1:

```jimp
import "./effects.jimp";
import * as math from "./math.jimp";
import math from "./math.jimp";
export { add };
export let value = 1;
```

## Bindings importados

Um item de import nomeia uma função, record ou variant exportado e pode declarar outro nome local com `as`.

```jimp
import { calculate as calculateTotal } from "./totals.jimp";
```

- O nome anterior a `as` é procurado na tabela de exports da dependência.
- O nome posterior a `as`, ou o nome original quando não há alias, é o binding local.
- Um binding de função importado é imutável e pode ser chamado onde uma função local ao módulo poderia ser chamada.
- Um binding de record importado nomeia o mesmo tipo nominal e permite literais, anotações, acesso a campos e contratos agregados exatos sob seu alias local.
- Um binding de variant importado nomeia o mesmo tipo nominal e permite construção, anotações, correspondência e contratos exatos de funções genéricas sob seu alias local.
- Bindings importados ficam disponíveis em todo o módulo, inclusive em funções declaradas antes do primeiro local de chamada do import.
- Dois imports não devem criar o mesmo binding local.
- Um binding importado não deve conflitar com função ou record local ao módulo, variável, parâmetro ou palavra reservada.
- Importar a mesma declaração exportada com aliases locais distintos é válido.
- Um item de import que nomeie uma declaração ausente ou privada é inválido.

As chamadas devem corresponder exatamente ao contrato de parâmetros e retorno da função exportada. JIMP não realiza conversão implícita na fronteira entre módulos.

## Declarações exportadas

`export` altera somente a visibilidade. Ele não altera a avaliação, identidade do record, tipagem, convenção de chamada nem representação em runtime.

- Somente uma declaração de função, record ou variant no escopo superior pode usar `export`.
- Os nomes dos exports são os nomes declarados das funções, records ou variants; aliases de export não são permitidos.
- Os nomes dos exports devem ser únicos em um módulo.
- Uma função privada permanece acessível dentro do módulo que a declarou.
- Uma função exportada pode chamar funções privadas e importadas.
- Uma função exportada não pode capturar variáveis do módulo de entrada, seguindo a regra existente de escopo isolado das funções.
- O módulo de entrada pode exportar funções, embora esses exports sejam usados somente quando outra compilação tratar o arquivo como dependência.
- Um record exportado expõe sua identidade nominal qualificada, os nomes ordenados dos campos e os tipos exatos. Importá-lo não cria um record local estruturalmente intercambiável.
- Uma variant exportada expõe sua identidade nominal qualificada, parâmetros de tipo, alternativas ordenadas e campos exatos de payload. Importá-la não cria uma variant local estruturalmente intercambiável.
- Uma função genérica é vinculada uma única vez com sua representação uniforme verificada; imports não criam cópias monomorfizadas.
- Uma função exportada pode aceitar ou retornar agregados. Os esquemas necessários são transportados transitivamente para análise exata de chamadas e campos, mas o consumidor deve importar explicitamente o record para nomear ou construir esse tipo.

As tabelas de exports são metadados de compilação. Elas não expõem ponteiros nativos e não precisam permanecer observáveis no módulo vinculado em runtime.

## Especificadores de módulos

O resolvedor inicial de fontes aceita somente especificadores relativos:

```text
./name.jimp
../shared/name.jimp
```

Um especificador relativo:

- deve começar com `./` ou `../`;
- deve usar `/` como separador em todos os sistemas operacionais;
- deve terminar com a extensão exata `.jimp`;
- não deve conter caractere NUL, barra invertida, segmento de caminho vazio nem barra final;
- é interpretado após a decodificação normal dos escapes de strings JIMP;
- não é decodificado como URL e não usa escapes percentuais;
- não recebe extensões implícitas nem procura por `index.jimp`.

Caminhos absolutos, caminhos com unidade, caminhos UNC, URLs `file:`, URLs de rede e nomes simples são especificadores de fonte inválidos.

O prefixo `std:` é reservado para o [contrato da biblioteca padrão](STDLIB.md). Um resolvedor de sistema de arquivos não deve interpretar `std:` como caminho relativo nem como caminho a partir da raiz do projeto. O compilador o resolve somente pelo catálogo selecionado do conjunto de ferramentas; quando esse catálogo não fornece o módulo solicitado, o especificador permanece não resolvido.

## Raiz do projeto e identidade do módulo

Toda compilação possui uma raiz de projeto. A CLI oficial usará por padrão o diretório do módulo de entrada e poderá aceitar uma raiz explícita em uma implementação posterior. O módulo de entrada e todas as dependências resolvidas devem permanecer dentro da raiz real do projeto.

Cada arquivo possui duas identidades relacionadas:

1. **Identidade física** é seu caminho canônico no sistema de arquivos após a resolução de links simbólicos. Ela é usada para cache, verificação de contenção e detecção de arquivos duplicados.
2. **ID portátil do módulo** é o caminho normalizado relativo à raiz do projeto e codificado com `/`, como `lib/math.jimp`. Ele é usado em diagnósticos determinísticos e símbolos do vinculador.

A resolução deve rejeitar:

- travessia lexical com `..` que escape da raiz do projeto;
- travessia por link simbólico cujo destino real escape da raiz real do projeto;
- dois IDs portáteis distintos que resolvam para o mesmo arquivo físico;
- aliases específicos da plataforma cuja grafia torne o grafo ambíguo;
- um arquivo que não seja um fonte regular, legível e em UTF-8.

IDs portáteis de módulos são sensíveis a maiúsculas e minúsculas. Um compilador em um sistema de arquivos que não diferencie maiúsculas e minúsculas deve detectar IDs conflitantes em vez de escolher um silenciosamente.

## Algoritmo de resolução

Para cada import, o resolvedor executa estas etapas em ordem:

1. Decodificar e validar o especificador do módulo.
2. Resolvê-lo em relação ao diretório físico do módulo importador.
3. Normalizar segmentos `.` e `..` sem permitir escape da raiz do projeto.
4. Resolver links simbólicos e verificar a contenção dentro da raiz real do projeto.
5. Exigir um arquivo `.jimp` regular e existente.
6. Derivar seu ID portátil em relação à raiz do projeto.
7. Reutilizar o módulo analisado quando sua identidade física já estiver no cache.
8. Analisar imports na ordem do fonte e resolver recursivamente dependências ainda não armazenadas no cache.

Nenhum caminho alternativo de busca é tentado após uma falha. Em particular, o resolvedor não deve pesquisar o diretório de trabalho, caminhos de módulos definidos pelo ambiente, diretórios superiores de pacotes nem a rede.

## Validação do grafo

O grafo completo deve ser resolvido antes do início da redução semântica.

- O módulo de entrada é a raiz do grafo.
- Cada arquivo-fonte físico é analisado no máximo uma vez por compilação.
- Imports são percorridos na ordem do fonte.
- Um ciclo entre dependências é inválido, inclusive quando um arquivo importa a si mesmo por meio de um alias.
- O diagnóstico do ciclo deve mostrar o caminho de IDs portáteis que fecha o ciclo.
- Todo nome importado é verificado somente depois que a tabela de exports da dependência estiver disponível.
- Um arquivo-fonte não pode mudar entre o carregamento do grafo e a emissão do bytecode; implementações devem preservar o conteúdo lido ou verificar uma identidade estável do arquivo.

Para um grafo válido, os módulos são vinculados em ordem topológica determinística: dependências precedem importadores e, nos demais casos, prevalece a primeira descoberta na ordem do fonte. Os mesmos bytes de fonte e opções do compilador devem produzir a mesma ordem vinculada em todas as plataformas compatíveis.

## Resolução de nomes e vinculação

A resolução de nomes ocorre em um namespace de módulo antes da alocação dos índices globais de funções.

1. Coletar esquemas de records locais, assinaturas de funções e tabelas de exports.
2. Resolver cada binding importado para uma identidade de função ou record exportado: `(ID portátil do módulo, nome do export)`.
3. Analisar declarações e corpos usando bindings locais e importados e identidades nominais exatas.
4. Atribuir índices vinculados de funções na ordem determinística dos módulos e declarações.
5. Reduzir chamadas a operandos numéricos de `CALL`.
6. Emitir uma função de entrada para as instruções executáveis do módulo de entrada.

Funções privadas com o mesmo nome em módulos diferentes não entram em conflito. Nomes visíveis ao vinculador, diagnósticos e futuras identidades de arquivo nos dados de debug devem permanecer qualificados pelo módulo, mesmo que a tabela atual de funções do `.jbc` armazene um nome compacto de implementação.

O bytecode vinculado deve preservar identidade de debug suficiente para distinguir números de linha iguais em módulos-fonte diferentes. A extensão de uma localização de fonte `jimp-error-v1` com um ID portátil do módulo é compatível porque consumidores devem ignorar campos desconhecidos.

## Comportamento de falhas

Falhas de módulos são falhas do compilador e usam `JIMP-1001` com fase `compile`. Os diagnósticos devem identificar o ID portátil do módulo importador e a linha do fonte quando disponíveis.

Casos obrigatórios de falha incluem:

- especificador inválido ou incompatível;
- escape da raiz do projeto ou por link simbólico;
- fonte ausente, ilegível, não regular ou com UTF-8 inválido;
- binding local de import duplicado ou conflitante;
- declaração exportada ausente ou privada;
- export duplicado;
- import posterior a uma declaração ou instrução executável;
- instrução executável em módulo que não seja o de entrada;
- ciclo entre dependências;
- contrato incompatível em chamada importada;
- identidade física ambígua ou conflito em sistema de arquivos que não diferencia maiúsculas e minúsculas.

O compilador não deve emitir `.jbc` quando ocorrer qualquer falha de módulo.

## Extensão da gramática

Esta gramática estende a notação de [LANGUAGE.md](LANGUAGE.md):

```ebnf
module              = { trivia-line }, { import-declaration, { trivia-line } },
                      { function-declaration | record-declaration
                        | exported-declaration | entry-statement } ;

import-declaration  = whitespace, "import", required-whitespace,
                      "{", whitespace, import-list, whitespace, "}",
                      required-whitespace, "from", required-whitespace,
                      string-literal, [ ";" ], whitespace, line-boundary ;
import-list         = import-item,
                      { whitespace, ",", whitespace, import-item } ;
import-item         = identifier,
                      [ required-whitespace, "as", required-whitespace,
                        identifier ] ;

exported-declaration = whitespace, "export", required-whitespace,
                       ( function-declaration | record-declaration ) ;
entry-statement     = statement ;
```

Uma lista vazia de imports é inválida. `entry-statement` é permitido somente no módulo de entrada. O prefixo `export` e o cabeçalho da declaração devem ocupar a mesma linha lógica.

## Implementação atual

O frontend representa imports separadamente das instruções executáveis e marca a visibilidade diretamente nas declarações de funções e records. O resolvedor fornece cada item com especificador, nomes importado e local, ID portátil do módulo, tipo da declaração e uma assinatura exata de função ou um esquema nominal de record com dependências transitivas. A análise rejeita descritores não resolvidos ou excedentes, contratos inválidos, bindings duplicados, conflitos de nomes e instruções executáveis fora do módulo de entrada.

Uma chamada importada analisada mantém sua identidade de função qualificada por módulo até o vinculador atribuir índices globais com dependências primeiro. A CLI usa a semântica de `compileProject(entryPath)` e aceita grafos completos de projetos. A API de baixo nível `compile(source)` permanece intencionalmente restrita a um único fonte e rejeita imports porque não possui raiz de projeto nem autoridade sobre o sistema de arquivos.

## Critérios de aceitação da implementação

A implementação de módulos está concluída até o P7.6:

- o parser e o analisador implementarem essa sintaxe e esse modelo de visibilidade;
- o resolvedor aplicar identidade canônica e contenção na raiz do projeto;
- programas acíclicos com vários arquivos forem vinculados deterministicamente em um `.jbc`;
- chamadas importadas forem executadas por instruções genéricas `CALL`, e valores agregados usarem instruções genéricas de heap no runtime Rust;
- diagnósticos de fonte distinguirem IDs de módulos e linhas;
- testes unitários e de integração entre linguagens cobrirem grafos válidos e todas as classes obrigatórias de falhas;
- nenhum conceito de módulo nem resolvedor de caminhos de fonte for adicionado ao conjunto de instruções da VM.
