# Modelo de Sandbox e Segurança JIMP v1

[Versão em inglês](../EN/SECURITY.md)

## Status

Este documento especifica o contrato de segurança do runtime Rust oficial, o formato portátil `.jbc` `2.9` e o perfil `jimp-reference-sandbox` v1. Ele consolida as garantias definidas em [VM.md](VM.md), [HEAP.md](HEAP.md), os limites gerados em [SANDBOX.md](SANDBOX.md), o modelo de capacidades usado por [STDLIB.md](STDLIB.md) e as classes de falha de [ERRORS.md](ERRORS.md).

Os termos **deve**, **não deve**, **obrigatório** e **inválido** são normativos. Este é um contrato de sandbox no nível da VM, não uma declaração de isolamento do sistema operacional ou do processo.

## Escopo e fronteiras de confiança

O runtime oficial trata a sequência completa de bytes `.jbc` como não confiável, incluindo cabeçalho, diretório de seções, constantes, strings, imports, metadados de funções, instruções, fluxo de controle e mapeamentos de debug. Um módulo não se torna confiável por ter sido produzido pelo compilador oficial. As verificações do compilador melhoram diagnósticos e reprodutibilidade, mas o runtime Rust decodifica e verifica cada módulo de forma independente.

A base computacional confiável é composta por:

- o executável do runtime oficial e suas dependências;
- a implementação do host registrada no runtime;
- a política de capacidades selecionada pelo integrador;
- o sistema operacional e quaisquer controles externos de isolamento de processo.

Bytecode JIMP, projetos-fonte, metadados de compilação e metadados de debug ficam fora dessa base confiável. Um runtime, host, configuração de política, sistema operacional ou canal de distribuição comprometido está fora da proteção fornecida por este contrato.

## Modelo de ameaça

O sandbox foi projetado para rejeitar ou conter estes comportamentos controlados pelo módulo:

- estruturas de módulo malformadas, truncadas, sobrepostas, grandes demais ou incompatíveis;
- índices, intervalos de registradores, operandos, intervalos de funções ou destinos de desvio inválidos;
- confusão de tipos entre desvios, chamadas, retornos e invocações do host;
- fluxos de instruções inalcançáveis ou encerrados incorretamente;
- trabalho excessivo do verificador dentro das dimensões representadas pelo perfil de referência;
- loops, recursão, registradores ativos, memória lógica de valores, alocação de heap, aninhamento, trabalho de igualdade estrutural ou processamento/canonicalização de JSON sem limite;
- solicitações de capacidades do host indisponíveis, negadas ou com assinatura incompatível;
- tentativas de influenciar a execução por metadados de debug não autoritativos;
- tentativas de embutir endereços nativos ou invocar destinos FFI arbitrários.

O sandbox pressupõe que o runtime e o código autorizado do host obedecem a seus contratos. Ele não protege contra código nativo malicioso que já esteja em execução dentro do processo confiável.

## Fronteira entre validação e efeitos

O runtime oficial segue esta ordem:

1. Lê os metadados do arquivo e rejeita um módulo codificado maior que `MAX_MODULE_BYTES` antes de ler seu conteúdo.
2. Decodifica o contêiner completo e aplica os limites de carregamento.
3. Verifica todas as funções, instruções, caminhos de controle, tipos, assinaturas, regras de encerramento, mapeamentos de debug e orçamentos de verificação.
4. Resolve cada import do host contra a política exata de capacidades, a tabela de host disponível e a assinatura declarada, sem invocar a capacidade.
5. Cria o estado de execução e inicia a interpretação da representação verificada.
6. Invoca uma capacidade do host somente quando um `HOST_CALL` verificado é alcançado.

Nenhum efeito no host solicitado pelo módulo pode ocorrer antes da etapa 6. Portanto, uma falha de decodificação, verificação ou resolução não produz saída parcial solicitada pelo módulo nem outra ação no host. A leitura do arquivo de entrada, a alocação das estruturas internas do runtime e a escrita de diagnósticos são operações do runtime, não efeitos solicitados pelo módulo.

`--validate-portable` conclui as etapas 1 a 4 e nunca executa o bytecode.

## Garantias de segurança

| Propriedade | Comportamento aplicado | Fase da falha |
| --- | --- | --- |
| Integridade estrutural | Limites, sobreposição e cardinalidade de seções, codificações, índices e fronteiras de instruções são verificados antes da execução. | Decodificação |
| Integridade de tipos e fluxo de controle | Alcançabilidade, destinos de desvio, tipos de registradores sensíveis aos caminhos, chamadas, retornos e contratos de chamadas ao host são verificados para cada função. | Verificação |
| Confinamento de capacidades | Todo import deve ser exatamente permitido, estar disponível e possuir assinatura compatível antes da execução de qualquer instrução. | Resolução |
| Limites de recursos da VM | Limites de carregamento, verificação, frames, registradores, memória lógica de valores, heap, profundidade agregada, igualdade estrutural, entrada/saída/profundidade/valores JSON e passos usam o perfil selecionado. | Decodificação, verificação ou execução |
| Integridade dos argumentos do host | Valores em runtime são conferidos contra a assinatura do import resolvido imediatamente antes da invocação. | Execução |
| Debug não autoritativo | Metadados de debug podem enriquecer diagnósticos, mas não alteram decodificação, fluxo de controle, valores, autorização ou execução. | Decodificação ou verificação |
| Exclusão de ponteiros nativos | O bytecode contém imports simbólicos e operandos numéricos da VM, nunca endereços nativos considerados confiáveis. | Decodificação e resolução |

Um módulo válido pode manipular diretamente apenas valores escalares, valores opacos e imutáveis da heap, registradores virtuais, fluxo de controle e frames. Handles da heap não podem entrar em constantes nem em assinaturas da Host ABI e nunca são endereços nativos. O módulo não possui acesso implícito a arquivos, rede, variáveis de ambiente, relógios, aleatoriedade, processos ou memória nativa. Esse acesso existe somente quando uma capacidade do host explicitamente autorizada o fornece.

## Segurança das capacidades

Um import do host é uma solicitação, não uma permissão. Antes da execução, o resolvedor exige todas estas condições:

1. O símbolo canônico da capacidade está presente na lista exata de permissões do integrador.
2. O host registrou esse símbolo exatamente uma vez.
3. Os tipos dos parâmetros e do retorno correspondem exatamente à declaração do módulo.
4. A resolução pode ser concluída sem executar a operação externa solicitada.

A resolução substitui a pesquisa simbólica por um identificador numérico definido pela implementação. O bytecode não pode escolher esse identificador nem usá-lo como endereço nativo. O host valida novamente os valores dos argumentos em runtime quando o identificador é invocado.

O runtime oficial independente autoriza `std.console.write(STRING): VOID` e as capacidades puras e totais de suporte `std.json.validate`, `std.json.canonicalize` e `std.json.diagnostic`. O suporte JSON aceita somente valores STRING, aplica os limites JSON gerados e não realiza I/O externo. Essas capacidades não concedem autoridade sobre arquivos, rede, ambiente, relógio, aleatoriedade, processos nem FFI arbitrária.

A política de capacidades deve negar por padrão. Adicionar uma capacidade expande a autoridade do sandbox e exige uma revisão separada de validação de entrada, autorização, cotas de recursos, determinismo e efeitos colaterais.

## Contabilização de recursos

Os limites numéricos normativos ficam em [`sandbox/v1.json`](../../../sandbox/v1.json) e são publicados em [SANDBOX.md](SANDBOX.md). Suas funções de segurança são:

- **Limites de carregamento** restringem estruturas codificadas antes que grandes alocações dependentes sejam aceitas.
- **Limites de verificação** restringem o volume de instruções decodificadas, o estado de registradores por função e o estado da análise de tipos sensível aos caminhos.
- **Limites de execução** restringem trabalho interpretado, frames simultâneos, registradores ativos, bytes lógicos de valores, objetos cumulativos da heap, slots, bytes lógicos da heap, profundidade agregada, visitas da igualdade estrutural e entrada, saída, aninhamento e quantidade de valores JSON.

A memória lógica de valores contabiliza cada espaço de registrador ativo e o conteúdo UTF-8 das strings armazenadas nos registradores ativos. A heap contabiliza separadamente cada objeto imutável, slot, conteúdo direto de string e profundidade derivada, de modo cumulativo; uma atualização funcional não recupera a cobrança original durante a execução. Strings do pool de constantes usam limites separados de carregamento. A contabilização é determinística e portátil, mas não mede o overhead do alocador nem a memória residente do processo.

Cada instrução da VM consome um passo-base. `HEAP_EQUAL` cobra também um passo por par de valores examinado e é limitada por `MAX_HEAP_EQUALITY_VISITS`. O suporte JSON de referência é limitado separadamente por `MAX_JSON_INPUT_BYTES`, `MAX_JSON_OUTPUT_BYTES`, `MAX_JSON_DEPTH` e `MAX_JSON_VALUES`. Outros tempos, alocações, bytes escritos ou solicitações externas executadas dentro de uma capacidade autorizada não são contabilizados pelos orçamentos da VM. Hosts devem aplicar suas próprias cotas e regras de cancelamento.

## Semântica de falhas e efeitos

Falhas de decodificação e verificação rejeitam o módulo completo. Falhas de resolução o rejeitam antes da execução. Falhas de limite de execução, aritmética ou invocação do host encerram o programa pelo contrato padrão `jimp-error-v1`.

A execução não é transacional. Efeitos concluídos por chamadas autorizadas anteriores ao host não são revertidos quando uma instrução, limite ou chamada posterior falha. Um host não deve depender da VM para oferecer atomicidade, compensação ou entrega exatamente uma vez.

## Não garantias explícitas

O sandbox JIMP não fornece por si só:

- uma fronteira de segurança de processo, contêiner, usuário, locatário ou kernel do sistema operacional;
- um limite rígido de RSS do processo, overhead do alocador, tempo de CPU, tempo de parede, threads, descritores de arquivo ou alocações do host;
- uma cota para a saída padrão ou outros efeitos executados por uma capacidade autorizada;
- preempção, timeout, cancelamento ou reversão de uma invocação do host bloqueada ou demorada;
- confidencialidade ou integridade de arquivos de módulo, diagnósticos, argumentos do host ou dados externos;
- autenticação, assinatura, verificação de origem ou proteção contra adulteração do bytecode;
- proteção contra canais laterais de tempo, cache, volume de saída ou outros tipos;
- proteção contra defeitos no runtime, host, dependências, compilador, sistema operacional ou hardware;
- comportamento determinístico de capacidades externas, a menos que seus contratos individuais o exijam.

Implantações que executam código adversarial devem combinar este contrato da VM com um processo externo de baixo privilégio e controles do sistema operacional adequados ao seu modelo de ameaça.

## Requisitos para implementações do host

Um host compatível deve:

- expor somente capacidades explicitamente registradas, com nomes únicos e tipos definidos;
- manter a resolução de imports livre de efeitos solicitados pelo módulo;
- validar identificadores, quantidade e tipos dos argumentos e tipos de retorno;
- rejeitar identificadores desconhecidos e valores malformados sem executar uma operação não pretendida;
- nunca interpretar dados do bytecode como ponteiro bruto, endereço de função nativa ou destino FFI irrestrito;
- aplicar autorização, limites de tamanho, timeouts, restrições de caminhos ou rede e cotas de saída específicas para cada capacidade quando aplicável;
- relatar falhas recuperáveis pelo contrato de resultado do host em vez de encerrar intencionalmente o processo;
- documentar todo efeito observável externamente e comportamento não determinístico.

O host continua responsável pela segurança de sua implementação nativa mesmo quando a VM forneceu argumentos tipados válidos.

## Orientações de implantação

Para módulos não confiáveis, operadores devem executar o runtime com a menor lista possível de capacidades e uma identidade de sistema operacional com privilégio mínimo, restringir memória e CPU do processo externamente, limitar saída e I/O, isolar arquivos e credenciais sensíveis e validar o módulo com `--validate-portable` antes de agendar a execução. A validação é útil para controle de admissão, mas não autoriza uma execução posterior sob uma política de host diferente.

## Aceitação atual

O contrato está atualizado até o P7.7: a fronteira de confiança, o modelo de ameaças, a ordem de validação antes de efeitos, as regras de capacidades, os limites escalares, agregados e JSON determinísticos, a semântica de falhas, as obrigações do host e as não garantias explícitas estão documentados consistentemente em inglês e português. O P7.7 especifica pré-requisitos futuros de capacidades de arquivos/rede em [IO_CAPABILITIES.md](IO_CAPABILITIES.md), mas não concede essa autoridade.
