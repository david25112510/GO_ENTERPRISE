# Documentação — GO Enterprise

Índice da documentação técnica do GO Enterprise, o sistema de gestão operacional da Selbetti para o
contrato Correios MG. Este índice existe para orientar consultas e correções futuras — tanto para o
David quanto para qualquer pessoa ou agente trabalhando neste projeto.

Documentação revisada em **04/11/2026**, referente à versão **8.10.1**, publicada em 04/11/2026.

## Como o projeto está organizado

```
GO_ENTERPRISE/
  package.json          ← versão do app + config do electron-builder (empacotamento Windows)
  main.js                ← processo principal do Electron (janelas, menu, bandeja, IPC)
  preload.js               ← ponte segura renderer ↔ sistema de arquivos (contextBridge)
  src/
    dataStore.js            ← leitura/escrita/observação/mesclagem do banco na pasta compartilhada
    settingsStore.js         ← configurações locais deste PC (settings.json)
    mediaStore.js            ← arquivos de mídia do SELBNEWS na pasta compartilhada
    updater.js                ← checagem e instalação de novas versões
  renderer/
    app.html                  ← A APLICAÇÃO INTEIRA (todas as telas, lógica, cálculos) — um único
                                 arquivo HTML/CSS/JS (a maior parte do peso
                                 são imagens embutidas em base64: logo, mascote, fotos de manuais)
    master-secret.js           ← segredo local NÃO versionado (senha mestre) — ver docs/SEGURANCA_E_ACESSO.md
  build/
    icon.ico, icon.png, tray.png  ← ícones do instalador/bandeja
  docs/                        ← esta documentação
  tests/jornada-he.cjs          ← regressões de Jornada/HE; executar com npm test
```

`renderer/app.html` é o coração do sistema: uma SPA sem framework (sem React/Vue/build step), com
CSS e JS inline, organizada internamente em seções numeradas por comentários — procure por
`===================== N. NOME =====================` dentro do arquivo para navegar rápido. Essa
numeração é referenciada nos documentos abaixo.

## Onde procurar cada assunto

| Preciso entender... | Ver |
|---|---|
| Como os processos Electron se encaixam, o que cada arquivo faz | [ARQUITETURA.md](ARQUITETURA.md) |
| O formato dos dados (`db.employees`, `db.finance`, etc.) | [MODELO_DE_DADOS.md](MODELO_DE_DADOS.md) |
| O que cada tela faz, quem pode acessar, quais funções cuidam dela | [TELAS_E_FUNCIONALIDADES.md](TELAS_E_FUNCIONALIDADES.md) |
| PIN, senha mestre, papéis de acesso (gestor/operador/TV), criptografia | [SEGURANCA_E_ACESSO.md](SEGURANCA_E_ACESSO.md) |
| Como os dados são salvos e sincronizados entre computadores | [SINCRONIZACAO_E_PERSISTENCIA.md](SINCRONIZACAO_E_PERSISTENCIA.md) |
| Como gerar o instalador e publicar uma atualização | [BUILD_E_RELEASE.md](BUILD_E_RELEASE.md) |
| Como editar Jornada/HE, importar ponto e usar o gráfico | [JORNADA_HE_EDICAO.md](JORNADA_HE_EDICAO.md) |
| Estado publicado, commits, validação e pendências | [ESTADO_ATUAL_8.10.1.md](ESTADO_ATUAL_8.10.1.md) |
| Notas e hash do instalador 8.10.1 | [RELEASE_8.10.1.md](RELEASE_8.10.1.md) |
| Falhas encontradas e limites da verificação | [VERIFICACAO_2026-10-20.md](VERIFICACAO_2026-10-20.md) |
| Decisões de design não óbvias, bugs corrigidos e por quê, armadilhas conhecidas | [HISTORICO_E_DECISOES.md](HISTORICO_E_DECISOES.md) |

O `README.md` na raiz do projeto continua existindo com uma visão geral mais curta, voltada a quem
está configurando o app pela primeira vez (instalação, pasta compartilhada, TV). Esta pasta `docs/`
é o nível "manutenção e evolução do código".

## Fatos rápidos (versão 8.10.1)

- **Stack:** Electron 30 + electron-builder 24, sem framework de UI, sem bundler/transpiler.
- **Banco de dados:** um único arquivo JSON (`gestao_operacional.json`) dentro de uma pasta
  sincronizada por nuvem (OneDrive/Drive/Dropbox) escolhida pelo usuário — não é um servidor/banco
  relacional. Ver [SINCRONIZACAO_E_PERSISTENCIA.md](SINCRONIZACAO_E_PERSISTENCIA.md).
- **Distribuição:** instalador NSIS gerado localmente (`npm run dist`) e publicado manualmente na
  mesma pasta compartilhada, numa subpasta `atualizacoes/`. Sem servidor de update próprio.
- **Papéis de acesso:** `gestor` (acesso total), `operador` (painel próprio + produção), `tv`
  (somente Dashboard TV/Notícias, tela de kiosk).
- **Dashboard TV:** o painel operacional é uma tela única; no kiosk, alterna com SELBNEWS
  (dois minutos de Dashboard e 40 segundos de SELBNEWS) — ver
  [TELAS_E_FUNCIONALIDADES.md](TELAS_E_FUNCIONALIDADES.md) e o item 12 de
  [HISTORICO_E_DECISOES.md](HISTORICO_E_DECISOES.md).
- **Estado de continuidade:** a fotografia técnica da versão publicada, artefatos, commits e próximos
  cuidados está em [ESTADO_ATUAL_8.10.1.md](ESTADO_ATUAL_8.10.1.md). O documento da 8.9.1 é histórico.
- **Repositório Git:** github.com/david25112510/GO_ENTERPRISE — alterna entre privado/público
  conforme pedido do David; o segredo de bootstrap (`renderer/master-secret.js`) nunca é commitado.
