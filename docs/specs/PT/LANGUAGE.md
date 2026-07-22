# Sintaxe da Linguagem JIMP v1

[Versão em inglês](../EN/LANGUAGE.md)

## Status

Este documento define a sintaxe e a semântica centrais da linguagem-fonte implementadas até o P7.6, incluindo operações de STRING por valores escalares Unicode, arrays tipados, records nominais, records de resultado recuperável, imports e exports nomeados, grafos estáticos seguros do projeto e módulos `std:` apoiados pelo catálogo. A linguagem e o formato portátil permanecem pré-estáveis.

As palavras-chave, a gramática, as regras de tipo e os exemplos são normativos. O texto explicativo é informativo, exceto quando utiliza **deve**, **não deve**, **obrigatório** ou **inválido**.

## Codificação e linhas

- Arquivos-fonte usam a extensão `.jimp` e codificação UTF-8.
- Finais de linha LF e CRLF são aceitos.
- Cada linha lógica não vazia contém uma instrução simples completa ou um delimitador de bloco.
- Espaços em branco no início e no fim são ignorados.
- O ponto e vírgula ao final de uma instrução simples é opcional.
- Um programa vazio é válido.

Comentários começam com `//` após espaços em branco opcionais e ocupam o restante da linha lógica. Comentários inline não são aceitos. Marcadores de comentário dentro de strings são conteúdo comum.

## Palavras reservadas e identificadores

As palavras reservadas diferenciam maiúsculas de minúsculas:

```text
as break continue else export false from function if import let null print record return true var while with
```

Identificadores começam com uma letra ASCII ou sublinhado e continuam com letras ASCII, dígitos ou sublinhados. Eles diferenciam maiúsculas de minúsculas.

## Tipos e literais

Os tipos escalares de valor são `NULL`, `BOOL`, `I64`, `F64` e `STRING`. Um tipo de array é escrito `[T]`; seu elemento não pode ser `NULL` nem `VOID`. Um tipo de record é o nome de uma declaração nominal `record` visível. Tipos agregados podem ser aninhados. `VOID` é permitido somente como tipo de retorno de função e nunca representa um valor de runtime.

- Strings usam aspas duplas e aceitam `\\`, `\"`, `\n`, `\r` e `\t`.
- Inteiros usam dígitos decimais com sinal negativo opcional e devem caber em `i64` com sinal.
- Literais de ponto flutuante possuem parte fracionária, expoente ou ambos. Eles são arredondados para valores finitos IEEE 754 binary64.
- Os literais booleanos são `true` e `false`; o literal nulo é `null`.

Separadores numéricos, notação hexadecimal, sinal positivo inicial, `NaN`, literais de infinito e conversões implícitas não são aceitos.

## Variáveis e escopo léxico

As duas formas de declaração exigem um inicializador:

```jimp
let immutableValue = 42;
var mutableValue: I64 = immutableValue + 1;
mutableValue = mutableValue * 2;
```

- `let` cria uma variável imutável; `var` cria uma variável mutável.
- As duas formas aceitam uma anotação exata opcional `: Type` antes de `=`. Um array vazio exige esse tipo contextual ou outro contexto agregado exato.
- Nomes devem ser declarados antes do uso e não podem ser duplicados no mesmo escopo.
- Blocos aninhados podem sombrear variáveis externas.
- O tipo atual de uma variável mutável é acompanhado na ordem do código-fonte.
- Caminhos condicionais devem convergir para o mesmo tipo em toda variável externa que permaneça alcançável.
- Uma variável externa atribuída dentro de um loop deve preservar o tipo que possuía na entrada do loop.
- Variáveis declaradas dentro de um bloco ficam indisponíveis após o fechamento desse bloco.
- O nome de uma variável não pode conflitar com o nome de uma função.
- O nome de uma variável ou parâmetro não pode conflitar com um record visível.

## Expressões

Expressões primárias são literais escalares e de array, literais de record, referências a variáveis, chamadas de função e expressões entre parênteses. Acesso indexado pós-fixado, recorte de STRING, `.length` e acesso a campo de record têm precedência maior que operadores unários. Atualizações funcionais com `with` têm a menor precedência. Argumentos, membros de literais, operandos de atualização e operandos binários são avaliados da esquerda para a direita.

Da maior para a menor precedência:

| Precedência | Operadores | Tipos dos operandos | Resultado |
| ---: | --- | --- | --- |
| 9 | chamada, acesso indexado, recorte de STRING, `.length`, acesso a campo | contrato exato; array ou STRING mais `I64`; STRING mais dois `I64`; array, STRING ou record | retorno declarado, elemento ou STRING de um escalar, STRING, `I64` ou tipo do campo |
| 8 | literais de array e record | elementos homogêneos/contextuais exatos ou campos declarados completos | tipo agregado |
| 7 | `-` unário | `I64` ou `F64` | tipo do operando |
| 7 | `!` unário | `BOOL` | `BOOL` |
| 6 | `*`, `/`, `%` | mesmo tipo numérico | tipo dos operandos |
| 5 | `+`, `-` | mesmo tipo numérico; `+` também aceita duas STRING | tipo dos operandos |
| 4 | `<`, `<=`, `>`, `>=` | mesmo tipo numérico | `BOOL` |
| 3 | `==`, `!=` | mesmo tipo de valor não `VOID` | `BOOL` |
| 2 | `&&` | `BOOL`, `BOOL` | `BOOL` |
| 1 | `||` | `BOOL`, `BOOL` | `BOOL` |
| 0 | `with [index] = value`, `with { field: value, ... }` | tipo exato do elemento ou campo | tipo agregado da base |

`&&` e `||` utilizam curto-circuito. A aritmética verificada de `I64` informa overflow e divisores zero em runtime. Operações `F64` seguem o comportamento IEEE 754 binary64.

Uma chamada `VOID` pode ser usada como instrução de expressão, mas seu resultado não pode inicializar ou receber atribuição em uma variável, ser impresso, ser retornado como valor ou participar de outra expressão.

Arrays e records possuem semântica de valor imutável. Atribuição em índice ou campo é inválida; uma expressão `with` retorna um novo valor e preserva o original. `==` e `!=` comparam estruturalmente agregados do mesmo tipo. Consulte [AGGREGATES.md](AGGREGATES.md) para inicialização exata, identidade nominal, visibilidade entre módulos, falhas de limite e comportamento no sandbox.

Comprimento, indexação e recorte de STRING contam valores escalares Unicode, não bytes UTF-8. `value[index]` retorna uma STRING de um escalar, `value[start:end]` usa um intervalo semiaberto e `+` concatena STRING. Índices e intervalos diretos inválidos falham deterministicamente em execução; os auxiliares portáteis de [`std:text`](STDLIB.md) fornecem alternativas recuperáveis descritas em [RESULTS.md](RESULTS.md). O processamento tipado de documentos JSON é fornecido por [`std:json`](JSON.md), não pela sintaxe-fonte.

Records são declarados no escopo do módulo, com um campo tipado por linha lógica:

```jimp
record Point {
  x: I64,
  y: I64,
}

let origin = Point { y: 0, x: 0 }
let moved = origin with { x: 4 }
```

## Funções

Funções possuem nome, são declaradas no escopo do programa e exigem tipos explícitos nos parâmetros e no retorno:

```jimp
function add(left: I64, right: I64): I64 {
  return left + right;
}

let answer = add(20, 22);
```

- Os tipos de parâmetro podem ser `BOOL`, `I64`, `F64`, `STRING` ou qualquer tipo agregado visível.
- Os tipos de retorno podem incluir também `NULL`, `VOID` ou qualquer tipo agregado visível.
- Nomes de parâmetros são únicos na função e parâmetros são imutáveis.
- Chamadas devem fornecer a quantidade e os tipos exatos dos argumentos; nenhuma conversão é realizada.
- Chamadas podem preceder declarações, e recursão direta ou mútua é válida.
- Uma função possui escopo léxico isolado e não pode capturar variáveis da entrada do programa nem de outra função.
- Uma função não `VOID` deve retornar seu tipo declarado em todos os caminhos estaticamente alcançáveis.
- Uma função `VOID` pode usar `return;`; alcançar seu final realiza um retorno vazio implícito.
- `return` é inválido fora de uma função. Retornar um valor de `VOID`, ou omiti-lo em uma função que retorna valor, é inválido.

Funções não são valores de primeira classe. Chamadas apontam diretamente para um identificador declarado.

## Instruções condicionais e loops

`if` e `while` exigem condições `BOOL` e blocos entre chaves:

```jimp
var count = 0;
while count < 10 {
  count = count + 1;
  if count == 2 {
    continue;
  }
  if count == 4 {
    break;
  }
}
```

- `if` pode possuir um `else`; blocos podem estar vazios ou aninhados.
- `while` avalia sua condição antes de cada iteração.
- `break` encerra o loop mais interno; `continue` inicia a próxima avaliação de sua condição.
- `break` e `continue` são inválidos fora de um loop.
- Uma instrução após `return`, `break` ou `continue` incondicional no mesmo bloco é inalcançável e inválida.
- Um `while` não é considerado executado nem terminante durante a verificação de retornos de função.

A chave de abertura encerra sua linha lógica. A chave de fechamento ocupa sua própria linha lógica, exceto pela forma `} else {`, que é aceita. Blocos independentes e `else if` não são definidos.

## Outras instruções

`print expressão` exige `STRING` e escreve o valor seguido por uma quebra de linha através do host de console. É uma construção do código-fonte reduzida pelo compilador, não um opcode da VM.

Qualquer expressão pode ser utilizada como instrução; seu resultado é descartado.

## Gramática

A gramática utiliza EBNF no estilo ISO/IEC 14977. Espaços em branco léxicos podem aparecer ao redor de operadores e pontuação.

```ebnf
program          = { trivia-line | top-level-item } ;
top-level-item   = statement | function-declaration | record-declaration ;

record-declaration = record-header, line-ending,
                     { trivia-line | record-field-line }, close-brace-line ;
record-header    = whitespace, "record", required-whitespace,
                   identifier, whitespace, "{" ;
record-field-line = whitespace, identifier, whitespace, ":", whitespace,
                    value-type, [ whitespace, "," ], whitespace, line-boundary ;

function-declaration = function-header, line-ending, block-body,
                       close-brace-line ;
function-header  = whitespace, "function", required-whitespace,
                   identifier, whitespace, "(", whitespace,
                   [ parameter-list ], whitespace, ")", whitespace,
                   ":", whitespace, return-type, whitespace, "{" ;
parameter-list   = parameter, { whitespace, ",", whitespace, parameter } ;
parameter        = identifier, whitespace, ":", whitespace, parameter-type ;
parameter-type   = "BOOL" | "I64" | "F64" | "STRING" | aggregate-type ;
return-type      = "NULL" | parameter-type | "VOID" ;
value-type       = "NULL" | "BOOL" | "I64" | "F64" | "STRING" | aggregate-type ;
aggregate-type   = identifier | "[", whitespace, parameter-type, whitespace, "]" ;

statement        = statement-line | if-statement | while-statement ;
statement-line   = whitespace, simple-statement, whitespace, line-boundary ;
simple-statement = print-statement | variable-declaration
                   | variable-assignment | return-statement
                   | break-statement | continue-statement
                   | expression-statement ;

if-statement     = if-header, line-ending, block-body,
                   ( close-brace-line,
                     [ { trivia-line }, else-header, line-ending,
                       block-body, close-brace-line ]
                   | close-else-header, line-ending,
                     block-body, close-brace-line ) ;
while-statement  = while-header, line-ending, block-body, close-brace-line ;
if-header        = whitespace, "if", required-whitespace,
                   expression, whitespace, "{" ;
else-header      = whitespace, "else", whitespace, "{" ;
while-header     = whitespace, "while", required-whitespace,
                   expression, whitespace, "{" ;
close-brace-line = whitespace, "}", whitespace, line-boundary ;
close-else-header = whitespace, "}", whitespace, "else",
                    whitespace, "{" ;
block-body       = { trivia-line | statement } ;

print-statement  = "print", required-whitespace, expression, [ ";" ] ;
variable-declaration = ( "let" | "var" ), required-whitespace,
                       identifier, [ whitespace, ":", whitespace, value-type ],
                       whitespace, "=", whitespace,
                       expression, [ ";" ] ;
variable-assignment = identifier, whitespace, "=", whitespace,
                      expression, [ ";" ] ;
return-statement = "return", [ required-whitespace, expression ], [ ";" ] ;
break-statement  = "break", [ ";" ] ;
continue-statement = "continue", [ ";" ] ;
expression-statement = expression, [ ";" ] ;

expression       = update-expression ;
update-expression = logical-or-expression,
                    { required-whitespace, "with", required-whitespace,
                      ( "[", whitespace, expression, whitespace, "]",
                        whitespace, "=", whitespace, expression
                      | "{", whitespace, field-initializer-list,
                        whitespace, "}" ) } ;
logical-or-expression = logical-and-expression,
                        { whitespace, "||", whitespace, logical-and-expression } ;
logical-and-expression = equality-expression,
                         { whitespace, "&&", whitespace, equality-expression } ;
equality-expression = comparison-expression,
                      { whitespace, ( "==" | "!=" ), whitespace, comparison-expression } ;
comparison-expression = additive-expression,
                        { whitespace, ( "<" | "<=" | ">" | ">=" ),
                          whitespace, additive-expression } ;
additive-expression = multiplicative-expression,
                      { whitespace, ( "+" | "-" ), whitespace,
                        multiplicative-expression } ;
multiplicative-expression = unary-expression,
                            { whitespace, ( "*" | "/" | "%" ),
                              whitespace, unary-expression } ;
unary-expression = { ( "!" | "-" ), whitespace }, postfix-expression ;
postfix-expression = primary-expression,
                     { whitespace,
                       ( "[", whitespace, expression,
                         [ whitespace, ":", whitespace, expression ],
                         whitespace, "]"
                       | ".", identifier ) } ;
primary-expression = value-literal | array-literal | record-literal
                     | function-call | identifier
                     | "(", whitespace, expression, whitespace, ")" ;
function-call    = identifier, whitespace, "(", whitespace,
                   [ argument-list ], whitespace, ")" ;
argument-list    = expression, { whitespace, ",", whitespace, expression } ;
array-literal    = "[", whitespace,
                   [ expression, { whitespace, ",", whitespace, expression },
                     [ whitespace, "," ] ], whitespace, "]" ;
record-literal   = identifier, whitespace, "{", whitespace,
                   field-initializer-list, whitespace, "}" ;
field-initializer-list = [ field-initializer,
                           { whitespace, ",", whitespace, field-initializer },
                           [ whitespace, "," ] ] ;
field-initializer = identifier, whitespace, ":", whitespace, expression ;

value-literal    = string-literal | integer-literal | float-literal
                   | "true" | "false" | "null" ;
integer-literal  = [ "-" ], unsigned-integer ;
float-literal    = [ "-" ], unsigned-integer,
                   ( fractional-part, [ exponent-part ] | exponent-part ) ;
unsigned-integer = "0" | nonzero-digit, { digit } ;
fractional-part  = ".", digit, { digit } ;
exponent-part    = ( "e" | "E" ), [ "+" | "-" ], digit, { digit } ;

identifier       = identifier-start, { identifier-start | digit } ;
identifier-start = ASCII-letter | "_" ;
digit            = "0" | "1" | "2" | "3" | "4"
                   | "5" | "6" | "7" | "8" | "9" ;
nonzero-digit    = "1" | "2" | "3" | "4" | "5"
                   | "6" | "7" | "8" | "9" ;
string-literal   = '"', { string-character | escape-sequence }, '"' ;
escape-sequence  = "\\", ( "\\" | '"' | "n" | "r" | "t" ) ;
trivia-line      = whitespace, [ "//", { comment-character } ],
                   whitespace, line-boundary ;
whitespace       = { whitespace-character } ;
required-whitespace = whitespace-character, whitespace ;
line-ending      = "\n" | "\r", "\n" ;
line-boundary    = line-ending | end-of-file ;
```

`ASCII-letter` significa `A` até `Z` ou `a` até `z`. `string-character` exclui finais de linha, aspas sem escape e barras invertidas sem escape. `comment-character` exclui finais de linha. `whitespace-character` é qualquer caractere de espaço em branco que não encerre linha e seja reconhecido pelo compilador. `end-of-file` é o limite terminal do código-fonte.

## Exemplos inválidos

```jimp
break;
return 1;
function missing(value: I64): I64 {
  if value == 0 {
    return 0;
  }
}
function invalid(value: NULL): VOID {
}
var changing = 1;
while true {
  changing = false;
}
let unknown = [];
let mixed = [1, "two"];
origin.x = 4;
```

O compilador deve informar a linha lógica que contém sintaxe ou semântica inválida e não deve emitir bytecode.

## Fora do escopo

O compilador atual ainda não implementa blocos independentes, `else if`, closures, funções de primeira classe, parâmetros padrão ou variádicos, mutação direta de agregados, exceções nem autoridade de arquivos/rede. [Arrays e records](AGGREGATES.md) tipados, [records de resultado](RESULTS.md) recuperável, a [heap](HEAP.md) portátil, grafos estáticos do projeto, chamadas importadas, a [biblioteca padrão](STDLIB.md) atual e [perfis de destino](TARGETS.md) explícitos estão implementados. I/O externo futuro segue o [projeto de capacidades](IO_CAPABILITIES.md) revisado separadamente.
