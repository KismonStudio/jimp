# Formato Padrão de Erros AUREON v1

[Versão em inglês](../EN/ERRORS.md)

> Este arquivo é gerado a partir de [`errors/v1.json`](../../../errors/v1.json). Não o edite manualmente.

As ferramentas do compilador e os runtimes relatam falhas usando código, fase, mensagem e localização opcional. A saída legível é o padrão. A opção `--error-format=json` emite um objeto JSON em uma linha na saída de erro. O texto do diagnóstico não é uma fronteira de compatibilidade; `schema`, `code` e `phase` são.

## Contrato

`schema`, `code`, `phase` e `message` são obrigatórios. `location` é opcional. Consumidores devem ignorar campos desconhecidos para permitir a adição posterior de metadados compatíveis.

## Saída legível

`AUREON error AUREON-1001 (compile) at source line 3: Identificador value não definido.`

## Saída JSON

```json
{"schema":"aureon-error-v1","code":"AUREON-1001","phase":"compile","message":"Identificador value não definido.","location":{"kind":"source","line":3}}
```

## Localizações

`location` é omitido quando indisponível. Localizações de fonte usam `{"kind":"source","line":N}` e podem incluir um `moduleId` portátil quando ele é conhecido pelo frontend. Localizações de bytecode usam `{"kind":"bytecode","offset":N}`. Linhas começam em um; offsets de bytecode começam em zero. Localizações de fonte do runtime são preenchidas pela seção opcional de debug do `.abc`.

## Códigos

| Código | Fase | Saída CLI | Significado |
| --- | --- | ---: | --- |
| `AUREON-0001` | `usage` | 2 | Os argumentos da linha de comando são inválidos ou estão incompletos. |
| `AUREON-0002` | `io` | 1 | Não foi possível ler, inspecionar ou gravar um arquivo necessário. |
| `AUREON-1001` | `compile` | 1 | Falha na análise sintática, análise semântica ou geração de bytecode. |
| `AUREON-2001` | `decode` | 1 | O módulo .abc codificado está malformado ou não é compatível. |
| `AUREON-2002` | `verify` | 1 | O módulo decodificado viola uma regra estrutural, de tipo ou de fluxo de controle. |
| `AUREON-3001` | `resolve` | 1 | Um import do host está indisponível, incompatível ou negado pela política. |
| `AUREON-4001` | `execute` | 1 | A execução ou uma chamada ao host falhou. |
| `AUREON-9001` | `internal` | 1 | A ferramenta encontrou uma falha interna inesperada. |
