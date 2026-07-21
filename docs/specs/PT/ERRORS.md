# Formato Padrão de Erros JIMP v1

[Versão em inglês](../EN/ERRORS.md)

> Este arquivo é gerado a partir de [`errors/v1.json`](../../../errors/v1.json). Não o edite manualmente.

As ferramentas do compilador e os runtimes relatam falhas usando código, fase, mensagem e localização opcional. A saída legível é o padrão. A opção `--error-format=json` emite um objeto JSON em uma linha na saída de erro. O texto do diagnóstico não é uma fronteira de compatibilidade; `schema`, `code` e `phase` são.

## Contrato

`schema`, `code`, `phase` e `message` são obrigatórios. `location` é opcional. Consumidores devem ignorar campos desconhecidos para permitir a adição posterior de metadados compatíveis.

## Saída legível

`JIMP error JIMP-1001 (compile) at source line 3: Identificador value não definido.`

## Saída JSON

```json
{"schema":"jimp-error-v1","code":"JIMP-1001","phase":"compile","message":"Identificador value não definido.","location":{"kind":"source","line":3}}
```

## Localizações

`location` é omitido quando indisponível. Localizações de fonte usam `{"kind":"source","line":N}` e podem incluir um `moduleId` portátil quando ele é conhecido pelo frontend. Localizações de bytecode usam `{"kind":"bytecode","offset":N}`. Linhas começam em um; offsets de bytecode começam em zero. Localizações de fonte do runtime são preenchidas pela seção opcional de debug do `.jbc`.

## Códigos

| Código | Fase | Saída CLI | Significado |
| --- | --- | ---: | --- |
| `JIMP-0001` | `usage` | 2 | Os argumentos da linha de comando são inválidos ou estão incompletos. |
| `JIMP-0002` | `io` | 1 | Não foi possível ler, inspecionar ou gravar um arquivo necessário. |
| `JIMP-1001` | `compile` | 1 | Falha na análise sintática, análise semântica ou geração de bytecode. |
| `JIMP-2001` | `decode` | 1 | O módulo .jbc codificado está malformado ou não é compatível. |
| `JIMP-2002` | `verify` | 1 | O módulo decodificado viola uma regra estrutural, de tipo ou de fluxo de controle. |
| `JIMP-3001` | `resolve` | 1 | Um import do host está indisponível, incompatível ou negado pela política. |
| `JIMP-4001` | `execute` | 1 | A execução ou uma chamada ao host falhou. |
| `JIMP-9001` | `internal` | 1 | A ferramenta encontrou uma falha interna inesperada. |
