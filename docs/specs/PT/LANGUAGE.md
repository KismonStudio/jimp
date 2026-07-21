# Sintaxe da Linguagem JIMP v1

[English version](../EN/LANGUAGE.md)

## Status

Este documento define a sintaxe e a semântica completas do P2 aceitas pelo compilador JIMP até o P2.5. A linguagem permanece pré-estável.

As palavras reservadas, a gramática, as regras de operadores e os exemplos são normativos. O texto explicativo é informativo, exceto quando utiliza **deve**, **não deve**, **obrigatório** ou **inválido**.

## Codificação e linhas

- Arquivos de código-fonte utilizam a extensão `.jimp` e codificação UTF-8.
- Terminações de linha LF e CRLF são aceitas.
- Cada linha lógica não vazia e que não seja comentário contém uma instrução simples completa ou um delimitador de bloco condicional.
- Espaços em branco no início e no final são ignorados.
- O ponto e vírgula no final de uma instrução é opcional.
- Um programa vazio é válido.

Comentários começam com `//` após espaços em branco opcionais e ocupam o restante da linha lógica. Comentários inline ainda não são aceitos. Marcadores de comentário dentro de strings são conteúdo comum.

## Palavras reservadas e identificadores

As palavras reservadas diferenciam maiúsculas de minúsculas:

```text
if else print true false null let var
```

Identificadores começam com uma letra ASCII ou sublinhado e continuam com letras ASCII, dígitos ou sublinhados. Eles diferenciam maiúsculas de minúsculas, e palavras reservadas não podem nomear variáveis.

## Literais

### Strings

Strings são delimitadas por aspas duplas. Elas aceitam `\\`, `\"`, `\n`, `\r` e `\t`. Aspas sem escape, barra invertida sem escape, terminação de linha literal, escape não aceito ou ausência das aspas finais são inválidos.

### Inteiros

Literais inteiros utilizam dígitos decimais com um sinal de menos inicial opcional. Zeros à esquerda são proibidos, exceto em `0`. Os valores devem caber em `i64` com sinal, de `-9223372036854775808` até `9223372036854775807`.

### Ponto flutuante

Literais de ponto flutuante possuem uma parte inteira seguida por uma parte fracionária, um expoente ou ambos. Uma parte fracionária exige dígitos após o ponto. Um expoente começa com `e` ou `E`, pode ter sinal e exige dígitos. Literais no código-fonte são arredondados para binary64 IEEE 754 e devem ser finitos.

### Booleano e nulo

Os literais booleanos são `true` e `false`. O literal nulo é `null`.

Separadores numéricos, notação hexadecimal, sinal de mais inicial, `NaN` e literais infinitos não são aceitos.

## Variáveis

As variáveis utilizam escopo léxico de bloco. Nomes devem ser declarados antes do uso e não podem ser declarados mais de uma vez no mesmo escopo. Um bloco aninhado pode ocultar um nome do escopo externo. As duas formas de declaração exigem inicializador:

```jimp
let immutableValue = 42;
var mutableValue = immutableValue + 1;
mutableValue = mutableValue * 2;
```

- `let` cria uma variável imutável que não pode receber nova atribuição.
- `var` cria uma variável mutável.
- Inicializadores e atribuições aceitam expressões.
- O tipo atual de uma variável mutável é acompanhado na ordem do código-fonte e pode mudar após uma atribuição incondicional.
- Atribuições dentro de uma condicional podem atualizar uma variável externa. Após a condicional, todos os caminhos devem convergir para o mesmo tipo.
- Em um `if` sem `else`, o caminho falso implícito mantém o tipo de entrada; portanto, o caminho executado deve terminar com esse mesmo tipo.
- Em um `if` com `else`, os dois caminhos explícitos podem convergir para um novo tipo, mesmo que seja diferente do tipo de entrada.
- Uma declaração dentro de um bloco `if` ou `else` deixa de estar disponível quando o bloco termina.
- Declarações não utilizadas são válidas.

## Expressões

Expressões primárias são literais, referências a variáveis e expressões entre parênteses. Operadores são associativos à esquerda dentro do mesmo nível de precedência.

Da maior para a menor precedência:

| Precedência | Operadores | Tipos dos operandos | Resultado |
| ---: | --- | --- | --- |
| 7 | `-` unário | `I64` ou `F64` | tipo do operando |
| 7 | `!` unário | `BOOL` | `BOOL` |
| 6 | `*`, `/`, `%` | mesmo tipo numérico | tipo dos operandos |
| 5 | `+`, `-` | mesmo tipo numérico | tipo dos operandos |
| 4 | `<`, `<=`, `>`, `>=` | mesmo tipo numérico | `BOOL` |
| 3 | `==`, `!=` | mesmo tipo de valor | `BOOL` |
| 2 | `&&` | `BOOL`, `BOOL` | `BOOL` |
| 1 | `||` | `BOOL`, `BOOL` | `BOOL` |

Não existem conversões implícitas. Em particular, aritmética mista entre `I64` e `F64` é inválida, e strings não aceitam aritmética nem comparação ordenada.

Soma, subtração, multiplicação, divisão, resto e negação de `I64` são verificadas. Overflow, divisão por zero e resto por zero são erros de runtime. A divisão de `I64` trunca em direção a zero. Operações `F64` seguem o comportamento binary64 IEEE 754; portanto, a execução pode produzir resultados não finitos, embora literais no código-fonte devam ser finitos.

A igualdade aceita valores `NULL`, `BOOL`, `I64`, `F64` e `STRING` quando os dois operandos possuem o mesmo tipo. As regras de igualdade IEEE 754 se aplicam a `F64`, incluindo `NaN != NaN` e `-0.0 == 0.0`.

Os operandos são avaliados da esquerda para a direita. `&&` e `||` utilizam avaliação de curto-circuito: `false && direita` não avalia `direita`, e `true || direita` não avalia `direita`.

## Instruções

### `print`

`print` exige uma expressão `STRING` e escreve seu valor seguido por uma quebra de linha através do host de console.

```jimp
let message = "Olá, JIMP!";
print message;
```

### Declaração e atribuição

`let` e `var` declaram variáveis inicializadas. Uma atribuição substitui o valor atual de uma `var` existente.

### `if` e `else`

`if` exige uma expressão `BOOL` e um bloco entre chaves. Um bloco `else` opcional é executado quando a condição é falsa. Os blocos podem estar vazios ou aninhados.

```jimp
if score >= 70 {
  print "Aprovado";
} else {
  print "Não aprovado";
}
```

A chave de abertura deve terminar a linha lógica do `if` ou `else`. A chave de fechamento ocupa sua própria linha lógica, com exceção da forma `} else {`, que também é aceita. Blocos independentes e `else if` não são definidos no P2.

### Instrução de expressão

Qualquer expressão pode ser utilizada como instrução. Ela é avaliada e seu resultado é descartado.

## Gramática

A gramática utiliza EBNF no estilo ISO/IEC 14977. Espaços em branco léxicos podem aparecer ao redor de operadores e pontuação.

```ebnf
program          = { trivia-line | statement-line | if-statement } ;

trivia-line      = whitespace, [ comment ], whitespace, line-boundary ;
statement-line   = whitespace, simple-statement, whitespace, line-boundary ;
simple-statement = print-statement | variable-declaration
                   | variable-assignment | expression-statement ;

if-statement     = if-header, line-ending, block-body,
                   ( close-brace-line,
                     [ { trivia-line }, else-header, line-ending,
                       block-body, close-brace-line ]
                   | close-else-header, line-ending,
                     block-body, close-brace-line ) ;
if-header        = whitespace, "if", required-whitespace,
                   expression, whitespace, "{", whitespace ;
else-header      = whitespace, "else", whitespace, "{", whitespace ;
close-brace-line = whitespace, "}", whitespace, line-boundary ;
close-else-header = whitespace, "}", whitespace, "else",
                    whitespace, "{", whitespace ;
block-body       = { trivia-line | statement-line | if-statement } ;

comment          = "//", { comment-character } ;

print-statement  = "print", required-whitespace,
                   expression, whitespace, [ ";" ] ;

variable-declaration = ( "let" | "var" ), required-whitespace,
                       identifier, whitespace, "=", whitespace,
                       expression, whitespace, [ ";" ] ;

variable-assignment = identifier, whitespace, "=", whitespace,
                      expression, whitespace, [ ";" ] ;

expression-statement = expression, whitespace, [ ";" ] ;

expression       = logical-or-expression ;
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
unary-expression = { ( "!" | "-" ), whitespace }, primary-expression ;
primary-expression = value-literal | identifier
                     | "(", whitespace, expression, whitespace, ")" ;

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
whitespace       = { whitespace-character } ;
required-whitespace = whitespace-character, whitespace ;
comment-character = source-character - ( "\r" | "\n" ) ;
line-ending      = "\n" | "\r", "\n" ;
line-boundary    = line-ending | end-of-file ;
```

`ASCII-letter` significa `A` até `Z` ou `a` até `z`. `source-character` representa um caractere Unicode decodificado de UTF-8. `whitespace-character` é qualquer caractere de espaço em branco que não encerre linha e seja reconhecido pelo compilador. `end-of-file` é o limite terminal do código-fonte.

## Exemplos inválidos

```jimp
let missingInitializer;
let duplicate = 1;
let duplicate = 2;
duplicate = 3;
unknown + 1;
1 + true;
1 + 1.0;
"a" < "b";
print 42;
01;
.5;
9223372036854775808;
1e309;
if 1 {
}
if true
  print "sem chaves";
}
if true {
  let local = 1;
}
local;
var divergent = 1;
if true {
  divergent = "texto";
} else {
  divergent = false;
}
```

O compilador deve informar a linha lógica que contém sintaxe ou semântica inválida e não deve emitir bytecode.

## Fora do escopo

O JIMP ainda não define blocos independentes, `else if`, loops, desvios para trás, funções, módulos, imports no código-fonte ou uma biblioteca padrão geral.
