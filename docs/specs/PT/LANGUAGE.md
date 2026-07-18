# Sintaxe da Linguagem JIMP v1

[English version](../EN/LANGUAGE.md)

## Status

Este documento define a sintaxe aceita pelo compilador protótipo do JIMP v1. Ela é intencionalmente mínima e não especifica a futura linguagem principal.

As palavras-chave, a gramática e os exemplos deste documento são normativos. O texto explicativo é informativo, exceto quando utiliza os termos **deve**, **não deve**, **obrigatório** ou **inválido**.

## Codificação do código-fonte e linhas

- Um arquivo de código-fonte utiliza a extensão `.jimp` e deve ser codificado em UTF-8.
- Um programa consiste em zero ou mais linhas lógicas.
- São aceitas terminações de linha LF (`U+000A`) e CRLF (`U+000D U+000A`).
- Espaços em branco no início e no final de cada linha lógica são ignorados.
- Um programa vazio é válido e produz um programa contendo apenas a instrução de encerramento do bytecode.
- Cada linha lógica que não esteja vazia nem seja um comentário deve conter exatamente uma instrução completa.

## Elementos léxicos

O JIMP v1 possui uma palavra-chave case-sensitive:

```text
print
```

`PRINT`, `Print` e outras variações de maiúsculas e minúsculas não são palavras-chave.

Espaços em branco separam `print` de seu literal de string. Eles também podem aparecer antes da instrução, depois do literal e ao redor do ponto e vírgula opcional.

## Comentários

Um comentário começa com `//` após espaços em branco opcionais e continua até o final de sua linha lógica.

```jimp
// Isto é um comentário.
    // Espaços em branco no início são permitidos.
```

Comentários devem ocupar sua própria linha lógica. Comentários inline não são aceitos na v1:

```jimp
print "Olá"; // Inválido na v1.
```

Marcadores de comentário dentro de um literal de string são conteúdo comum da string.

## Literais de string

Um literal de string começa e termina com aspas duplas (`"`). Ele pode conter texto UTF-8, exceto aspas duplas sem escape, barras invertidas sem escape ou uma terminação de linha literal.

As seguintes sequências de escape são aceitas:

| Escape | Valor                           |
| ------ | ------------------------------- |
| `\\`   | Barra invertida                 |
| `\"`   | Aspas duplas                    |
| `\n`   | Quebra de linha (`U+000A`)      |
| `\r`   | Retorno de carro (`U+000D`)     |
| `\t`   | Tabulação horizontal (`U+0009`) |

Todas as demais sequências de escape são inválidas. Literais de string multilinha não são aceitos.

## Instruções

### `print`

A instrução `print` escreve o valor decodificado da string seguido por uma quebra de linha através do host de console.

```jimp
print "Olá, JIMP!";
print "O ponto e vírgula é opcional"
print "Escapes: \\"texto entre aspas\\" e uma quebra de linha\n";
```

É obrigatório haver ao menos um espaço em branco entre `print` e as aspas duplas iniciais.

## Gramática

A gramática utiliza EBNF no estilo ISO/IEC 14977. `source-character` representa um caractere Unicode decodificado do código-fonte UTF-8. `line-ending` e o final do arquivo delimitam linhas lógicas e são processados antes do reconhecimento das instruções.

```ebnf
program          = { logical-line } ;

logical-line     = whitespace,
                   [ comment | print-statement ],
                   whitespace,
                   ( line-ending | end-of-file ) ;

comment          = "//", { comment-character } ;

print-statement  = "print", required-whitespace,
                   string-literal, whitespace,
                   [ ";" ] ;

string-literal   = '"', { string-character | escape-sequence }, '"' ;

escape-sequence  = "\\", ( "\\" | '"' | "n" | "r" | "t" ) ;

whitespace       = { whitespace-character } ;
required-whitespace = whitespace-character, whitespace ;

string-character = source-character
                   - ( '"' | "\\" | "\r" | "\n" ) ;

comment-character = source-character - ( "\r" | "\n" ) ;
line-ending      = "\n" | "\r", "\n" ;
```

`whitespace-character` é qualquer caractere de espaço em branco que não seja uma terminação de linha e seja reconhecido pela implementação do compilador.

## Programas inválidos

As entradas a seguir são inválidas na v1:

```jimp
PRINT "Palavras-chave diferenciam maiúsculas e minúsculas";
print"O espaço em branco é obrigatório";
print "Aspas finais ausentes;
print "Escape não aceito: \u0041";
print "Um"; print "Dois";
let value = "Ainda não faz parte da v1";
```

O compilador deve informar a linha lógica que contém a sintaxe inválida e não deve emitir bytecode para esse arquivo-fonte.

## Fora do escopo

O JIMP v1 ainda não define identificadores, variáveis, valores numéricos ou booleanos, expressões, blocos, controle de fluxo, funções, módulos, imports ou uma Host ABI geral. Esses recursos exigem especificações separadas antes de serem implementados.
