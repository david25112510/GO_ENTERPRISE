# Jornada/HE — Fase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar ao módulo Jornada/HE (já em produção, v8.6.0) os 4 documentos restantes do Portal Meu RH: aging de 180 dias (Analítico + Sintético), assinaturas de ponto pendentes, e o detalhe evento-a-evento de intra/interjornada — puramente como dados e tabelas simples, sem redesenho visual (isso é a Fase 3).

**Architecture:** 4 parsers novos reaproveitando a mesma engine de extração de texto de PDF já validada na Fase 1 (`extractPdfFragments`), cada um com seu importador próprio e botão dedicado. Espelho de Ponto Pendente e Intra/Interjornada detalhado anexam ao registro existente de `db.jornadaPeriods` (são sobre o período ativo); Analítico/Sintético de 180 dias alimentam uma coleção nova `db.jornada180Windows` (Analítico) e um campo de projeção no registro existente (Sintético) — porque a janela de 180 dias é uma competência diferente da ativa.

**Tech Stack:** Electron, JS puro sem framework (renderer/app.html), motor de extração de PDF já existente (sem libs novas).

**Spec:** `docs/superpowers/specs/2026-08-27-jornada-he-fase2-design.md` (e `docs/superpowers/specs/2026-08-19-jornada-he-design.md` para o contexto da Fase 1, que este plano estende).

## Global Constraints

- HE (`horasExtraMin`) nunca entra no cálculo de pagamento estimado (`computeTimesheetPayroll`) — regra da Fase 1, continua valendo.
- Os valores de 180 dias desta Fase 2 (`valorPagarDescontarMin`, `vencimentos180d`) são **só informativos** — não tocam `computeTimesheetPayroll` nesta fase. Confirmado com o usuário.
- `interIntraEvents` é armazenado mas não recalcula `intrajornadaMin`/`interjornadaMin` — esses totais continuam vindo da Listagem de HE (Fase 1).
- Nenhuma mudança em `computeTimesheetPayroll`, `renderProfileTimesheets`, `importTimesheet`/`db.timesheets`, ou em qualquer função/dado da Fase 1 além das 3 extensões de schema descritas na Task 1.
- Sem framework, sem build step, sem libs novas — tudo em `renderer/app.html`, seguindo os padrões já estabelecidos (`norm`/`normName` para casar colaborador, `db.imports` para log, `save(true)` para persistir, `alert()` para feedback).
- Trabalhar direto na branch `main`, sem worktree — mesmo modo de execução da Fase 1 (consentimento já dado pelo usuário para todo este projeto).

## Arquivos de referência (dados reais para os testes)

Todos em `F:\Projetos DEV\Modulo RH\`, mesmo período ativo `26/07/2026 a 25/08/2026`, mesmos 15 colaboradores da Fase 1:
- `Bco_Horas_Selbetti_Analitico_Portal_MEU_RH.pdf`
- `Bco_Horas_Selbetti_Sintetico_Portal_MEU_RH.pdf`
- `Espelho_de_Ponto_PENDENTE_Assinatura_Portal_MEU_RH.pdf`
- `Listagem_de_INTERJORNADA_e_INTRAJORNADA_Portal_MEU_RH.pdf`
- `Relatorios\Ultimo_Painel.html` — saída já calculada pela ferramenta Python pra este mesmo período, usada como gabarito (equivalente ao `historico.json` da Fase 1).

Os 4 PDFs já foram explorados fragmento a fragmento (mesma técnica da Fase 1: copiar as funções de baixo nível de `renderer/app.html:2898-3027` — `inflateZlib`, `bytesToLatin1`, `parsePdfObjects`, `pdfDictGet`, `pdfResolveRef`, `pdfGetStreamBytes`, `parseToUnicodeMap`, `extractPdfFragments` — pra um script standalone e rodar contra o arquivo real). As posições X de coluna e os valores esperados abaixo já vêm dessa exploração real, não são estimativas.

---

## Task 1: Modelo de dados (Fase 2)

**Files:**
- Modify: `src/dataStore.js` (`ARRAY_COLLECTIONS`)
- Modify: `renderer/app.html` (`normalizeJornadaEmployeeRecord`, `normalizeDb`, e funções novas logo após `upsertJornadaEmployeeRecord`)

**Interfaces:**
- Consumes: `jornadaPeriodId` (Fase 1, mesmo padrão de `"YYYY-MM"`).
- Produces:
  - `normalizeJornadaEmployeeRecord` ganha `pendingSignatureDocs`, `interIntraEvents`, `vencimentos180d` (arrays, `[]` por padrão).
  - `jornada180WindowId(dateIso) -> string`
  - `normalizeJornada180Employee(e) -> {employeeId,chapa,nome,valorPagarDescontarMin,eventos}`
  - `normalizeJornada180Window(w) -> {id,janelaIni,janelaFim,importedAt,updatedAt,employees}`
  - `upsertJornada180EmployeeRecord(windowId,janelaIni,janelaFim,employeeId,chapa,nome,patch)`

- [ ] **Step 1: Registrar a coleção no merge entre PCs**

Em `src/dataStore.js`, trocar:
```js
const ARRAY_COLLECTIONS = [
  'production', 'finance', 'expenses', 'losses', 'employees', 'absences', 'vacations',
  'suppliers', 'imports', 'history', 'activities', 'timesheets', 'manuals', 'news',
  'alerts', 'dailyMessages', 'selbNews', 'selbAlerts', 'jornadaPeriods'
];
```
por:
```js
const ARRAY_COLLECTIONS = [
  'production', 'finance', 'expenses', 'losses', 'employees', 'absences', 'vacations',
  'suppliers', 'imports', 'history', 'activities', 'timesheets', 'manuals', 'news',
  'alerts', 'dailyMessages', 'selbNews', 'selbAlerts', 'jornadaPeriods', 'jornada180Windows'
];
```

- [ ] **Step 2: Estender `normalizeJornadaEmployeeRecord` com os 3 campos novos**

Localizar (`renderer/app.html`, buscar `function normalizeJornadaEmployeeRecord`):
```js
function normalizeJornadaEmployeeRecord(e){
  return {
    employeeId:e.employeeId||null, chapa:e.chapa||'', nome:e.nome||'',
    bhSaldoAnteriorMin:e.bhSaldoAnteriorMin??null, bhSaldoPeriodoMin:e.bhSaldoPeriodoMin??null, bhSaldoTotalMin:e.bhSaldoTotalMin??null,
    horario:e.horario||'', horasBaseMin:e.horasBaseMin??null, horasTrabMin:e.horasTrabMin??null,
    horasAtrasoMin:e.horasAtrasoMin??null, horasFaltaMin:e.horasFaltaMin??null, horasAbonoMin:e.horasAbonoMin??null,
    horasExtraMin:e.horasExtraMin??null, horasAdNoturnoMin:e.horasAdNoturnoMin??null,
    intrajornadaMin:e.intrajornadaMin??null, interjornadaMin:e.interjornadaMin??null
  };
}
```
Trocar por:
```js
function normalizeJornadaEmployeeRecord(e){
  return {
    employeeId:e.employeeId||null, chapa:e.chapa||'', nome:e.nome||'',
    bhSaldoAnteriorMin:e.bhSaldoAnteriorMin??null, bhSaldoPeriodoMin:e.bhSaldoPeriodoMin??null, bhSaldoTotalMin:e.bhSaldoTotalMin??null,
    horario:e.horario||'', horasBaseMin:e.horasBaseMin??null, horasTrabMin:e.horasTrabMin??null,
    horasAtrasoMin:e.horasAtrasoMin??null, horasFaltaMin:e.horasFaltaMin??null, horasAbonoMin:e.horasAbonoMin??null,
    horasExtraMin:e.horasExtraMin??null, horasAdNoturnoMin:e.horasAdNoturnoMin??null,
    intrajornadaMin:e.intrajornadaMin??null, interjornadaMin:e.interjornadaMin??null,
    // ---- Fase 2 ----
    pendingSignatureDocs:Array.isArray(e.pendingSignatureDocs)?e.pendingSignatureDocs.map(d=>({id:d.id||'',arquivo:d.arquivo||'',status:d.status||''})):[],
    interIntraEvents:Array.isArray(e.interIntraEvents)?e.interIntraEvents.map(ev=>({data:ev.data||'',codigo:ev.codigo||'',descricao:ev.descricao||'',minutos:ev.minutos??null,tipo:ev.tipo||'intra'})):[],
    vencimentos180d:Array.isArray(e.vencimentos180d)?e.vencimentos180d.map(v=>({competenciaId:v.competenciaId||'',valorMin:v.valorMin??null})):[]
  };
}
```

- [ ] **Step 3: Helpers da coleção `db.jornada180Windows`**

Logo após `function upsertJornadaEmployeeRecord(...){...}` (Fase 1, procurar por `period.updatedAt=new Date().toISOString();` seguido do fechamento da função), inserir:

```js
/* ===================== JORNADA/HE — Fase 2: aging de 180 dias =====================
   Coleção própria db.jornada180Windows[]: um registro por janela de 180 dias (diferente do
   período ativo de db.jornadaPeriods — a janela de 180 dias é sempre uma competência ANTIGA,
   não a atual). Um mesmo import pode gerar/atualizar mais de uma janela se colaboradores
   diferentes tiverem janelas diferentes no mesmo arquivo (não observado no arquivo real de
   exemplo, mas o layout do PDF permite). */
function jornada180WindowId(dateIso){ return String(dateIso||'').slice(0,7) }
function normalizeJornada180Employee(e){
  return {
    employeeId:e.employeeId||null, chapa:e.chapa||'', nome:e.nome||'',
    valorPagarDescontarMin:e.valorPagarDescontarMin??null,
    eventos:Array.isArray(e.eventos)?e.eventos.map(ev=>({data:ev.data||'',dataLimite:ev.dataLimite||'',evento:ev.evento||'',tipo:ev.tipo||'',valorMin:ev.valorMin??null})):[]
  };
}
function normalizeJornada180Window(w){
  return {
    id:w.id||'', janelaIni:w.janelaIni||'', janelaFim:w.janelaFim||'',
    importedAt:w.importedAt||new Date().toISOString(), updatedAt:w.updatedAt||w.importedAt||new Date().toISOString(),
    employees:Array.isArray(w.employees)?w.employees.map(normalizeJornada180Employee):[]
  };
}
function upsertJornada180EmployeeRecord(windowId,janelaIni,janelaFim,employeeId,chapa,nome,patch){
  db.jornada180Windows=db.jornada180Windows||[];
  let win=db.jornada180Windows.find(w=>w.id===windowId);
  if(!win){
    win=normalizeJornada180Window({id:windowId,janelaIni,janelaFim,importedAt:new Date().toISOString()});
    db.jornada180Windows.push(win);
  }
  let rec=win.employees.find(e=>e.employeeId===employeeId);
  if(!rec){rec=normalizeJornada180Employee({employeeId,chapa,nome});win.employees.push(rec)}
  Object.assign(rec,patch);
  if(chapa)rec.chapa=chapa;
  if(nome)rec.nome=nome;
  win.updatedAt=new Date().toISOString();
}
```

- [ ] **Step 4: `normalizeDb` — registrar a coleção**

Localizar em `normalizeDb()` a linha (Fase 1):
```js
jornadaPeriods:Array.isArray(source.jornadaPeriods)?source.jornadaPeriods.map(normalizeJornadaPeriod):[],
```
Logo abaixo dela, adicionar:
```js
jornada180Windows:Array.isArray(source.jornada180Windows)?source.jornada180Windows.map(normalizeJornada180Window):[],
```

- [ ] **Step 5: Verificar sintaxe**

```bash
node -e "
const fs=require('fs');
const html=fs.readFileSync('renderer/app.html','utf-8');
const s=html.indexOf('<script>'),e=html.indexOf('</script>');
fs.writeFileSync(process.env.TEMP+'/check.js',html.slice(s+8,e));
"
node --check "$TEMP/check.js"
```
Expected: sem saída.

- [ ] **Step 6: Commit**

```bash
git add src/dataStore.js renderer/app.html
git commit -m "Adiciona modelo de dados da Fase 2 do Jornada/HE (180 dias, assinaturas, intra/inter detalhado)"
```

---

## Task 2: Parser do PDF "Espelho de Ponto PENDENTE Assinatura"

**Files:**
- Modify: `renderer/app.html` (função nova logo após `parseAnalitico180Fragments` — que ainda não existe nesta task; para esta task, inserir logo após `upsertJornada180EmployeeRecord`, Task 1)

**Interfaces:**
- Consumes: array de fragmentos `[{x,y,s}]` (mesmo formato de `extractPdfFragments`).
- Produces: `parseEspelhoPendenteFragments(frags) -> {employees:[{chapa,nome,docs:[{id,arquivo,status}]}]}`

Layout real validado (`Espelho_de_Ponto_PENDENTE_Assinatura_Portal_MEU_RH.pdf`): tabela de 3 colunas visíveis (Chapa/Nome/Horario/Total de Doc.), com um bloco por colaborador seguido, quando há pendência, de um sub-cabeçalho "Id/Nome Arquivo/Satus Assinatura" e N linhas de documento — todos usando as MESMAS posições X que o bloco do colaborador (chapa≈33.6/id≈33.6 na mesma coluna; nome≈84.6/arquivo≈84.6; horario≈254.1/status≈254.1). A distinção entre "linha de colaborador" e "linha de documento" é pelo CONTEÚDO da 3ª coluna, não pela posição.

- [ ] **Step 1: Escrever o parser**

```js
/* ===================== JORNADA/HE — Fase 2: parser do "Espelho de Ponto PENDENTE Assinatura" =====================
   Layout validado contra o arquivo real. Colaborador e documento pendente usam as MESMAS 3
   colunas de posição X — a distinção é pelo conteúdo da 3ª coluna: "Satus Assinatura" é o
   sub-cabeçalho (ignora), texto começando com "Doc." é uma linha de documento, qualquer outra
   coisa (padrão de horário, ex. "08:00-12:00/13:12-18:00 2ª/6ª") é uma nova linha de colaborador. */
const ESPELHO_PENDENTE_COLS=[{key:'c1',x:33.6},{key:'c2',x:84.6},{key:'c3',x:254.1},{key:'total',x:424.0}];
function espelhoPendenteClassifyCol(x){
  let best=null,bestDist=Infinity;
  for(const c of ESPELHO_PENDENTE_COLS){const d=Math.abs(x-c.x);if(d<bestDist){bestDist=d;best=c}}
  return bestDist<=6?best.key:null;
}
function parseEspelhoPendenteFragments(frags){
  const headerFrag=frags.find(f=>f.s==='Chapa');
  if(!headerFrag)throw new Error('Layout do Espelho de Ponto Pendente não reconhecido (cabeçalho "Chapa" não encontrado).');
  const dataFrags=frags.filter(f=>f.y<headerFrag.y-3);
  const rowsByY=new Map();
  dataFrags.forEach(f=>{
    const yKey=Math.round(f.y*2)/2;
    let bucket=null;
    for(const k of rowsByY.keys())if(Math.abs(k-yKey)<1){bucket=k;break}
    if(bucket===null){bucket=yKey;rowsByY.set(bucket,[])}
    rowsByY.get(bucket).push(f);
  });
  const employees=[];
  let current=null;
  [...rowsByY.entries()].sort((a,b)=>b[0]-a[0]).forEach(([,rowFrags])=>{
    const rec={};
    rowFrags.forEach(f=>{const col=espelhoPendenteClassifyCol(f.x);if(col)rec[col]=f.s});
    if(!rec.c3)return;
    if(rec.c3==='Satus Assinatura')return;
    if(rec.c3.startsWith('Doc.')){
      if(current)current.docs.push({id:rec.c1||'',arquivo:rec.c2||'',status:rec.c3});
      return;
    }
    current={chapa:rec.c1||'',nome:rec.c2||'',docs:[]};
    employees.push(current);
  });
  return {employees};
}
```

- [ ] **Step 2: Verificar sintaxe**

Run: mesmo comando de extração + `node --check` (Task 1, Step 5).
Expected: sem saída.

- [ ] **Step 3: Testar contra o PDF real**

Criar um script standalone temporário (`.mjs`) juntando as funções de baixo nível (`renderer/app.html:2898-3027`) + `parseEspelhoPendenteFragments` desta task:

```js
import { readFile } from 'node:fs/promises';
// ... colar bytesToLatin1, parsePdfObjects, pdfDictGet, pdfResolveRef, pdfGetStreamBytes,
//     inflateZlib, parseToUnicodeMap, extractPdfFragments (renderer/app.html:2898-3027) ...
// ... colar espelhoPendenteClassifyCol e parseEspelhoPendenteFragments desta task ...

const buf=await readFile(String.raw`F:\Projetos DEV\Modulo RH\Espelho_de_Ponto_PENDENTE_Assinatura_Portal_MEU_RH.pdf`);
const frags=await extractPdfFragments(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));
const result=parseEspelhoPendenteFragments(frags);

console.assert(result.employees.length===15,'deveria ter 15 colaboradores, achou '+result.employees.length);

const totalDocs=result.employees.reduce((s,e)=>s+e.docs.length,0);
console.assert(totalDocs===9,'deveria ter 9 documentos pendentes no total, achou '+totalDocs);

const italo=result.employees.find(e=>e.chapa==='090263');
console.assert(italo&&italo.docs.length===1,'090263 deveria ter 1 doc, achou '+(italo&&italo.docs.length));
console.assert(italo&&italo.docs[0].id==='50423','id do doc do 090263 errado: '+(italo&&italo.docs[0].id));
console.assert(italo&&italo.docs[0].arquivo==='Espelho de Ponto_26-06-2026_25-07-2026','arquivo errado: '+(italo&&italo.docs[0].arquivo));
console.assert(italo&&italo.docs[0].status==='Doc. Pendente Assinatura','status errado: '+(italo&&italo.docs[0].status));

const joao=result.employees.find(e=>e.chapa==='090399');
console.assert(joao&&joao.docs.length===3,'090399 deveria ter 3 docs, achou '+(joao&&joao.docs.length));

const tiago=result.employees.find(e=>e.chapa==='090396');
console.assert(tiago&&tiago.docs.length===4,'090396 deveria ter 4 docs, achou '+(tiago&&tiago.docs.length));

const vinicius=result.employees.find(e=>e.chapa==='090462');
console.assert(vinicius&&vinicius.docs.length===1,'090462 deveria ter 1 doc, achou '+(vinicius&&vinicius.docs.length));

const adriano=result.employees.find(e=>e.chapa==='090349');
console.assert(adriano&&adriano.docs.length===0,'090349 não deveria ter doc pendente, achou '+(adriano&&adriano.docs.length));

console.log('OK — todas as asserções do parser do Espelho de Ponto Pendente passaram');
```

Run: `node <script>.mjs`
Expected: `OK — todas as asserções do parser do Espelho de Ponto Pendente passaram`, sem `Assertion failed`.

Se falhar, o mais provável é a tolerância `bestDist<=6` em `espelhoPendenteClassifyCol` ou o agrupamento de linha (`Math.abs(k-yKey)<1`) — ajustar e rodar de novo.

- [ ] **Step 4: Commit**

```bash
git add renderer/app.html
git commit -m "Adiciona parser do Espelho de Ponto Pendente de Assinatura"
```

---

## Task 3: Importador do Espelho de Ponto Pendente

**Files:**
- Modify: `renderer/app.html` (função nova logo após `parseEspelhoPendenteFragments`)

**Interfaces:**
- Consumes: `parseEspelhoPendenteFragments`, `latestJornadaPeriod`, `upsertJornadaEmployeeRecord`, `norm`, `normName`, `db.employees`, `save`.
- Produces: `importJornadaEspelhoPendente(file)`.

**Decisão de design importante**: este PDF não traz data de período próprio (só Chapa/Nome/Horario/Total de Doc.) — não dá pra criar um período novo a partir dele. O importador anexa ao período **mais recente já existente** em `db.jornadaPeriods` (criado pela planilha de saldo ou pela Listagem de HE da Fase 1). Se ainda não existir nenhum período, aborta com uma mensagem clara em vez de inventar um período sem data.

- [ ] **Step 1: Escrever o importador**

```js
async function importJornadaEspelhoPendente(file){
  if(!file)return;
  try{
    const buf=await file.arrayBuffer();
    const frags=await extractPdfFragments(buf);
    const {employees}=parseEspelhoPendenteFragments(frags);
    const period=latestJornadaPeriod();
    if(!period){alert('Importe primeiro a planilha de saldo ou a Listagem de HE deste período — o Espelho de Ponto Pendente não tem data própria, precisa de um período já existente pra ser anexado.');return}
    let updated=0,notFound=0;const misses=[];
    employees.forEach(row=>{
      let emp=row.chapa?db.employees.find(x=>x.reg&&norm(x.reg)===norm(row.chapa)):null;
      if(!emp&&row.nome)emp=db.employees.find(x=>normName(x.name)===normName(row.nome));
      if(!emp){notFound++;misses.push(row.nome||row.chapa);return}
      upsertJornadaEmployeeRecord(period.id,period.periodoIni,period.periodoFim,false,emp.id,row.chapa,row.nome,{
        pendingSignatureDocs:row.docs
      });
      updated++;
    });
    db.imports.unshift({at:new Date().toLocaleString('pt-BR'),file:file.name,total:employees.length,added:0,updated,same:0,errors:notFound});
    db.imports=db.imports.slice(0,30);
    await save(true);
    let msg=`Jornada/HE — Espelho de Ponto Pendente de Assinatura importado: ${updated} colaborador(es).`;
    if(notFound)msg+=` ${notFound} não encontrado(s) na equipe${misses.length?' ('+misses.slice(0,5).join(', ')+(misses.length>5?'…':'')+')':''}.`;
    alert(msg);
  }catch(e){alert('Falha ao importar Espelho de Ponto Pendente: '+e.message)}
}
```

- [ ] **Step 2: Verificar sintaxe**

Run: mesmo comando de extração + `node --check`.
Expected: sem saída.

- [ ] **Step 3: Commit**

```bash
git add renderer/app.html
git commit -m "Adiciona importador do Espelho de Ponto Pendente de Assinatura"
```

---

## Task 4: Parser do PDF "Listagem de INTERJORNADA e INTRAJORNADA" (detalhado)

**Files:**
- Modify: `renderer/app.html` (função nova logo após `importJornadaEspelhoPendente`)

**Interfaces:**
- Consumes: array de fragmentos `[{x,y,s}]`.
- Produces: `parseInterIntraFragments(frags) -> {periodoIni,periodoFim,employees:[{chapa,nome,intraTotalMin,interTotalMin,eventos:[{data,codigo,descricao,minutos,tipo}]}]}`

Layout real validado: cabeçalho "Periodo Ativo do Ponto" com as duas datas (igual à Listagem de HE da Fase 1). Cada colaborador tem uma linha com chapa/nome/horário + rótulos "T. Hr Intra"/"T. Hr Inter" (valor só aparece quando > 0 — quando é zero, o fragmento simplesmente não existe, não aparece "00:00:00"), seguida de um sub-cabeçalho "Data/Cod Evento/Desc Evento/Horas" e 0+ linhas de evento.

**Risco conhecido**: nenhum colaborador do arquivo real tem interjornada > 0, então a coluna de valor de interjornada (`interVal`, x estimado por simetria com a de intrajornada) nunca foi vista populada de verdade — só a posição da coluna de intrajornada (`intraVal`, x=596.7) foi confirmada com dado real positivo. Documentar como risco residual.

- [ ] **Step 1: Escrever o parser**

```js
/* ===================== JORNADA/HE — Fase 2: parser da Listagem de INTERJORNADA e INTRAJORNADA (detalhado) =====================
   Layout validado contra o arquivo real. Cada colaborador: linha de cabeçalho (chapa/nome/horário/
   T.Hr Intra/T.Hr Inter — os valores só aparecem quando >0) + sub-cabeçalho "Data/Cod Evento/
   Desc Evento/Horas" + 0..N linhas de evento. A coluna do valor de interjornada (x≈708.5) é
   inferida por simetria com a de intrajornada (x=596.7, confirmada com dado real) — nenhum
   colaborador do arquivo de exemplo tem interjornada > 0 pra confirmar essa posição de verdade. */
const INTERINTRA_COLS=[
  {key:'a',x:40.1},{key:'nome',x:97.4},{key:'cod',x:119.1},{key:'desc',x:198.6},
  {key:'horario',x:301.9},{key:'horas',x:445.4},
  {key:'intraLabel',x:541.9},{key:'intraVal',x:596.7},
  {key:'interLabel',x:653.7},{key:'interVal',x:708.5}
];
function interIntraClassifyCol(x){
  let best=null,bestDist=Infinity;
  for(const c of INTERINTRA_COLS){const d=Math.abs(x-c.x);if(d<bestDist){bestDist=d;best=c}}
  return bestDist<=8?best.key:null;
}
function parseInterIntraFragments(frags){
  const periodoLabel=frags.find(f=>f.s.indexOf('Periodo Ativo do Ponto')>=0);
  if(!periodoLabel)throw new Error('Layout da Listagem de Interjornada/Intrajornada não reconhecido (rótulo de período não encontrado).');
  const dateFrags=frags.filter(f=>Math.abs(f.y-periodoLabel.y)<3&&/^\d{2}\/\d{2}\/\d{2,4}$/.test(f.s)).sort((a,b)=>a.x-b.x);
  if(dateFrags.length<2)throw new Error('Não foi possível ler o período ativo do ponto.');
  const periodoIni=pdfDateBrToIso(dateFrags[0].s),periodoFim=pdfDateBrToIso(dateFrags[1].s);

  const dataFrags=frags.filter(f=>f.y<periodoLabel.y-10);
  const rowsByY=new Map();
  dataFrags.forEach(f=>{
    const yKey=Math.round(f.y*2)/2;
    let bucket=null;
    for(const k of rowsByY.keys())if(Math.abs(k-yKey)<1){bucket=k;break}
    if(bucket===null){bucket=yKey;rowsByY.set(bucket,[])}
    rowsByY.get(bucket).push(f);
  });
  const employees=[];
  let current=null;
  [...rowsByY.entries()].sort((a,b)=>b[0]-a[0]).forEach(([,rowFrags])=>{
    const rec={};
    rowFrags.forEach(f=>{const col=interIntraClassifyCol(f.x);if(col)rec[col]=f.s});
    if(rec.a==='Data')return;
    if(rec.a&&/^\d{2}\/\d{2}\/\d{4}$/.test(rec.a)){
      if(current)current.eventos.push({
        data:pdfDateBrToIso(rec.a),codigo:rec.cod||'',descricao:rec.desc||'',
        minutos:parseDurationHms(rec.horas),
        tipo:/INTERJORNADA/i.test(rec.desc||'')?'inter':'intra'
      });
      return;
    }
    if(rec.a&&/^\d{4,6}$/.test(rec.a)){
      current={chapa:rec.a,nome:rec.nome||'',intraTotalMin:parseDurationHms(rec.intraVal),interTotalMin:parseDurationHms(rec.interVal),eventos:[]};
      employees.push(current);
    }
  });
  return {periodoIni,periodoFim,employees};
}
```

- [ ] **Step 2: Verificar sintaxe**

Run: mesmo comando + `node --check`.
Expected: sem saída.

- [ ] **Step 3: Testar contra o PDF real**

Mesma técnica de script standalone (Task 2, Step 3), agora com `parseInterIntraFragments`:

```js
const buf=await readFile(String.raw`F:\Projetos DEV\Modulo RH\Listagem_de_INTERJORNADA_e_INTRAJORNADA_Portal_MEU_RH.pdf`);
const frags=await extractPdfFragments(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));
const result=parseInterIntraFragments(frags);

console.assert(result.periodoIni==='2026-07-26','periodoIni errado: '+result.periodoIni);
console.assert(result.periodoFim==='2026-08-25','periodoFim errado: '+result.periodoFim);
console.assert(result.employees.length===15,'deveria ter 15 colaboradores, achou '+result.employees.length);

const adriano=result.employees.find(e=>e.chapa==='090349');
console.assert(adriano&&adriano.intraTotalMin===1,'intraTotalMin do 090349 errado: '+(adriano&&adriano.intraTotalMin));
console.assert(adriano&&adriano.eventos.length===1,'090349 deveria ter 1 evento, achou '+(adriano&&adriano.eventos.length));
console.assert(adriano&&adriano.eventos[0].data==='2026-08-25','data do evento errada: '+(adriano&&adriano.eventos[0].data));
console.assert(adriano&&adriano.eventos[0].codigo==='6139','código do evento errado: '+(adriano&&adriano.eventos[0].codigo));
console.assert(adriano&&adriano.eventos[0].minutos===1,'minutos do evento errados: '+(adriano&&adriano.eventos[0].minutos));
console.assert(adriano&&adriano.eventos[0].tipo==='intra','tipo do evento errado: '+(adriano&&adriano.eventos[0].tipo));

const vinicius=result.employees.find(e=>e.chapa==='090462');
console.assert(vinicius&&vinicius.intraTotalMin===112,'intraTotalMin do 090462 errado: '+(vinicius&&vinicius.intraTotalMin));
console.assert(vinicius&&vinicius.eventos.length===4,'090462 deveria ter 4 eventos, achou '+(vinicius&&vinicius.eventos.length));
const somaEventos=vinicius.eventos.reduce((s,e)=>s+e.minutos,0);
console.assert(somaEventos===112,'soma dos eventos do 090462 deveria bater com o total (112), achou '+somaEventos);

const alexsander=result.employees.find(e=>e.chapa==='090464');
console.assert(alexsander&&alexsander.intraTotalMin===null,'090464 não deveria ter intraTotalMin (sem ocorrência), achou '+(alexsander&&alexsander.intraTotalMin));
console.assert(alexsander&&alexsander.eventos.length===0,'090464 não deveria ter eventos, achou '+(alexsander&&alexsander.eventos.length));

console.log('OK — todas as asserções do parser de Interjornada/Intrajornada passaram');
```

Run: `node <script>.mjs`
Expected: `OK — ...`, sem `Assertion failed`.

Se falhar, ajustar `bestDist<=8` em `interIntraClassifyCol` ou o agrupamento de linha.

- [ ] **Step 4: Commit**

```bash
git add renderer/app.html
git commit -m "Adiciona parser detalhado de Interjornada/Intrajornada"
```

---

## Task 5: Importador da Listagem de Interjornada/Intrajornada detalhada

**Files:**
- Modify: `renderer/app.html` (função nova logo após `parseInterIntraFragments`)

**Interfaces:**
- Consumes: `parseInterIntraFragments`, `jornadaPeriodId`, `upsertJornadaEmployeeRecord`, `norm`, `normName`.
- Produces: `importJornadaInterIntraDetalhado(file)`.

Esta importação **só grava `interIntraEvents`** — não recalcula `intrajornadaMin`/`interjornadaMin` (que continuam vindo da Listagem de HE da Fase 1, conforme decisão do usuário).

- [ ] **Step 1: Escrever o importador**

```js
async function importJornadaInterIntraDetalhado(file){
  if(!file)return;
  try{
    const buf=await file.arrayBuffer();
    const frags=await extractPdfFragments(buf);
    const {periodoIni,periodoFim,employees}=parseInterIntraFragments(frags);
    const periodId=jornadaPeriodId(periodoFim);
    let updated=0,notFound=0;const misses=[];
    employees.forEach(row=>{
      let emp=row.chapa?db.employees.find(x=>x.reg&&norm(x.reg)===norm(row.chapa)):null;
      if(!emp&&row.nome)emp=db.employees.find(x=>normName(x.name)===normName(row.nome));
      if(!emp){notFound++;misses.push(row.nome||row.chapa);return}
      upsertJornadaEmployeeRecord(periodId,periodoIni,periodoFim,true,emp.id,row.chapa,row.nome,{
        interIntraEvents:row.eventos
      });
      updated++;
    });
    db.imports.unshift({at:new Date().toLocaleString('pt-BR'),file:file.name,total:employees.length,added:0,updated,same:0,errors:notFound});
    db.imports=db.imports.slice(0,30);
    await save(true);
    let msg=`Jornada/HE — detalhe de Intra/Interjornada importado: ${updated} colaborador(es) (período ${periodoIni.split('-').reverse().join('/')} a ${periodoFim.split('-').reverse().join('/')}).`;
    if(notFound)msg+=` ${notFound} não encontrado(s) na equipe${misses.length?' ('+misses.slice(0,5).join(', ')+(misses.length>5?'…':'')+')':''}.`;
    alert(msg);
  }catch(e){alert('Falha ao importar Listagem de Interjornada/Intrajornada: '+e.message)}
}
```

- [ ] **Step 2: Verificar sintaxe**

Run: mesmo comando + `node --check`.
Expected: sem saída.

- [ ] **Step 3: Commit**

```bash
git add renderer/app.html
git commit -m "Adiciona importador detalhado de Interjornada/Intrajornada"
```

---

## Task 6: Parser do PDF "Bco_Horas_Selbetti_Sintetico" (projeção de 180 dias)

**Files:**
- Modify: `renderer/app.html` (função nova logo após `importJornadaInterIntraDetalhado`)

**Interfaces:**
- Consumes: array de fragmentos `[{x,y,s}]`, `parseHourBankCell` (Fase 1, já lida com HH:MM assinado).
- Produces: `parseSintetico180Fragments(frags) -> {periodoIni,periodoFim,employees:[{chapa,nome,vencimentos:[{competenciaId,valorMin}]}]}`

Layout real validado: cabeçalho "Periodo Ativo do Ponto" com as datas; tabela com CHAPA/NOME/PER.INI/PER.FIM/SLD TOT BH/NEG ATU/POS ATU + N colunas "VL REF" (uma por competência de vencimento futuro — o número varia, esta task detecta dinamicamente pelo cabeçalho, no arquivo real são 3: 8/2026, 9/2026, 10/2026). Só a projeção (colunas VL REF) é extraída — SLD TOT BH/NEG ATU/POS ATU já vêm de outras fontes na Fase 1 e não são reimportadas aqui.

**Caso real de dado ausente (não é bug)**: o colaborador 090464 não tem nenhum fragmento de SLD TOT BH no PDF real (só NEG ATU e POS ATU) — mesmo padrão de lacuna real de dado já visto na Fase 1 (chapa 090401 na Listagem de HE). Como esta task não usa a coluna SLD TOT BH mesmo, isso não afeta o resultado, mas documentar a lacuna evita confusão numa investigação futura.

- [ ] **Step 1: Escrever o parser**

```js
/* ===================== JORNADA/HE — Fase 2: parser do Sintético de 180 dias (só a projeção) =====================
   Layout validado contra o arquivo real. As colunas "VL REF" (uma por competência futura de
   vencimento) têm um cabeçalho em 3 linhas ("REF"/"COMP"/"N/YYYY") bem acima da linha "VL REF"
   principal (mesma linha de CHAPA/NOME/...) — usa a posição X da própria "VL REF" como âncora
   da coluna de dado, e casa com a "N/YYYY" mais próxima em X pra saber a competência. Só a
   projeção é extraída aqui — SLD TOT BH/NEG ATU/POS ATU já vêm da planilha/Listagem de HE da
   Fase 1 e não são reimportados. */
function parseSintetico180Fragments(frags){
  const periodoLabel=frags.find(f=>f.s.indexOf('Periodo Ativo do Ponto')>=0);
  if(!periodoLabel)throw new Error('Layout do Sintético de 180 dias não reconhecido (rótulo de período não encontrado).');
  const dateFrags=frags.filter(f=>Math.abs(f.y-periodoLabel.y)<3&&/^\d{2}\/\d{2}\/\d{2,4}$/.test(f.s)).sort((a,b)=>a.x-b.x);
  if(dateFrags.length<2)throw new Error('Não foi possível ler o período ativo do ponto.');
  const periodoIni=pdfDateBrToIso(dateFrags[0].s),periodoFim=pdfDateBrToIso(dateFrags[1].s);

  const headerFrag=frags.find(f=>f.s==='CHAPA');
  if(!headerFrag)throw new Error('Layout do Sintético de 180 dias não reconhecido (cabeçalho "CHAPA" não encontrado).');

  const vlRefCols=frags.filter(f=>f.s==='VL REF').map(vf=>{
    const compFrag=frags.find(f=>Math.abs(f.x-vf.x)<10&&/^\d{1,2}\/\d{4}$/.test(f.s));
    if(!compFrag)return null;
    const [mes,ano]=compFrag.s.split('/');
    return {x:vf.x,competenciaId:`${ano}-${mes.padStart(2,'0')}`};
  }).filter(Boolean);

  const dataFrags=frags.filter(f=>f.y<headerFrag.y-3);
  const rowsByY=new Map();
  dataFrags.forEach(f=>{
    const yKey=Math.round(f.y*2)/2;
    let bucket=null;
    for(const k of rowsByY.keys())if(Math.abs(k-yKey)<1){bucket=k;break}
    if(bucket===null){bucket=yKey;rowsByY.set(bucket,[])}
    rowsByY.get(bucket).push(f);
  });
  const SINTETICO_COLS=[{key:'chapa',x:34.1},{key:'nome',x:88.0},{key:'sldTot',x:396.0},{key:'negAtu',x:457.3},{key:'posAtu',x:517.4}];
  function classifyBase(x){
    let best=null,bestDist=Infinity;
    for(const c of SINTETICO_COLS){const d=Math.abs(x-c.x);if(d<bestDist){bestDist=d;best=c}}
    return bestDist<=6?best.key:null;
  }
  const employees=[];
  [...rowsByY.entries()].sort((a,b)=>b[0]-a[0]).forEach(([,rowFrags])=>{
    const rec={vencimentos:[]};
    rowFrags.forEach(f=>{
      const col=classifyBase(f.x);
      if(col==='chapa')rec.chapa=f.s;
      else if(col==='nome')rec.nome=f.s;
      else if(col)return; // sldTot/negAtu/posAtu — não usados nesta fase
      else{
        let best=null,bestDist=Infinity;
        vlRefCols.forEach(c=>{const d=Math.abs(f.x-c.x);if(d<bestDist){bestDist=d;best=c}});
        if(best&&bestDist<=8){
          const parsed=parseHourBankCell(f.s);
          if(parsed)rec.vencimentos.push({competenciaId:best.competenciaId,valorMin:parsed.minutes*parsed.sign});
        }
      }
    });
    if(rec.chapa)employees.push(rec);
  });
  return {periodoIni,periodoFim,employees};
}
```

- [ ] **Step 2: Verificar sintaxe**

Run: mesmo comando + `node --check`.
Expected: sem saída.

- [ ] **Step 3: Testar contra o PDF real**

```js
const buf=await readFile(String.raw`F:\Projetos DEV\Modulo RH\Bco_Horas_Selbetti_Sintetico_Portal_MEU_RH.pdf`);
const frags=await extractPdfFragments(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));
const result=parseSintetico180Fragments(frags);

console.assert(result.periodoIni==='2026-07-26','periodoIni errado: '+result.periodoIni);
console.assert(result.periodoFim==='2026-08-25','periodoFim errado: '+result.periodoFim);
console.assert(result.employees.length===15,'deveria ter 15 colaboradores, achou '+result.employees.length);

const quelisson=result.employees.find(e=>e.chapa==='090073');
console.assert(quelisson&&quelisson.vencimentos.length===2,'090073 deveria ter 2 vencimentos, achou '+(quelisson&&quelisson.vencimentos.length));
const v9=quelisson.vencimentos.find(v=>v.competenciaId==='2026-09');
const v10=quelisson.vencimentos.find(v=>v.competenciaId==='2026-10');
console.assert(v9&&v9.valorMin===290,'vencimento 2026-09 do 090073 errado: '+(v9&&v9.valorMin));
console.assert(v10&&v10.valorMin===985,'vencimento 2026-10 do 090073 errado: '+(v10&&v10.valorMin));

const allan=result.employees.find(e=>e.chapa==='090305');
console.assert(allan&&allan.vencimentos.length===1,'090305 deveria ter 1 vencimento, achou '+(allan&&allan.vencimentos.length));
console.assert(allan&&allan.vencimentos[0].competenciaId==='2026-10','competência do 090305 errada: '+(allan&&allan.vencimentos[0].competenciaId));
console.assert(allan&&allan.vencimentos[0].valorMin===-328,'valor do 090305 errado (deveria ser negativo): '+(allan&&allan.vencimentos[0].valorMin));

const arthur=result.employees.find(e=>e.chapa==='090388');
console.assert(arthur&&arthur.vencimentos.length===1&&arthur.vencimentos[0].valorMin===713,'090388 errado: '+JSON.stringify(arthur&&arthur.vencimentos));

const adriano=result.employees.find(e=>e.chapa==='090349');
console.assert(adriano&&adriano.vencimentos.length===0,'090349 não deveria ter vencimento nenhum, achou '+(adriano&&adriano.vencimentos.length));

console.log('OK — todas as asserções do parser do Sintético de 180 dias passaram');
```

Run: `node <script>.mjs`
Expected: `OK — ...`, sem `Assertion failed`.

Se falhar, ajustar a tolerância `bestDist<=6`/`bestDist<=8`, ou a distância `<10` no casamento "VL REF"↔"N/YYYY".

- [ ] **Step 4: Commit**

```bash
git add renderer/app.html
git commit -m "Adiciona parser da projecao de vencimento (Sintetico 180 dias)"
```

---

## Task 7: Importador do Sintético de 180 dias

**Files:**
- Modify: `renderer/app.html` (função nova logo após `parseSintetico180Fragments`)

**Interfaces:**
- Consumes: `parseSintetico180Fragments`, `jornadaPeriodId`, `upsertJornadaEmployeeRecord`, `norm`, `normName`.
- Produces: `importJornadaSintetico180(file)`.

- [ ] **Step 1: Escrever o importador**

```js
async function importJornadaSintetico180(file){
  if(!file)return;
  try{
    const buf=await file.arrayBuffer();
    const frags=await extractPdfFragments(buf);
    const {periodoIni,periodoFim,employees}=parseSintetico180Fragments(frags);
    const periodId=jornadaPeriodId(periodoFim);
    let updated=0,notFound=0;const misses=[];
    employees.forEach(row=>{
      let emp=row.chapa?db.employees.find(x=>x.reg&&norm(x.reg)===norm(row.chapa)):null;
      if(!emp&&row.nome)emp=db.employees.find(x=>normName(x.name)===normName(row.nome));
      if(!emp){notFound++;misses.push(row.nome||row.chapa);return}
      upsertJornadaEmployeeRecord(periodId,periodoIni,periodoFim,true,emp.id,row.chapa,row.nome,{
        vencimentos180d:row.vencimentos
      });
      updated++;
    });
    db.imports.unshift({at:new Date().toLocaleString('pt-BR'),file:file.name,total:employees.length,added:0,updated,same:0,errors:notFound});
    db.imports=db.imports.slice(0,30);
    await save(true);
    let msg=`Jornada/HE — projeção de vencimento (180 dias) importada: ${updated} colaborador(es) (período ${periodoIni.split('-').reverse().join('/')} a ${periodoFim.split('-').reverse().join('/')}).`;
    if(notFound)msg+=` ${notFound} não encontrado(s) na equipe${misses.length?' ('+misses.slice(0,5).join(', ')+(misses.length>5?'…':'')+')':''}.`;
    alert(msg);
  }catch(e){alert('Falha ao importar Sintético de 180 dias: '+e.message)}
}
```

- [ ] **Step 2: Verificar sintaxe**

Run: mesmo comando + `node --check`.
Expected: sem saída.

- [ ] **Step 3: Commit**

```bash
git add renderer/app.html
git commit -m "Adiciona importador da projecao de vencimento (Sintetico 180 dias)"
```

---

## Task 8: Parser do PDF "Bco_Horas_Selbetti_Analitico" (eventos de 180 dias)

**Files:**
- Modify: `renderer/app.html` (função nova logo após `importJornadaSintetico180`)

**Interfaces:**
- Consumes: array de fragmentos `[{x,y,s}]`, `parseHourBankCell`, `jornada180WindowId` (Task 1).
- Produces: `parseAnalitico180Fragments(frags) -> {windows:[{id,janelaIni,janelaFim,employees:[{chapa,nome,valorPagarDescontarMin,eventos:[{data,dataLimite,evento,tipo,valorMin}]}]}]}`

Layout real validado: bloco por colaborador ("chapa NOME ... 180 dias do Banco DD/MM/YY a DD/MM/YY"), sub-cabeçalho "Data/Data Limite/Evento/Tipo/Valor", 0+ linhas de evento, linha "Horas a PAGAR/DESCONTAR HH:MM", disclaimer.

**Risco conhecido, já documentado no spec**: no arquivo real de exemplo, **nenhum colaborador tem eventos** (todos "00:00", tabela de eventos vazia) — o caminho "com eventos" é escrito a partir da estrutura visível do cabeçalho (mesmas posições X dos rótulos "Data"/"Data Limite"/"Evento"/"Tipo"/"Valor"), mas sem um exemplo populado real pra confirmar 100%. O teste desta task só valida o caminho "sem eventos", que é o único disponível.

- [ ] **Step 1: Escrever o parser**

```js
/* ===================== JORNADA/HE — Fase 2: parser do Analítico de 180 dias =====================
   Layout validado contra o arquivo real. Cada colaborador: linha "chapa NOME ... 180 dias do
   Banco DD/MM/YY a DD/MM/YY" + sub-cabeçalho "Data/Data Limite/Evento/Tipo/Valor" + 0..N linhas
   de evento + linha "Horas a PAGAR/DESCONTAR HH:MM". RISCO CONHECIDO: nenhum colaborador do
   arquivo de exemplo tem evento real (todos "00:00" sem eventos) — a leitura de uma linha de
   evento é inferida pela posição dos rótulos do sub-cabeçalho, sem confirmação com dado real
   populado. Reconfirmar assim que houver um arquivo real com eventos. */
const ANALITICO180_COLS=[
  {key:'chapa',x:43.4},{key:'nome',x:118.4},{key:'janelaLabel',x:512.9},{key:'janelaIni',x:607.3},{key:'janelaFim',x:669.6},
  {key:'col1',x:46.4},{key:'dataLimite',x:112.4},{key:'evento',x:179.9},{key:'tipo',x:414.4},{key:'valor',x:474.0},
  {key:'totalLabel',x:365.6}
];
function analitico180ClassifyCol(x){
  let best=null,bestDist=Infinity;
  for(const c of ANALITICO180_COLS){const d=Math.abs(x-c.x);if(d<bestDist){bestDist=d;best=c}}
  return bestDist<=6?best.key:null;
}
function parseAnalitico180Fragments(frags){
  const headerFrag=frags.find(f=>f.s==='180 dias do Banco');
  if(!headerFrag)throw new Error('Layout do Analítico de 180 dias não reconhecido (rótulo "180 dias do Banco" não encontrado).');
  const rowsByY=new Map();
  frags.forEach(f=>{
    const yKey=Math.round(f.y*2)/2;
    let bucket=null;
    for(const k of rowsByY.keys())if(Math.abs(k-yKey)<1){bucket=k;break}
    if(bucket===null){bucket=yKey;rowsByY.set(bucket,[])}
    rowsByY.get(bucket).push(f);
  });
  const windows=new Map();
  let current=null;
  [...rowsByY.entries()].sort((a,b)=>b[0]-a[0]).forEach(([,rowFrags])=>{
    const rec={};
    rowFrags.forEach(f=>{const col=analitico180ClassifyCol(f.x);if(col)rec[col]=f.s});
    if(rec.janelaLabel==='180 dias do Banco'){
      const janelaIni=pdfDateBrToIso(rec.janelaIni),janelaFim=pdfDateBrToIso(rec.janelaFim);
      const windowId=jornada180WindowId(janelaFim);
      if(!windows.has(windowId))windows.set(windowId,{janelaIni,janelaFim,employees:[]});
      current={chapa:rec.chapa||'',nome:rec.nome||'',valorPagarDescontarMin:0,eventos:[]};
      windows.get(windowId).employees.push(current);
      return;
    }
    if(rec.totalLabel==='Horas a PAGAR/DESCONTAR'){
      if(current){const parsed=parseHourBankCell(rec.valor);current.valorPagarDescontarMin=parsed?parsed.minutes*parsed.sign:0}
      return;
    }
    if(rec.col1==='Data')return;
    if(current&&rec.col1&&/^\d{2}\/\d{2}\/\d{2,4}$/.test(rec.col1)){
      const parsed=parseHourBankCell(rec.valor);
      current.eventos.push({data:pdfDateBrToIso(rec.col1),dataLimite:pdfDateBrToIso(rec.dataLimite),evento:rec.evento||'',tipo:rec.tipo||'',valorMin:parsed?parsed.minutes*parsed.sign:null});
    }
  });
  return {windows:[...windows.entries()].map(([id,w])=>({id,...w}))};
}
```

- [ ] **Step 2: Verificar sintaxe**

Run: mesmo comando + `node --check`.
Expected: sem saída.

- [ ] **Step 3: Testar contra o PDF real**

```js
const buf=await readFile(String.raw`F:\Projetos DEV\Modulo RH\Bco_Horas_Selbetti_Analitico_Portal_MEU_RH.pdf`);
const frags=await extractPdfFragments(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));
const result=parseAnalitico180Fragments(frags);

console.assert(result.windows.length===1,'deveria ter 1 janela, achou '+result.windows.length);
const w=result.windows[0];
console.assert(w.janelaIni==='2026-01-26','janelaIni errada: '+w.janelaIni);
console.assert(w.janelaFim==='2026-02-25','janelaFim errada: '+w.janelaFim);
console.assert(w.id==='2026-02','id da janela errado: '+w.id);
console.assert(w.employees.length===15,'deveria ter 15 colaboradores, achou '+w.employees.length);

const quelisson=w.employees.find(e=>e.chapa==='090073');
console.assert(quelisson&&quelisson.valorPagarDescontarMin===0,'090073 deveria ter valorPagarDescontarMin=0, achou '+(quelisson&&quelisson.valorPagarDescontarMin));
console.assert(quelisson&&quelisson.eventos.length===0,'090073 não deveria ter eventos (arquivo real não tem nenhum), achou '+(quelisson&&quelisson.eventos.length));

const totalEventos=w.employees.reduce((s,e)=>s+e.eventos.length,0);
console.assert(totalEventos===0,'nenhum colaborador do arquivo real deveria ter evento, achou '+totalEventos+' no total');

console.log('OK — todas as asserções do parser do Analítico de 180 dias passaram (caminho sem eventos)');
```

Run: `node <script>.mjs`
Expected: `OK — ...`, sem `Assertion failed`.

- [ ] **Step 4: Commit**

```bash
git add renderer/app.html
git commit -m "Adiciona parser de eventos do Analitico 180 dias"
```

---

## Task 9: Importador do Analítico de 180 dias

**Files:**
- Modify: `renderer/app.html` (função nova logo após `parseAnalitico180Fragments`)

**Interfaces:**
- Consumes: `parseAnalitico180Fragments`, `upsertJornada180EmployeeRecord` (Task 1), `norm`, `normName`.
- Produces: `importJornadaAnalitico180(file)`.

- [ ] **Step 1: Escrever o importador**

```js
async function importJornadaAnalitico180(file){
  if(!file)return;
  try{
    const buf=await file.arrayBuffer();
    const frags=await extractPdfFragments(buf);
    const {windows}=parseAnalitico180Fragments(frags);
    let updated=0,notFound=0,totalRows=0;const misses=[];
    windows.forEach(w=>{
      w.employees.forEach(row=>{
        totalRows++;
        let emp=row.chapa?db.employees.find(x=>x.reg&&norm(x.reg)===norm(row.chapa)):null;
        if(!emp&&row.nome)emp=db.employees.find(x=>normName(x.name)===normName(row.nome));
        if(!emp){notFound++;misses.push(row.nome||row.chapa);return}
        upsertJornada180EmployeeRecord(w.id,w.janelaIni,w.janelaFim,emp.id,row.chapa,row.nome,{
          valorPagarDescontarMin:row.valorPagarDescontarMin,eventos:row.eventos
        });
        updated++;
      });
    });
    db.imports.unshift({at:new Date().toLocaleString('pt-BR'),file:file.name,total:totalRows,added:0,updated,same:0,errors:notFound});
    db.imports=db.imports.slice(0,30);
    await save(true);
    const janelas=windows.map(w=>`${w.janelaIni.split('-').reverse().join('/')} a ${w.janelaFim.split('-').reverse().join('/')}`).join(', ');
    let msg=`Jornada/HE — Analítico de 180 dias importado: ${updated} colaborador(es) (janela ${janelas}).`;
    if(notFound)msg+=` ${notFound} não encontrado(s) na equipe${misses.length?' ('+misses.slice(0,5).join(', ')+(misses.length>5?'…':'')+')':''}.`;
    alert(msg);
  }catch(e){alert('Falha ao importar Analítico de 180 dias: '+e.message)}
}
```

- [ ] **Step 2: Verificar sintaxe**

Run: mesmo comando + `node --check`.
Expected: sem saída.

- [ ] **Step 3: Commit**

```bash
git add renderer/app.html
git commit -m "Adiciona importador de eventos do Analitico 180 dias"
```

---

## Task 10: UI — botões de importação e aba "180 dias / Pendências"

**Files:**
- Modify: `renderer/app.html` (dentro de `<section class="view" id="jornadaHe">`)

**Interfaces:**
- Consumes: `importJornadaAnalitico180`, `importJornadaSintetico180`, `importJornadaEspelhoPendente`, `importJornadaInterIntraDetalhado` (Tasks 3, 5, 7, 9), `switchJornadaHeTab` (Fase 1, já genérico por `data-tab`/`data-pane`, não precisa mudar).
- Produces: botão de aba `data-tab="pendencias"`, elementos DOM `#jornada180Table`, `#jornadaPendenciasTable` (consumidos pela Task 11).

- [ ] **Step 1: Botão da aba nova**

Localizar (buscar `data-tab="historico"`):
```html
        <button class="role-tab" data-tab="historico" onclick="switchJornadaHeTab('historico')">Histórico</button>
      </div>
```
Trocar por:
```html
        <button class="role-tab" data-tab="historico" onclick="switchJornadaHeTab('historico')">Histórico</button>
        <button class="role-tab" data-tab="pendencias" onclick="switchJornadaHeTab('pendencias')">180 dias / Pendências</button>
      </div>
```

- [ ] **Step 2: Botões de importação novos na Visão Geral**

Localizar (buscar `Importar Listagem de HE`):
```html
            <label class="btn primary file">⬆ Importar planilha de saldo<input type="file" accept=".xlsx" onchange="importJornadaSaldoPlanilha(this.files[0]);this.value=''"></label>
            <label class="btn primary file">⬆ Importar Listagem de HE (PDF)<input type="file" accept=".pdf" onchange="importJornadaListagemHe(this.files[0]);this.value=''"></label>
          </div>
          <p class="muted" style="font-size:12px;margin-top:-6px">Os dois arquivos são independentes — pode importar só um, o outro, ou os dois, em qualquer ordem.</p>
```
Trocar por:
```html
            <label class="btn primary file">⬆ Importar planilha de saldo<input type="file" accept=".xlsx" onchange="importJornadaSaldoPlanilha(this.files[0]);this.value=''"></label>
            <label class="btn primary file">⬆ Importar Listagem de HE (PDF)<input type="file" accept=".pdf" onchange="importJornadaListagemHe(this.files[0]);this.value=''"></label>
            <label class="btn primary file">⬆ Importar Analítico 180 dias (PDF)<input type="file" accept=".pdf" onchange="importJornadaAnalitico180(this.files[0]);this.value=''"></label>
            <label class="btn primary file">⬆ Importar Sintético 180 dias (PDF)<input type="file" accept=".pdf" onchange="importJornadaSintetico180(this.files[0]);this.value=''"></label>
            <label class="btn primary file">⬆ Importar Espelho Pendente Assinatura (PDF)<input type="file" accept=".pdf" onchange="importJornadaEspelhoPendente(this.files[0]);this.value=''"></label>
            <label class="btn primary file">⬆ Importar Intra/Interjornada detalhado (PDF)<input type="file" accept=".pdf" onchange="importJornadaInterIntraDetalhado(this.files[0]);this.value=''"></label>
          </div>
          <p class="muted" style="font-size:12px;margin-top:-6px">Os arquivos são independentes — pode importar qualquer combinação deles, em qualquer ordem.</p>
```

- [ ] **Step 3: Painel da aba nova**

Localizar o fechamento da aba `historico` (buscar `id="jornadaHeHistoricoTable"`, o `</div></div>` que fecha aquele painel, seguido do `</section>` do Jornada/HE):
```html
      <div class="jornadaHe-tabpane" data-pane="historico">
        <div class="panel"><h2>Períodos importados</h2>
          <div class="tablewrap"><table><thead><tr><th>Período</th><th>Colaboradores</th><th>Saldo líquido</th><th>vs. período anterior</th></tr></thead><tbody id="jornadaHeHistoricoTable"></tbody></table></div>
        </div>
      </div>
    </section>
```
Trocar por:
```html
      <div class="jornadaHe-tabpane" data-pane="historico">
        <div class="panel"><h2>Períodos importados</h2>
          <div class="tablewrap"><table><thead><tr><th>Período</th><th>Colaboradores</th><th>Saldo líquido</th><th>vs. período anterior</th></tr></thead><tbody id="jornadaHeHistoricoTable"></tbody></table></div>
        </div>
      </div>

      <div class="jornadaHe-tabpane" data-pane="pendencias">
        <div class="panel"><h2>Vencimento do banco de horas (180 dias)</h2>
          <p class="muted" style="font-size:12px;margin-top:-6px">Informativo — não entra no cálculo de pagamento estimado.</p>
          <div class="tablewrap"><table><thead><tr><th>Colaborador</th><th>Janela mais antiga</th><th>Valor a pagar/descontar</th><th>Próximos vencimentos</th></tr></thead><tbody id="jornada180Table"></tbody></table></div>
        </div>
        <div class="panel"><h2>Assinaturas de ponto pendentes</h2>
          <div class="tablewrap"><table><thead><tr><th>Colaborador</th><th>Documentos pendentes</th></tr></thead><tbody id="jornadaPendenciasTable"></tbody></table></div>
        </div>
      </div>
    </section>
```

- [ ] **Step 4: Verificar sintaxe e balanceamento**

```bash
node -e "
const fs=require('fs');
const html=fs.readFileSync('renderer/app.html','utf-8');
const s=html.indexOf('<script>'),e=html.indexOf('</script>');
fs.writeFileSync(process.env.TEMP+'/check.js',html.slice(s+8,e));
"
node --check "$TEMP/check.js"
node -e "
const fs=require('fs');
const html=fs.readFileSync('renderer/app.html','utf-8');
const scriptStart=html.indexOf('<script>');
const htmlPart=html.slice(0,scriptStart);
console.log('div:',(htmlPart.match(/<div[\s>]/g)||[]).length,(htmlPart.match(/<\/div>/g)||[]).length);
console.log('section:',(htmlPart.match(/<section[\s>]/g)||[]).length,(htmlPart.match(/<\/section>/g)||[]).length);
"
```
Expected: `node --check` sem saída; `div`/`section` com os dois números de cada par iguais.

- [ ] **Step 5: Commit**

```bash
git add renderer/app.html
git commit -m "Adiciona botoes de importacao e aba 180 dias/Pendencias"
```

---

## Task 11: Renderização da aba "180 dias / Pendências"

**Files:**
- Modify: `renderer/app.html` (função nova logo após `renderJornadaHe`; wiring dentro de `render()`)

**Interfaces:**
- Consumes: `db.jornada180Windows`, `latestJornadaPeriod`, `findJornadaEmployeeRecord`, `fmtSignedMin`, `escHtml` (Fase 1).
- Produces: `renderJornada180Pendencias()` — chamada de dentro de `render()`.

- [ ] **Step 1: Função de renderização**

Logo após `renderJornadaHe(){...}` (Fase 1, buscar o `}` que fecha essa função, antes de `function parseHorarioRaw`), inserir:

```js
function renderJornada180Pendencias(){
  const tbl180=$('jornada180Table'),tblPend=$('jornadaPendenciasTable');
  if(!tbl180||!tblPend)return;
  const windows=[...(db.jornada180Windows||[])].sort((a,b)=>a.id.localeCompare(b.id));
  const oldest=windows[0];
  const period=latestJornadaPeriod();
  if(!oldest||!oldest.employees.filter(e=>e.employeeId).length){
    tbl180.innerHTML='<tr><td colspan="4" class="muted">Nenhum dado de 180 dias importado ainda.</td></tr>';
  }else{
    const byName=[...oldest.employees].filter(e=>e.employeeId).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
    tbl180.innerHTML=byName.map(e=>{
      const rec=period?findJornadaEmployeeRecord(period,e.employeeId):null;
      const venc=(rec&&rec.vencimentos180d||[]).map(v=>`${v.competenciaId}: ${fmtSignedMin(v.valorMin)}`).join(', ')||'—';
      return `<tr><td>${escHtml(e.nome)}</td><td>${oldest.janelaIni.split('-').reverse().join('/')} a ${oldest.janelaFim.split('-').reverse().join('/')}</td>
        <td style="color:${(e.valorPagarDescontarMin||0)<0?'var(--red)':'inherit'}">${fmtSignedMin(e.valorPagarDescontarMin)}</td><td style="font-size:12px">${venc}</td></tr>`;
    }).join('')||'<tr><td colspan="4" class="muted">Nenhum colaborador nesta janela.</td></tr>';
  }
  const pendentes=period?period.employees.filter(e=>e.employeeId&&(e.pendingSignatureDocs||[]).length):[];
  tblPend.innerHTML=pendentes.length?[...pendentes].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).map(e=>
    `<tr><td>${escHtml(e.nome)}</td><td>${e.pendingSignatureDocs.map(d=>escHtml(d.arquivo)).join('<br>')}</td></tr>`
  ).join(''):'<tr><td colspan="2" class="muted">Nenhuma assinatura pendente.</td></tr>';
}
```

- [ ] **Step 2: Wiring dentro de `render()`**

Localizar `renderJornadaHe();` dentro de `render()` (buscar `grep -n "renderJornadaHe();" renderer/app.html`). Logo depois dessa linha, adicionar:
```js
  renderJornada180Pendencias();
```

- [ ] **Step 3: Verificar sintaxe**

Run: mesmo comando + `node --check`.
Expected: sem saída.

- [ ] **Step 4: Commit**

```bash
git add renderer/app.html
git commit -m "Adiciona renderizacao da aba 180 dias/Pendencias"
```

---

## Task 12: Alerta de assinatura pendente no Home

**Files:**
- Modify: `renderer/app.html` (função nova logo após `financeDueAlerts`; wiring na lista de alertas do Home)

**Interfaces:**
- Consumes: `latestJornadaPeriod` (Fase 1).
- Produces: `pendingSignatureAlerts() -> [{type:'assinatura',severity,text,detail}]`.

- [ ] **Step 1: Função de alerta**

Logo após `function financeDueAlerts(){...}` (buscar o `}` que fecha essa função), inserir:

```js
function pendingSignatureAlerts(){
  const period=latestJornadaPeriod();
  if(!period)return [];
  return period.employees.filter(e=>e.employeeId&&(e.pendingSignatureDocs||[]).length).map(e=>({
    type:'assinatura',severity:e.pendingSignatureDocs.length>=3?'bad':'warn',
    text:`${e.nome} — ${e.pendingSignatureDocs.length} espelho(s) de ponto pendente(s) de assinatura`,
    detail:e.pendingSignatureDocs.map(d=>d.arquivo).join(', ')
  }));
}
```

- [ ] **Step 2: Incluir na lista de alertas do Home**

Localizar (buscar `const alerts=[...vacationDeadlineAlerts()`):
```js
  const alerts=[...vacationDeadlineAlerts(),...financeDueAlerts(),...lossAlerts()];
```
Trocar por:
```js
  const alerts=[...vacationDeadlineAlerts(),...financeDueAlerts(),...lossAlerts(),...pendingSignatureAlerts()];
```

Logo abaixo, localizar o `.map` que renderiza cada alerta por `a.type` (buscar `if(a.type==='ferias')`):
```js
  $('alertsList').innerHTML=alerts.length?alerts.map(a=>{
    if(a.type==='ferias')return `<div class="alert-box ${a.severity}"><div class="ic">🏖️</div><div><b>${escHtml(a.text)}</b><small>${escHtml(a.detail)}</small></div></div>`;
```
Trocar por:
```js
  $('alertsList').innerHTML=alerts.length?alerts.map(a=>{
    if(a.type==='ferias')return `<div class="alert-box ${a.severity}"><div class="ic">🏖️</div><div><b>${escHtml(a.text)}</b><small>${escHtml(a.detail)}</small></div></div>`;
    if(a.type==='assinatura')return `<div class="alert-box ${a.severity}"><div class="ic">✍️</div><div><b>${escHtml(a.text)}</b><small>${escHtml(a.detail)}</small></div></div>`;
```

- [ ] **Step 3: Verificar sintaxe**

Run: mesmo comando + `node --check`.
Expected: sem saída.

- [ ] **Step 4: Commit**

```bash
git add renderer/app.html
git commit -m "Adiciona alerta de assinatura de ponto pendente no Home"
```

---

## Task 13: QA manual completo + build

**Files:** nenhum (só verificação)

- [ ] **Step 1: Rodar o app localmente**

```bash
unset ELECTRON_RUN_AS_NODE   # ou Remove-Item Env:\ELECTRON_RUN_AS_NODE no PowerShell
npm start
```
Expected: app abre sem erro no console.

- [ ] **Step 2: Importar os 4 arquivos novos, em qualquer ordem**

No Jornada/HE → Visão Geral, importar `Bco_Horas_Selbetti_Analitico_Portal_MEU_RH.pdf`, `Bco_Horas_Selbetti_Sintetico_Portal_MEU_RH.pdf`, `Espelho_de_Ponto_PENDENTE_Assinatura_Portal_MEU_RH.pdf`, `Listagem_de_INTERJORNADA_e_INTRAJORNADA_Portal_MEU_RH.pdf`.
Expected: 4 alertas de sucesso; o Espelho de Ponto Pendente só funciona se um período já existir (importar a planilha de saldo ou a Listagem de HE da Fase 1 primeiro, se ainda não tiver dado de teste).

- [ ] **Step 3: Conferir a aba "180 dias / Pendências"**

Expected: tabela de 180 dias mostrando a janela `26/01/2026 a 25/02/2026` com valor "00:00" pra todo mundo (arquivo real não tem evento); tabela de pendências mostrando 4 colaboradores (ITALO KELLER MARQUES SAYAO, JOAO PEDRO RODRIGUES SANTOS, TIAGO FERRARI CANDIOTTO, VINICIUS MAGALHAES MORAIS RIBEIRO) com seus documentos.

- [ ] **Step 4: Conferir o alerta no Home**

Expected: 4 alertas de assinatura pendente aparecem na lista de alertas do Home (um por colaborador com pendência), com o ícone ✍️.

- [ ] **Step 5: Reimportar os mesmos 4 arquivos**

Expected: números batem exatamente com a primeira importação (idempotente, não duplica).

- [ ] **Step 6: Conferir que a Fase 1 continua intacta**

Abrir a aba "Banco de Horas"/"HE do período" do Jornada/HE, o Meu Painel de um operador, e o resumo de pagamento estimado no perfil individual — tudo deve continuar mostrando exatamente os mesmos valores de antes desta Fase 2 (nada da Fase 1 foi alterado).

- [ ] **Step 7: Build completo**

```bash
npx electron-builder --win
```
Expected: build termina com exit code 0, gera `dist\GO-Enterprise-Setup-<versão>.exe`.

- [ ] **Step 8: Commit final (se algum ajuste tiver sido feito durante o QA)**

```bash
git add -A
git commit -m "Ajustes de QA da Fase 2 do Jornada/HE"
```
(pular este commit se nenhum ajuste foi necessário)

---

## Self-review desta plan (já aplicado)

- **Cobertura da spec**: modelo de dados híbrido (Task 1), os 4 parsers + 4 importadores (Tasks 2-9), UI com botões + aba nova (Task 10), renderização (Task 11), alerta de assinatura pendente (Task 12), testes (Task 13) — todas as seções da spec de Fase 2 têm task correspondente.
- **Sem placeholders**: todo código é real, extraído/adaptado do próprio `app.html` ou validado contra os arquivos reais em `Modulo RH` (exceto o caminho "com eventos" do Analítico de 180 dias, cujo risco residual — nenhum evento real disponível pra validar — está documentado explicitamente na Task 8, não escondido).
- **Consistência de tipos**: `upsertJornadaEmployeeRecord` (Fase 1) e `upsertJornada180EmployeeRecord` (Task 1) mantêm a mesma assinatura em todas as chamadas; `parseHourBankCell`/`parseDurationHms`/`pdfDateBrToIso` (Fase 1, reaproveitados sem mudança) usados com o mesmo contrato em todos os parsers novos; `vencimentos180d`/`pendingSignatureDocs`/`interIntraEvents` têm exatamente os mesmos nomes de campo em `normalizeJornadaEmployeeRecord` (Task 1), nos parsers que os produzem (Tasks 4, 6) e nos importadores que os gravam (Tasks 5, 7, 3).
- **Isolamento do HE e dos valores de 180 dias**: nenhuma task desta Fase 2 toca `computeTimesheetPayroll` — confirmado por não haver nenhuma referência a essa função em nenhuma das 13 tasks.
