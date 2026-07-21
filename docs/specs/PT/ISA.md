# VM Portátil JIMP v1 — Referência Gerada da ISA

[English version](../EN/ISA.md)

> Este arquivo é gerado a partir de [`isa/v1.json`](../../../isa/v1.json). Não o edite manualmente.

- Versão do formato: `2.2`
- Ordem dos bytes: `little-endian`
- Tamanho do opcode: `1 byte`
- `NO_REGISTER`: `65535` (`0xffff`)

## Tags dos tipos de valores

| Tag | Nome | Valor de runtime | Descrição |
| ---: | --- | --- | --- |
| `0` | `NULL` | sim | Ausência de valor. |
| `1` | `BOOL` | sim | Valor booleano falso ou verdadeiro. |
| `2` | `I64` | sim | Inteiro de 64 bits com sinal em complemento de dois. |
| `3` | `F64` | sim | Valor binary64 IEEE 754. |
| `4` | `STRING` | sim | String UTF-8 válida e imutável. |
| `255` | `VOID` | não | Marcador de assinatura para ausência de retorno. |

## Instruções

| Opcode | Nome | Operandos | Descrição |
| ---: | --- | --- | --- |
| `1` | `LOAD_CONST` | `destination: register (u16)`<br>`constant: constant_index (u32)` | Carrega uma constante imutável em um registrador virtual. |
| `2` | `MOVE` | `destination: register (u16)`<br>`source: register (u16)` | Copia um valor entre registradores virtuais. |
| `3` | `HOST_CALL` | `import: import_index (u32)`<br>`argument_start: register (u16)`<br>`argument_count: register_count (u16)`<br>`result: optional_register (u16)` | Invoca um import do host resolvido e tipado. |
| `10` | `NEGATE` | `destination: register (u16)`<br>`operand: register (u16)` | Nega um valor numérico tipado. |
| `11` | `ADD` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Soma dois valores numéricos tipados. |
| `12` | `SUBTRACT` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Subtrai dois valores numéricos tipados. |
| `13` | `MULTIPLY` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Multiplica dois valores numéricos tipados. |
| `14` | `DIVIDE` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Divide dois valores numéricos tipados. |
| `15` | `REMAINDER` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Calcula o resto de dois valores numéricos tipados. |
| `20` | `EQUAL` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Compara a igualdade entre dois valores do mesmo tipo. |
| `21` | `NOT_EQUAL` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Compara a desigualdade entre dois valores do mesmo tipo. |
| `22` | `LESS_THAN` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Testa se um valor numérico é menor que outro. |
| `23` | `LESS_EQUAL` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Testa se um valor numérico é menor ou igual a outro. |
| `24` | `GREATER_THAN` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Testa se um valor numérico é maior que outro. |
| `25` | `GREATER_EQUAL` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Testa se um valor numérico é maior ou igual a outro. |
| `30` | `BOOL_NOT` | `destination: register (u16)`<br>`operand: register (u16)` | Calcula a negação booleana. |
| `31` | `BOOL_AND` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Calcula a conjunção booleana com avaliação imediata. |
| `32` | `BOOL_OR` | `destination: register (u16)`<br>`left: register (u16)`<br>`right: register (u16)` | Calcula a disjunção booleana com avaliação imediata. |
| `40` | `JUMP` | `target: code_offset (u32)` | Continua a execucao em um offset de instrucao posterior na funcao atual. |
| `41` | `JUMP_IF_FALSE` | `condition: register (u16)`<br>`target: code_offset (u32)` | Desvia para frente quando uma condicao booleana e falsa. |
| `42` | `JUMP_IF_TRUE` | `condition: register (u16)`<br>`target: code_offset (u32)` | Desvia para frente quando uma condicao booleana e verdadeira. |
| `255` | `HALT` | — | Encerra a função de entrada com sucesso. |
