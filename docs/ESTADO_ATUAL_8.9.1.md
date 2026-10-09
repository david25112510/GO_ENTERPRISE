# Estado atual e continuidade — GO Enterprise 8.9.1

Registro de encerramento de 09/10/2026 para orientar futuras alterações.

## Versão publicada

- Versão: `8.9.1`
- Branch: `main`
- Commit da funcionalidade e versão: `b45804d9e39165c6de107a52c1c81aed082ad957`
- Repositório: `https://github.com/david25112510/GO_ENTERPRISE`
- Instalador: `GO-Enterprise-Setup-8.9.1.exe`
- SHA-256: `2961F115349C2A0C31AE197047B51B63DB881306CFFD2E1BE5B0F8070395F15F`
- Pasta de atualização: `D:\PDFs\DAVID\BANCO DE DADOS\atualizacoes`
- Manifesto publicado: `version.json` apontando para a versão `8.9.1`

O hash do instalador local e da cópia na pasta de atualização foi comparado e era idêntico no
encerramento. O `HEAD` local também foi comparado com `origin/main` e estava sincronizado.

## Entregas recentes

### Versão 8.9.0

- Novo módulo **OS de Desenvolvimento**, acessível ao gestor.
- Importação direta de `Planilha de Desenvolvimentos 2022-2026.ods`.
- Base inicial analisada: 3.707 linhas; números repetidos são preservados por identidade composta.
- Filtros, indicadores, gráficos, tabela paginada e exportação CSV.
- Resumo das OS de desenvolvimento na Visão Geral, respeitando `dashboardDate`.
- Persistência e mesclagem de `db.developmentOrders` entre computadores.

Commits: `d6b3426` (módulo) e `9299c3b` (versão 8.9.0).

### Versão 8.9.1

- Bloco **OS Desenvolvimento** no Dashboard TV.
- Indicadores: abertas no mês, entregues no mês, backlog vencido e entrega no prazo.
- Minigráfico com as aberturas dos últimos seis meses.
- Data da última importação da base.
- Nenhum dado individual de cliente ou analista é exibido na TV.

Commit: `b45804d`.

## Arquivos centrais para manutenção

- `renderer/app.html`: telas, estilos, importação ODS e cálculos dos dashboards.
- `src/dataStore.js`: normalização, persistência e mesclagem dos dados compartilhados.
- `main.js`: janelas Electron, modo TV, bandeja e integração com o atualizador.
- `src/updater.js`: leitura do manifesto e abertura do instalador.
- `package.json` e `package-lock.json`: versão e empacotamento.

Pontos de busca úteis em `renderer/app.html`: `developmentOrders`,
`renderDevelopmentOrdersHome`, `renderDevelopmentOrders`, `dashDevOs` e
`renderDashboardTvInner`.

## Fonte de dados e atualização

A planilha ODS é a fonte de verdade das OS de desenvolvimento. Uma nova importação substitui a
coleção `db.developmentOrders`; não existe edição manual dessas OS no aplicativo. O Dashboard TV lê
o mesmo banco compartilhado e atualiza os cálculos no ciclo normal de sincronização.

## Procedimento seguro para a próxima alteração

1. Confirmar que o Git está limpo e atualizar `main`.
2. Alterar e testar localmente sem publicar.
3. Para mudanças na TV, validar visualmente em resolução real antes do release.
4. Incrementar a versão em `package.json` e `package-lock.json`.
5. Gerar o instalador e conferir seu SHA-256.
6. Fazer commit e push para `origin/main`.
7. Copiar `.exe`, `.blockmap` e `version.json` para a pasta `atualizacoes`.
8. Comparar o hash local com o arquivo publicado e confirmar `HEAD == origin/main`.

## Cuidados conhecidos

- Limpar `ELECTRON_RUN_AS_NODE` antes de abrir o Electron normalmente.
- O disco `C:` desta máquina estava com pouco espaço no release 8.9.1. O NSIS falhou duas vezes com
  erro de `mmap`; o build terminou ao usar `TEMP`/`TMP` em `F:`. Ver também o item 12d de
  [HISTORICO_E_DECISOES.md](HISTORICO_E_DECISOES.md).
- Não versionar `renderer/master-secret.js` nem registrar segredos na documentação.
- Não remover a área segura em `vw`/`vh` do modo TV; ela compensa o overscan da televisão física.
- O dashboard principal foi deliberadamente mantido no design anterior. A alteração aprovada da
  v8.9.1 está restrita ao Dashboard TV.
