# Módulo Jornada/HE — Design (Fase 3: dashboard executivo da Visão Geral)

## Contexto

As Fases 1 e 2 do módulo Jornada/HE (ver `docs/superpowers/specs/2026-08-19-jornada-he-design.md` e `docs/superpowers/specs/2026-08-27-jornada-he-fase2-design.md`) trouxeram os 6 documentos do Portal Meu RH para dentro do app: banco de horas, horas extras, intra/interjornada (total e evento a evento), aging de 180 dias e assinaturas pendentes. Todos os dados são importados, guardados e exibidos — mas em **tabelas simples**. A Fase 2 deixou explícito que o redesenho visual da Visão Geral seria uma Fase 3 separada.

Esta Fase 3 é esse redesenho: transformar a aba **Visão Geral** do Jornada/HE num **dashboard executivo** para apresentação à diretoria — gráficos, fotos dos colaboradores, indicador de meta do banco de horas (±10h), rankings de ofensores, e evolução por período de importação. É uma fase **puramente de apresentação**: nenhum parser, importador ou campo de dados novo; nenhuma mudança em `computeTimesheetPayroll` ou em qualquer cálculo. Todos os dados já existem desde as Fases 1 e 2.

Motivação direta do usuário: as tabelas atuais "não ficaram boas" para levar à diretoria, e os dados de intrajornada/interjornada — embora importados e usados no pagamento estimado desde a Fase 1 — **nunca tiveram tela** no módulo Jornada/HE. Esta fase resolve os dois pontos.

## Reorganização das abas

| Aba | Mudança |
|-----|---------|
| **Visão Geral** | Reescrita como dashboard executivo (layout em rolagem vertical). Foco desta fase. |
| **Banco de Horas** / **HE do período** / **Histórico** | Inalteradas — continuam como tabelas operacionais detalhadas. |
| **180 dias / Pendências** | Inalterada (Fase 2). |
| **Importar** (nova) | Recebe os 6 botões de importação que hoje ficam na Visão Geral (`importJornadaSaldoPlanilha`, `importJornadaListagemHe`, `importJornadaAnalitico180`, `importJornadaSintetico180`, `importJornadaEspelhoPendente`, `importJornadaInterIntraDetalhado`) — **movidos, não recriados** — mais uma tabela de log das últimas importações. |

Ordem das abas: mantém a ordem atual (Visão Geral · Banco de Horas · HE do período · Histórico · 180 dias / Pendências) e acrescenta **Importar** ao final.

## Regra de meta

**Fixa no código** (não configurável nesta fase): colaborador **dentro da meta** quando `bhSaldoTotalMin` está entre −600 e +600 (−10h a +10h, inclusive). Fora dessa faixa em qualquer direção = ofensor de banco de horas.

`jhMetaStatus(saldoMin)` retorna `'dentro'` | `'acima'` (> +600) | `'abaixo'` (< −600). Se um dia a meta virar configurável, é uma decisão de negócio explícita, não algo que esta fase assume.

## Modelo de dados

**Nenhuma mudança.** Tudo consumido já existe:

- `db.jornadaPeriods[]` (Fase 1) — `periodoIni`, `periodoFim`, `employees[]` com `employeeId`, `nome`, `chapa`, `bhSaldoTotalMin`, `bhSaldoAnteriorMin`, `bhSaldoPeriodoMin`, `horasExtraMin`, `horasAtrasoMin`, `horasFaltaMin`, `horasAbonoMin`, `horasAdNoturnoMin`, `intrajornadaMin`, `interjornadaMin`.
- Fase 2, no mesmo `employees[]` — `interIntraEvents[]` (`data`, `codigo`, `descricao`, `minutos`, `tipo`), `vencimentos180d[]` (`competenciaId`, `valorMin`), `pendingSignatureDocs[]` (`id`, `arquivo`, `status`).
- `db.jornada180Windows[]` (Fase 2) — janela de 180 dias, `valorPagarDescontarMin` por colaborador.
- `db.employees[]` — `name`, `role`/função, `costCenter`/centro de custo, `admission`, `photo` (data URL; `DEFAULT_AVATAR` quando ausente).
- `db.imports[]` — log de importações (filtrado por arquivos do Jornada/HE para a aba Importar).

O período de referência do dashboard é sempre `latestJornadaPeriod()`.

## Composição do dashboard (aba Visão Geral)

Rolagem vertical, blocos de largura total, de cima para baixo. Cada bloco tem estado vazio próprio quando não há período importado.

### 1. Faixa de KPIs

Três tiles + um rótulo de contexto:

- **% dentro da meta ±10h** — `nº de ativos com |bhSaldoTotalMin| ≤ 600 / total de ativos`, formatado como percentual inteiro.
- **HE do período** — `Σ horasExtraMin` dos ativos, formatado como duração.
- **Intra + inter do período** — `Σ (intrajornadaMin + interjornadaMin)` dos ativos, formatado como duração.
- **Rótulo de período** — `periodoIni a periodoFim` (dd/mm/aaaa) do período mais recente. Não é KPI, é contexto.

"Ativos" = `period.employees.filter(e => e.employeeId)`, mesmo critério da Fase 1.

### 2. Bloco de meta

Dois sub-componentes empilhados:

**Régua de distribuição** — 5 faixas fixas por `bhSaldoTotalMin`:

| Faixa | Cor |
|-------|-----|
| `< −20h` | vermelho |
| `−20h a −10h` | âmbar |
| `dentro de ±10h` | verde |
| `+10h a +20h` | âmbar |
| `> +20h` | vermelho |

Cada faixa mostra a contagem de colaboradores e uma linha de mini-avatares (foto). Serve de resumo rápido do KPI "fora da meta".

**Barras horizontais ordenadas** — uma linha por colaborador ativo, ordenada do saldo mais negativo (devedor) ao mais positivo (credor):

- foto (avatar pequeno) + nome à esquerda
- trilho com: zona verde marcando a faixa ±10h, linha vertical de zero ao centro, barra preenchida a partir do zero na direção/proporção do saldo
- barra **verde** quando `jhMetaStatus === 'dentro'`, **vermelha** quando `'acima'` ou `'abaixo'`
- valor com sinal à direita (`fmtSignedMin`), vermelho quando fora da meta

A escala do trilho é simétrica em torno de zero, com o extremo definido pelo maior `|bhSaldoTotalMin|` do período (mínimo de 20h para não exagerar barras pequenas).

### 3. Dois blocos lado a lado

**Evolução por período** (small multiples) — 3 mini-gráficos de linha, um ponto por período em `db.jornadaPeriods` (ordenados por `id` ascendente), eixo X = competência (`mmm/aa`):

- *Saldo líquido da equipe* — `Σ bhSaldoTotalMin` por período
- *HE total* — `Σ horasExtraMin` por período
- *Colaboradores fora da meta* — `nº com |bhSaldoTotalMin| > 600` por período

Com 1 só período, mostra o ponto único e um texto "histórico aparece a partir da 2ª importação". Usa o helper `jhSparkline`.

**Ofensores** — 3 colunas, top 5 cada, com foto + nome + valor:

- *Banco de horas fora da meta* — apenas quem está fora (`jhMetaStatus !== 'dentro'`), lista única ordenada pela **distância absoluta de zero** (maior primeiro); valor exibido com sinal, em vermelho. Se ninguém está fora, "toda a equipe dentro da meta".
- *Horas extras* — maior `horasExtraMin` (ignora zeros).
- *Intra + interjornada* — maior `intrajornadaMin + interjornadaMin` (ignora zeros).

Cada coluna mostra menos de 5 quando há menos candidatos; some a coluna inteira só se não houver nenhum (caso raro).

### 4. Grade de colaboradores

Cartões RICH, 4 por linha (responsivo: cai para 2 ou 1 em telas estreitas):

- foto (avatar), nome, `função · centro de custo`
- 4 números: **Saldo BH** (`fmtSignedMin`, vermelho se negativo), **HE**, **Intra**, **Inter** (durações)
- borda/realce colorido pelo `jhMetaStatus` (verde = dentro, vermelho = fora)
- clique em qualquer ponto do cartão abre o painel lateral daquele colaborador

Controle de ordenação acima da grade: **por nome** (padrão) · **por saldo** (mais devedor primeiro) · **fora da meta primeiro**.

## Painel lateral de detalhe do colaborador

Elemento `#jhEmployeeDrawer` com markup fixo no HTML, conteúdo preenchido por `openJhEmployeeDrawer(employeeId)`. Desliza da direita sobre o dashboard, com backdrop escurecido. Fecha no botão X, na tecla Esc, ou clicando no backdrop (`closeJhEmployeeDrawer()`).

Conteúdo, de cima para baixo:

- **Cabeçalho** — foto grande, nome, `função · centro de custo · admissão mm/aaaa`, e um chip de status (`Dentro da meta · +2h` verde / `Fora da meta · +41h` vermelho, via `jhMetaStatus` + `fmtSignedMin`).
- **4 métricas grandes** — Saldo banco de horas · Horas extras · Intrajornada · Interjornada, do período mais recente.
- **Evolução do saldo** — `jhSparkline` do `bhSaldoTotalMin` desse colaborador ao longo dos períodos importados (casado por `employeeId`).
- **Ocorrências de intra/interjornada — evento a evento:**
  - se `interIntraEvents.length` > 0 → tabela `data · código · descrição · minutos · tipo (intra/inter)`, ordenada por data desc
  - senão, se `intrajornadaMin || interjornadaMin` → só os totais + aviso "importe o PDF de Intra/Interjornada detalhado para ver evento a evento"
  - senão → "sem ocorrências de intra/interjornada no período"
- **Pendências** — nº de espelhos de ponto pendentes de assinatura e quais (`pendingSignatureDocs`); projeção de vencimento 180d (`vencimentos180d`: competência → `fmtSignedMin`); valor da janela de 180 dias (`db.jornada180Windows`, casado por `employeeId`) quando houver. Cada linha some se o dado correspondente não foi importado.

Este painel é a resposta à reclamação de "não trouxeram intra/interjornada": o dado sempre existiu (Fase 1 para os totais, Fase 2 para o detalhe), esta fase dá tela a ele.

## Componentes no código

Tudo em `renderer/app.html`. Sem libs, sem framework, sem build step — mesmos padrões das Fases 1 e 2 (`$`, `escHtml`, `fmtSignedMin`, `fmtDurationMin`, `DEFAULT_AVATAR`, `switchJornadaHeTab`, classes `.roster-avatar`).

### HTML — dentro de `<section id="jornadaHe">`

- `data-pane="overview"` reescrito: contêineres `#jhKpis`, `#jhMetaRuler`, `#jhMetaBars`, `#jhEvolucao`, `#jhOfensores`, `#jhGrid` (+ o controle de ordenação da grade).
- Novo botão de aba `data-tab="importar"` + `data-pane="importar"`: os 6 `<label class="btn primary file">` movidos da Visão Geral, mais `<tbody id="jhImportLog">`.
- `#jhEmployeeDrawer` (backdrop + painel) no fim da section, com `hidden` por padrão.

### JS — funções novas logo após `renderJornadaHe`

| Função | Papel | Tipo |
|--------|-------|------|
| `jhMetaStatus(saldoMin)` | `'dentro'`/`'acima'`/`'abaixo'`, limiar fixo 600 | pura |
| `jhTeamMetrics(period)` | `{pctDentro, heTotalMin, intraInterMin, faixas:[{key,label,count,employees}]}` | pura |
| `jhOfensores(period)` | `{bancoHoras:[...], he:[...], intraInter:[...]}` — top 5, cada item `{employeeId, nome, valorMin}` | pura |
| `jhEvolucaoSeries()` | `[{periodId, label, saldoLiquidoMin, heTotalMin, foraMeta}]` por período ascendente | pura |
| `jhSparkline(points, opts)` | string SVG de linha (viewBox 0..100), adaptado de `renderProdLineChart` — sem depender de `#dashProdChart` | pura |
| `renderJornadaHe()` | **reescrita** — monta KPIs, régua, barras, evolução, ofensores e grade chamando as puras acima | render |
| `renderJhImportLog()` | preenche `#jhImportLog` a partir de `db.imports` (arquivos do Jornada/HE) | render |
| `openJhEmployeeDrawer(employeeId)` / `closeJhEmployeeDrawer()` | abre/fecha e preenche o painel lateral | render |

`renderJornada180Pendencias()` e todo o resto das Fases 1–2 ficam intactos. `renderJornadaHe()` continua sendo chamada de dentro de `render()` no mesmo ponto; `renderJhImportLog()` entra logo depois.

### CSS

Bloco novo `/* ---- Jornada/HE — dashboard (Fase 3) ---- */`, reaproveitando variáveis de cor existentes (`--red`, `--selbetti-dark`, `--line`, etc.) e classes de avatar (`.roster-avatar`, `.roster-avatar-fallback`). Classes novas com prefixo `jh-` (`jh-kpi`, `jh-ruler`, `jh-metabar`, `jh-spark`, `jh-offcard`, `jh-card`, `jh-drawer`).

## Fluxo e estados de erro

- Sem período importado (`latestJornadaPeriod()` nulo) → cada bloco mostra sua mensagem vazia; a grade e o painel lateral não renderizam nada. Sem erro.
- Colaborador sem foto → `DEFAULT_AVATAR` (já é o padrão da Fase 1).
- Colaborador do período sem `employeeId` (não casado na importação) → ignorado em todos os cálculos e na grade, mesmo critério da Fase 1.
- Um único período → evolução mostra ponto único + aviso; nenhum crash nos deltas.
- Nenhum ofensor numa categoria → mensagem "toda a equipe dentro da meta" / coluna com menos itens.
- Painel lateral com dados parciais (ex.: só Listagem de HE importada, sem detalhe de intra/inter, sem 180d) → cada seção degrada individualmente, nunca quebra o painel.

## Testes

Sem framework de teste no projeto; verificação como nas Fases 1–2.

- **Funções puras** — script `.mjs` standalone com `console.assert`, montando um `db` de exemplo a partir dos dados reais já importados (`F:\Projetos DEV\Modulo RH`, mesmo período `26/07/2026 a 25/08/2026`, 15 colaboradores) mais um 2º período sintético para exercitar a evolução:
  - `jhMetaStatus` — fronteiras exatas em ±600.
  - `jhTeamMetrics` — `% dentro da meta` bate com a contagem manual; soma das 5 faixas = total de ativos; `heTotalMin`/`intraInterMin` conferem com a soma direta.
  - `jhOfensores` — ordem correta (banco de horas por `|valorMin|` desc; HE e intra+inter por valor desc); no máximo 5; zeros excluídos.
  - `jhEvolucaoSeries` — 1 período (1 ponto) e 2 períodos (deltas na direção certa).
  - `jhSparkline` — não quebra com 0, 1 e N pontos; todos os valores iguais não gera `NaN` no path.
- **`node --check`** no script extraído de `renderer/app.html` (mesmo comando das fases anteriores).
- **Balanceamento de HTML** — contagem de `<div>`/`</div>` e `<section>`/`</section>` na parte HTML iguais antes e depois.
- **QA manual:**
  1. `npm start` — Visão Geral renderiza sem erro de console com os dados reais importados.
  2. KPIs, régua e barras batem com os números da aba Banco de Horas.
  3. Grade: ordenação (nome / saldo / fora-da-meta) funciona; clicar abre o painel lateral certo; Esc e backdrop fecham.
  4. Painel lateral: 4 métricas conferem; evolução do saldo aparece; tabela de intra/inter aparece quando o PDF detalhado foi importado, e o fallback de totais quando não; pendências e 180d aparecem/somem conforme o que foi importado.
  5. Aba Importar: os 6 botões funcionam (mesma função de antes); log lista as importações.
  6. Estados vazios: com `db.jornadaPeriods` vazio, nenhum bloco quebra.
  7. Fase 1 e 2 intactas: Banco de Horas / HE do período / Histórico / 180 dias / Pendências mostram exatamente os mesmos valores; pagamento estimado no perfil individual inalterado.
  8. `npx electron-builder --win` — exit 0.
- Bump de versão `8.7.0 → 8.8.0` (`package.json` + `package-lock.json`) e publicação na pasta de atualizações (`.exe` + `.blockmap` + `version.json`), como nas Fases 1–2.

## Fora de escopo

- Qualquer mudança em parser, importador, modelo de dados ou `computeTimesheetPayroll`.
- Meta configurável pelo usuário (fica fixa em ±10h nesta fase).
- Modo tela cheia / apresentação dedicado e export de PDF do painel (decisão do usuário: a aba bem-feita basta).
- Ranking de ofensores para atraso/falta (usuário escolheu só banco de horas, HE e intra+inter).
- Adicional noturno como bloco próprio (continua só nas tabelas da aba HE do período).
- Itens de backlog herdados da Fase 1 (comparação por colaborador na aba Histórico, persistência de não-encontrados nos importadores, remoção de `importHourBank` morto) — seguem no backlog, fora desta fase.
