# JIMP Bytecode v1

[English version](../EN/BYTECODE.md)

Este documento define o contrato inicial interoperável do bytecode do JIMP.

Todos os inteiros com mais de um byte são representados como **unsigned little-endian**. Um programa começa com um cabeçalho de dez bytes:

| Campo             | Tamanho | Valor                            |
| ----------------- | ------: | -------------------------------- |
| magic             | 4 bytes | ASCII `JIMP`                     |
| version           | 2 bytes | `1`                              |
| instruction count | 4 bytes | número de instruções codificadas |

As instruções vêm imediatamente após o cabeçalho. A última instrução deve ser `HALT`, e nenhum byte pode existir após ela.

| Opcode | Nome    | Codificação                                         | Comportamento                                                                |
| -----: | ------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
|    `1` | `PRINT` | opcode, tamanho do texto UTF-8 (`u16`), bytes UTF-8 | Escreve o texto seguido por uma quebra de linha por meio do host de console. |
|  `255` | `HALT`  | opcode                                              | Encerra a execução com sucesso.                                              |

Os runtimes devem rejeitar cabeçalhos malformados, versões não suportadas, opcodes não suportados, operandos incompletos, sequências UTF-8 inválidas, ausência da instrução `HALT` e quaisquer dados adicionais após a última instrução.
