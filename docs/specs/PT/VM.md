# VM Portátil AUREON v1

[Versão em inglês](../EN/VM.md)

## Status

Este documento especifica a VM portátil AUREON v1 implementada até o P7.6. O formato `2.9` preserva a heap imutável, validada independentemente e limitada por recursos, e adiciona operações genéricas de comprimento, leitura indexada, recorte semiaberto e concatenação de STRING por valores escalares Unicode.

O formato histórico em [BYTECODE.md](BYTECODE.md) continha um opcode temporário `PRINT` e não é mais gerado nem aceito. O formato `2.9` permanece pré-estável enquanto a linguagem e a VM continuam evoluindo.

Os termos **deve**, **não deve**, **obrigatório** e **inválido** são normativos.

## Princípios da arquitetura

- O compilador compreende os conceitos da linguagem de alto nível.
- A VM compreende apenas primitivas genéricas de execução.
- Comportamentos externos são fornecidos por imports nomeados e tipados do host.
- Um módulo `.abc` não contém ponteiros nativos nem símbolos específicos de plataforma.
- O módulo completo é verificado antes da execução ou de efeitos no host.
- O mesmo módulo válido possui o mesmo significado estrutural em todo runtime compatível.

## Modelo de valores escalares

A VM portátil v1 define os seguintes tipos de valores escalares:

| Tipo | Tag do tipo | Significado |
| --- | ---: | --- |
| `null` | `0` | Ausência de valor |
| `bool` | `1` | `false` ou `true` |
| `i64` | `2` | Inteiro de 64 bits com sinal em complemento de dois |
| `f64` | `3` | Padrão de bits binary64 IEEE 754 |
| `string` | `4` | Sequência imutável de bytes UTF-8 válidos |
| `void` | `255` | Marcador usado apenas em assinaturas para ausência de retorno |

`void` não é um valor de runtime e não deve ser armazenado em um registrador nem em uma entrada do pool de constantes. Não existem conversões implícitas entre tipos de valores.

A representação em memória do runtime é definida pela implementação. Os valores observáveis e suas codificações no bytecode são portáteis. Todos os números com múltiplos bytes no `.abc` usam little-endian.

Strings são imutáveis. Uma string carregada do pool de constantes pode ser compartilhada por uma implementação, mas seu conteúdo observável não deve mudar. Valores de coleção, objeto, buffer binário e referência de função estão fora da fundação inicial da v1.

## Registradores virtuais

Cada função declara um `register_count` codificado como inteiro sem sinal de 16 bits. Registradores são locais a uma invocação de função e são endereçados de `r0` até `r(register_count - 1)`.

- Índices válidos de registradores vão de `0` até `65534`.
- `0xffff` é reservado como `NO_REGISTER` nos operandos das instruções.
- Uma função pode declarar de zero até `65535` registradores.
- Todo registrador é inicializado com `null` quando seu frame é criado.
- Argumentos de função ocupam registradores consecutivos iniciando em `r0` em cada novo frame de chamada.
- Ler ou escrever um índice fora do intervalo declarado constitui bytecode inválido.
- Registradores contêm valores, nunca ponteiros do host ou endereços do bytecode.

A alocação de registradores é responsabilidade do compilador. Um runtime pode usar qualquer representação interna que preserve essa semântica.

## Contêiner do módulo

Um arquivo `.abc` portátil consiste em um cabeçalho, um diretório de seções e os conteúdos das seções. O diretório permite validar e ignorar seções opcionais sem interpretar o código.

### Cabeçalho

| Campo | Codificação | Valor obrigatório |
| --- | --- | --- |
| magic | 4 bytes | ASCII `AURN` |
| versão principal do formato | `u16` | `2` |
| versão secundária do formato | `u16` | `9` |
| flags do módulo | `u32` | `0`; demais bits são reservados |
| função de entrada | `u32` | Índice na seção de funções |
| quantidade de seções | `u16` | Quantidade de entradas do diretório |
| reservado | `u16` | `0` |

O cabeçalho é seguido imediatamente por `quantidade de seções` entradas do diretório.

### Entrada do diretório de seções

| Campo | Codificação | Significado |
| --- | --- | --- |
| tipo | `u16` | Identificador do tipo da seção |
| flags | `u16` | Flags de comportamento da seção |
| offset | `u32` | Offset absoluto em bytes a partir do início do arquivo |
| tamanho | `u32` | Tamanho do conteúdo da seção em bytes |

O bit `0` das flags da seção significa `OPTIONAL`. Todos os demais bits são reservados e devem ser zero. Um runtime pode ignorar uma seção desconhecida somente quando `OPTIONAL` estiver definido; ele deve rejeitar uma seção obrigatória desconhecida.

As seções devem estar completamente dentro do arquivo, não devem sobrepor o cabeçalho, o diretório ou outra seção e podem aparecer em qualquer ordem física. Alinhamento não é implícito e não faz parte de uma seção, exceto quando incluído em seu tamanho declarado.

### Tipos de seção

| Tipo | Identificador | Cardinalidade |
| --- | ---: | --- |
| constantes | `1` | Exatamente uma, obrigatória |
| imports do host | `2` | Exatamente uma, obrigatória; pode conter zero entradas |
| funções | `3` | Exatamente uma, obrigatória |
| código | `4` | Exatamente uma, obrigatória |
| debug | `5` | Zero ou uma, opcional |
| metadados de compilação | `6` | Zero ou uma, opcional |

Seções únicas duplicadas são inválidas.

## Seção de constantes

A seção de constantes começa com uma quantidade de entradas codificada como `u32`, seguida por essa quantidade de entradas. Cada entrada começa com uma tag de tipo de um byte e possui o seguinte conteúdo:

| Tipo | Conteúdo |
| --- | --- |
| `null` | Sem conteúdo |
| `bool` | Um byte: `0` para falso ou `1` para verdadeiro |
| `i64` | Valor de oito bytes em complemento de dois |
| `f64` | Padrão de bits binary64 IEEE 754 com oito bytes |
| `string` | Tamanho em bytes UTF-8 como `u32`, seguido por essa quantidade de bytes |

Outros valores booleanos, strings UTF-8 inválidas, tags desconhecidas, entradas incompletas e dados residuais na seção são inválidos. Constantes duplicadas são permitidas e possuem índices distintos.

## Seção de imports do host

A seção de imports do host começa com uma quantidade de imports codificada como `u32`. Cada import declara:

| Campo | Codificação | Significado |
| --- | --- | --- |
| namespace | `u32` | Índice de uma constante string, como `std.console` |
| nome | `u32` | Índice de uma constante string, como `write` |
| quantidade de parâmetros | `u16` | Quantidade de tags de tipo dos parâmetros |
| tipo de retorno | `u8` | Tag de tipo escalar ou `void` |
| flags | `u8` | `0` para imports síncronos da v1 |
| tipos dos parâmetros | array de bytes | Uma tag de tipo escalar por parâmetro |

O nome canônico do import é `namespace.nome`, por exemplo `std.console.write`. As constantes de namespace e nome devem ser strings não vazias. `null` e `void` são tipos de parâmetro inválidos; `void` é permitido apenas como tipo de retorno.

Todos os imports devem ser resolvidos, ter suas assinaturas verificadas e ser autorizados pela política do host antes do início da execução. A resolução produz um handle numérico definido pela implementação, de modo que a execução das instruções não precise pesquisar strings. A resolução de imports não deve realizar por si mesma um efeito externo solicitado pelo programa.

Endereços nativos brutos e chamadas FFI arbitrárias são proibidos. Um host pode rejeitar um módulo válido quando uma capacidade obrigatória estiver indisponível ou não for autorizada.

## Seção de funções

A seção de funções começa com uma quantidade de funções codificada como `u32`. Cada entrada de função declara:

| Campo | Codificação | Significado |
| --- | --- | --- |
| nome | `u32` | Índice de constante string ou `0xffffffff` para função anônima |
| offset do código | `u32` | Offset relativo ao início da seção de código |
| tamanho do código | `u32` | Tamanho da função em bytes |
| quantidade de registradores | `u16` | Tamanho do frame de registradores da função |
| quantidade de parâmetros | `u16` | Quantidade de tags de tipo dos parâmetros |
| tipo de retorno | `u8` | Tag de tipo escalar ou `void` |
| flags | `u8` | Reservado; deve ser `0` |
| reservado | `u16` | Deve ser `0` |
| tipos dos parâmetros | array de bytes | Uma tag de tipo escalar por parâmetro |

Os intervalos de código das funções devem estar completamente dentro da seção de código e não devem se sobrepor. O índice da função de entrada no cabeçalho deve existir, possuir zero parâmetros, retornar `void` e terminar fisicamente com `HALT`. Todas as outras funções terminam fisicamente com `RETURN`. `HALT` é inválido fora da função de entrada, `RETURN` é inválido dentro dela e o bytecode não pode chamar a função de entrada.

## Seção de código e modelo de instruções

A seção de código contém os fluxos de instruções das funções. Cada instrução começa com um opcode de um byte seguido pelos operandos definidos pela especificação da ISA legível por máquina.

- Opcodes são estáveis dentro de uma versão principal do formato.
- Inteiros nos operandos usam little-endian.
- Instruções não possuem alinhamento ou preenchimento implícito.
- Opcodes desconhecidos e operandos malformados são inválidos.
- Os limites das instruções devem ser derivados da definição da ISA, não estimados por varredura dos bytes.
- Um módulo não pode definir novas semânticas de opcode.

## Seção de debug

A seção de debug relaciona offsets de instruções codificadas aos IDs portáteis dos módulos-fonte e às linhas do código-fonte. Sua entrada no diretório deve definir a flag `OPTIONAL`. Um módulo válido no formato `2.9` pode omitir essa seção sem alterar a semântica da execução.

| Campo | Codificação | Significado |
| --- | --- | --- |
| versão do debug | `u16` | `2` |
| flags do debug | `u16` | `0`; demais bits são reservados |
| quantidade de fontes | `u32` | Quantidade de IDs de módulos-fonte seguintes |
| quantidade de mapeamentos | `u32` | Quantidade de mapeamentos seguintes |
| tamanho do fonte em bytes | `u32` | Tamanho UTF-8 de um ID portátil de módulo |
| bytes do fonte | array de bytes | ID portátil não vazio do módulo |
| offset do código | `u32` | Campo do mapeamento: offset relativo à seção completa de código |
| índice do fonte | `u32` | Campo do mapeamento: índice da tabela de fontes, ou `0xffffffff` quando indisponível |
| linha do código-fonte | `u32` | Campo do mapeamento: linha iniciada em um |

A tabela de fontes precede os mapeamentos. Os IDs de fonte devem ser únicos, UTF-8 válidos, não vazios e não podem exceder o limite de símbolos do sandbox. Cada mapeamento contém um `offset do código`, um `índice do fonte` e uma `linha do código-fonte`. Os offsets devem estar em ordem estritamente crescente e referenciar limites de instruções decodificadas. Os índices devem referenciar a tabela ou usar `0xffffffff`. Quantidades acima do limite de instruções do sandbox, linhas zero, offsets ou fontes duplicados, dados incompletos e dados residuais tornam a seção inválida. Mapeamentos podem ser omitidos para instruções individuais.

Os metadados de debug não são autoritativos: eles não devem alterar a decodificação, a verificação, o fluxo de controle, os valores, a autorização do host nem qualquer outro comportamento da execução. O runtime oficial usa um mapeamento válido da instrução atual ao relatar uma falha de execução; sem mapeamento, a mesma falha é relatada sem localização no código-fonte.

## Seção de metadados de compilação

A seção opcional de metadados de compilação registra a versão de metadados `1`, flags zero, a versão principal selecionada da biblioteca padrão (`u16`), um campo reservado zero, o nome do perfil de destino, o ID portátil do módulo de entrada e uma lista ordenada e sem duplicatas das capacidades garantidas pelo destino. Cada string é codificada com um tamanho `u32` seguido por bytes UTF-8 não vazios e limitada por `MAX_SYMBOL_BYTES`; a quantidade de capacidades é limitada por `MAX_HOST_IMPORTS`.

Essa seção é descritiva, não concede autoridade. Um runtime que selecione um destino não portátil deve receber esse destino explicitamente, exigir correspondência exata com os metadados, verificar de forma independente o perfil e as assinaturas do host e então aplicar sua própria política de capacidades. Ele nunca deve conceder uma capacidade apenas porque os metadados do bytecode a nomeiam. Módulos sem metadados de compilação são compatíveis somente com a base portátil.

O conjunto inicial de instruções genéricas possui as seguintes operações semânticas. Os opcodes numéricos e as codificações dos operandos são definidos pela fonte [`isa/v1.json`](../../../isa/v1.json), legível por máquina, e resumidos na [referência da ISA](ISA.md) gerada.

### `LOAD_CONST destination, constant`

- `destination`: índice do registrador (`u16`).
- `constant`: índice no pool de constantes (`u32`).
- Copia o valor da constante imutável referenciada para o registrador de destino.

### `MOVE destination, source`

- `destination`: índice do registrador (`u16`).
- `source`: índice do registrador (`u16`).
- Copia o valor da origem para o registrador de destino.

### Operações unárias tipadas

`NEGATE` e `BOOL_NOT` utilizam os operandos de registrador `destination, operand`. `NEGATE` aceita `I64` ou `F64` e preserva o tipo do operando. `BOOL_NOT` aceita `BOOL` e produz `BOOL`. Negar o menor `I64` é um erro de overflow em runtime.

### Aritmética binária tipada

`ADD`, `SUBTRACT`, `MULTIPLY`, `DIVIDE` e `REMAINDER` utilizam os operandos de registrador `destination, left, right`. As duas entradas devem possuir o mesmo tipo numérico, e o resultado possui esse tipo. A aritmética `I64` é verificada; overflow, divisão por zero e resto por zero são erros de runtime. A divisão `I64` trunca em direção a zero. A aritmética `F64` segue o comportamento binary64 IEEE 754.

### Operações genéricas de STRING

`STRING_LENGTH destination, value` aceita STRING e produz I64. `STRING_LOAD destination, value, index` aceita STRING e I64 e produz uma STRING de um valor escalar. `STRING_SLICE destination, value, start, end` aceita STRING e dois limites I64 e produz um intervalo semiaberto de STRING. Essas operações contam valores escalares Unicode, nunca bytes UTF-8; índices negativos ou fora dos limites e intervalos inválidos falham deterministicamente. `STRING_CONCAT destination, left, right` aceita duas STRING e produz STRING. Todos os resultados permanecem sujeitos aos limites de memória lógica de valores e de passos de execução.

### Comparações tipadas

`EQUAL` e `NOT_EQUAL` aceitam dois valores de runtime do mesmo tipo e produzem `BOOL`. `LESS_THAN`, `LESS_EQUAL`, `GREATER_THAN` e `GREATER_EQUAL` aceitam dois valores do mesmo tipo numérico e produzem `BOOL`.

### Operações booleanas tipadas

`BOOL_AND` e `BOOL_OR` aceitam dois operandos `BOOL` e produzem `BOOL`. Elas permanecem operações imediatas no bytecode. O compilador reduz `&&` e `||` do código-fonte a desvios condicionais, de modo que o operando direito seja avaliado somente quando necessário.

### Controle de fluxo

`JUMP target` continua a execução em `target`. `JUMP_IF_FALSE condition, target` e `JUMP_IF_TRUE condition, target` selecionam entre `target` e a instrução seguinte de acordo com um registrador `BOOL`.

- `target` é um offset de bytes `u32` sem sinal, relativo ao início da função atual.
- Um destino deve identificar o primeiro byte de uma instrução na mesma função.
- Um destino pode estar antes ou depois da instrução de desvio, permitindo loops.
- Toda instrução codificada deve ser alcançável a partir da entrada da função.
- Os tipos de registradores exigidos por uma instrução devem ser válidos em todos os caminhos de controle de fluxo recebidos.

O verificador calcula um ponto fixo entre todos os caminhos de entrada. Arestas de retorno não podem contornar verificações de tipo nem tornar uma instrução codificada inalcançável.

### `CALL function, argument_start, argument_count, result`

- `function`: índice na tabela de funções (`u32`), exceto a função de entrada.
- `argument_start`: primeiro registrador de argumento no chamador (`u16`).
- `argument_count`: quantidade de registradores consecutivos do chamador (`u16`).
- `result`: registrador de destino no chamador (`u16`) ou `NO_REGISTER`.

A quantidade e os tipos dos argumentos devem corresponder exatamente à assinatura da função chamada. Uma chamada cria um frame isolado com a quantidade declarada de registradores, inicializa todos com `null` e copia os argumentos para registradores consecutivos iniciando em `r0`. Uma função `void` exige `NO_REGISTER`; uma função que retorna valor exige um registrador de destino válido. Chamadas podem ser recursivas.

### `RETURN result`

`result` é um registrador (`u16`) ou `NO_REGISTER`. Uma função `void` deve retornar `NO_REGISTER`. Uma função que retorna valor deve retornar um registrador cujo tipo corresponda exatamente à sua assinatura. O retorno remove o frame atual, escreve o valor retornado no destino declarado pelo chamador quando aplicável e retoma o chamador após seu `CALL`.

### `HOST_CALL import, argument_start, argument_count, result`

- `import`: índice do import do host (`u32`).
- `argument_start`: primeiro registrador de argumento (`u16`).
- `argument_count`: quantidade de registradores de argumento consecutivos (`u16`).
- `result`: registrador de destino (`u16`) ou `NO_REGISTER`.

Os argumentos ocupam o intervalo consecutivo iniciado em `argument_start`. A quantidade e os tipos dos valores devem corresponder à assinatura declarada do import. Um import `void` exige `NO_REGISTER`; um import que retorna um valor exige um registrador de destino válido. O runtime deve verificar os tipos dos valores antes de invocar o host, mesmo quando a verificação estática já os tenha estabelecido.

### `HALT`

- Não possui operandos.
- Encerra a função de entrada e o programa com sucesso.
- Deve ser a última instrução codificada da função de entrada e deve ser alcançável.

`PRINT`, `FETCH`, `JSON`, `VAR` e `FUNCTION` não são instruções da VM. O compilador reduz as construções da linguagem a instruções genéricas e imports do host.

## Exemplo de redução

A instrução no código-fonte:

```aureon
print "Olá";
```

é representada conceitualmente como:

```text
constants:
  0: string "std.console"
  1: string "write"
  2: string "Olá"
  3: string "\n"

imports:
  0: std.console.write(string) -> void

entry function:
  registers: 1
  LOAD_CONST r0, constant[2]
  HOST_CALL import[0], r0, 1, NO_REGISTER
  LOAD_CONST r0, constant[3]
  HOST_CALL import[0], r0, 1, NO_REGISTER
  HALT
```

Um host de sistema operacional pode implementar o import com um terminal, enquanto um host bare metal pode implementá-lo com memória VGA ou framebuffer. O módulo `.abc` permanece inalterado.

## Ordem de verificação e execução

Antes de executar qualquer instrução, um runtime deve:

1. Validar o cabeçalho e a versão.
2. Validar o diretório de seções, limites, cardinalidade e regras de sobreposição.
3. Decodificar e validar todas as constantes, imports, funções e instruções.
4. Validar todos os índices, intervalos de registradores, intervalos de funções, destinos de desvio, alcançabilidade, tipos de registradores sensíveis aos caminhos, assinaturas e regras de encerramento.
5. Aplicar limites de recursos da implementação.
6. Resolver e autorizar todos os imports do host sem efeitos solicitados pelo programa.
7. Criar a representação interna verificada do programa.

Somente então a execução pode começar. Uma falha de validação estrutural não deve produzir efeitos no host solicitados pelo programa. Uma chamada ao host ainda pode falhar durante a execução; efeitos concluídos por chamadas válidas anteriores não são revertidos.

A decodificação de instruções estabelece primeiro a estrutura de opcodes, operandos, registradores, índices e destinos de desvio. Em seguida, a validação de tipos propaga os tipos dos registradores pelo grafo de controle de fluxo verificado e exige que o contrato de cada instrução seja válido em todos os caminhos recebidos. A ordem física das instruções, isoladamente, não deve determinar o tipo inferido na entrada de um desvio.

## Limites de recursos e segurança

Os limites oficiais são gerados a partir de [`sandbox/v1.json`](../../../sandbox/v1.json) e publicados no [Sandbox de Referência AUREON v1](SANDBOX.md). O encoder e o verificador JavaScript e o decoder e o verificador Rust aplicam os mesmos limites de carregamento e verificação. A CLI verifica o tamanho do arquivo codificado antes de lê-lo.

A execução acompanha passos, frames de chamada, registradores ativos e memória lógica de valores do runtime. A memória lógica de valores equivale a `16` bytes por registrador ativo mais os bytes UTF-8 do conteúdo de cada string armazenada nesses registradores. O armazenamento do pool de constantes é limitado separadamente. Um frame é cobrado antes da alocação de seu array de registradores ou da cópia das strings dos argumentos. Substituir ou retornar um valor atualiza a cobrança, e argumentos do host são emprestados sem uma cópia feita pela VM.

Ultrapassar um limite de carregamento ou verificação rejeita o módulo completo antes da execução e de efeitos no host. Ultrapassar um limite de execução encerra o programa com erro; efeitos concluídos por chamadas autorizadas anteriores ao host não são revertidos. Limites lógicos são portáteis e determinísticos, mas não descrevem o overhead do alocador da implementação nem o RSS total do processo.

As falhas são expostas por meio do [Formato Padrão de Erros AUREON v1](ERRORS.md). Falhas de decodificação, verificação, resolução de imports do host e execução possuem códigos estáveis distintos. O texto do diagnóstico é um detalhe de implementação e pode melhorar sem alterar o código do erro.

O módulo nunca deve conter endereços nativos considerados confiáveis. Metadados de debug e compilação não são autoritativos e não devem conceder capacidades nem alterar a autorização. Hosts expõem capacidades explicitamente e permanecem responsáveis pela autorização da plataforma e pela política de sandbox. O modelo completo de ameaça, a fronteira de confiança, as obrigações do host e as não garantias explícitas são especificados no [Modelo de Sandbox e Segurança AUREON v1](SECURITY.md).

## Decisões adiadas

Os seguintes itens exigem especificações posteriores: valores de heap, coleções, buffers binários, operações assíncronas do host, exceções, imports e exports de módulos em runtime, localizações de debug por coluna e execução AOT/JIT.
