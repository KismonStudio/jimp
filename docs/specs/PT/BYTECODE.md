# Formato Legado 1 do Bytecode JIMP

[English version](../EN/BYTECODE.md)

Este documento preserva o contrato histórico do bytecode protótipo implementado no JIMP 0.1.0.

O formato 1 não é mais gerado nem aceito. O contrato interoperável ativo é a [VM Portátil JIMP v1](VM.md), codificada como formato `.jbc` `2.1`.

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

## Validação antes da execução

Um runtime deve decodificar e validar o módulo completo antes de executar sua primeira instrução ou invocar qualquer capacidade do host. Uma falha de validação não deve produzir uma saída parcial do programa nem qualquer outro efeito no host solicitado pelo programa.
