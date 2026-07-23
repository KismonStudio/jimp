# Perfis de Destino AUREON v1

[Versão em inglês](../EN/TARGETS.md)

> Gerado de [`targets/v1.json`](../../../targets/v1.json).

Perfis de destino são contratos explícitos entre compilador e runtime. A substituição nativa da biblioteca padrão ocorre somente na vinculação; o runtime nunca realiza sondagem nem fallback dinâmico.

| Perfil | Capacidades opcionais garantidas | Contrato |
| --- | --- | --- |
| `portable` | — | Base portável sem capacidades nativas opcionais da biblioteca padrão. |
| `reference-native-i64` | `std.math.i64.absolute`, `std.math.i64.maximum`, `std.math.i64.minimum`, `std.math.i64.sign` | Perfil do runtime de referência com funções I64 nativas e semanticamente equivalentes. |
