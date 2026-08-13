# Telas e funcionalidades

Cada tela é uma `<section class="view" id="...">` dentro de `renderer/app.html`, mostrada/escondida
por `switchView(v)` (alterna a classe `.active`). A visibilidade dos botões do menu lateral (`#mainNav`)
é decidida em JS por `NAV_VIEWS_BY_ROLE` — ver [SEGURANCA_E_ACESSO.md](SEGURANCA_E_ACESSO.md) para a
tabela completa de quem vê o quê.

Toda tela tem uma função `renderX()` (seção **9. RENDER**) chamada por `render()` a cada mudança de
dado — não há re-render seletivo, `render()` sempre recalcula tudo que está visível.

## Visão Geral (`id="home"`, papel: gestor) — `renderHome()`

Cockpit executivo: cards de desempenho, alertas centralizados (`alertsPanel`), banco de horas da
equipe, gráfico de impressões diárias do mês, metas, projeção de fechamento do mês, leitura executiva
automática (texto gerado a partir dos números), e a tabela de produção diária consolidada.

- **Banco de horas da equipe** (`teamHourBank`) — lista todos os colaboradores com `hourBank`
  definido, ordenados pelo saldo absoluto. É aqui que fica o botão **"Importar planilha de banco de
  horas"** (`importHourBank()`) — ver [MODELO_DE_DADOS.md](MODELO_DE_DADOS.md#dbemployees--colaboradores)
  e [HISTORICO_E_DECISOES.md](HISTORICO_E_DECISOES.md).
- **Projeção/metas** — `donutCard()`/`projItem()`, comparam realizado × meta × ritmo esperado até a
  data selecionada (`dashboardDate`).

## Meu Painel (`id="operadorHome"`, papel: operador) — `renderOperadorHome(prods)`

Tela inicial de quem loga como operador (matrícula, sem PIN — ver
[SEGURANCA_E_ACESSO.md](SEGURANCA_E_ACESSO.md)). Substitui a Visão Geral para esse papel
(`applyRoleUI()` força `switchView('operadorHome')` no login).

- **Cabeçalho de saudação** — foto do colaborador (ou iniciais, `initials()`), "Olá, `<primeiro
  nome>`!" e uma frase com o tempo de casa calculado a partir de `employee.admission`
  (`tenureLabel()`).
- **Avisos** (`opAlertsList`) — sempre inclui um lembrete fixo de Feedz/PDI, mais alertas dinâmicos:
  banco de horas não informado/desatualizado, férias a agendar, SLA da equipe abaixo da meta.
- **Meu banco de horas** (`opHourBank`) — somente leitura; o operador **não importa mais nada aqui**
  (o botão de importar folha de ponto foi removido desta tela — só a gestão importa a planilha da
  equipe, em Visão Geral).
- Produção da equipe (sem faturamento — cards e valores financeiros ficam escondidos pra este papel).

## Produção (`id="producao"`) — `renderProducao(prods)`

Indicadores calculados **inteiramente a partir de `db.sla`** (as Ordens de Serviço importadas) — não
há um cadastro manual de produção. Puxa por competência (`productionMonth`): impressões, objetos, SLA
da competência, faturamento produzido (`prints × config.printValue`, escondido do operador via classe
`.finance-only`), meta e atingimento, gráfico diário, melhor/pior dia, tabela de OS importadas.

- **Importar planilha de produção/SLA** (`importSLA()`, `.gestor-only`) — único ponto de entrada de
  dados de produção no sistema. Formato esperado: colunas "Número da OS", "Status da OS", "Data/Hora
  de Recebimento", "Data/Hora da Entrega", "Sla de Produção", "Qtde. de Objetos", "Total de
  Impressões", etc. (ver `importSLA()` para a lista exata de nomes de coluna aceitos). Reimportar a
  mesma OS atualiza o registro em vez de duplicar (chave = Número da OS).

## Financeiro (`id="financeiro"`, papel: gestor) — `renderFinanceiro()`

- **Cards**: Receita, Gastos, Resultado, Margem — vêm de `financeTotals(month)` (seção 8). **Receita =
  faturamento produzido** (produção × valor por impressão); **Gastos = só `db.expenses`** (gastos por
  fornecedor). `db.finance` (registros financeiros) é só uma lista de lembretes de cobrança/vencimento
  e não entra nesta conta — ver [HISTORICO_E_DECISOES.md](HISTORICO_E_DECISOES.md) pro histórico dessa
  decisão.
- **+ Registro financeiro** / **+ Lançar gasto** / **+ Perda de papel** — os três modais de lançamento.
  Todo campo numérico usa `type="text" inputmode="decimal"` + `numVal()` (aceita vírgula).
- **Perda de papel por competência** — um registro por mês (ver `db.losses` no modelo de dados);
  "+ Perda de papel" abre um modal que permite lançar pesagens avulsas e informar as resmas pagas do
  mês; a fórmula completa está em `lossMetrics()`.

## Colaboradores / RH (`id="rh"`) — `renderRH()`, `renderRosterHTML()`

Rótulo do botão do menu muda conforme o papel (`applyRoleUI()`): "👥 Colaboradores" para gestor,
"👤 Meu Perfil" para operador (que é redirecionado direto pro próprio perfil ao clicar, nunca vê a
listagem completa — ver `switchView()`).

- **Quadro de colaboradores** — cards de foto/cargo/centro de custo, agrupados por centro de custo;
  busca por nome/cargo/matrícula/centro de custo; **Importar planilha** (`importEmployeesRoster()`,
  casa por matrícula e depois por nome, cria ou atualiza).
- **Controle de férias** / **Controle de faltas** — CRUD simples por competência.
- **🎂 Aniversários da equipe** — lista de `birthDate`; quem faz aniversário no mês aparece
  automaticamente no Dashboard TV.

### Perfil individual (`id="colaboradorPerfil"`) — `renderEmployeeProfile()`

Aberto por `openEmployeeProfile(id)`. Reúne tudo sobre um colaborador:

- Cabeçalho com foto/nome/cargo (`profile-avatar`).
- **Folha de Ponto** (`profileTsControls`/`profileTsSummary`, `renderProfileTimesheets()`) — upload de
  PDF (`importTimesheet()`, seção 7B). Preenche automaticamente turno/horário/localização/período, e
  alimenta a estimativa de "valor a receber" (`computeTimesheetPayroll()`) e a sincronização de faltas
  (`syncAbsencesFromTimesheet()`). **Não altera mais o banco de horas** exibido no painel do operador
  (só a planilha da equipe faz isso, desde ago/2026).
- **Atividades na Produção** — histórico livre de atividades desempenhadas.
- Férias e faltas deste colaborador especificamente.

## Manuais (`id="manuais"` / `id="manualDetail"`) — `renderManuais()`, `renderManualDetail()`

Manuais ilustrados de manutenção de equipamento (passo a passo com fotos), pré-cadastrados
(`seedManuals()`, seção 3) e 100% editáveis (`prepareManualModal`, `renderManualStepsEditor()`,
`renderLightbox()` para ver as fotos em tela cheia). Disponível para todos os papéis exceto TV.

## Dashboard TV (`id="dashboardTv"`) — `renderDashboardTv()`

Painel giratório em tela cheia pensado para um monitor/TV da operação. Pode abrir:
- **Dentro do app desktop**, numa janela Electron independente (`window.goDesktop.openTvWindow()` →
  `main.js:createTvWindow()`), que continua funcionando mesmo com a janela principal fechada.
- **No navegador**, abrindo `#dashboard` numa aba nova (`openDashboardTV()` cai nesse caminho fora do
  Electron) — é assim que o papel de acesso dedicado `tv` funciona (ver
  [SEGURANCA_E_ACESSO.md](SEGURANCA_E_ACESSO.md)).

Mecânica do rodízio de slides (constantes `DASH_SLIDE_BG`/`DASH_SLIDE_DURATIONS`, 5 slides — Produção
fica mais tempo em tela que os demais):

```
enterKioskMode() → body.kiosk-mode, renderDashboardTv(), showKioskSlide(0), scheduleKioskRotate()
                                                                    │
                              a cada N ms (por slide) ──────────────┘
                                        │
                          showKioskSlide(next) + scheduleKioskRotate() de novo
```

- `refreshKioskData()` roda em intervalo à parte para os dados (não só o slide) — relê a pasta
  compartilhada direto (`window.goDesktop.readData()`), **não** o cache do IndexedDB, pra nunca mostrar
  dado desatualizado quando o slide volta pra Produção depois de já ter atualizado uma vez (ver
  [HISTORICO_E_DECISOES.md](HISTORICO_E_DECISOES.md) — esse foi um bug real).
- Slides: Produção (gráfico de linha com meta), SLA (gauge circular), Ranking, Ritmo (+ aniversariantes
  do mês), Notícias. Rodapé mostra a "mensagem do dia" (`todaysMessage()`, rotação determinística por
  dia do ano dentro de `db.dailyMessages`).
- CSS: todo o conteúdo dos slides usa `flex:1;min-height:0;overflow:hidden` em vez de alturas fixas em
  `calc()` — necessário pra funcionar em qualquer resolução de TV real, não só no monitor de dev (ver
  histórico).

## Conteúdo TV / Notícias (`id="noticias"`, papel: gestor) — `renderNoticias()`

Onde o gestor cadastra o que aparece na TV: **Notícias** (`openNewsModal`, tela própria no rodízio),
**Alertas customizados** (`openAlertModal`, com severidade `warn`/`bad` e imagem opcional — aparecem
junto dos avisos automáticos na tela "SLA & Avisos"), e o pool de **Mensagens do dia**
(`saveDailyMessage()`, rodapé da TV).

## Fornecedores (`id="fornecedores"`, papel: gestor)

CRUD simples (`addSupplier()`) — nome, tipo (Fixo/Avulso), contrato, situação. Alimenta os selects de
fornecedor em Financeiro (registro financeiro e gastos).

## Administração (`id="admin"`, papel: gestor) — `renderAdmin()`

Painel de configuração, dividido em blocos independentes:

| Bloco | Função |
|---|---|
| Configurações operacionais | `saveConfig()` — valor por impressão, peso da folha, meta de SLA, encargos, metas diárias |
| 🔒 Segurança | PIN do gestor, PIN da TV, criptografia opcional do arquivo — ver [SEGURANCA_E_ACESSO.md](SEGURANCA_E_ACESSO.md) |
| 🗂️ Backup e versões | Backup/restore manual (`.json`), exportar cópia `.godb`, apagar tudo, histórico de versões (`db.history`) |
| 💾 Arquivo `.godb` (`.browser-only`) | Mecanismo legado (File System Access API) — só aparece fora do app desktop |
| 🖥️ Sincronização entre computadores (`.desktop-only`) | Escolher/abrir a pasta compartilhada — ver [SINCRONIZACAO_E_PERSISTENCIA.md](SINCRONIZACAO_E_PERSISTENCIA.md) |
| ⬆️ Atualizações de versão (`.desktop-only`) | Checagem manual, versão instalada, banner de atualização disponível — ver [BUILD_E_RELEASE.md](BUILD_E_RELEASE.md) |
| 📺 Tela de TV independente (`.desktop-only`) | Atalho para abrir a janela da TV |

`.desktop-only`/`.browser-only` são alternadas por `initDesktopIntegration()` (seção 10C) conforme o
app está rodando dentro do Electron ou direto num navegador.

## Inventário de modais (CRUD)

Todo cadastro do sistema segue o mesmo padrão `prepareXModal()` (preenche o formulário) → usuário edita
→ `addX()`/`saveX()` (valida, grava em `db`, chama `save()`) → `deleteX()`. Lista completa dos modais
em `renderer/app.html`, seção **6. MODAIS / CRUD**:

`rhModal` (colaborador) · `absenceModal` (falta) · `vacationModal` (férias) · `newsModal` (notícia) ·
`alertModal` (alerta) · `dailyMessageModal` (mensagem do dia) · `supModal` (fornecedor) ·
`finModal` (registro financeiro) · `expModal` (gasto) · `lossModal` (perda de papel) ·
`activityModal` (atividade) · `manualModal` (manual de equipamento) · `pinChangeModal` /
`tvPinChangeModal` (segurança).
