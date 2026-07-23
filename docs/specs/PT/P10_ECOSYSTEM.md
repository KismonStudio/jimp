# Roadmap P10 de Pacotes e Extensões do Host

[Versão em inglês](../EN/P10_ECOSYSTEM.md)

## Status e objetivos

Este documento é o roadmap de implementação aprovado para o P10. Ele define trabalhos futuros de pacotes, dependências, cache, publicação e extensões do host; nenhuma dessas facilidades está implementada ou é confiável atualmente.

O P10 torna projetos AUREON reutilizáveis e reproduzíveis sem introduzir carregamento de módulos em runtime, downloads ocultos, scripts de instalação ou hardcoding do compilador para APIs de terceiros. Dependências-fonte continuam resolvidas estaticamente e vinculadas em bytecode autocontido. Extensões do host permanecem explicitamente instaladas, versionadas, registradas e autorizadas fora do módulo.

## P10.1 — Manifesto do projeto e identidade do pacote

Especificar um manifesto canônico de projeto com nome e versão do pacote, módulo de entrada, faixa suportada de AUREON/toolchain, major da biblioteca padrão, requisitos de destino, dependências e metadados opcionais. O formato do arquivo, regras de normalização, política de campos desconhecidos, codificação de caminhos e serialização determinística devem ser documentados antes da escolha de nome de arquivo ou parser.

Nomes e versões de pacotes usam uma única sintaxe canônica. IDs de módulos locais, IDs de pacotes e símbolos de capacidades do host permanecem namespaces distintos. Um manifesto não pode conceder capacidade nem sobrescrever a política do runtime.

## P10.2 — Resolver determinístico de dependências

Implementar resolução determinística para identidades exatas de pacotes, com verificações explícitas de conflitos, ciclos, identidade duplicada, alias de caixa, traversal de caminhos, escape por link simbólico e mutação de fontes. A resolução nunca executa código da dependência nem pesquisa diretórios pais implícitos por um pacote não declarado.

A primeira entrega suporta workspaces e dependências explícitas por caminho local. Fontes Git e registry são tarefas posteriores e devem reutilizar o mesmo grafo resolvido e imutável e as regras de linking qualificadas por módulo.

## P10.3 — Lockfile e modelo de integridade

Especificar um lockfile canônico que registre cada versão resolvida, fonte, digest do conteúdo, arestas de dependência, perfil selecionado da biblioteca padrão, perfil de destino e compatibilidade relevante do toolchain. Builds com lockfile devem rejeitar conteúdo divergente em vez de atualizá-lo silenciosamente.

O lockfile é uma entrada descritiva para reprodutibilidade, não autoridade do runtime. Ele não pode conceder capacidades da Host ABI, relaxar o sandbox nem tornar código nativo não confiável seguro.

## P10.4 — Cache endereçado por conteúdo e builds offline

Implementar um cache de pacotes endereçado por conteúdo com preenchimento atômico, verificação de digest antes do uso, recuperação de corrupção, segurança entre processos concorrentes, política de tamanho limitado e coleta de lixo explícita. O modo offline não realiza requisição de rede e funciona somente quando todos os artefatos travados estiverem presentes e válidos.

O compilador lê snapshots imutáveis e verificados. Caminhos e timestamps do cache não afetam a identidade do módulo nem o bytecode emitido. Nenhum pacote pode executar script de pós-instalação, build ou ciclo de vida durante a resolução.

## P10.5 — Distribuição por Git e registry

Adicionar dependências por revisão Git imutável antes de projetar um registry público. Branches e tags mutáveis devem ser resolvidos para um commit travado. A obtenção pela rede usa a própria política de transporte do toolchain, revisada separadamente, com limites de tamanho, timeouts, redirects, requisitos TLS e verificação de digest.

O projeto de registry deve especificar ownership de namespaces, imutabilidade de versões, formato de artefato, checksums, assinatura e proveniência opcionais, remoção lógica sem mutação, separação de autenticação, rate limits, comportamento de mirrors, defesas contra dependency confusion e recuperação de credenciais comprometidas. Publicação nunca é obrigatória para construir pacotes locais.

## P10.6 — SDK versionado de extensões do host

Publicar um SDK restrito para embedders registrarem capacidades tipadas pela interface orientada por dados do P9. O SDK deve versionar a ABI de registro, tipos de valores suportados, ciclo de vida assíncrono, cancelamento, mapeamento de erros, declarações de política de recursos, requisitos de thread safety e handshake de compatibilidade.

Instalar um pacote-fonte nunca instala nem ativa uma extensão nativa do host. Extensões nativas são componentes controlados pelo operador fora do `.abc`, exigem implantação explícita e autorização por política e devem suportar isolamento fora do processo quando viável. Ponteiros arbitrários, chamadas FFI irrestritas e bibliotecas dinâmicas selecionadas pelo módulo continuam proibidos.

## P10.7 — Fluxos da CLI e política de publicação

Especificar comandos públicos para validação do manifesto, adição/remoção de dependências, geração do lockfile, instalação/obtenção determinística, verificação offline, empacotamento, inspeção de integridade e publicação. Os comandos devem oferecer diagnósticos humanos e legíveis por máquina estáveis, CI não interativo, simulação quando mudanças de estado forem materiais e nenhuma exibição implícita de credenciais.

Armazenamento de credenciais, seleção do registry, proxies, certificados e overrides de ambiente exigem precedência explícita e regras de redação. A publicação exige revisão do conteúdo do pacote, exclui segredos e saídas de build por padrão e nunca sobrescreve uma versão imutável existente.

## P10.8 — Conformidade do ecossistema e gate de release

Fornecer registries de fixture, repositórios Git locais, casos de cache corrompido, dependency confusion, grafos cíclicos e conflitantes, builds offline, comparações de reprodutibilidade, testes de pacote/instalação, fixtures de compatibilidade do SDK e testes de capacidade negada. Testes públicos não devem depender de registry ativo nem rede pública.

O P10 somente está concluído quando duas máquinas suportadas e limpas conseguirem resolver o mesmo projeto travado em bytecode vinculado idêntico, rebuilds offline forem verificados, entradas comprometidas ou alteradas falharem de forma fechada e capacidades de terceiros permanecerem indisponíveis até instalação e autorização separadas.

## Invariantes de segurança e exclusões

- Resolução de dependências e compilação não executam scripts fornecidos por pacotes.
- Pacotes-fonte não podem conceder autoridade ao host nem selecionar implementações nativas por conta própria.
- Lockfiles e assinaturas estabelecem identidade ou integridade, não confiança nem permissão.
- Dados de cache e registry não são confiáveis até passarem por limites, estrutura e verificação de digest.
- Carregamento dinâmico de módulos em runtime, plugins nativos arbitrários selecionados pelo bytecode, upgrades automáticos de dependências e caminho global implícito de busca de pacotes permanecem fora do escopo.
