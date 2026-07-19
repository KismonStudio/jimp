# Sintaxe da Linguagem JIMP v1

[English version](../EN/LANGUAGE.md)

## Status

Este documento define a sintaxe e a semântica de expressões aceitas atualmente pelo compilador JIMP até o P2.3. A linguagem permanece pré-estável.

As palavras reservadas, a gramática, as regras de operadores e os exemplos são normativos. O texto explicativo é informativo, exceto quando utiliza **deve**, **não deve**, **obrigatório** ou **inválido**.

## Codificação e linhas

- Arquivos de código-fonte utilizam a extensão `.jimp` e codificação UTF-8.
- Terminações de linha LF e CRLF são aceitas.
- Cada linha lógica não vazia e que não seja comentário contém exatamente uma instrução completa.
- Espaços em branco no início e no final são ignorados.
- O ponto e vírgula no final de uma instrução é opcional.
- Um programa vazio é válido.

Comentários começam com `//` após espaços em branco opcionais e ocupam o restante da linha lógica. Comentários inline ainda não são aceitos. Marcadores de comentário dentro de strings são conteúdo comum.

## Palavras reservadas e identificadores

As palavras reservadas diferenciam maiúsculas de minúsculas:

```text
print true false null let var
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

As variáveis utilizam atualmente o escopo do programa. Nomes devem ser declarados antes do uso e não podem ser declarados mais de uma vez. As duas formas de declaração exigem inicializador:

```jimp
let immutableValue = 42;
var mutableValue = immutableValue + 1;
mutableValue = mutableValue * 2;
```

- `let` cria uma variável imutável que não pode receber nova atribuição.
- `var` cria uma variável mutável.
- Inicializadores e atribuições aceitam expressões.
- O tipo atual de uma variável mutável é acompanhado na ordem do código-fonte e pode mudar após uma atribuição durante a base pré-estável do P2.
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

Os operandos são avaliados da esquerda para a direita. `&&` e `||` são imediatos no P2.3: os dois operandos são avaliados. A avaliação com curto-circuito exige a base de desvios planejada para o P2.4.

## Instruções

### `print`

`print` exige uma expressão `STRING` e escreve seu valor seguido por uma quebra de linha através do host de console.

```jimp
let message = "Olá, JIMP!";
print message;
```

### Declaração e atribuição

`let` e `var` declaram variáveis inicializadas. Uma atribuição substitui o valor atual de uma `var` existente.

### Instrução de expressão

Qualquer expressão pode ser utilizada como instrução. Ela é avaliada e seu resultado é descartado.

## Gramática

A gramática utiliza EBNF no estilo ISO/IEC 14977. Espaços em branco léxicos podem aparecer ao redor de operadores e pontuação.

```ebnf
program          = { logical-line } ;

logical-line     = whitespace,
                   [ comment | print-statement | variable-declaration
                   | variable-assignment | expression-statement ],
                   whitespace,
                   ( line-ending | end-of-file ) ;

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
```

O compilador deve informar a linha lógica que contém sintaxe ou semântica inválida e não deve emitir bytecode.

## Fora do escopo

O JIMP ainda não define escopos léxicos de bloco, controle de fluxo condicional, avaliação booleana com curto-circuito, funções, módulos, imports no código-fonte ou uma biblioteca padrão geral.
