# VM Portátil JIMP v1 — Referência Gerada da ISA

[English version](../EN/ISA.md)

> Este arquivo é gerado a partir de [`isa/v1.json`](../../../isa/v1.json). Não o edite manualmente.

- Versão do formato: `2.0`
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
| `255` | `HALT` | — | Encerra a função de entrada com sucesso. |
