# AUREON — Definição Oficial do Projeto (v1)

## Visão Geral

**AUREON** é uma linguagem de programação compilada para um **bytecode portátil**, projetada para separar completamente o processo de **compilação** do processo de **execução**.

Sua arquitetura é baseada em dois componentes independentes:

- **Escritor (Compiler):** responsável por analisar, validar e transformar o código-fonte em bytecode.
- **Leitor (Runtime/VM):** responsável exclusivamente por interpretar e executar esse bytecode.

O runtime não possui conhecimento da linguagem de alto nível nem de conceitos como variáveis, funções, strings, JSON ou APIs específicas. Ele apenas executa um conjunto reduzido, padronizado e determinístico de instruções.

***

# Filosofia

O princípio fundamental do AUREON é:

> **O compilador é inteligente. O runtime é simples.**

Toda a complexidade da linguagem existe apenas durante a compilação.

Após compilado, resta apenas um programa em bytecode executável por qualquer implementação compatível da Máquina Virtual AUREON.

***

# Objetivos

O projeto possui os seguintes objetivos:

- Criar uma linguagem portátil.
- Possuir uma especificação aberta da linguagem, do bytecode e da máquina virtual.
- Permitir múltiplas implementações compatíveis da VM.
- Permitir múltiplos ambientes de execução.
- Manter o runtime extremamente pequeno e previsível.
- Facilitar a portabilidade para diferentes arquiteturas.
- Permitir execução em desktop, mobile, servidores e sistemas embarcados.
- Permitir execução em ambientes bare metal.
- Fornecer sandbox por padrão.
- Permitir integração com aplicações e engines através de uma Host ABI padronizada.

***

# Não é objetivo

O AUREON **não pretende**:

- Substituir JavaScript.
- Substituir C.
- Substituir Rust.
- Ser dependente do Node.js.
- Ser dependente de qualquer sistema operacional.
- Ser uma linguagem exclusiva para desenvolvimento de jogos.
- Ser dependente da Kismon Engine ou de qualquer outra engine.

***

# Arquitetura

```text
Código AUREON
      │
      ▼
Compilador Oficial (JavaScript)
      │
      ▼
Lexer
      │
      ▼
Parser
      │
      ▼
AST
      │
      ▼
Análise Semântica
      │
      ▼
IR
      │
      ▼
Otimizações
      │
      ▼
Bytecode (.abc)
      │
      ▼
Runtime AUREON
      │
      ▼
Host Environment
```

***

# Componentes

## 1. Linguagem

Define:

- Sintaxe
- Gramática
- Sistema de tipos
- Expressões
- Estruturas de controle
- Funções
- Módulos
- Regras semânticas

A linguagem não define como um programa é executado.

***

## 2. Bytecode

O Bytecode AUREON é um formato binário portátil.

Ele define:

- Instruções
- Operandos
- Constant Pool
- Imports
- Exports
- Metadados
- Informações de debug

O formato é completamente independente da plataforma.

***

## 3. Máquina Virtual

A Máquina Virtual é responsável apenas por:

- Carregar módulos.
- Validar bytecode.
- Manter registradores.
- Gerenciar memória.
- Gerenciar pilha.
- Executar instruções.
- Encaminhar chamadas ao Host.

A VM **não implementa APIs de alto nível**.

***

## 4. Host Environment

O Host fornece recursos externos ao programa.

Exemplos:

- Console
- Sistema de arquivos
- Rede
- Relógio
- Interface gráfica
- Hardware
- Engines

Cada ambiente implementa apenas os recursos que desejar oferecer.

***

# Organização do Projeto

```text
AUREON
├── Linguagem
├── Compilador
├── Bytecode
├── Máquina Virtual
├── Runtime
├── CLI
├── Biblioteca Padrão
└── Especificação
```

***

# Implementação Oficial

## Compilador

Implementado em:

```text
JavaScript
```

Responsável por:

- Lexer
- Parser
- AST
- Análise semântica
- IR
- Otimizações
- Geração de bytecode
- CLI

***

## Runtime

Implementado em:

```text
Rust
```

Responsável por:

- Decoder
- Verifier
- Máquina Virtual
- Scheduler
- Memória
- Execução

O runtime é um executável independente.

Ele não depende do Node.js.

***

# Comunicação

A comunicação entre compilador e runtime ocorre exclusivamente através do bytecode.

```text
Código Fonte
      │
      ▼
Compilador
      │
      ▼
programa.abc
      │
      ▼
Runtime
```

O bytecode é o único contrato entre ambos.

***

# Implementações Compatíveis

A especificação permite múltiplas implementações.

Exemplos:

- VM JavaScript
- VM Rust
- VM C
- VM Zig
- VM WebAssembly
- VM Bare Metal

Desde que respeitem a especificação oficial.

***

# Portabilidade

O mesmo bytecode poderá ser executado em qualquer ambiente que implemente a especificação.

Exemplos:

- Windows
- Linux
- macOS
- Android
- Termux
- Raspberry Pi
- ESP32 (implementação específica)
- Bare Metal

***

# Host ABI

Toda comunicação externa ocorre através da Host ABI.

Exemplo:

```text
std.console.write
std.console.read
std.time.sleep
std.time.now
std.filesystem.read
std.filesystem.write
std.network.request
```

A VM não conhece essas implementações.

Ela apenas solicita ao Host sua execução.

***

# Biblioteca Padrão

A biblioteca padrão é independente da VM.

Pode ser organizada em módulos:

```text
std.core
std.text
std.math
std.collections
std.console
std.time
std.filesystem
std.network
```

Nem todos os módulos precisam existir em todos os ambientes.

***

# Segurança

Antes da execução o runtime realiza:

- Validação estrutural.
- Validação de imports.
- Validação da versão do bytecode.
- Validação dos limites.
- Validação das instruções.

O objetivo é impedir a execução de bytecode inválido ou incompatível.

***

# Independência

O AUREON pode ser utilizado para:

- Aplicações CLI
- Automação
- Ferramentas
- Scripts
- Jogos
- Servidores
- Sistemas embarcados
- Projetos educacionais
- Ambientes experimentais

Sem depender de qualquer framework específico.

***

# Integrações

Projetos externos podem integrar o AUREON implementando um Host.

Exemplos:

```text
Host Node.js
Host Android
Host Linux
Host Windows
Host Bare Metal
Host Kismon Engine
Host Unreal Engine
Host Godot
```

Cada Host fornece suas próprias APIs.

***

# Relação com a Kismon Engine

A **Kismon Engine não faz parte do núcleo do AUREON**.

Ela poderá oferecer um Host próprio contendo bibliotecas específicas.

Exemplo:

```aureon
use kismon.entity
use kismon.physics
use kismon.audio
```

Esses módulos pertencem à integração da Kismon, e não ao AUREON.

***

# Distribuição

O projeto é distribuído em dois componentes principais.

## AUREON CLI

Responsável por:

- Compilar código
- Validar código
- Gerar bytecode
- Executar ferramentas auxiliares

## AUREON Runtime

Responsável por:

- Carregar bytecode
- Validar bytecode
- Executar programas

O CLI instala automaticamente o runtime quando necessário.

***

# Filosofia de Desenvolvimento

O núcleo do projeto prioriza:

- Simplicidade
- Modularidade
- Portabilidade
- Baixo acoplamento
- Especificação aberta
- Compatibilidade entre implementações
- Previsibilidade
- Facilidade de portar para novas plataformas

***

# Missão

> Criar uma linguagem de programação moderna baseada em bytecode portátil, com uma máquina virtual simples, especificação aberta e arquitetura desacoplada, permitindo que um mesmo programa seja executado em qualquer ambiente que implemente o Runtime AUREON e sua Host ABI, independentemente da linguagem utilizada para implementar esse runtime.

***

# Resumo da Arquitetura

```text
              Código AUREON
                    │
                    ▼
      Compilador Oficial (JavaScript)
                    │
                    ▼
            Bytecode Portátil (.abc)
                    │
     ┌──────────────┼──────────────┐
     ▼              ▼              ▼
 VM Rust        VM JavaScript    VM C
     │              │              │
     └──────────────┼──────────────┘
                    ▼
             Host Environment
                    │
     ┌──────────────┼──────────────┐
     ▼              ▼              ▼
 Linux        Android        Kismon Engine
```

