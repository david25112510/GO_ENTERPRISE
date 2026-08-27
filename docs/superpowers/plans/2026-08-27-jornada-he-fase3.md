# Jornada/HE — Fase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescrever a aba "Visão Geral" do módulo Jornada/HE como um dashboard executivo para a diretoria (KPIs, faixa de meta ±10h, evolução por período, ofensores, grade de colaboradores com foto e painel lateral de detalhe), e mover os botões de importação para uma aba nova "Importar".

**Architecture:** Fase puramente de apresentação. Cinco funções puras novas calculam métricas a partir de `db.jornadaPeriods`/`db.jornada180Windows`/`db.employees` (nada é gravado). `renderJornadaHe()` é reescrita para montar o dashboard chamando essas puras. Um painel lateral (`#jhEmployeeDrawer`) mostra o detalhe de um colaborador. Tudo em `renderer/app.html`, sem libs, sem framework, seguindo os padrões das Fases 1–2 (`$`, `escHtml`, `fmtSignedMin`, `fmtDurationMin`, `DEFAULT_AVATAR`, classes `.roster-avatar`).

**Tech Stack:** Electron, JS puro no `renderer/app.html`, SVG inline para gráficos (mesma técnica de `renderProdLineChart`/`smoothPath`). Sem dependências novas.

**Spec:** `docs/superpowers/specs/2026-08-27-jornada-he-fase3-design.md`

## Global Constraints

- **Nenhuma mudança** em parser, importador, modelo de dados, `normalizeDb`, `normalizeJornada*` ou `computeTimesheetPayroll`. Se um passo exigir isso, o passo está errado.
- **Nenhum campo de dados novo.** Tudo consumido já existe desde as Fases 1–2.
- Meta do banco de horas **fixa em ±10h** = `bhSaldoTotalMin` entre −600 e +600 minutos, inclusive. Não configurável nesta fase.
- "Ativos" = `period.employees.filter(e => e.employeeId)` — mesmo critério da Fase 1. Colaboradores sem `employeeId` são ignorados em todo cálculo e na grade.
- Período de referência do dashboard = `latestJornadaPeriod()` (já existe, `renderer/app.html:1836`).
- As abas **Banco de Horas**, **HE do período**, **Histórico** e **180 dias / Pendências** não mudam. `renderJornada180Pendencias()` fica intacta.
- Sem framework de teste no projeto: funções puras são testadas por script `.mjs` standalone com `console.assert` (padrão das Fases 1–2); render/DOM é verificado por `node --check` + balanceamento de tags + QA manual.
- Trabalhar direto na branch `main`, sem worktree — mesmo modo das Fases 1–2 (consentimento já dado para todo este projeto).
- Commits frequentes, um por task.
- Classes CSS novas com prefixo `jh-`. Bloco CSS novo `/* ---- Jornada/HE — dashboard (Fase 3) ---- */` antes de `</style>` (`renderer/app.html:706`).

---

## Estrutura de arquivos

Um único arquivo é tocado: `renderer/app.html`.

| Região | Responsabilidade | Tasks |
|--------|------------------|-------|
| Bloco `<style>` (antes da linha 706) | CSS do dashboard, classes `jh-*` | 2, 3, 4, 5, 6 |
| `<section id="jornadaHe">` (linhas 915–966) | Botão de aba "Importar"; pane `overview` reescrito; pane `importar` novo; markup do drawer | 2 |
| JS logo após `renderJornadaHe` (a partir da linha 3680) | `jhMetaStatus`, `jhTeamMetrics`, `jhOfensores`, `jhEvolucaoSeries`, `jhSparkline`, `jhPeriodLabel`, `jhIsJornadaImport`; `renderJornadaHe()` reescrita; `renderJhImportLog()`; `openJhEmployeeDrawer`/`closeJhEmployeeDrawer` | 1, 3, 4, 5, 6 |
| `render()` (linha 3996) | Chamar `renderJhImportLog()` após `renderJornada180Pendencias()` | 2 |

Ordem lógica no arquivo (de cima para baixo): CSS → HTML da section → funções puras → `renderJornadaHe` reescrita → `renderJhImportLog` → drawer → resto (intacto).

---

## Task 1: Funções puras de métricas + testes

**Files:**
- Modify: `renderer/app.html` — inserir as funções puras imediatamente antes de `function renderJornadaHe(){` (linha 3680)
- Test: `scratchpad/test-jh-fase3.mjs` (script standalone temporário; não versionado)

**Interfaces:**
- Consumes: variável global `db` (só `jhEvolucaoSeries` a usa); nada mais.
- Produces:
  - `jhMetaStatus(saldoMin) -> 'dentro' | 'acima' | 'abaixo'`
  - `jhPeriodLabel(id) -> string` (ex.: `"2026-08"` → `"ago/26"`)
  - `jhTeamMetrics(period) -> {ativos:Array, n:number, pctDentro:number, heTotalMin:number, intraInterMin:number, faixas:[{key:string,label:string,tone:'ok'|'warn'|'bad',employees:Array}]}` (5 faixas, sempre nessa ordem: `ltMinus20`, `minus20to10`, `dentro`, `plus10to20`, `gtPlus20`)
  - `jhOfensores(period) -> {bancoHoras:Array, he:Array, intraInter:Array}` — cada array com até 5 itens `{employeeId:string, nome:string, valorMin:number}`
  - `jhEvolucaoSeries() -> [{periodId:string, label:string, saldoLiquidoMin:number, heTotalMin:number, foraMeta:number}]` (ordenado por `periodId` ascendente)
  - `jhSparkline(values, opts) -> string` (HTML com `<svg>`); `values` é `number[]` ou `[{v:number}]`; `opts` opcional

- [ ] **Step 1: Escrever o script de teste que falha**

Criar `scratchpad/test-jh-fase3.mjs`:

```js
// Cola as funções puras da Task 1 aqui (jhMetaStatus, jhPeriodLabel, jhTeamMetrics,
// jhOfensores, jhEvolucaoSeries, jhSparkline). jhEvolucaoSeries lê `globalThis.db`.

function emp(employeeId, nome, over){ return Object.assign({employeeId, nome, bhSaldoTotalMin:0, horasExtraMin:0, intrajornadaMin:0, interjornadaMin:0}, over||{}); }

// --- jhMetaStatus: fronteiras exatas ---
console.assert(jhMetaStatus(0)==='dentro','0 é dentro');
console.assert(jhMetaStatus(600)==='dentro','+600 (exatamente +10h) é dentro');
console.assert(jhMetaStatus(-600)==='dentro','-600 é dentro');
console.assert(jhMetaStatus(601)==='acima','+601 é acima');
console.assert(jhMetaStatus(-601)==='abaixo','-601 é abaixo');
console.assert(jhMetaStatus(null)==='dentro','null trata como 0');

// --- jhTeamMetrics ---
const period={ id:'2026-08', periodoIni:'2026-07-26', periodoFim:'2026-08-25', employees:[
  emp('e1','A',{bhSaldoTotalMin:120, horasExtraMin:360, intrajornadaMin:60, interjornadaMin:0}),   // dentro
  emp('e2','B',{bhSaldoTotalMin:-300, horasExtraMin:0}),                                            // dentro
  emp('e3','C',{bhSaldoTotalMin:2460, horasExtraMin:1320, intrajornadaMin:180, interjornadaMin:120}), // gtPlus20, +41h
  emp('e4','D',{bhSaldoTotalMin:-1680}),                                                             // ltMinus20, -28h
  emp('e5','E',{bhSaldoTotalMin:900}),                                                              // plus10to20
  emp('e6','F',{bhSaldoTotalMin:-720}),                                                             // minus20to10
  { nome:'SEM ID', bhSaldoTotalMin:9999 }                                                           // ignorado (sem employeeId)
]};
const tm=jhTeamMetrics(period);
console.assert(tm.n===6,'6 ativos (o sem employeeId não conta), veio '+tm.n);
console.assert(tm.pctDentro===33,'2 de 6 dentro = 33%, veio '+tm.pctDentro);
console.assert(tm.heTotalMin===360+1320,'HE total = 1680, veio '+tm.heTotalMin);
console.assert(tm.intraInterMin===60+180+120,'intra+inter = 360, veio '+tm.intraInterMin);
console.assert(tm.faixas.map(f=>f.key).join(',')==='ltMinus20,minus20to10,dentro,plus10to20,gtPlus20','ordem das faixas');
console.assert(tm.faixas.reduce((s,f)=>s+f.employees.length,0)===6,'soma das faixas = total de ativos');
console.assert(tm.faixas[0].employees.length===1 && tm.faixas[0].employees[0].nome==='D','ltMinus20 = D');
console.assert(tm.faixas[2].employees.length===2,'dentro = 2 (A e B)');
console.assert(tm.faixas[4].employees.length===1 && tm.faixas[4].employees[0].nome==='C','gtPlus20 = C');

// --- jhOfensores ---
const of=jhOfensores(period);
console.assert(of.bancoHoras.map(x=>x.nome).join(',')==='C,D,E,F','banco de horas: só fora da meta, por |valor| desc');
console.assert(of.bancoHoras[0].valorMin===2460,'primeiro ofensor de BH mantém o sinal (+2460)');
console.assert(of.he.map(x=>x.nome).join(',')==='C,A','HE: só quem tem HE>0, maior primeiro');
console.assert(of.intraInter.map(x=>x.nome).join(',')==='C,A','intra+inter: C(420) depois A(60)');
console.assert(of.he.length<=5 && of.bancoHoras.length<=5,'no máximo 5');

// --- jhOfensores: ninguém fora da meta ---
const dentroTodos={ employees:[emp('x','X',{bhSaldoTotalMin:0}), emp('y','Y',{bhSaldoTotalMin:120})] };
console.assert(jhOfensores(dentroTodos).bancoHoras.length===0,'sem ofensores de BH quando todos dentro');

// --- jhEvolucaoSeries ---
globalThis.db={ jornadaPeriods:[
  { id:'2026-08', employees:period.employees },
  { id:'2026-07', employees:[ emp('e1','A',{bhSaldoTotalMin:0}), emp('e3','C',{bhSaldoTotalMin:600}) ] }
]};
const ev=jhEvolucaoSeries();
console.assert(ev.length===2,'2 períodos');
console.assert(ev[0].periodId==='2026-07' && ev[1].periodId==='2026-08','ordenado ascendente por id');
console.assert(ev[0].label==='jul/26','label compacto');
console.assert(ev[1].saldoLiquidoMin===120-300+2460-1680+900-720,'saldo líquido de ago soma só ativos');
console.assert(ev[1].foraMeta===4,'ago: 4 fora da meta (C,D,E,F)');
console.assert(ev[0].foraMeta===0,'jul: 0 fora da meta');

// --- jhEvolucaoSeries: db vazio ---
globalThis.db={};
console.assert(Array.isArray(jhEvolucaoSeries()) && jhEvolucaoSeries().length===0,'db sem jornadaPeriods → []');

// --- jhSparkline: robustez ---
console.assert(jhSparkline([]).includes('jh-spark'),'0 pontos não quebra');
console.assert(jhSparkline([5]).includes('<svg'),'1 ponto');
console.assert(!/NaN/.test(jhSparkline([3,3,3])),'valores iguais não geram NaN');
console.assert(!/NaN/.test(jhSparkline([-100,0,250])),'valores negativos e positivos não geram NaN');
console.assert(jhSparkline([-100,0,250]).includes('jh-spark-zero'),'linha de zero quando cruza zero');

console.log('OK — todas as asserções da Fase 3 (funções puras) passaram');
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node scratchpad/test-jh-fase3.mjs`
Expected: `ReferenceError: jhMetaStatus is not defined` (as funções ainda não foram coladas no script — cole-as no topo conforme os próximos steps as define, ou escreva-as direto no script e depois copie para o `app.html`).

- [ ] **Step 3: Escrever `jhMetaStatus` e `jhPeriodLabel`**

Inserir em `renderer/app.html`, imediatamente antes de `function renderJornadaHe(){` (linha 3680):

```js
/* ===================== JORNADA/HE — Fase 3: dashboard executivo =====================
   Funções puras de métrica (não gravam nada) + render da aba "Visão Geral" como painel
   para a diretoria. Meta do banco de horas fixa em ±10h (±600 min). */
function jhMetaStatus(saldoMin){
  const v=saldoMin||0;
  if(v>600)return 'acima';
  if(v<-600)return 'abaixo';
  return 'dentro';
}
function jhPeriodLabel(id){
  const M=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const [y,mo]=String(id||'').split('-');
  return `${M[(+mo||1)-1]}/${String(y||'').slice(2)}`;
}
```

- [ ] **Step 4: Escrever `jhTeamMetrics`**

Logo após `jhPeriodLabel`:

```js
function jhTeamMetrics(period){
  const ativos=((period&&period.employees)||[]).filter(e=>e.employeeId);
  const n=ativos.length;
  const dentro=ativos.filter(e=>jhMetaStatus(e.bhSaldoTotalMin)==='dentro').length;
  const faixaKey=v=>{
    v=v||0;
    if(v<-1200)return 'ltMinus20';
    if(v<-600)return 'minus20to10';
    if(v<=600)return 'dentro';
    if(v<=1200)return 'plus10to20';
    return 'gtPlus20';
  };
  const defs=[
    {key:'ltMinus20',label:'abaixo de −20h',tone:'bad'},
    {key:'minus20to10',label:'−20h a −10h',tone:'warn'},
    {key:'dentro',label:'dentro de ±10h',tone:'ok'},
    {key:'plus10to20',label:'+10h a +20h',tone:'warn'},
    {key:'gtPlus20',label:'acima de +20h',tone:'bad'}
  ];
  return {
    ativos, n,
    pctDentro:n?Math.round(dentro/n*100):0,
    heTotalMin:ativos.reduce((s,e)=>s+(e.horasExtraMin||0),0),
    intraInterMin:ativos.reduce((s,e)=>s+(e.intrajornadaMin||0)+(e.interjornadaMin||0),0),
    faixas:defs.map(d=>({...d,employees:ativos.filter(e=>faixaKey(e.bhSaldoTotalMin)===d.key)}))
  };
}
```

- [ ] **Step 5: Escrever `jhOfensores`**

Logo após `jhTeamMetrics`:

```js
function jhOfensores(period){
  const ativos=((period&&period.employees)||[]).filter(e=>e.employeeId);
  const rank=val=>ativos
    .map(e=>({employeeId:e.employeeId,nome:e.nome,valorMin:val(e)}))
    .filter(x=>x.valorMin)
    .sort((a,b)=>Math.abs(b.valorMin)-Math.abs(a.valorMin))
    .slice(0,5);
  return {
    bancoHoras:ativos
      .filter(e=>jhMetaStatus(e.bhSaldoTotalMin)!=='dentro')
      .map(e=>({employeeId:e.employeeId,nome:e.nome,valorMin:e.bhSaldoTotalMin||0}))
      .sort((a,b)=>Math.abs(b.valorMin)-Math.abs(a.valorMin))
      .slice(0,5),
    he:rank(e=>e.horasExtraMin||0),
    intraInter:rank(e=>(e.intrajornadaMin||0)+(e.interjornadaMin||0))
  };
}
```

- [ ] **Step 6: Escrever `jhEvolucaoSeries`**

Logo após `jhOfensores`:

```js
function jhEvolucaoSeries(){
  return [...((db&&db.jornadaPeriods)||[])]
    .sort((a,b)=>a.id.localeCompare(b.id))
    .map(p=>{
      const ativos=(p.employees||[]).filter(e=>e.employeeId);
      return {
        periodId:p.id,
        label:jhPeriodLabel(p.id),
        saldoLiquidoMin:ativos.reduce((s,e)=>s+(e.bhSaldoTotalMin||0),0),
        heTotalMin:ativos.reduce((s,e)=>s+(e.horasExtraMin||0),0),
        foraMeta:ativos.filter(e=>jhMetaStatus(e.bhSaldoTotalMin)!=='dentro').length
      };
    });
}
```

- [ ] **Step 7: Escrever `jhSparkline`**

Logo após `jhEvolucaoSeries`:

```js
/* mini-gráfico de linha em SVG (viewBox 0..100), puro — retorna string, não toca no DOM.
   Aceita number[] ou [{v}]. Desenha linha de zero quando a série cruza zero. */
function jhSparkline(values,opts){
  opts=opts||{};
  const vals=(values||[]).map(v=>typeof v==='number'?v:((v&&v.v)||0));
  const n=vals.length;
  if(!n)return '<div class="jh-spark jh-spark-empty"></div>';
  const min=Math.min(...vals),max=Math.max(...vals),flat=max===min;
  const span=flat?1:(max-min);
  const padTop=12,padBottom=12,h=100-padTop-padBottom;
  const yOf=v=>flat?50:padTop+h*(1-(v-min)/span);
  const pts=vals.map((v,i)=>({x:n>1?i/(n-1)*100:50,y:yOf(v)}));
  const d=pts.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const dots=pts.map(p=>`<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="2.4" class="jh-spark-dot"/>`).join('');
  const zeroY=(!flat&&min<0&&max>0)?yOf(0):null;
  return `<div class="jh-spark">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      ${zeroY!=null?`<line x1="0" y1="${zeroY.toFixed(2)}" x2="100" y2="${zeroY.toFixed(2)}" class="jh-spark-zero" vector-effect="non-scaling-stroke"/>`:''}
      <path d="${d}" class="jh-spark-line" fill="none" vector-effect="non-scaling-stroke"/>
      ${dots}
    </svg>
  </div>`;
}
```

- [ ] **Step 8: Rodar o teste e confirmar que passa**

Copiar as 6 funções para o topo do `scratchpad/test-jh-fase3.mjs` (substituindo qualquer versão de rascunho).
Run: `node scratchpad/test-jh-fase3.mjs`
Expected: `OK — todas as asserções da Fase 3 (funções puras) passaram`, sem nenhuma linha `Assertion failed`.

- [ ] **Step 9: Verificar sintaxe do app.html**

Run:
```bash
node -e "const fs=require('fs');const html=fs.readFileSync('renderer/app.html','utf-8');const s=html.indexOf('<script>'),e=html.lastIndexOf('</script>');fs.writeFileSync(process.env.TEMP+'/check.js',html.slice(s+8,e));"
node --check "$TEMP/check.js"
```
Expected: sem saída.

- [ ] **Step 10: Commit**

```bash
git add renderer/app.html
git commit -m "Adiciona funcoes puras de metrica da Fase 3 do Jornada/HE"
```

---

## Task 2: Reestrutura HTML — aba "Importar" + esqueleto do dashboard + drawer

**Files:**
- Modify: `renderer/app.html` — `<section id="jornadaHe">` (linhas 917–966), bloco `<style>` (antes da linha 706), `render()` (linha 3996), e JS logo após as funções da Task 1

**Interfaces:**
- Consumes: `switchJornadaHeTab` (linha 3666, já genérico por `data-tab`/`data-pane`), `escHtml`, `db.imports`, as 6 funções `importJornada*` (inalteradas), `$`
- Produces:
  - Botão de aba `data-tab="importar"`; pane `data-pane="importar"`
  - Elementos DOM: `#jhEmpty`, `#jhDashboard`, `#jhKpis`, `#jhMetaRuler`, `#jhMetaBars`, `#jhEvolucao`, `#jhOfensores`, `#jhGrid`, `#jhGridSort`, `#jhImportLog`
  - Markup do drawer: `#jhDrawerBackdrop`, `#jhEmployeeDrawer`, `#jhDrawerBody`
  - `renderJhImportLog()`, `jhIsJornadaImport(fname)`
  - Placeholder `renderJornadaHe()` continua existindo (será reescrito nas Tasks 3–5); nesta task ele só precisa não quebrar — mantenha a função da Fase 1 como está até a Task 3.

- [ ] **Step 1: Adicionar o botão da aba "Importar"**

Localizar (linha ~922):
```html
        <button class="role-tab" data-tab="pendencias" onclick="switchJornadaHeTab('pendencias')">180 dias / Pendências</button>
      </div>
```
Trocar por:
```html
        <button class="role-tab" data-tab="pendencias" onclick="switchJornadaHeTab('pendencias')">180 dias / Pendências</button>
        <button class="role-tab" data-tab="importar" onclick="switchJornadaHeTab('importar')">Importar</button>
      </div>
```

- [ ] **Step 2: Reescrever o pane `overview` (esqueleto vazio)**

Localizar o bloco inteiro (linhas ~925–937):
```html
      <div class="jornadaHe-tabpane active" data-pane="overview">
        <div class="grid cards" id="jornadaHeOverviewCards"></div>
        <div class="panel"><div class="toolbar">
            <label class="btn primary file">⬆ Importar planilha de saldo<input type="file" accept=".xlsx" onchange="importJornadaSaldoPlanilha(this.files[0]);this.value=''"></label>
            <label class="btn primary file">⬆ Importar Listagem de HE (PDF)<input type="file" accept=".pdf" onchange="importJornadaListagemHe(this.files[0]);this.value=''"></label>
            <label class="btn primary file">⬆ Importar Analítico 180 dias (PDF)<input type="file" accept=".pdf" onchange="importJornadaAnalitico180(this.files[0]);this.value=''"></label>
            <label class="btn primary file">⬆ Importar Sintético 180 dias (PDF)<input type="file" accept=".pdf" onchange="importJornadaSintetico180(this.files[0]);this.value=''"></label>
            <label class="btn primary file">⬆ Importar Espelho Pendente Assinatura (PDF)<input type="file" accept=".pdf" onchange="importJornadaEspelhoPendente(this.files[0]);this.value=''"></label>
            <label class="btn primary file">⬆ Importar Intra/Interjornada detalhado (PDF)<input type="file" accept=".pdf" onchange="importJornadaInterIntraDetalhado(this.files[0]);this.value=''"></label>
          </div>
          <p class="muted" style="font-size:12px;margin-top:-6px">Os arquivos são independentes — pode importar qualquer combinação deles, em qualquer ordem.</p>
        </div>
      </div>
```
Trocar por:
```html
      <div class="jornadaHe-tabpane active" data-pane="overview">
        <div id="jhEmpty" class="panel" style="display:none"><p class="muted">Nenhum período importado ainda. Use a aba <b>Importar</b> para carregar os dados do Portal Meu RH.</p></div>
        <div id="jhDashboard">
          <div class="jh-kpis" id="jhKpis"></div>
          <div class="panel"><h2>Meta do banco de horas (±10h)</h2>
            <div class="jh-ruler" id="jhMetaRuler"></div>
            <div class="jh-metabars" id="jhMetaBars"></div>
          </div>
          <div class="jh-two">
            <div class="panel"><h2>Evolução por período de importação</h2><div id="jhEvolucao"></div></div>
            <div class="panel"><h2>Ofensores</h2><div class="jh-off3" id="jhOfensores"></div></div>
          </div>
          <div class="panel">
            <div class="jh-grid-head">
              <h2>Colaboradores</h2>
              <label class="jh-sort">Ordenar
                <select id="jhGridSort" onchange="renderJornadaHe()">
                  <option value="nome">por nome</option>
                  <option value="saldo">por saldo (devedor primeiro)</option>
                  <option value="fora">fora da meta primeiro</option>
                </select>
              </label>
            </div>
            <div class="jh-grid" id="jhGrid"></div>
          </div>
        </div>
      </div>
```

- [ ] **Step 3: Adicionar o pane `importar` logo após o pane `pendencias`**

Localizar o fim do pane `pendencias` (linhas ~962–966):
```html
        <div class="panel"><h2>Assinaturas de ponto pendentes</h2>
          <div class="tablewrap"><table><thead><tr><th>Colaborador</th><th>Documentos pendentes</th></tr></thead><tbody id="jornadaPendenciasTable"></tbody></table></div>
        </div>
      </div>
    </section>
```
Trocar por (insere o pane novo + o markup do drawer antes do `</section>`):
```html
        <div class="panel"><h2>Assinaturas de ponto pendentes</h2>
          <div class="tablewrap"><table><thead><tr><th>Colaborador</th><th>Documentos pendentes</th></tr></thead><tbody id="jornadaPendenciasTable"></tbody></table></div>
        </div>
      </div>

      <div class="jornadaHe-tabpane" data-pane="importar">
        <div class="panel"><h2>Importar dados do Portal Meu RH</h2>
          <div class="toolbar">
            <label class="btn primary file">⬆ Importar planilha de saldo<input type="file" accept=".xlsx" onchange="importJornadaSaldoPlanilha(this.files[0]);this.value=''"></label>
            <label class="btn primary file">⬆ Importar Listagem de HE (PDF)<input type="file" accept=".pdf" onchange="importJornadaListagemHe(this.files[0]);this.value=''"></label>
            <label class="btn primary file">⬆ Importar Analítico 180 dias (PDF)<input type="file" accept=".pdf" onchange="importJornadaAnalitico180(this.files[0]);this.value=''"></label>
            <label class="btn primary file">⬆ Importar Sintético 180 dias (PDF)<input type="file" accept=".pdf" onchange="importJornadaSintetico180(this.files[0]);this.value=''"></label>
            <label class="btn primary file">⬆ Importar Espelho Pendente Assinatura (PDF)<input type="file" accept=".pdf" onchange="importJornadaEspelhoPendente(this.files[0]);this.value=''"></label>
            <label class="btn primary file">⬆ Importar Intra/Interjornada detalhado (PDF)<input type="file" accept=".pdf" onchange="importJornadaInterIntraDetalhado(this.files[0]);this.value=''"></label>
          </div>
          <p class="muted" style="font-size:12px;margin-top:-6px">Os arquivos são independentes — pode importar qualquer combinação deles, em qualquer ordem.</p>
        </div>
        <div class="panel"><h2>Últimas importações do Jornada/HE</h2>
          <div class="tablewrap"><table><thead><tr><th>Quando</th><th>Arquivo</th><th>Registros</th><th>Atualizados</th><th>Não encontrados</th></tr></thead><tbody id="jhImportLog"></tbody></table></div>
        </div>
      </div>

      <div class="jh-drawer-backdrop" id="jhDrawerBackdrop" hidden onclick="closeJhEmployeeDrawer()"></div>
      <aside class="jh-drawer" id="jhEmployeeDrawer" hidden aria-label="Detalhe do colaborador">
        <button class="jh-drawer-close" type="button" onclick="closeJhEmployeeDrawer()" aria-label="Fechar">✕</button>
        <div id="jhDrawerBody"></div>
      </aside>
    </section>
```

- [ ] **Step 4: Adicionar o CSS base do dashboard**

Inserir antes de `</style>` (linha ~706):

```css
/* ---- Jornada/HE — dashboard (Fase 3) ---- */
#jhDashboard{display:flex;flex-direction:column;gap:16px}
.jh-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.jh-kpi{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.jh-kpi .k{font-size:12px;color:var(--muted);font-weight:700}
.jh-kpi .v{font-size:22px;font-weight:800;color:var(--selbetti-dark);margin-top:4px}
.jh-kpi.warn .v{color:#b45309}
.jh-kpi.bad .v{color:var(--red)}
.jh-two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.jh-grid-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
.jh-grid-head h2{margin:0}
.jh-sort{font-size:12px;color:var(--muted);font-weight:700;display:flex;align-items:center;gap:6px}
.jh-sort select{font-size:12px;padding:4px 6px;border-radius:8px;border:1px solid var(--line2)}
.jh-drawer-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:60}
.jh-drawer-backdrop[hidden]{display:none}
.jh-drawer{position:fixed;top:0;right:0;height:100vh;width:min(460px,92vw);background:#fff;z-index:61;
  box-shadow:-8px 0 30px rgba(0,0,0,.25);padding:22px;overflow-y:auto;animation:jhSlideIn .18s ease}
.jh-drawer[hidden]{display:none}
@keyframes jhSlideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
.jh-drawer-close{position:absolute;top:14px;right:14px;border:none;background:#eef1f4;width:30px;height:30px;
  border-radius:50%;font-size:14px;cursor:pointer}
@media(max-width:900px){.jh-kpis{grid-template-columns:repeat(2,1fr)}.jh-two{grid-template-columns:1fr}}
```

- [ ] **Step 5: Escrever `jhIsJornadaImport` e `renderJhImportLog`**

Inserir em `renderer/app.html` logo após `jhSparkline` (Task 1):

```js
function jhIsJornadaImport(fname){
  return /bco_horas|espelho.*(assinatura|ponto)|inter\s*jornada|intra\s*jornada|listagem[_ ]?de[_ ]?he|planilha.*saldo|saldo.*selbetti/i.test(fname||'');
}
function renderJhImportLog(){
  const tb=$('jhImportLog');if(!tb)return;
  const rows=(db.imports||[]).filter(i=>jhIsJornadaImport(i.file));
  tb.innerHTML=rows.length?rows.map(i=>`<tr>
    <td>${escHtml(i.at||'')}</td><td>${escHtml(i.file||'')}</td>
    <td>${i.total??'—'}</td><td>${i.updated??'—'}</td><td>${i.errors??0}</td></tr>`).join('')
    :'<tr><td colspan="5" class="muted">Nenhuma importação do Jornada/HE ainda.</td></tr>';
}
```

- [ ] **Step 6: Chamar `renderJhImportLog()` dentro de `render()`**

Localizar (linha ~4006):
```js
  renderJornadaHe();
  renderJornada180Pendencias();
```
Trocar por:
```js
  renderJornadaHe();
  renderJornada180Pendencias();
  renderJhImportLog();
```

- [ ] **Step 7: Ajustar `renderJornadaHe` da Fase 1 para não quebrar com o HTML novo**

A `renderJornadaHe()` da Fase 1 escreve em `$('jornadaHeOverviewCards')` e faz `return` cedo se esse elemento não existir (`renderer/app.html:3681`). Como o elemento foi removido no Step 2, a função inteira vira no-op até a Task 3 reescrevê-la — **isso é o comportamento desejado nesta task** (a Visão Geral fica com os contêineres vazios). Não altere `renderJornadaHe` aqui; apenas confirme, lendo a linha 3681, que o `if(!el)return;` protege contra o elemento ausente. Se em vez de `if(!el)return;` houver acesso direto que quebre, envolva o corpo com `if(!$('jhKpis'))return;` no início. **Não** reescreva a lógica — isso é a Task 3.

- [ ] **Step 8: Verificar sintaxe e balanceamento de tags**

Run:
```bash
node -e "const fs=require('fs');const html=fs.readFileSync('renderer/app.html','utf-8');const s=html.indexOf('<script>'),e=html.lastIndexOf('</script>');fs.writeFileSync(process.env.TEMP+'/check.js',html.slice(s+8,e));"
node --check "$TEMP/check.js"
node -e "const fs=require('fs');const html=fs.readFileSync('renderer/app.html','utf-8');const h=html.slice(0,html.indexOf('<script>'));console.log('div',(h.match(/<div[\s>]/g)||[]).length,(h.match(/<\/div>/g)||[]).length);console.log('section',(h.match(/<section[\s>]/g)||[]).length,(h.match(/<\/section>/g)||[]).length);console.log('aside',(h.match(/<aside[\s>]/g)||[]).length,(h.match(/<\/aside>/g)||[]).length);"
```
Expected: `node --check` sem saída; `div`, `section` e `aside` com os dois números iguais em cada linha.

- [ ] **Step 9: QA manual rápido**

Run: `npm start` (com `ELECTRON_RUN_AS_NODE` desativado)
Expected:
- App abre sem erro no console.
- Aba Jornada/HE → "Visão Geral" mostra os contêineres vazios (sem crash); o `#jhEmpty` aparece só se `db.jornadaPeriods` estiver vazio (com dados importados, `#jhDashboard` aparece mas os blocos ainda estão vazios — normal até a Task 3).
- Aba "Importar" nova: os 6 botões funcionam (importa e mostra o `alert` de sempre); a tabela "Últimas importações do Jornada/HE" lista as importações reconhecidas pelo nome do arquivo.
- Abas Banco de Horas / HE do período / Histórico / 180 dias / Pendências: inalteradas.

- [ ] **Step 10: Commit**

```bash
git add renderer/app.html
git commit -m "Reestrutura aba Jornada/HE: aba Importar + esqueleto do dashboard + drawer"
```

---

## Task 3: `renderJornadaHe()` reescrita — KPIs + faixa de meta

**Files:**
- Modify: `renderer/app.html` — substituir o corpo de `function renderJornadaHe(){...}` (linhas 3680–3726); adicionar CSS antes de `</style>`

**Interfaces:**
- Consumes: `latestJornadaPeriod()`, `jhTeamMetrics(period)`, `jhMetaStatus`, `jhPeriodLabel`, `$`, `escHtml`, `fmtSignedMin`, `fmtDurationMin`, `DEFAULT_AVATAR`
- Produces: `renderJornadaHe()` reescrita que preenche `#jhEmpty`, `#jhDashboard`, `#jhKpis`, `#jhMetaRuler`, `#jhMetaBars` (os demais contêineres — `#jhEvolucao`, `#jhOfensores`, `#jhGrid` — são preenchidos nas Tasks 4–5, dentro da mesma função)

- [ ] **Step 1: Substituir a função `renderJornadaHe`**

Localizar a função inteira (linhas 3680–3726, de `function renderJornadaHe(){` até o `}` que a fecha antes de `function renderJornada180Pendencias(){`) e substituir por:

```js
function renderJornadaHe(){
  const empty=$('jhEmpty'),dash=$('jhDashboard');
  if(!empty||!dash)return;
  const period=latestJornadaPeriod();
  if(!period){
    empty.style.display='';dash.style.display='none';
    return;
  }
  empty.style.display='none';dash.style.display='';
  const tm=jhTeamMetrics(period);

  // ---- KPIs ----
  const periodo=`${period.periodoIni.split('-').reverse().join('/')} a ${period.periodoFim.split('-').reverse().join('/')}`;
  $('jhKpis').innerHTML=`
    <div class="jh-kpi ${tm.pctDentro>=70?'':'warn'}"><div class="k">Dentro da meta ±10h</div><div class="v">${tm.pctDentro}%</div></div>
    <div class="jh-kpi"><div class="k">HE do período</div><div class="v">${fmtDurationMin(tm.heTotalMin)}</div></div>
    <div class="jh-kpi"><div class="k">Intra + interjornada</div><div class="v">${fmtDurationMin(tm.intraInterMin)}</div></div>
    <div class="jh-kpi"><div class="k">Período</div><div class="v" style="font-size:15px">${periodo}</div></div>`;

  // ---- Régua de distribuição (5 faixas) ----
  $('jhMetaRuler').innerHTML=tm.faixas.map(f=>`
    <div class="jh-ruler-cell jh-tone-${f.tone}">
      <div class="jh-ruler-n">${f.employees.length}</div>
      <div class="jh-ruler-lbl">${f.label}</div>
      <div class="jh-ruler-avs">${f.employees.slice(0,8).map(e=>jhAvatar(e,'xs')).join('')}${f.employees.length>8?`<span class="jh-more">+${f.employees.length-8}</span>`:''}</div>
    </div>`).join('');

  // ---- Barras horizontais ordenadas (devedor -> credor) ----
  const bars=[...tm.ativos].sort((a,b)=>(a.bhSaldoTotalMin||0)-(b.bhSaldoTotalMin||0));
  const escala=Math.max(1200,...bars.map(e=>Math.abs(e.bhSaldoTotalMin||0)));
  $('jhMetaBars').innerHTML=bars.map(e=>{
    const v=e.bhSaldoTotalMin||0, st=jhMetaStatus(v), pct=Math.min(100,Math.abs(v)/escala*100)/2;
    const metaPct=600/escala*100/2;
    return `<div class="jh-metabar" onclick="openJhEmployeeDrawer('${e.employeeId}')">
      <div class="jh-metabar-nm">${jhAvatar(e,'sm')}<span>${escHtml(e.nome)}</span></div>
      <div class="jh-metabar-track">
        <span class="jh-metabar-zone" style="left:${(50-metaPct).toFixed(2)}%;width:${(metaPct*2).toFixed(2)}%"></span>
        <span class="jh-metabar-zero"></span>
        <span class="jh-metabar-fill ${st==='dentro'?'ok':'bad'}" style="${v<0?`right:50%;width:${pct.toFixed(2)}%`:`left:50%;width:${pct.toFixed(2)}%`}"></span>
      </div>
      <div class="jh-metabar-val ${st==='dentro'?'':'bad'}">${fmtSignedMin(v)}</div>
    </div>`;
  }).join('')||'<p class="muted">Nenhum colaborador ativo neste período.</p>';

  jhRenderEvolucao();   // Task 4
  jhRenderOfensores(period);  // Task 4
  jhRenderGrid(period);  // Task 5
}
```

Nota: `jhRenderEvolucao`, `jhRenderOfensores`, `jhRenderGrid` e `jhAvatar` são criados nas Tasks 4 e 5. Para esta task compilar e rodar, adicione **stubs temporários** logo após `renderJornadaHe` (serão substituídos):

```js
function jhAvatar(e,size){const src=(e&&e.photo)||DEFAULT_AVATAR;return `<img class="jh-av jh-av-${size||'sm'}" src="${src}" alt="">`;}
function jhRenderEvolucao(){}
function jhRenderOfensores(){}
function jhRenderGrid(){}
```

- [ ] **Step 2: Adicionar o CSS de KPIs, régua e barras**

Inserir antes de `</style>`, junto ao bloco `/* ---- Jornada/HE — dashboard (Fase 3) ---- */`:

```css
.jh-av{border-radius:50%;object-fit:cover;background:#eef1f4;flex:0 0 auto}
.jh-av-xs{width:16px;height:16px}
.jh-av-sm{width:24px;height:24px}
.jh-av-lg{width:64px;height:64px;border:3px solid var(--selbetti-soft)}
.jh-ruler{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:6px 0 14px}
.jh-ruler-cell{border:1px solid var(--line);border-radius:10px;padding:10px 8px;text-align:center}
.jh-ruler-cell.jh-tone-ok{background:#ecfdf3;border-color:#abefc6}
.jh-ruler-cell.jh-tone-warn{background:#fffaeb;border-color:#fedf89}
.jh-ruler-cell.jh-tone-bad{background:#fef3f2;border-color:#fecdca}
.jh-ruler-n{font-size:20px;font-weight:800}
.jh-ruler-lbl{font-size:10px;color:var(--muted);margin-top:2px;line-height:1.2}
.jh-ruler-avs{display:flex;gap:2px;justify-content:center;flex-wrap:wrap;margin-top:6px;min-height:16px}
.jh-more{font-size:10px;color:var(--muted);font-weight:700}
.jh-metabars{display:flex;flex-direction:column;gap:4px}
.jh-metabar{display:grid;grid-template-columns:150px 1fr 64px;align-items:center;gap:10px;cursor:pointer;padding:2px 4px;border-radius:6px}
.jh-metabar:hover{background:#f8fafc}
.jh-metabar-nm{display:flex;align-items:center;gap:6px;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jh-metabar-track{position:relative;height:18px;background:#f1f5f9;border-radius:4px}
.jh-metabar-zone{position:absolute;top:0;bottom:0;background:#dcfae6;border-left:1px dashed #86c9a3;border-right:1px dashed #86c9a3}
.jh-metabar-zero{position:absolute;top:-3px;bottom:-3px;left:50%;width:2px;background:#94a3b8}
.jh-metabar-fill{position:absolute;top:2px;bottom:2px;border-radius:3px;background:var(--selbetti)}
.jh-metabar-fill.ok{background:#079149}
.jh-metabar-fill.bad{background:var(--red)}
.jh-metabar-val{font-size:12px;font-weight:700;text-align:right}
.jh-metabar-val.bad{color:var(--red)}
```

- [ ] **Step 3: Verificar sintaxe**

Run:
```bash
node -e "const fs=require('fs');const html=fs.readFileSync('renderer/app.html','utf-8');const s=html.indexOf('<script>'),e=html.lastIndexOf('</script>');fs.writeFileSync(process.env.TEMP+'/check.js',html.slice(s+8,e));"
node --check "$TEMP/check.js"
```
Expected: sem saída.

- [ ] **Step 4: QA manual**

Run: `npm start`
Expected: com dados reais importados, a Visão Geral mostra:
- 4 KPIs preenchidos (o de % vira `warn`/amarelo abaixo de 70%).
- Régua de 5 faixas com contagem e mini-fotos; soma das contagens = nº de colaboradores da aba Banco de Horas.
- Barras horizontais, uma por colaborador, ordenadas do saldo mais negativo ao mais positivo; barra verde dentro de ±10h, vermelha fora; valor à direita bate com a coluna "Saldo total" da aba Banco de Horas.
- Sem período importado → aparece só `#jhEmpty`.

- [ ] **Step 5: Commit**

```bash
git add renderer/app.html
git commit -m "Reescreve Visao Geral do Jornada/HE: KPIs e faixa de meta +/-10h"
```

---

## Task 4: Evolução por período + ofensores

**Files:**
- Modify: `renderer/app.html` — substituir os stubs `jhRenderEvolucao`/`jhRenderOfensores` por implementações reais (logo após `renderJornadaHe`); adicionar CSS antes de `</style>`

**Interfaces:**
- Consumes: `jhEvolucaoSeries()`, `jhOfensores(period)`, `jhSparkline`, `jhAvatar`, `$`, `escHtml`, `fmtSignedMin`, `fmtDurationMin`
- Produces: `jhRenderEvolucao()` (preenche `#jhEvolucao`), `jhRenderOfensores(period)` (preenche `#jhOfensores`)

- [ ] **Step 1: Implementar `jhRenderEvolucao`**

Substituir o stub `function jhRenderEvolucao(){}` por:

```js
function jhRenderEvolucao(){
  const el=$('jhEvolucao');if(!el)return;
  const s=jhEvolucaoSeries();
  if(!s.length){el.innerHTML='<p class="muted">Nenhum período importado.</p>';return}
  const cards=[
    {t:'Saldo líquido da equipe',vals:s.map(p=>p.saldoLiquidoMin),fmt:fmtSignedMin},
    {t:'HE total',vals:s.map(p=>p.heTotalMin),fmt:fmtDurationMin},
    {t:'Colaboradores fora da meta',vals:s.map(p=>p.foraMeta),fmt:v=>String(v)}
  ];
  const xlab=`<div class="jh-mini-x"><span>${s[0].label}</span>${s.length>1?`<span>${s[s.length-1].label}</span>`:''}</div>`;
  el.innerHTML=`<div class="jh-minis">${cards.map(c=>`
    <div class="jh-mini">
      <div class="jh-mini-t">${c.t}</div>
      ${jhSparkline(c.vals)}
      <div class="jh-mini-v">${c.fmt(c.vals[c.vals.length-1])}</div>
      ${xlab}
    </div>`).join('')}</div>
    ${s.length<2?'<p class="muted" style="font-size:11px;margin-top:6px">O histórico aparece a partir da 2ª importação de período.</p>':''}`;
}
```

- [ ] **Step 2: Implementar `jhRenderOfensores`**

Substituir o stub `function jhRenderOfensores(){}` por:

```js
function jhRenderOfensores(period){
  const el=$('jhOfensores');if(!el)return;
  const o=jhOfensores(period);
  const col=(titulo,itens,fmt,empty)=>`
    <div class="jh-offcard">
      <h4>${titulo}</h4>
      ${itens.length?itens.map(x=>`<div class="jh-offrow" onclick="openJhEmployeeDrawer('${x.employeeId}')">
        ${jhAvatar(x,'sm')}<span class="jh-offnm">${escHtml(x.nome)}</span><b class="${x.valorMin<0?'bad':''}">${fmt(x.valorMin)}</b>
      </div>`).join(''):`<p class="muted" style="font-size:11px">${empty}</p>`}
    </div>`;
  el.innerHTML=
    col('Banco de horas fora da meta',o.bancoHoras,fmtSignedMin,'Toda a equipe dentro da meta.')+
    col('Horas extras',o.he,fmtDurationMin,'Sem horas extras no período.')+
    col('Intra + interjornada',o.intraInter,fmtDurationMin,'Sem ocorrências no período.');
}
```

- [ ] **Step 3: Adicionar o CSS de evolução e ofensores**

Inserir antes de `</style>`, junto ao bloco da Fase 3:

```css
.jh-minis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.jh-mini{border:1px solid var(--line);border-radius:10px;padding:10px}
.jh-mini-t{font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.03em}
.jh-mini-v{font-size:16px;font-weight:800;margin-top:2px}
.jh-mini-x{display:flex;justify-content:space-between;font-size:9px;color:var(--muted);margin-top:2px}
.jh-spark{height:56px}
.jh-spark svg{width:100%;height:100%;display:block;overflow:visible}
.jh-spark-line{stroke:var(--selbetti);stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.jh-spark-dot{fill:var(--selbetti-dark)}
.jh-spark-zero{stroke:#cbd5e1;stroke-width:1;stroke-dasharray:4 4}
.jh-spark-empty{height:56px;background:repeating-linear-gradient(90deg,#eef2f6 0 1px,transparent 1px 24px);border-bottom:1px solid #cbd5e1}
.jh-off3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.jh-offcard{border:1px solid var(--line);border-radius:10px;padding:10px}
.jh-offcard h4{margin:0 0 8px;font-size:10px;text-transform:uppercase;color:var(--muted)}
.jh-offrow{display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid var(--line);font-size:12px;cursor:pointer}
.jh-offrow:last-child{border-bottom:none}
.jh-offrow:hover{background:#f8fafc}
.jh-offnm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jh-offrow b{margin-left:auto;font-weight:700}
.jh-offrow b.bad{color:var(--red)}
@media(max-width:900px){.jh-minis,.jh-off3{grid-template-columns:1fr}}
```

- [ ] **Step 4: Verificar sintaxe**

Run:
```bash
node -e "const fs=require('fs');const html=fs.readFileSync('renderer/app.html','utf-8');const s=html.indexOf('<script>'),e=html.lastIndexOf('</script>');fs.writeFileSync(process.env.TEMP+'/check.js',html.slice(s+8,e));"
node --check "$TEMP/check.js"
```
Expected: sem saída.

- [ ] **Step 5: QA manual**

Run: `npm start`
Expected:
- Bloco "Evolução por período": 3 mini-gráficos (saldo líquido, HE total, fora da meta). Com 1 período só, mostra o ponto único + o aviso "aparece a partir da 2ª importação". Com 2+ períodos, a linha conecta os pontos e o rótulo do eixo mostra a 1ª e a última competência.
- Bloco "Ofensores": 3 colunas. "Banco de horas fora da meta" lista só quem está fora, ordenado pela distância de zero, valor com sinal (vermelho quando negativo). "Horas extras" e "Intra + interjornada" listam os maiores, ignorando zeros. Coluna sem candidatos mostra a mensagem de vazio.
- Clicar numa linha de ofensor abre o drawer (ainda sem conteúdo real até a Task 6 — pode dar erro de `openJhEmployeeDrawer` indefinido; nesse caso, este step só valida visualmente as listas e o clique é testado na Task 6).

- [ ] **Step 6: Commit**

```bash
git add renderer/app.html
git commit -m "Adiciona evolucao por periodo e ofensores no dashboard do Jornada/HE"
```

---

## Task 5: Grade de colaboradores (cartões RICH) + ordenação

**Files:**
- Modify: `renderer/app.html` — substituir o stub `jhRenderGrid` e o stub `jhAvatar` por implementações reais; adicionar CSS antes de `</style>`

**Interfaces:**
- Consumes: `jhMetaStatus`, `$`, `escHtml`, `fmtSignedMin`, `fmtDurationMin`, `DEFAULT_AVATAR`, `db.employees`, `#jhGridSort`
- Produces: `jhAvatar(emp, size)` (versão final), `jhRenderGrid(period)` (preenche `#jhGrid`), `jhEmpLookup(employeeId)` (helper: junta o registro do período com o cadastro de `db.employees`)

- [ ] **Step 1: Implementar `jhAvatar` e `jhEmpLookup`**

Substituir o stub `function jhAvatar(e,size){...}` por:

```js
// junta o registro do colaborador no período (nome/saldo/HE/etc.) com o cadastro (foto/função/CC/admissão)
function jhEmpLookup(employeeId){
  const cad=(db.employees||[]).find(x=>x.id===employeeId)||{};
  return {
    id:employeeId, photo:cad.photo||'', role:cad.role||'', costCenter:cad.costCenter||'',
    admission:cad.admission||''
  };
}
function jhAvatar(e,size){
  const src=(e&&e.photo)||(e&&e.employeeId&&jhEmpLookup(e.employeeId).photo)||DEFAULT_AVATAR;
  return `<img class="jh-av jh-av-${size||'sm'}" src="${src||DEFAULT_AVATAR}" alt="" onerror="this.src='${DEFAULT_AVATAR}'">`;
}
```

- [ ] **Step 2: Implementar `jhRenderGrid`**

Substituir o stub `function jhRenderGrid(){}` por:

```js
function jhRenderGrid(period){
  const el=$('jhGrid');if(!el)return;
  const sort=($('jhGridSort')||{}).value||'nome';
  let list=period.employees.filter(e=>e.employeeId);
  if(sort==='nome')list=list.sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  else if(sort==='saldo')list=list.sort((a,b)=>(a.bhSaldoTotalMin||0)-(b.bhSaldoTotalMin||0));
  else if(sort==='fora')list=list.sort((a,b)=>{
    const fa=jhMetaStatus(a.bhSaldoTotalMin)==='dentro'?1:0, fb=jhMetaStatus(b.bhSaldoTotalMin)==='dentro'?1:0;
    return fa-fb || Math.abs(b.bhSaldoTotalMin||0)-Math.abs(a.bhSaldoTotalMin||0);
  });
  el.innerHTML=list.map(e=>{
    const cad=jhEmpLookup(e.employeeId), st=jhMetaStatus(e.bhSaldoTotalMin);
    const sub=[cad.role,cad.costCenter].filter(Boolean).join(' · ')||'—';
    return `<div class="jh-card jh-card-${st==='dentro'?'ok':'bad'}" onclick="openJhEmployeeDrawer('${e.employeeId}')">
      <div class="jh-card-hd">${jhAvatar(e,'lg')}<div><b>${escHtml(e.nome)}</b><small>${escHtml(sub)}</small></div></div>
      <div class="jh-card-mini">
        <span>Saldo BH</span><b class="${(e.bhSaldoTotalMin||0)<0?'bad':''}">${fmtSignedMin(e.bhSaldoTotalMin)}</b>
        <span>HE</span><b>${fmtDurationMin(e.horasExtraMin)}</b>
        <span>Intra</span><b>${fmtDurationMin(e.intrajornadaMin)}</b>
        <span>Inter</span><b>${fmtDurationMin(e.interjornadaMin)}</b>
      </div>
    </div>`;
  }).join('')||'<p class="muted">Nenhum colaborador ativo neste período.</p>';
}
```

- [ ] **Step 3: Adicionar o CSS da grade**

Inserir antes de `</style>`, junto ao bloco da Fase 3:

```css
.jh-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.jh-card{border:1px solid var(--line);border-radius:12px;padding:12px;cursor:pointer;border-left:4px solid #079149;transition:box-shadow .15s}
.jh-card:hover{box-shadow:0 4px 14px rgba(0,0,0,.10)}
.jh-card-bad{border-left-color:var(--red)}
.jh-card-hd{display:flex;gap:10px;align-items:center}
.jh-card-hd b{font-size:12px;display:block}
.jh-card-hd small{font-size:10px;color:var(--muted);display:block}
.jh-card-mini{display:grid;grid-template-columns:auto 1fr;gap:3px 8px;margin-top:10px;font-size:11px}
.jh-card-mini span{color:var(--muted)}
.jh-card-mini b{text-align:right}
.jh-card-mini b.bad{color:var(--red)}
@media(max-width:1100px){.jh-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:640px){.jh-grid{grid-template-columns:1fr}}
```

- [ ] **Step 4: Verificar sintaxe**

Run:
```bash
node -e "const fs=require('fs');const html=fs.readFileSync('renderer/app.html','utf-8');const s=html.indexOf('<script>'),e=html.lastIndexOf('</script>');fs.writeFileSync(process.env.TEMP+'/check.js',html.slice(s+8,e));"
node --check "$TEMP/check.js"
```
Expected: sem saída.

- [ ] **Step 5: QA manual**

Run: `npm start`
Expected:
- Grade com 4 cartões por linha (2 em telas médias, 1 em estreitas), cada um com foto, nome, `função · centro de custo` e os 4 números (Saldo BH, HE, Intra, Inter). Colaborador sem foto → avatar padrão. Borda esquerda verde (dentro) ou vermelha (fora da meta).
- Os 4 números batem com as abas Banco de Horas e HE do período.
- O seletor "Ordenar" muda a ordem: por nome (A→Z), por saldo (mais negativo primeiro), fora da meta primeiro.

- [ ] **Step 6: Commit**

```bash
git add renderer/app.html
git commit -m "Adiciona grade de colaboradores com foto e ordenacao no dashboard do Jornada/HE"
```

---

## Task 6: Painel lateral de detalhe do colaborador

**Files:**
- Modify: `renderer/app.html` — adicionar `openJhEmployeeDrawer`/`closeJhEmployeeDrawer` (logo após `jhRenderGrid`); adicionar CSS antes de `</style>`; adicionar listener de tecla Esc

**Interfaces:**
- Consumes: `latestJornadaPeriod()` (linha 1836), `findJornadaEmployeeRecord(period,employeeId)` (linha 1842), `jhEmpLookup`, `jhMetaStatus`, `jhSparkline`, `jhPeriodLabel`, `db.jornadaPeriods`, `db.jornada180Windows`, `$`, `escHtml`, `fmtSignedMin`, `fmtDurationMin`, `DEFAULT_AVATAR`. Não usa `jhEvolucaoSeries` (o drawer tem série própria por colaborador via `jhEmpSaldoSeries`).
- Produces: `openJhEmployeeDrawer(employeeId)`, `closeJhEmployeeDrawer()`, `jhEmpSaldoSeries(employeeId)` (helper local)

- [ ] **Step 1: Implementar as funções do drawer**

Inserir logo após `jhRenderGrid`:

```js
// série do saldo total desse colaborador ao longo dos períodos importados (para o mini-gráfico do drawer)
function jhEmpSaldoSeries(employeeId){
  return [...(db.jornadaPeriods||[])]
    .sort((a,b)=>a.id.localeCompare(b.id))
    .map(p=>{
      const r=(p.employees||[]).find(e=>e.employeeId===employeeId);
      return {label:jhPeriodLabel(p.id),v:r?(r.bhSaldoTotalMin||0):0};
    });
}
function openJhEmployeeDrawer(employeeId){
  const period=latestJornadaPeriod();if(!period)return;
  const rec=findJornadaEmployeeRecord(period,employeeId);if(!rec)return;
  const cad=jhEmpLookup(employeeId);
  const st=jhMetaStatus(rec.bhSaldoTotalMin);
  const stTxt=st==='dentro'?'Dentro da meta':'Fora da meta';
  const sub=[cad.role,cad.costCenter,cad.admission?('admissão '+cad.admission.slice(0,7).split('-').reverse().join('/')):''].filter(Boolean).join(' · ');

  const evts=Array.isArray(rec.interIntraEvents)?rec.interIntraEvents:[];
  let intraInterHtml;
  if(evts.length){
    intraInterHtml=`<table class="jh-dtable"><thead><tr><th>Data</th><th>Código</th><th>Descrição</th><th>Tipo</th><th style="text-align:right">Min</th></tr></thead><tbody>${
      [...evts].sort((a,b)=>String(b.data).localeCompare(String(a.data))).map(x=>`<tr>
        <td>${String(x.data||'').split('-').reverse().join('/')}</td><td>${escHtml(x.codigo||'')}</td>
        <td>${escHtml(x.descricao||'')}</td><td>${x.tipo==='inter'?'inter':'intra'}</td>
        <td style="text-align:right">${fmtDurationMin(x.minutos)}</td></tr>`).join('')
    }</tbody></table>`;
  }else if((rec.intrajornadaMin||0)||(rec.interjornadaMin||0)){
    intraInterHtml=`<p class="jh-d-note">Totais do período: intrajornada ${fmtDurationMin(rec.intrajornadaMin)} · interjornada ${fmtDurationMin(rec.interjornadaMin)}.<br>Importe o PDF <b>Intra/Interjornada detalhado</b> na aba Importar para ver evento a evento.</p>`;
  }else{
    intraInterHtml='<p class="jh-d-note">Sem ocorrências de intra/interjornada no período.</p>';
  }

  // pendências
  const docs=Array.isArray(rec.pendingSignatureDocs)?rec.pendingSignatureDocs:[];
  const venc=Array.isArray(rec.vencimentos180d)?rec.vencimentos180d:[];
  const win=(db.jornada180Windows||[]).slice().sort((a,b)=>a.id.localeCompare(b.id))[0];
  const winRec=win?(win.employees||[]).find(e=>e.employeeId===employeeId):null;
  const pendParts=[];
  if(docs.length)pendParts.push(`${docs.length} espelho(s) de ponto pendente(s): ${docs.map(d=>escHtml(d.arquivo||d.id||'')).join(', ')}`);
  if(venc.length)pendParts.push('Vencimento 180d projetado: '+venc.map(v=>`${v.competenciaId} ${fmtSignedMin(v.valorMin)}`).join(' · '));
  if(winRec)pendParts.push(`Janela ${win.janelaIni.split('-').reverse().join('/')} a ${win.janelaFim.split('-').reverse().join('/')}: ${fmtSignedMin(winRec.valorPagarDescontarMin)}`);

  $('jhDrawerBody').innerHTML=`
    <div class="jh-d-hd">${jhAvatar({employeeId,photo:cad.photo},'lg')}
      <div><h3>${escHtml(rec.nome)}</h3><small>${escHtml(sub||'—')}</small></div>
      <span class="jh-d-chip ${st==='dentro'?'ok':'bad'}">${stTxt} · ${fmtSignedMin(rec.bhSaldoTotalMin)}</span>
    </div>
    <div class="jh-d-metrics">
      <div><b>${fmtSignedMin(rec.bhSaldoTotalMin)}</b><small>Saldo banco de horas</small></div>
      <div><b>${fmtDurationMin(rec.horasExtraMin)}</b><small>Horas extras</small></div>
      <div><b>${fmtDurationMin(rec.intrajornadaMin)}</b><small>Intrajornada</small></div>
      <div><b>${fmtDurationMin(rec.interjornadaMin)}</b><small>Interjornada</small></div>
    </div>
    <div class="jh-d-sec"><h4>Evolução do saldo</h4>${jhSparkline(jhEmpSaldoSeries(employeeId))}</div>
    <div class="jh-d-sec"><h4>Ocorrências de intra/interjornada</h4>${intraInterHtml}</div>
    <div class="jh-d-sec"><h4>Pendências</h4>${pendParts.length?pendParts.map(p=>`<p class="jh-d-note">${p}</p>`).join(''):'<p class="jh-d-note">Nenhuma pendência registrada.</p>'}</div>`;

  $('jhDrawerBackdrop').hidden=false;
  $('jhEmployeeDrawer').hidden=false;
}
function closeJhEmployeeDrawer(){
  const b=$('jhDrawerBackdrop'),d=$('jhEmployeeDrawer');
  if(b)b.hidden=true;
  if(d)d.hidden=true;
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const d=$('jhEmployeeDrawer');if(d&&!d.hidden)closeJhEmployeeDrawer();}});
```

- [ ] **Step 2: Adicionar o CSS do conteúdo do drawer**

Inserir antes de `</style>`, junto ao bloco da Fase 3:

```css
.jh-d-hd{display:flex;gap:12px;align-items:center;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:12px;margin:6px 0 12px}
.jh-d-hd h3{margin:0;font-size:16px}
.jh-d-hd small{color:var(--muted);font-size:11px}
.jh-d-chip{font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px}
.jh-d-chip.ok{background:#ecfdf3;color:#067647}
.jh-d-chip.bad{background:#fef3f2;color:var(--red)}
.jh-d-metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px}
.jh-d-metrics>div{background:#f8fafc;border:1px solid var(--line);border-radius:8px;padding:8px;text-align:center}
.jh-d-metrics b{display:block;font-size:15px}
.jh-d-metrics small{font-size:9px;color:var(--muted)}
.jh-d-sec{margin-bottom:14px}
.jh-d-sec h4{margin:0 0 6px;font-size:10px;text-transform:uppercase;color:var(--muted)}
.jh-d-note{font-size:11px;color:#334155;margin:4px 0}
.jh-dtable{width:100%;border-collapse:collapse;font-size:10px}
.jh-dtable th,.jh-dtable td{padding:3px 4px;border-bottom:1px solid var(--line);text-align:left}
```

- [ ] **Step 3: Verificar sintaxe**

Run:
```bash
node -e "const fs=require('fs');const html=fs.readFileSync('renderer/app.html','utf-8');const s=html.indexOf('<script>'),e=html.lastIndexOf('</script>');fs.writeFileSync(process.env.TEMP+'/check.js',html.slice(s+8,e));"
node --check "$TEMP/check.js"
```
Expected: sem saída.

- [ ] **Step 4: QA manual**

Run: `npm start`
Expected:
- Clicar num cartão da grade, numa barra de meta ou numa linha de ofensor abre o painel lateral deslizando da direita, com backdrop escurecido.
- Cabeçalho: foto grande, nome, `função · centro de custo · admissão mm/aaaa`, chip verde/vermelho com o status e o saldo.
- 4 métricas grandes conferem com a grade.
- "Evolução do saldo": mini-gráfico com um ponto por período; se só há 1 período, aparece 1 ponto.
- "Ocorrências de intra/interjornada": tabela evento a evento se o PDF detalhado foi importado; senão, os totais + aviso; senão, "sem ocorrências".
- "Pendências": linhas de assinatura pendente / vencimento 180d / janela de 180 dias, cada uma só aparece se o dado existe.
- Fechar: no ✕, na tecla Esc, e clicando no backdrop.

- [ ] **Step 5: Commit**

```bash
git add renderer/app.html
git commit -m "Adiciona painel lateral de detalhe do colaborador no Jornada/HE"
```

---

## Task 7: QA manual completo + build + publicação

**Files:** `package.json`, `package-lock.json` (bump de versão); nenhuma mudança de lógica salvo ajustes de QA.

- [ ] **Step 1: Rodar o app e exercitar o dashboard inteiro**

```bash
# PowerShell: Remove-Item Env:\ELECTRON_RUN_AS_NODE  (ou: unset ELECTRON_RUN_AS_NODE)
npm start
```
Verificar, na aba Jornada/HE → Visão Geral, com os dados reais já importados (`F:\Projetos DEV\Modulo RH`, período `26/07/2026 a 25/08/2026`, 15 colaboradores):
- KPIs, régua de meta e barras conferem com a aba Banco de Horas.
- Evolução: com 1 período, aviso de histórico; importar um 2º período (ou ter um no `db`) faz a linha aparecer.
- Ofensores: 3 colunas corretas; "banco de horas fora da meta" só com quem está fora.
- Grade: 15 cartões, 4 números cada, ordenação nas 3 opções.
- Drawer: abre por cartão / barra / ofensor; conteúdo completo; fecha por ✕ / Esc / backdrop.

- [ ] **Step 2: Conferir a aba "Importar"**

- Os 6 botões importam (mesmos `alert` de antes) e o dashboard re-renderiza com os novos números.
- A tabela "Últimas importações do Jornada/HE" lista as importações reconhecidas.

- [ ] **Step 3: Conferir estados vazios**

- Num perfil/instalação sem `db.jornadaPeriods` (ou renomeando temporariamente o array no DevTools), a Visão Geral mostra só `#jhEmpty`; nenhum bloco quebra; nenhum erro no console.

- [ ] **Step 4: Conferir que as Fases 1 e 2 continuam intactas**

- Abas Banco de Horas / HE do período / Histórico / 180 dias / Pendências: exatamente os mesmos valores de antes.
- Perfil individual do colaborador → "valor a receber estimado": inalterado (`computeTimesheetPayroll` não foi tocado).
- Home: alerta de assinatura pendente (Fase 2) continua aparecendo.

- [ ] **Step 5: Verificação final de sintaxe e balanceamento**

Run:
```bash
node -e "const fs=require('fs');const html=fs.readFileSync('renderer/app.html','utf-8');const s=html.indexOf('<script>'),e=html.lastIndexOf('</script>');fs.writeFileSync(process.env.TEMP+'/check.js',html.slice(s+8,e));"
node --check "$TEMP/check.js"
node -e "const fs=require('fs');const html=fs.readFileSync('renderer/app.html','utf-8');const h=html.slice(0,html.indexOf('<script>'));console.log('div',(h.match(/<div[\s>]/g)||[]).length,(h.match(/<\/div>/g)||[]).length);console.log('section',(h.match(/<section[\s>]/g)||[]).length,(h.match(/<\/section>/g)||[]).length);console.log('aside',(h.match(/<aside[\s>]/g)||[]).length,(h.match(/<\/aside>/g)||[]).length);"
```
Expected: `node --check` sem saída; pares de tags iguais.

- [ ] **Step 6: Rodar o teste das funções puras de novo**

Run: `node scratchpad/test-jh-fase3.mjs`
Expected: `OK — todas as asserções da Fase 3 (funções puras) passaram`.

- [ ] **Step 7: Bump de versão**

Em `package.json` e `package-lock.json` (3 ocorrências no total: `package.json` linha 4; `package-lock.json` linhas 3 e 9), trocar `"version": "8.7.0"` por `"version": "8.8.0"`.

- [ ] **Step 8: Build completo**

Run: `npx electron-builder --win`
Expected: exit code 0; gera `dist\GO-Enterprise-Setup-8.8.0.exe` e `.blockmap`.

- [ ] **Step 9: Commit**

```bash
git add renderer/app.html package.json package-lock.json
git commit -m "Finaliza Fase 3 do Jornada/HE: dashboard executivo + bump 8.8.0"
```

- [ ] **Step 10: Publicar a atualização**

Copiar `dist\GO-Enterprise-Setup-8.8.0.exe` + `.blockmap` para a pasta de atualizações (`<sharedFolder>\atualizacoes\`, hoje `D:\PDFs\DAVID\BANCO DE DADOS\atualizacoes`) e escrever `version.json`:
```json
{
  "version": "8.8.0",
  "installer": "GO-Enterprise-Setup-8.8.0.exe",
  "notes": "Jornada/HE: nova Visão Geral como painel executivo — KPIs, meta de banco de horas ±10h, evolução por período, ofensores (banco de horas, HE, intra/interjornada) e grade de colaboradores com foto e detalhe por pessoa (incluindo intra/interjornada evento a evento). Botões de importação movidos para a aba 'Importar'. Nenhuma mudança nos cálculos.",
  "publishedAt": "<ISO agora>"
}
```
Confirmar (via `node`) que `version.json` é válido e o instalador referenciado existe na pasta.

---

## Self-review desta plan (já aplicado)

- **Cobertura da spec**: reorganização de abas (Task 2) · regra de meta `jhMetaStatus` (Task 1) · KPIs + régua + barras (Task 3) · evolução small-multiples + ofensores 3 colunas (Task 4) · grade RICH + ordenação (Task 5) · painel lateral com 4 métricas + evolução do saldo + intra/inter evento a evento + pendências/180d (Task 6) · aba "Importar" com os 6 botões movidos + log (Task 2) · estados vazios (Tasks 3–6, verificados na Task 7) · testes de função pura + `node --check` + balanceamento + QA + bump 8.8.0 + publicação (Tasks 1, 7). Todas as seções da spec têm task.
- **Sem placeholders**: todo o código dos steps é real. Os stubs `jhRenderEvolucao`/`jhRenderOfensores`/`jhRenderGrid`/`jhAvatar` na Task 3 são explicitamente temporários e substituídos por implementações completas nas Tasks 4–5 (necessário para cada task compilar isoladamente).
- **Consistência de tipos**: `jhMetaStatus` retorna sempre `'dentro'|'acima'|'abaixo'` e é usada com esse contrato em `jhTeamMetrics`, `jhOfensores`, `jhEvolucaoSeries`, `jhRenderGrid`, `openJhEmployeeDrawer`. `jhTeamMetrics().faixas` tem `{key,label,tone,employees}` em todas as chamadas. Itens de ofensor são `{employeeId,nome,valorMin}` na produção (`jhOfensores`) e no consumo (`jhRenderOfensores`). `jhSparkline` aceita `number[]` (evolução) e `[{v}]` (`jhEmpSaldoSeries`) — ambos tratados no `map` inicial. `jhAvatar` é chamada com registro de período (`{employeeId,nome,...}`) e com objeto sintético `{employeeId,photo}` — ambos cobertos. `jhEmpLookup` retorna `{id,photo,role,costCenter,admission}` e é consumido com esses campos em `jhRenderGrid` e `openJhEmployeeDrawer`.
- **Ordem de implementação**: Task 1 (puras, testáveis sozinhas) → Task 2 (HTML/esqueleto, app não quebra) → Tasks 3–6 (cada uma acende um bloco do dashboard, verificável no `npm start`) → Task 7 (QA + build + publish). Cada task termina com deliverable testável e commit próprio.
