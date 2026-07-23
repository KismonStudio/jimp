# Sandbox de Referência JIMP v1

[Versão em inglês](../EN/SANDBOX.md)

> Este arquivo é gerado a partir de [`sandbox/v1.json`](../../../sandbox/v1.json). Não o edite manualmente.

Estes limites definem o perfil obrigatório de recursos implementado pelas ferramentas oficiais do compilador e pelo runtime Rust. Limites de carregamento e verificação são checados antes da execução. Limites de execução encerram o programa com erro e não revertem efeitos autorizados anteriores no host. A memória de valores do runtime é uma cobrança lógica portátil, não uma garantia sobre RSS do processo ou overhead do alocador. A fronteira de confiança, as garantias e as não garantias explícitas são definidas pelo [modelo de sandbox e segurança](SECURITY.md).

| Fase | Limite | Valor | Unidade | Significado |
| --- | --- | ---: | --- | --- |
| Carregamento | `MAX_MODULE_BYTES` | 16,777,216 | bytes | Tamanho máximo do arquivo .jbc codificado. |
| Carregamento | `MAX_SECTION_COUNT` | 16 | sections | Quantidade máxima de entradas no diretório do módulo. |
| Carregamento | `MAX_CONSTANTS` | 65,536 | constants | Quantidade máxima de entradas no pool de constantes. |
| Carregamento | `MAX_CONSTANT_STRING_BYTES` | 1,048,576 | bytes | Tamanho máximo em bytes UTF-8 de uma constante string. |
| Carregamento | `MAX_TOTAL_CONSTANT_STRING_BYTES` | 8,388,608 | bytes | Máximo de bytes UTF-8 combinados de todas as constantes string. |
| Carregamento | `MAX_SYMBOL_BYTES` | 256 | bytes | Tamanho máximo em bytes UTF-8 de um componente referenciado de símbolo de função ou host. |
| Carregamento | `MAX_HOST_IMPORTS` | 1,024 | imports | Quantidade máxima de imports tipados do host. |
| Carregamento | `MAX_FUNCTIONS` | 4,096 | functions | Quantidade máxima de funções, incluindo a entrada. |
| Carregamento | `MAX_PARAMETERS` | 256 | parameters | Quantidade máxima de parâmetros em uma assinatura de host ou função. |
| Verificação | `MAX_TYPE_PARAMETERS` | 16 | type parameters | Quantidade máxima de parâmetros de tipo genéricos em uma declaração. |
| Verificação | `MAX_TYPE_NESTING` | 64 | levels | Profundidade máxima de tipos-fonte genéricos e arrays aninhados. |
| Verificação | `MAX_NOMINAL_FIELDS` | 256 | fields | Quantidade máxima de campos em um record ou em uma alternativa de variant. |
| Verificação | `MAX_VARIANT_ALTERNATIVES` | 256 | alternatives | Quantidade máxima de alternativas em uma declaração variant. |
| Verificação | `MAX_MATCH_ARMS` | 256 | arms | Quantidade máxima de braços em uma expressão match. |
| Carregamento | `MAX_CODE_BYTES` | 8,388,608 | bytes | Tamanho máximo combinado do código codificado das funções. |
| Verificação | `MAX_TOTAL_INSTRUCTIONS` | 262,144 | instructions | Quantidade máxima de instruções decodificadas no módulo. |
| Verificação | `MAX_REGISTERS_PER_FUNCTION` | 4,096 | registers | Quantidade máxima de registradores virtuais em um frame de função. |
| Verificação | `MAX_VERIFICATION_TYPE_CELLS` | 4,194,304 | type cells | Máximo do produto entre instruções e registradores na análise de fluxo de uma função. |
| Execução | `MAX_CALL_FRAMES` | 1,024 | frames | Quantidade máxima de frames de chamada simultâneos, incluindo a entrada. |
| Execução | `MAX_ACTIVE_REGISTERS` | 262,144 | registers | Quantidade máxima de registradores virtuais em todos os frames ativos. |
| Execução | `REGISTER_SLOT_BYTES` | 16 | bytes | Memória lógica cobrada por registrador ativo, sem os bytes do conteúdo de strings. |
| Execução | `MAX_RUNTIME_VALUE_BYTES` | 33,554,432 | bytes | Máximo de bytes lógicos para registradores ativos e conteúdos de strings. |
| Execução | `MAX_HEAP_OBJECTS` | 4,096 | objects | Quantidade maxima de objetos imutaveis alocados durante uma execucao. |
| Verificação | `MAX_HEAP_SLOTS_PER_OBJECT` | 1,024 | slots | Quantidade maxima de slots em um objeto imutavel da heap. |
| Execução | `MAX_TOTAL_HEAP_SLOTS` | 65,536 | slots | Quantidade maxima cumulativa de slots alocados durante uma execucao. |
| Execução | `HEAP_OBJECT_HEADER_BYTES` | 16 | bytes | Memoria logica cobrada por objeto imutavel da heap. |
| Execução | `HEAP_SLOT_BYTES` | 16 | bytes | Memoria logica cobrada por slot da heap, sem os bytes do conteudo de strings. |
| Execução | `MAX_HEAP_BYTES` | 4,194,304 | bytes | Maximo cumulativo de bytes logicos alocados para objetos, slots e conteudos diretos de strings na heap. |
| Execução | `MAX_HEAP_DEPTH` | 128 | levels | Profundidade maxima de aninhamento de referencias imutaveis da heap. |
| Execução | `MAX_HEAP_EQUALITY_VISITS` | 65,536 | value pairs | Quantidade maxima de pares de valores examinados por uma operacao de igualdade estrutural da heap. |
| Execução | `MAX_JSON_INPUT_BYTES` | 1,048,576 | bytes | Quantidade maxima de entrada UTF-8 aceita por uma operacao de referencia de std:json. |
| Execução | `MAX_JSON_OUTPUT_BYTES` | 1,048,576 | bytes | Quantidade maxima de saida UTF-8 canonica produzida por uma operacao de referencia de std:json. |
| Execução | `MAX_JSON_DEPTH` | 128 | levels | Profundidade maxima de arrays e objetos aceita pela implementacao de referencia de std:json. |
| Execução | `MAX_JSON_VALUES` | 65,536 | values | Quantidade maxima de valores analisados por uma operacao de referencia de std:json. |
| Execução | `MAX_EXECUTION_STEPS` | 1,000,000 | instructions | Quantidade máxima de instruções executadas por um programa. |
