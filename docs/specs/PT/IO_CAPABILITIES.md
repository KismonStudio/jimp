# Projeto de Capacidades de Arquivos e Rede AUREON v1

[Versão em inglês](../EN/IO_CAPABILITIES.md)

## Status

Este é o contrato de projeto concluído do P7.7. Ele não concede autoridade ao runtime e não adiciona módulos `std:files` ou `std:http` ao catálogo. Sua implementação está planejada no [P8](P8_TYPES.md) para pré-requisitos de valores e no [P9](P9_CAPABILITIES.md) para agendamento assíncrono e APIs controladas por capacidades.

## Modelo obrigatório de valores e execução

- `BYTES` deve ser uma sequência imutável de bytes, contabilizada por recursos e distinta de STRING e `[I64]`.
- Operações externas devem retornar resultados tipados; negação, timeout, cancelamento, status, decodificação e tamanho esperados não podem virar exceções da linguagem.
- Trabalho assíncrono exige um modelo especificado de task/future com cancelamento estruturado. Bloquear uma instrução da VM em trabalho ilimitado do host é inválido.
- Tokens de cancelamento e handles de requisição são valores tipados, locais à execução e não falsificáveis. Nunca são ponteiros nativos, constantes, dados serializáveis do bytecode nem identidades comparáveis.
- Timeouts são durações I64 explícitas, com unidade e máximo documentados; nenhuma autoridade de relógio ambiente é implícita.

## Superfície de capacidades

Funções futuras podem ser catalogadas em `std:files` e `std:http`, enquanto a autoridade permanece em capacidades nomeadas separadamente, como `std.files.read`, `std.files.write` e `std.http.request`. Nomes como `FETCH`, caminhos, sockets, métodos e headers não viram opcodes nem palavras-chave.

Capacidades de arquivos exigem raiz escolhida pelo embedder, contenção canônica após resolução de links simbólicos, separação explícita de leitura e escrita, limites de bytes e política de escrita atômica. Capacidades de rede exigem listas permitidas de esquemas e destinos, política de redirecionamento, política de DNS/rebinding, limites de requisição, resposta e headers, timeout, cancelamento e política TLS.

## Matriz de falhas e testes

Uma implementação conforme deve testar sucesso permitido, negação, indisponibilidade, assinatura incompatível, entrada inválida, escape de caminho, destino proibido, timeout, cancelamento, requisição excessiva, resposta excessiva, resposta malformada e falha do host. Falhas de resolução ocorrem antes da execução. Falhas esperadas em runtime retornam dados tipados e não executam efeitos posteriores ao cancelamento. Hosts falsos e determinísticos devem cobrir testes sem acesso real a arquivos ou rede.

Hosts podem omitir todas as capacidades de arquivos e rede. A VM portátil, o compilador e a biblioteca padrão existente continuam utilizáveis sem elas.
