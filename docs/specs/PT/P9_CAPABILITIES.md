# Roadmap P9 de Integrações Assíncronas por Capacidades

[Versão em inglês](../EN/P9_CAPABILITIES.md)

## Status e pré-requisitos

Este documento é o roadmap de implementação aprovado para o P9. Ele não concede autoridade atual e ainda não adiciona `std:files` nem `std:http`. O P9 começa somente após o P8 entregar resultados tipados genéricos e `BYTES` imutável; qualquer modelo público recursivo de resposta também depende do contrato aprovado de valores recursivos do P8.

O P9 implementa o projeto de segurança estabelecido em [IO_CAPABILITIES.md](IO_CAPABILITIES.md). Nomes de APIs externas permanecem como dados do catálogo da biblioteca padrão e símbolos tipados da Host ABI. Arquivos, métodos HTTP, URLs, sockets, caminhos e handles de plataforma nunca se tornam palavras-chave, opcodes ou ponteiros confiáveis do bytecode.

## P9.1 — Modelo de task e future

Especificar e implementar um resultado assíncrono tipado, como `Task<T>` ou `Future<T>`, e a operação de fonte usada para aguardá-lo. O projeto deve definir autoridade de criação, espera única ou repetida, ownership, cache do resultado, representação de falhas, escopo léxico, interação com chamadas e loops e comportamento quando a execução de entrada termina com trabalho pendente.

Identificadores de tasks são locais à execução, não falsificáveis, não serializáveis, excluídos de constantes e payloads comuns da Host ABI e nunca são handles nativos observáveis. Instruções genéricas de agendamento somente podem ser adicionadas após aprovação de suas semânticas e regras de verificação independente.

## P9.2 — Scheduler determinístico e limitado

Implementar agendamento cooperativo com limites explícitos de tasks pendentes, eventos prontos, polls, bytes de resultados retidos, operações ativas do host, despertares e trabalho total do scheduler. A verificação do módulo termina antes que qualquer task seja iniciada. A ordem de agendamento e o comportamento de hosts falsos com a mesma entrada devem ser determinísticos quando a ordem de conclusão externa não estiver envolvida.

O runtime não deve bloquear uma instrução da VM em trabalho nativo sem limite. Integrações do host usam um protocolo revisado de iniciar/consultar/concluir ou equivalente que permita controle externo do runtime e não possa reentrar código arbitrário da VM.

## P9.3 — Cancelamento estruturado e timeouts

Especificar escopos de tasks, propagação de cancelamento, estados terminais, obrigações de limpeza e durações de timeout com unidade I64 e máximo exatos. O cancelamento deve ser idempotente. Uma task concluída, cancelada, expirada ou com falha não pode publicar outro resultado nem executar posteriormente outro efeito solicitado pelo módulo.

Cancelamento e timeout esperados são resultados tipados, não falhas do processo nem exceções da linguagem. O encerramento do runtime deve solicitar cancelamento e limitar a limpeza; ele não pode afirmar que código nativo não cooperativo foi interrompido sem uma fronteira externa de processo.

## P9.4 — Registro do host orientado por dados

Substituir a tabela fechada de capacidades do runtime de referência por uma interface versionada de embedding que registre símbolos, assinaturas exatas, classificações de efeitos, metadados de política de recursos e implementações como dados do host. O compilador e a VM não devem desviar por nomes de funções da biblioteca padrão.

Registro é separado de permissão. A resolução ainda exige disponibilidade, compatibilidade exata de assinatura, autorização explícita da política e compatibilidade com o perfil de destino antes da execução. Símbolos duplicados, versões de ABI não suportadas, metadados malformados e políticas incompatíveis falham antes de efeitos.

## P9.5 — `std:files` controlado por capacidades

Adicionar APIs tipadas de arquivos somente sobre `BYTES` imutável, resultados genéricos, tasks e capacidades de leitura/escrita autorizadas separadamente. O contrato deve definir raiz selecionada pelo embedder, sintaxe de caminho independente de plataforma na fronteira pública, contenção canônica após resolução de links simbólicos, separação de leitura/escrita, política de sobrescrita e escrita atômica, exposição de metadados, limites de requisição/resultado, cancelamento e limpeza.

A matriz de testes inclui leituras e escritas permitidas, além de negação, capacidade indisponível, caminho inválido, traversal, caminho absoluto, escape por link simbólico, substituição sensível a corrida, dados excessivos, timeout, cancelamento, falha do host e comportamento de escrita parcial. Os testes usam raízes temporárias isoladas e nunca dependem dos arquivos do desenvolvedor.

## P9.6 — `std:http` controlado por capacidades

Adicionar requisições e respostas HTTP tipadas sobre valores imutáveis e `BYTES`. O contrato deve definir esquemas e métodos suportados, headers normalizados, análise de URL, allowlists de destinos, política de DNS e rebinding, política de redirects, requisitos TLS, limites de requisição/resposta/headers, timeout, cancelamento, contabilização de descompressão, tratamento de status e isolamento de credenciais.

O runtime padrão não concede autoridade de rede. Os testes usam hosts falsos determinísticos ou fixtures locais isoladas e cobrem negação, capacidade indisponível, URL malformada, esquema ou destino proibido, falha da política de DNS, escape por redirect, entrada/saída excessiva, resposta malformada, timeout, cancelamento e falha do host.

## P9.7 — Harness determinístico de integração

Fornecer hosts falsos de relógio, arquivos, DNS e HTTP com conclusões e falhas roteirizadas. Fixtures de conformidade devem exercitar a ordem do scheduler e todos os estados obrigatórios de falha sem internet pública nem autoridade implícita sobre o sistema de arquivos. O harness deve comprovar que falha de resolução não causa efeitos e que o cancelamento impede efeitos posteriores.

## P9.8 — Gate de segurança e conformidade

Executar uma revisão dedicada do modelo de ameaças cobrindo traversal de caminhos, corridas de links simbólicos, SSRF, DNS rebinding, escapes por redirects, política TLS, injeção de headers, bombas de descompressão, vazamento de segredos, riscos de confused deputy, trabalho nativo sem limite, vazamento de tasks, corridas de cancelamento e desvios da contabilização de recursos.

O P9 somente está concluído quando operações assíncronas, cancelamento, registro orientado por dados, arquivos e HTTP passarem por especificações bilíngues, verificação independente do bytecode, testes determinísticos com hosts falsos, políticas que negam por padrão, testes de empacotamento/instalação e o gate completo multiplataforma.

## Exclusões intencionais

O P9 não adiciona sockets brutos, FFI arbitrária, subprocessos, acesso ao ambiente, relógios implícitos, caminhos irrestritos do sistema de arquivos, redirects irrestritos, carregamento dinâmico de código nem instalação de pacotes. Essas autoridades exigem capacidades separadas no catálogo e revisões de segurança.
