# VM Portátil JIMP v1

[English version](../EN/VM.md)

## Status

Este documento especifica a base implementada da VM portátil JIMP v1. Ela utiliza o formato de contêiner `.jbc` `2.0` para que os runtimes possam distingui-lo sem ambiguidade do formato protótipo `1`, que foi descontinuado.

O formato histórico em [BYTECODE.md](BYTECODE.md) continha um opcode temporário `PRINT` e não é mais gerado nem aceito. O formato `2.0` permanece pré-estável enquanto a linguagem e a VM continuam evoluindo.

Os termos **deve**, **não deve**, **obrigatório** e **inválido** são normativos.

## Princípios da arquitetura

- O compilador compreende os conceitos da linguagem de alto nível.
- A VM compreende apenas primitivas genéricas de execução.
- Comportamentos externos são fornecidos por imports nomeados e tipados do host.
- Um módulo `.jbc` não contém ponteiros nativos nem símbolos específicos de plataforma.
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

A representação em memória do runtime é definida pela implementação. Os valores observáveis e suas codificações no bytecode são portáteis. Todos os números com múltiplos bytes no `.jbc` usam little-endian.

Strings são imutáveis. Uma string carregada do pool de constantes pode ser compartilhada por uma implementação, mas seu conteúdo observável não deve mudar. Valores de coleção, objeto, buffer binário e referência de função estão fora da fundação inicial da v1.

## Registradores virtuais

Cada função declara um `register_count` codificado como inteiro sem sinal de 16 bits. Registradores são locais a uma invocação de função e são endereçados de `r0` até `r(register_count - 1)`.

- Índices válidos de registradores vão de `0` até `65534`.
- `0xffff` é reservado como `NO_REGISTER` nos operandos das instruções.
- Uma função pode declarar de zero até `65535` registradores.
- Todo registrador é inicializado com `null` quando seu frame é criado.
- Argumentos de função, quando funções se tornarem executáveis, ocupam registradores consecutivos iniciando em `r0`.
- Ler ou escrever um índice fora do intervalo declarado constitui bytecode inválido.
- Registradores contêm valores, nunca ponteiros do host ou endereços do bytecode.

A alocação de registradores é responsabilidade do compilador. Um runtime pode usar qualquer representação interna que preserve essa semântica.

## Contêiner do módulo

Um arquivo `.jbc` portátil consiste em um cabeçalho, um diretório de seções e os conteúdos das seções. O diretório permite validar e ignorar seções opcionais sem interpretar o código.

### Cabeçalho

| Campo | Codificação | Valor obrigatório |
| --- | --- | --- |
| magic | 4 bytes | ASCII `JIMP` |
| versão principal do formato | `u16` | `2` |
| versão secundária do formato | `u16` | `0` para esta arquitetura |
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

Os intervalos de código das funções devem estar completamente dentro da seção de código e não devem se sobrepor. O índice da função de entrada no cabeçalho deve existir. Na fundação inicial da v1, a função de entrada deve possuir zero parâmetros e retornar `void`.

As instruções de invocação de função são intencionalmente adiadas. O modelo da seção de funções é definido agora para que o contêiner não precise ser redesenhado quando `CALL` e `RETURN` forem introduzidos.

## Seção de código e modelo de instruções

A seção de código contém os fluxos de instruções das funções. Cada instrução começa com um opcode de um byte seguido pelos operandos definidos pela especificação da ISA legível por máquina.

- Opcodes são estáveis dentro de uma versão principal do formato.
- Inteiros nos operandos usam little-endian.
- Instruções não possuem alinhamento ou preenchimento implícito.
- Opcodes desconhecidos e operandos malformados são inválidos.
- Os limites das instruções devem ser derivados da definição da ISA, não estimados por varredura dos bytes.
- Um módulo não pode definir novas semânticas de opcode.

O conjunto inicial de instruções genéricas possui as seguintes operações semânticas. Os opcodes numéricos e as codificações dos operandos são definidos pela fonte [`isa/v1.json`](../../../isa/v1.json), legível por máquina, e resumidos na [referência da ISA](ISA.md) gerada.

### `LOAD_CONST destination, constant`

- `destination`: índice do registrador (`u16`).
- `constant`: índice no pool de constantes (`u32`).
- Copia o valor da constante imutável referenciada para o registrador de destino.

### `MOVE destination, source`

- `destination`: índice do registrador (`u16`).
- `source`: índice do registrador (`u16`).
- Copia o valor da origem para o registrador de destino.

### `HOST_CALL import, argument_start, argument_count, result`

- `import`: índice do import do host (`u32`).
- `argument_start`: primeiro registrador de argumento (`u16`).
- `argument_count`: quantidade de registradores de argumento consecutivos (`u16`).
- `result`: registrador de destino (`u16`) ou `NO_REGISTER`.

Os argumentos ocupam o intervalo consecutivo iniciado em `argument_start`. A quantidade e os tipos dos valores devem corresponder à assinatura declarada do import. Um import `void` exige `NO_REGISTER`; um import que retorna um valor exige um registrador de destino válido. O runtime deve verificar os tipos dos valores antes de invocar o host, mesmo quando a verificação estática já os tenha estabelecido.

### `HALT`

- Não possui operandos.
- Encerra a função de entrada e o programa com sucesso.
- Na fundação linear inicial, deve ser a última instrução da função de entrada.

`PRINT`, `FETCH`, `JSON`, `VAR` e `FUNCTION` não são instruções da VM. O compilador reduz as construções da linguagem a instruções genéricas e imports do host.

## Exemplo de redução

A instrução no código-fonte:

```jimp
print "Olá";
```

é representada conceitualmente como:

```text
constants:
  0: string "std.console"
  1: string "write"
  2: string "Olá\n"

imports:
  0: std.console.write(string) -> void

entry function:
  registers: 1
  LOAD_CONST r0, constant[2]
  HOST_CALL import[0], r0, 1, NO_REGISTER
  HALT
```

Um host de sistema operacional pode implementar o import com um terminal, enquanto um host bare metal pode implementá-lo com memória VGA ou framebuffer. O módulo `.jbc` permanece inalterado.

## Ordem de verificação e execução

Antes de executar qualquer instrução, um runtime deve:

1. Validar o cabeçalho e a versão.
2. Validar o diretório de seções, limites, cardinalidade e regras de sobreposição.
3. Decodificar e validar todas as constantes, imports, funções e instruções.
4. Validar todos os índices, intervalos de registradores, intervalos de funções, assinaturas e regras de encerramento.
5. Aplicar limites de recursos da implementação.
6. Resolver e autorizar todos os imports do host sem efeitos solicitados pelo programa.
7. Criar a representação interna verificada do programa.

Somente então a execução pode começar. Uma falha de validação estrutural não deve produzir efeitos no host solicitados pelo programa. Uma chamada ao host ainda pode falhar durante a execução; efeitos concluídos por chamadas válidas anteriores não são revertidos.

## Limites de recursos e segurança

Um runtime pode impor limites documentados inferiores aos máximos do formato, incluindo tamanho do módulo, quantidade de constantes, tamanho de strings, quantidade de imports, quantidade de funções, registradores por função, quantidade de instruções, memória e passos de execução. Os limites devem ser verificados antes de alocações inseguras ou da execução.

O módulo nunca deve conter endereços nativos considerados confiáveis. Dados de debug não são autoritativos e não devem afetar a execução. Hosts expõem capacidades explicitamente e permanecem responsáveis pela autorização da plataforma e pela política de sandbox.

## Decisões adiadas

Os seguintes itens exigem especificações posteriores: semântica aritmética, regras de comparação, desvios, chamadas e retornos, valores de heap, coleções, buffers binários, operações assíncronas do host, exceções, imports e exports de módulos, codificação de debug e execução AOT/JIT.
