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

## Dashboard TV (`id="dashboardTv"`) — `renderDashboardTv()` / `renderDashboardTvInner()`

**Tela única sempre visível**, no estilo "parede de monitoramento" (Zabbix/NOC) — desde ago/2026 não
existe mais rodízio de slides (ver [HISTORICO_E_DECISOES.md](HISTORICO_E_DECISOES.md) para o histórico
completo dessa reformulação, inclusive os bugs reais encontrados numa TV física). Pode abrir:
- **Dentro do app desktop**, numa janela Electron independente (`window.goDesktop.openTvWindow()` →
  `main.js:createTvWindow()`), que continua funcionando mesmo com a janela principal fechada.
- **No navegador**, abrindo `#dashboard` numa aba nova (`openDashboardTV()` cai nesse caminho fora do
  Electron) — é assim que o papel de acesso dedicado `tv` funciona (ver
  [SEGURANCA_E_ACESSO.md](SEGURANCA_E_ACESSO.md)).

`renderDashboardTv()` é só uma casca: `if(!$('dashboardTv'))return; try{renderDashboardTvInner()}
catch(e){console.warn(...)}`. Isso é proposital — um erro dentro do render de verdade nunca pode
travar o resto de `render()` (RH, Financeiro, perfil do colaborador etc. rodam **depois** dela na
sequência) nem o fluxo de sincronização entre PCs (`save()`/`onDataChangedExternally` dependem que
`render()` termine). Qualquer mudança futura na TV deve manter essa separação — mexer direto dentro
de `renderDashboardTvInner()`.

### Estrutura (`.dash-kiosk-wrap` → `.dash-kiosk-header` + `.dash-board`)

```
.dash-kiosk-header   logo Selbetti · divisória · logo Correios + "Operação Correios-MG" · AO VIVO (pulsando) · relógio/data
.dash-board
  .dash-row.dash-row-kpis       8 tiles (grid 4×2): impressões/objetos hoje, ritmo, perdas de papel,
                                 impressões do mês, dias com produção, dias faltantes, produção de ontem
  .dash-row.dash-row-main       gráfico de produção (flex maior) · gauge de SLA · ranking (melhores dias)
  .dash-row.dash-row-secondary  avisos (trilho de cor lateral) · destaque notícias/aniversariantes
  .dash-tile.dash-tile-ticker   mensagem do dia, em ticker de rolagem horizontal contínua
```

Cada `.dash-tile` reaproveita o mesmo "cartão de vidro escuro" (`rgba(8,28,20,.62)` + borda
`rgba(143,227,184,.22)`) usado em todo o resto da TV. `.dash-tile-head` é o cabeçalho padrão
(ícone + título maiúsculo, borda inferior verde) — o mesmo em todo widget.

### Só uma coisa ainda "roda": o card de destaque

`dashSpotStage`/`dashSpotDots`/`dashSpotLabel` revezam sozinhos a cada 7s entre cada notícia
individual (`db.news`, uma de cada vez, foto com `object-fit:contain` — nunca corta — e texto
completo, sem `line-clamp`, com o tamanho da letra ajustado ao comprimento via `dashNewsLenTier()`) e
os aniversariantes do mês (`monthBirthdays()`). A lista (`dashSpotItems`) é remontada a cada
`renderDashboardTvInner()`, mas o índice/temporizador (`dashSpotIndex`/`dashSpotTimer`) são geridos à
parte por `scheduleDashSpotRotate()`, chamada uma única vez em `enterKioskMode()` — mesmo padrão do
relógio (`updateKioskClock`/`kioskClockTimer`). Fora do modo kiosk (preview normal na aba do app), o
card fica parado no primeiro item; só gira de verdade em tela cheia.

- `refreshKioskData()` roda a cada 60s e relê a pasta compartilhada direto
  (`window.goDesktop.readData()`), **não** o cache do IndexedDB, pra nunca mostrar dado desatualizado.
- Gráfico de produção: `renderProdLineChart()` (reaproveitada, não é exclusiva da TV) — mostra o valor
  de **todos** os dias do período (não só destaques), com a margem inferior do próprio SVG
  (`padBottom` dentro da função) reservada para as datas — ver histórico sobre por que isso importa.
- Ranking: só "melhores dias de produção" (top 3) — a versão antiga também tinha "melhor SLA" e "dias
  abaixo do ritmo" em colunas separadas; foram descartadas nessa reformulação pra caber numa tela só.
- Avisos: lista única (`alertItems`) combinando SLA/absenteísmo/alertas customizados/férias/perda de
  papel, capada em 6 itens no total — ver histórico, essa unificação já existia antes da reformulação
  de tela única.

### Layout do modo kiosk — por que é flexbox em várias camadas, não CSS Grid

O corpo (`.dash-board`) é uma coluna flex; `.dash-row-kpis` tem altura por **conteúdo**
(`flex:0 0 auto`, com tipografia compacta) e as outras duas linhas (`.dash-row-main`/
`.dash-row-secondary`) dividem o que sobra por `flex-grow` proporcional — nunca por porcentagem fixa
nem `calc()`. Essa combinação (uma linha por conteúdo + duas por flex-grow) foi a solução depois de
duas tentativas erradas — ver [HISTORICO_E_DECISOES.md](HISTORICO_E_DECISOES.md) antes de mexer nesses
números de novo, porque os dois erros já cometidos (dar `flex-grow` demais OU de menos pra
`.dash-row-kpis`) são fáceis de repetir.

Além disso, `.dash-kiosk-wrap` tem uma margem de segurança em `vw`/`vh` (não pixels fixos) ao redor de
tudo — é a "área segura" contra overscan de TV física (TVs recortam uma faixa das bordas do sinal
HDMI achando que é transmissão comum). Nunca trocar essa margem de volta pra pixel fixo.

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
