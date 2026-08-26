# Módulo Jornada/HE (Fase 1) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralizar banco de horas + horas extras (HE) num módulo novo "Jornada/HE" dentro do GO Enterprise, importando diretamente os dois documentos do Portal Meu RH que definem esses dois conceitos (planilha de saldo + Listagem de HE em PDF), com histórico por período desde o início — substituindo as duas fontes desconectadas que existem hoje (`emp.hourBank` e o resumo de pagamento baseado em `db.timesheets`).

**Architecture:** Tudo entra no arquivo único `renderer/app.html` (convenção já estabelecida no projeto — sem framework, sem arquivos separados por feature). A leitura da planilha reaproveita 100% o parser XLSX já existente (`readFirstSheet`/`findCol`/`parseHourBankCell`). A leitura do PDF reaproveita a camada de baixo nível de extração de texto já existente (`extractPdfFragments`, construída para o Cartão de Ponto), com um interpretador de tabela novo por cima, feito por classificação de coluna por posição X (mais simples que o parser do Cartão de Ponto, que usa caracteres "|" como separador — esta tabela não tem separador visível, mas cada linha de dado alinha exatamente com o X do cabeçalho da coluna).

**Tech Stack:** JavaScript puro (sem framework), Electron. Sem framework de teste no projeto — verificação por scripts Node standalone extraindo as funções puras, comparação contra dado real, e teste manual via `npm start`/DevTools (mesmo padrão já usado no resto do projeto, ver `docs/BUILD_E_RELEASE.md`).

**Spec:** `docs/superpowers/specs/2026-08-19-jornada-he-design.md`

## Global Constraints

- Nunca usar `-i`/interativo em nenhum comando.
- Nunca commitar `renderer/master-secret.js` (gitignored).
- `ELECTRON_RUN_AS_NODE` deve estar limpa antes de rodar `npm start` (ver `docs/BUILD_E_RELEASE.md`).
- Seguir a convenção de commit do projeto: mensagens em português, sem ponto final no título, descrevendo o "porquê".
- HE (`horasExtraMin`) NÃO entra no resumo de pagamento estimado em R$ — só alimenta o saldo do banco de horas (confirmado com o usuário).
- Os dois importadores (planilha de saldo, Listagem de HE) são independentes: qualquer um pode ser importado sozinho, em qualquer ordem, sem erro.
- A importação de Cartão de Ponto individual (`importTimesheet`/`db.timesheets`) **não muda** — continua existindo exatamente como está.

---

## Arquivos de referência (dados reais para os testes)

Os testes deste plano usam arquivos reais que já existem no computador — não são fixtures inventadas:

- `F:\Projetos DEV\Modulo RH\Planilha_Saldo_Horas.xlsx` — planilha de saldo real.
- `F:\Projetos DEV\Modulo RH\Listagem_de_HE_FA_AT_e_AB_Portal_MEU_RH.pdf` — PDF real.
- `F:\Projetos DEV\Modulo RH\_dados\historico.json` — gabarito: os mesmos dados já calculados pela ferramenta Python, pro mesmo período (`2026-07-26_2026-08-25`).

Valores de referência já extraídos e cruzados manualmente entre as duas fontes (usar nos testes):

**Chapa 090073 — QUELISSON QUINTO DINIZ** (aparece nos dois arquivos, período 26/07/2026 a 25/08/2026):
- Da planilha: saldo anterior `+75:47` (4547 min), saldo do período `-02:18` (-138 min), total `+73:29` (4409 min).
- Do PDF: horário `08:00-12:00/13:12-18:00 2ª/6ª`, HR_BASE `193:36:00` (11616 min), HR_TRAB `191:27:00` (11487 min), HR_ATRAS `09:47:00` (587 min), HR_FALTA `08:48:00` (528 min), HR_ABONO `00:00:00` (0 min), **HR_EXTRA `16:17:00` (977 min)**, HR_AD_NO `07:00:00` (420 min), HR_INTRA `00:00:00` (0 min), HR_INTER `00:00:00` (0 min).

**Chapa 090349 — ADRIANO MARTINS DE OLIVEIRA** (linha da tabela, do PDF, primeira linha de dado):
- Horário `08:00-12:00/13:12-18:00 2ª/6ª`, HR_BASE `193:36:00` (11616), HR_TRAB `215:24:00` (12924), HR_ATRAS `00:00:00` (0), HR_FALTA `00:00:00` (0), HR_ABONO `00:00:00` (0), HR_EXTRA `21:24:00` (1284), HR_AD_NO `07:00:00` (420), HR_INTRA `00:01:00` (1), HR_INTER `00:00:00` (0).
- Da planilha (mesma pessoa): saldo anterior `+00:33` (33 min), saldo do período `+21:24` (1284 min), total `+21:57` (1317 min).

Total de colaboradores no PDF: **15**. Período: `26/07/2026` a `25/08/2026` → `periodoIni="2026-07-26"`, `periodoFim="2026-08-25"`, `id` do período = `"2026-08"`.

Posições X (pontos PDF) de cada coluna, já validadas contra o arquivo real:

| Coluna | x (cabeçalho) | x (linha de dado) |
|---|---|---|
| Chapa | 34.3 | 34.3 |
| Nome | 84.6 | 84.6 |
| Horário | 254.1 | 254.1 |
| HR_BASE | 424.1 | 425.6 |
| HR_TRAB | 466.6 | 467.9 |
| HR_ATRAS | 509.0 | 510.1 |
| HR_FALTA | 551.5 | 553.2 |
| HR_ABONO | 594.0 | 595.4 |
| HR_EXTRA | 636.5 | 637.9 |
| HR_AD_NO | 679.2 | 680.7 |
| HR_INTRA | 721.7 | 722.7 |
| HR_INTER | 764.1 | 765.6 |

O espaçamento vertical entre linhas de dados é consistente (~15.4-15.5pt).

---

## Task 1: Coleção `jornadaPeriods` no merge entre PCs

**Files:**
- Modify: `src/dataStore.js:20-24`

**Interfaces:**
- Produces: `'jornadaPeriods'` presente em `ARRAY_COLLECTIONS`, exigindo que todo registro em `db.jornadaPeriods[]` tenha `id` e `updatedAt`.

- [ ] **Step 1: Adicionar a coleção**

Em `src/dataStore.js`, linha 20-24, trocar:
```js
const ARRAY_COLLECTIONS = [
  'production', 'finance', 'expenses', 'losses', 'employees', 'absences', 'vacations',
  'suppliers', 'imports', 'history', 'activities', 'timesheets', 'manuals', 'news',
  'alerts', 'dailyMessages', 'selbNews', 'selbAlerts'
];
```
por:
```js
const ARRAY_COLLECTIONS = [
  'production', 'finance', 'expenses', 'losses', 'employees', 'absences', 'vacations',
  'suppliers', 'imports', 'history', 'activities', 'timesheets', 'manuals', 'news',
  'alerts', 'dailyMessages', 'selbNews', 'selbAlerts', 'jornadaPeriods'
];
```

- [ ] **Step 2: Verificar sintaxe**

Run: `node --check src/dataStore.js`
Expected: sem saída (sucesso).

- [ ] **Step 3: Commit**

```bash
git add src/dataStore.js
git commit -m "Adiciona jornadaPeriods ao merge entre PCs (Jornada/HE Fase 1)"
```

---

## Task 2: Modelo de dados — normalização e helpers de período

**Files:**
- Modify: `renderer/app.html` (dentro de `normalizeDb`, linha ~1714-1737, e logo após as funções `normalizeSelbAlert`/`isSelbItemLive`, linha ~1746-1751)

**Interfaces:**
- Produces:
  - `jornadaPeriodId(dateIso) -> string` ("YYYY-MM")
  - `normalizeJornadaEmployeeRecord(e) -> object` (schema completo, ver abaixo)
  - `normalizeJornadaPeriod(p) -> object` (`{id, periodoIni, periodoFim, importedAt, updatedAt, employees: []}`)
  - `db.jornadaPeriods` presente em `normalizeDb()`
  - `latestJornadaPeriod() -> object|null`
  - `findJornadaEmployeeRecord(period, employeeId) -> object|null`
  - `jornadaPeriodByMonthId(id) -> object|null`
  - `upsertJornadaEmployeeRecord(periodId, periodoIni, periodoFim, precise, employeeId, chapa, nome, patch)` — cria/atualiza o período e o registro do colaborador dentro dele.
- Consumes: `uid()`, `db` (global), nada além disso.

- [ ] **Step 1: Adicionar `jornadaPeriods` a `normalizeDb()`**

Em `renderer/app.html`, dentro de `normalizeDb` (linha ~1714), trocar:
```js
    selbNews:Array.isArray(source.selbNews)?source.selbNews.map(normalizeSelbNews):[],
    selbAlerts:Array.isArray(source.selbAlerts)?source.selbAlerts.map(normalizeSelbAlert):[],
    config:{...db.config,...(source.config||{}),security:{...db.config.security,...((source.config||{}).security||{})}}
```
por:
```js
    selbNews:Array.isArray(source.selbNews)?source.selbNews.map(normalizeSelbNews):[],
    selbAlerts:Array.isArray(source.selbAlerts)?source.selbAlerts.map(normalizeSelbAlert):[],
    jornadaPeriods:Array.isArray(source.jornadaPeriods)?source.jornadaPeriods.map(normalizeJornadaPeriod):[],
    config:{...db.config,...(source.config||{}),security:{...db.config.security,...((source.config||{}).security||{})}}
```

- [ ] **Step 2: Escrever as funções de normalização e os helpers de período**

Logo depois da função `normalizeSelbAlert` (linha ~1751, antes do comentário `/* ---- SELBNEWS: regras de negócio puras`), inserir:

```js
/* ===================== JORNADA/HE — banco de horas + HE, Fase 1 =====================
   Coleção própria db.jornadaPeriods[]: um registro por período/competência (nunca sobrescrito por
   um período diferente — reimportar o MESMO período atualiza aquele registro). Os dois importadores
   (planilha de saldo, Listagem de HE) convergem pro mesmo período automaticamente porque o id do
   período é sempre derivado do mês-calendário do FIM da competência ("YYYY-MM"), não de correspondência
   fuzzy de datas — funciona em qualquer ordem de importação. */
function jornadaPeriodId(dateIso){ return String(dateIso||'').slice(0,7) }

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
function normalizeJornadaPeriod(p){
  return {
    id:p.id||'', periodoIni:p.periodoIni||'', periodoFim:p.periodoFim||'',
    importedAt:p.importedAt||new Date().toISOString(), updatedAt:p.updatedAt||p.importedAt||new Date().toISOString(),
    employees:Array.isArray(p.employees)?p.employees.map(normalizeJornadaEmployeeRecord):[]
  };
}
function latestJornadaPeriod(){
  const list=db.jornadaPeriods||[];
  if(!list.length)return null;
  return [...list].sort((a,b)=>b.id.localeCompare(a.id))[0];
}
function jornadaPeriodByMonthId(id){ return (db.jornadaPeriods||[]).find(p=>p.id===id)||null }
function findJornadaEmployeeRecord(period,employeeId){
  if(!period||!employeeId)return null;
  return period.employees.find(e=>e.employeeId===employeeId)||null;
}
// cria/atualiza o registro de um colaborador dentro de um período. "precise" indica se periodoIni/
// periodoFim deste import são a fonte confiável (true = veio do PDF, que traz "Periodo Ativo do
// Ponto"; false = veio da planilha, que só tem a data de geração do relatório) — só sobrescreve as
// datas do período se for preciso, ou se o período ainda não tiver data nenhuma.
function upsertJornadaEmployeeRecord(periodId,periodoIni,periodoFim,precise,employeeId,chapa,nome,patch){
  db.jornadaPeriods=db.jornadaPeriods||[];
  let period=db.jornadaPeriods.find(p=>p.id===periodId);
  if(!period){
    period=normalizeJornadaPeriod({id:periodId,periodoIni,periodoFim,importedAt:new Date().toISOString()});
    db.jornadaPeriods.push(period);
  }else if(precise||!period.periodoIni){
    period.periodoIni=periodoIni;period.periodoFim=periodoFim;
  }
  let rec=period.employees.find(e=>e.employeeId===employeeId);
  if(!rec){rec=normalizeJornadaEmployeeRecord({employeeId,chapa,nome});period.employees.push(rec)}
  Object.assign(rec,patch);
  if(chapa)rec.chapa=chapa;
  if(nome)rec.nome=nome;
  period.updatedAt=new Date().toISOString();
}
```

- [ ] **Step 3: Testar as funções puras contra dado real**

Criar um script standalone temporário (fora do repo, ex. na pasta de scratchpad) que copia só as funções puras acima (sem `db`/`uid` — usar um `uid` fake e um objeto `db` mínimo `{}`) e roda estas asserções:

```js
// teste manual — colar as funções normalizeJornadaEmployeeRecord/normalizeJornadaPeriod/
// jornadaPeriodId/upsertJornadaEmployeeRecord acima, com:
let db={}; const uid=()=>'x'+Math.random();

console.assert(jornadaPeriodId('2026-08-25')==='2026-08','período errado');

upsertJornadaEmployeeRecord('2026-08','2026-08-25','2026-08-25',false,'emp1','090073','QUELISSON',{bhSaldoTotalMin:4409});
console.assert(db.jornadaPeriods.length===1,'deveria criar 1 período');
console.assert(db.jornadaPeriods[0].periodoIni==='2026-08-25','data imprecisa deveria ter entrado (período novo)');

upsertJornadaEmployeeRecord('2026-08','2026-07-26','2026-08-25',true,'emp1','090073','QUELISSON',{horasExtraMin:977});
const rec=db.jornadaPeriods[0].employees[0];
console.assert(db.jornadaPeriods[0].periodoIni==='2026-07-26','import preciso deveria corrigir a data');
console.assert(rec.bhSaldoTotalMin===4409,'campo do primeiro import deveria persistir');
console.assert(rec.horasExtraMin===977,'campo do segundo import deveria ter mesclado');
console.log('OK — todas as asserções passaram');
```

Run: `node <script>.js`
Expected: `OK — todas as asserções passaram`, sem nenhuma linha `Assertion failed`.

- [ ] **Step 4: Verificar sintaxe do app.html**

Run:
```bash
node -e "
const fs=require('fs');
const html=fs.readFileSync('renderer/app.html','utf-8');
const s=html.indexOf('<script>'),e=html.indexOf('</script>');
require('fs').writeFileSync('/tmp/check.js',html.slice(s+8,e));
"
node --check /tmp/check.js
```
Expected: sem saída (sucesso).

- [ ] **Step 5: Commit**

```bash
git add renderer/app.html
git commit -m "Adiciona modelo de dados do Jornada/HE (db.jornadaPeriods)"
```

---

## Task 3: Importador da planilha de saldo

**Files:**
- Modify: `renderer/app.html` (nova função logo após `importHourBank`, linha ~2359)

**Interfaces:**
- Consumes: `readFirstSheet(file)`, `findHeaderRow(rows)`, `parsePtBrReportDate(s)`, `findCol(header,...names)`, `parseHourBankCell(raw)`, `normName(s)`, `norm(s)`, `db.employees`, `jornadaPeriodId`, `upsertJornadaEmployeeRecord`, `save`, `db.imports` (todas já existentes, ou criadas na Task 2).
- Produces: `importJornadaSaldoPlanilha(file)` — função async, chamada por um `<input type="file">` no HTML (Task 6).

- [ ] **Step 1: Escrever o importador**

Logo depois do fim de `importHourBank` (linha ~2359, antes da linha em branco que precede `readFirstSheet`... na verdade `readFirstSheet` está longe, então inserir logo após a chave de fechamento de `importHourBank`), inserir:

```js
/* ---- Jornada/HE: importador da planilha de saldo (mesmo formato que importHourBank já lê —
   reaproveita os mesmos helpers — mas grava num período do histórico em vez de sobrescrever
   emp.hourBank). A planilha não tem data de período, só a data de geração do relatório: o período
   criado por este import é "impreciso" (upsertJornadaEmployeeRecord com precise=false) — se depois
   a Listagem de HE for importada pro mesmo mês, ela corrige periodoIni/periodoFim com o valor certo. ---- */
async function importJornadaSaldoPlanilha(file){
  if(!file)return;
  try{
    const rows=await readFirstSheet(file);
    const hIdx=findHeaderRow(rows),h=rows[hIdx]||[];
    let reportDate='';
    for(let i=0;i<hIdx;i++){const d=parsePtBrReportDate(rows[i]&&rows[i][0]);if(d){reportDate=d;break}}
    const ix={reg:findCol(h,'Matricula','Matrícula'),name:findCol(h,'Nome'),
      saldoAnt:findCol(h,'Saldo Anterior'),
      saldoPer:findCol(h,'Saldo do Período','Saldo do Periodo','Saldo Período','Saldo Periodo'),
      saldoTot:findCol(h,'Total Banco','Banco Total','Saldo Total','Total do Banco','Total do Banco de Horas',
        'Banco de Horas','Banco De Horas','Saldo','Saldo Atual','Saldo Banco de Horas','Saldo do Banco de Horas')};
    if(ix.saldoTot<0){alert('Coluna com o saldo total do banco de horas não encontrada na planilha (ex.: "Total Banco" ou "Saldo").');return}
    if(ix.reg<0&&ix.name<0){alert('Informe ao menos a coluna "Matrícula" ou "Nome" para identificar cada colaborador.');return}
    const today=new Date().toISOString().slice(0,10);
    const periodoIni=reportDate||today,periodoFim=reportDate||today;
    const periodId=jornadaPeriodId(periodoFim);
    let updated=0,notFound=0,skipped=0;const misses=[];
    for(const r of rows.slice(hIdx+1)){
      const reg=ix.reg>=0?String(r[ix.reg]??'').trim():'';
      const name=ix.name>=0?String(r[ix.name]??'').trim():'';
      if(!reg&&!name)continue;
      const totParsed=parseHourBankCell(r[ix.saldoTot]);
      if(!totParsed){skipped++;continue}
      let emp=reg?db.employees.find(x=>x.reg&&norm(x.reg)===norm(reg)):null;
      if(!emp&&name)emp=db.employees.find(x=>normName(x.name)===normName(name));
      if(!emp){notFound++;misses.push(name||reg);continue}
      const antParsed=ix.saldoAnt>=0?parseHourBankCell(r[ix.saldoAnt]):null;
      const perParsed=ix.saldoPer>=0?parseHourBankCell(r[ix.saldoPer]):null;
      upsertJornadaEmployeeRecord(periodId,periodoIni,periodoFim,false,emp.id,reg,name,{
        bhSaldoAnteriorMin:antParsed?antParsed.minutes*antParsed.sign:null,
        bhSaldoPeriodoMin:perParsed?perParsed.minutes*perParsed.sign:null,
        bhSaldoTotalMin:totParsed.minutes*totParsed.sign
      });
      updated++;
    }
    db.imports.unshift({at:new Date().toLocaleString('pt-BR'),file:file.name,total:rows.length-hIdx-1,added:0,updated,same:skipped,errors:notFound});
    db.imports=db.imports.slice(0,30);
    await save(true);
    let msg=`Jornada/HE — planilha de saldo importada: ${updated} colaborador(es) (período ${periodId}).`;
    if(notFound)msg+=` ${notFound} não encontrado(s) na equipe${misses.length?' ('+misses.slice(0,5).join(', ')+(misses.length>5?'…':'')+')':''}.`;
    if(skipped)msg+=` ${skipped} linha(s) com saldo inválido ignorada(s).`;
    alert(msg);
  }catch(e){alert('Falha ao importar planilha de saldo: '+e.message)}
}
```

- [ ] **Step 2: Verificar sintaxe**

Run: (mesmo comando de extração + `node --check` da Task 2, Step 4)
Expected: sem saída.

- [ ] **Step 3: Teste manual com o arquivo real**

Este teste só pode ser feito dentro do app (a função usa `readFirstSheet`, que depende de APIs de arquivo do navegador/Electron). Deixar para o teste manual da Task 9 (QA final), onde o botão de importação já vai existir. Anotar aqui o resultado esperado pra conferir lá: importar `F:\Projetos DEV\Modulo RH\Planilha_Saldo_Horas.xlsx` deve atualizar o colaborador de chapa/nome "QUELISSON QUINTO DINIZ" com `bhSaldoAnteriorMin=4547, bhSaldoPeriodoMin=-138, bhSaldoTotalMin=4409` — **mas só se existir um colaborador com esse nome cadastrado em `db.employees`**; senão vai contar como "não encontrado" (comportamento correto, não é bug).

- [ ] **Step 4: Commit**

```bash
git add renderer/app.html
git commit -m "Adiciona importador da planilha de saldo do Jornada/HE"
```

---

## Task 4: Parser do PDF "Listagem de HE, FA, AT e AB"

**Files:**
- Modify: `renderer/app.html` (novas funções logo após `parsePontoStructure` termina — ver Task 5 do plano original de Cartão de Ponto; inserir antes de `parseHorarioRaw`, linha ~2998)

**Interfaces:**
- Consumes: nada além de JS puro — recebe o array de fragmentos que `extractPdfFragments` já produz (`[{x,y,s}]`).
- Produces:
  - `parseDurationHms(raw) -> number|null`
  - `pdfDateBrToIso(br) -> string` ("YYYY-MM-DD")
  - `listagemHeClassifyCol(x) -> string|null`
  - `parseListagemHeFragments(frags) -> {periodoIni, periodoFim, employees: [{chapa, nome, horario, horasBaseMin, ...}]}`

- [ ] **Step 1: Escrever o parser**

Antes de `function parseHorarioRaw(raw){` (linha ~2998), inserir:

```js
/* ===================== JORNADA/HE — parser do PDF "Listagem de HE, FA, AT e AB" =====================
   Layout validado contra o arquivo real (F:\Projetos DEV\Modulo RH\Listagem_de_HE_FA_AT_e_AB_Portal_MEU_RH.pdf):
   cada linha de dado tem seus fragmentos de texto quase na MESMA posição X do cabeçalho da coluna
   correspondente (±2pt de folga pela métrica da fonte) — não usa caractere separador como o Cartão
   de Ponto (que usa "|"), então a classificação de coluna é só por proximidade de X. */
const LISTAGEM_HE_COLS=[
  {key:'chapa',x:34.3},{key:'nome',x:84.6},{key:'horario',x:254.1},
  {key:'horasBaseMin',x:425.6},{key:'horasTrabMin',x:467.9},{key:'horasAtrasoMin',x:510.1},
  {key:'horasFaltaMin',x:553.2},{key:'horasAbonoMin',x:595.4},{key:'horasExtraMin',x:637.9},
  {key:'horasAdNoturnoMin',x:680.7},{key:'intrajornadaMin',x:722.7},{key:'interjornadaMin',x:765.6}
];
function listagemHeClassifyCol(x){
  let best=null,bestDist=Infinity;
  for(const c of LISTAGEM_HE_COLS){const d=Math.abs(x-c.x);if(d<bestDist){bestDist=d;best=c}}
  return bestDist<=4?best.key:null;
}
// "193:36:00" (HH:MM:SS) -> minutos. Nesta tabela os valores são sempre positivos (são durações
// acumuladas no período, não saldos com sinal como na planilha de banco de horas).
function parseDurationHms(raw){
  const m=String(raw||'').trim().match(/^(\d{1,4}):(\d{2})(?::(\d{2}))?$/);
  if(!m)return null;
  return (+m[1])*60+(+m[2])+Math.round((+(m[3]||0))/60);
}
function pdfDateBrToIso(br){
  const m=String(br||'').match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  if(!m)return '';
  const y=m[3].length===2?'20'+m[3]:m[3];
  return `${y}-${m[2]}-${m[1]}`;
}
function parseListagemHeFragments(frags){
  const periodoLabel=frags.find(f=>f.s.indexOf('Periodo Ativo do Ponto')>=0);
  if(!periodoLabel)throw new Error('Layout da Listagem de HE não reconhecido (rótulo de período não encontrado).');
  const dateFrags=frags.filter(f=>Math.abs(f.y-periodoLabel.y)<3&&/^\d{2}\/\d{2}\/\d{2,4}$/.test(f.s)).sort((a,b)=>a.x-b.x);
  if(dateFrags.length<2)throw new Error('Não foi possível ler o período ativo do ponto.');
  const periodoIni=pdfDateBrToIso(dateFrags[0].s),periodoFim=pdfDateBrToIso(dateFrags[1].s);

  const headerFrag=frags.find(f=>f.s==='Chapa');
  if(!headerFrag)throw new Error('Layout da Listagem de HE não reconhecido (cabeçalho "Chapa" não encontrado).');
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
  [...rowsByY.entries()].sort((a,b)=>b[0]-a[0]).forEach(([,rowFrags])=>{
    const rec={};
    rowFrags.forEach(f=>{
      const col=listagemHeClassifyCol(f.x);
      if(!col)return;
      if(col==='chapa')rec.chapa=f.s;
      else if(col==='nome')rec.nome=f.s;
      else if(col==='horario')rec.horario=f.s;
      else rec[col]=parseDurationHms(f.s);
    });
    if(rec.chapa)employees.push(rec);
  });
  return {periodoIni,periodoFim,employees};
}
```

- [ ] **Step 2: Verificar sintaxe**

Run: mesmo comando de extração + `node --check` (Task 2, Step 4).
Expected: sem saída.

- [ ] **Step 3: Testar contra o PDF real**

Criar um script standalone temporário que junta: as funções de baixo nível já existentes (`bytesToLatin1`, `parsePdfObjects`, `pdfDictGet`, `pdfResolveRef`, `pdfGetStreamBytes`, `inflateZlib`, `parseToUnicodeMap` — copiar de `renderer/app.html:2735-2808`), `extractPdfFragments` (copiar de `renderer/app.html:2809-2864`), e as funções novas desta task. Rodar:

```js
import { readFile } from 'node:fs/promises';
// ... (colar as funções copiadas acima) ...

const buf=await readFile(String.raw`F:\Projetos DEV\Modulo RH\Listagem_de_HE_FA_AT_e_AB_Portal_MEU_RH.pdf`);
const frags=await extractPdfFragments(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));
const result=parseListagemHeFragments(frags);

console.assert(result.periodoIni==='2026-07-26','periodoIni errado: '+result.periodoIni);
console.assert(result.periodoFim==='2026-08-25','periodoFim errado: '+result.periodoFim);
console.assert(result.employees.length===15,'deveria ter 15 colaboradores, achou '+result.employees.length);

const quelisson=result.employees.find(e=>e.chapa==='090073');
console.assert(quelisson,'não achou chapa 090073');
console.assert(quelisson.nome==='QUELISSON QUINTO DINIZ','nome errado: '+quelisson.nome);
console.assert(quelisson.horasExtraMin===977,'HR_EXTRA errado: '+quelisson.horasExtraMin);
console.assert(quelisson.horasBaseMin===11616,'HR_BASE errado: '+quelisson.horasBaseMin);
console.assert(quelisson.horasTrabMin===11487,'HR_TRAB errado: '+quelisson.horasTrabMin);
console.assert(quelisson.horasAtrasoMin===587,'HR_ATRAS errado: '+quelisson.horasAtrasoMin);
console.assert(quelisson.horasFaltaMin===528,'HR_FALTA errado: '+quelisson.horasFaltaMin);
console.assert(quelisson.horasAbonoMin===0,'HR_ABONO errado: '+quelisson.horasAbonoMin);
console.assert(quelisson.horasAdNoturnoMin===420,'HR_AD_NO errado: '+quelisson.horasAdNoturnoMin);
console.assert(quelisson.intrajornadaMin===0,'HR_INTRA errado: '+quelisson.intrajornadaMin);
console.assert(quelisson.interjornadaMin===0,'HR_INTER errado: '+quelisson.interjornadaMin);

const adriano=result.employees.find(e=>e.chapa==='090349');
console.assert(adriano&&adriano.horasExtraMin===1284,'HR_EXTRA do Adriano errado: '+(adriano&&adriano.horasExtraMin));
console.assert(adriano&&adriano.intrajornadaMin===1,'HR_INTRA do Adriano errado: '+(adriano&&adriano.intrajornadaMin));

console.log('OK — todas as asserções do parser da Listagem de HE passaram');
```

Run: `node <script>.mjs` (extensão `.mjs` por causa do `import` no topo)
Expected: `OK — todas as asserções do parser da Listagem de HE passaram`, sem `Assertion failed`.

Se alguma asserção falhar, o problema mais provável é a tolerância de classificação de coluna (`bestDist<=4` em `listagemHeClassifyCol`) ou o agrupamento de linha (`Math.abs(k-yKey)<1` em `parseListagemHeFragments`) — ajustar e rodar de novo até bater com os valores reais acima.

- [ ] **Step 4: Commit**

```bash
git add renderer/app.html
git commit -m "Adiciona parser do PDF Listagem de HE, FA, AT e AB"
```

---

## Task 5: Importador da Listagem de HE

**Files:**
- Modify: `renderer/app.html` (nova função logo após `parseListagemHeFragments`, resultado da Task 4)

**Interfaces:**
- Consumes: `extractPdfFragments(buf)`, `parseListagemHeFragments(frags)`, `jornadaPeriodId`, `upsertJornadaEmployeeRecord`, `norm`, `normName`, `db.employees`, `save`.
- Produces: `importJornadaListagemHe(file)` — função async, chamada por um `<input type="file">` no HTML (Task 6).

- [ ] **Step 1: Escrever o importador**

Logo depois de `parseListagemHeFragments` (Task 4), inserir:

```js
async function importJornadaListagemHe(file){
  if(!file)return;
  try{
    const buf=await file.arrayBuffer();
    const frags=await extractPdfFragments(buf);
    const {periodoIni,periodoFim,employees}=parseListagemHeFragments(frags);
    const periodId=jornadaPeriodId(periodoFim);
    let updated=0,notFound=0;const misses=[];
    employees.forEach(row=>{
      let emp=row.chapa?db.employees.find(x=>x.reg&&norm(x.reg)===norm(row.chapa)):null;
      if(!emp&&row.nome)emp=db.employees.find(x=>normName(x.name)===normName(row.nome));
      if(!emp){notFound++;misses.push(row.nome||row.chapa);return}
      upsertJornadaEmployeeRecord(periodId,periodoIni,periodoFim,true,emp.id,row.chapa,row.nome,{
        horario:row.horario||'',horasBaseMin:row.horasBaseMin??null,horasTrabMin:row.horasTrabMin??null,
        horasAtrasoMin:row.horasAtrasoMin??null,horasFaltaMin:row.horasFaltaMin??null,
        horasAbonoMin:row.horasAbonoMin??null,horasExtraMin:row.horasExtraMin??null,
        horasAdNoturnoMin:row.horasAdNoturnoMin??null,intrajornadaMin:row.intrajornadaMin??null,
        interjornadaMin:row.interjornadaMin??null
      });
      updated++;
    });
    db.imports.unshift({at:new Date().toLocaleString('pt-BR'),file:file.name,total:employees.length,added:0,updated,same:0,errors:notFound});
    db.imports=db.imports.slice(0,30);
    await save(true);
    let msg=`Jornada/HE — Listagem de HE importada: ${updated} colaborador(es) (período ${periodoIni.split('-').reverse().join('/')} a ${periodoFim.split('-').reverse().join('/')}).`;
    if(notFound)msg+=` ${notFound} não encontrado(s) na equipe${misses.length?' ('+misses.slice(0,5).join(', ')+(misses.length>5?'…':'')+')':''}.`;
    alert(msg);
  }catch(e){alert('Falha ao importar Listagem de HE: '+e.message)}
}
```

- [ ] **Step 2: Verificar sintaxe**

Run: mesmo comando de extração + `node --check`.
Expected: sem saída.

- [ ] **Step 3: Commit**

```bash
git add renderer/app.html
git commit -m "Adiciona importador da Listagem de HE do Jornada/HE"
```

---

## Task 6: Tela do módulo Jornada/HE (nav, HTML, CSS, tabs)

**Files:**
- Modify: `renderer/app.html`:
  - Nav: linha ~760 (depois do botão "Colaboradores")
  - `NAV_VIEWS_BY_ROLE`: linha ~2090-2094
  - Nova `<section>`: inserir depois da seção `#rh` fechar (localizar via `grep -n 'id="rh"' renderer/app.html` — inserir antes da próxima seção)
  - CSS: dentro do `<style>`, perto das regras `.selbnews-tabpane` (reaproveitar o mesmo padrão)

**Interfaces:**
- Consumes: `importJornadaSaldoPlanilha`, `importJornadaListagemHe` (Tasks 3 e 5).
- Produces: `switchJornadaHeTab(tab)`, elementos DOM `#jornadaHeOverviewCards`, `#jornadaHeBancoTable`, `#jornadaHeExtrasTable`, `#jornadaHeHistoricoTable` (consumidos pela Task 7).

- [ ] **Step 1: Botão de navegação**

Em `renderer/app.html` linha ~760, trocar:
```html
      <button data-view="rh">👥 <span>Colaboradores</span></button>
      <button data-view="manuais">📘 <span>Manuais</span></button>
```
por:
```html
      <button data-view="rh">👥 <span>Colaboradores</span></button>
      <button data-view="jornadaHe" data-role="gestor">🕒 <span>Jornada/HE</span></button>
      <button data-view="manuais">📘 <span>Manuais</span></button>
```

- [ ] **Step 2: `NAV_VIEWS_BY_ROLE`**

Linha ~2090-2094, trocar:
```js
const NAV_VIEWS_BY_ROLE={
  operador:['operadorHome','producao','manuais','dashboardTv'],
  tv:['dashboardTv','noticias'],
  gestor:['home','producao','financeiro','rh','manuais','dashboardTv','fornecedores','admin','noticias','selbnews']
};
```
por:
```js
const NAV_VIEWS_BY_ROLE={
  operador:['operadorHome','producao','manuais','dashboardTv'],
  tv:['dashboardTv','noticias'],
  gestor:['home','producao','financeiro','rh','jornadaHe','manuais','dashboardTv','fornecedores','admin','noticias','selbnews']
};
```

- [ ] **Step 3: CSS das sub-abas**

No `<style>`, logo após a regra `.selbnews-tabpane.active{display:block;animation:fade .2s ease}` (buscar com `grep -n "selbnews-tabpane.active" renderer/app.html`), inserir:
```css
.jornadaHe-tabpane{display:none}
.jornadaHe-tabpane.active{display:block;animation:fade .2s ease}
```

- [ ] **Step 4: Seção HTML**

Localizar o fim da seção `#rh` com `grep -n '<section class="view" id="rh"' renderer/app.html` e a tag `</section>` que a fecha (a próxima seção começa logo depois). Inserir a nova seção completa logo depois desse `</section>`:

```html
    <!-- JORNADA/HE — banco de horas + HE, Fase 1. Sem tela própria de aging 180d/intra-interjornada/
         assinaturas pendentes ainda (Fase 2, fora deste plano). -->
    <section class="view" id="jornadaHe">
      <div class="top"><div><h1>Jornada/HE</h1><p>Banco de horas e horas extras da equipe.</p></div></div>
      <div class="role-tabs" id="jornadaHeTabs">
        <button class="role-tab active" data-tab="overview" onclick="switchJornadaHeTab('overview')">Visão Geral</button>
        <button class="role-tab" data-tab="banco" onclick="switchJornadaHeTab('banco')">Banco de Horas</button>
        <button class="role-tab" data-tab="he" onclick="switchJornadaHeTab('he')">HE do período</button>
        <button class="role-tab" data-tab="historico" onclick="switchJornadaHeTab('historico')">Histórico</button>
      </div>

      <div class="jornadaHe-tabpane active" data-pane="overview">
        <div class="grid cards" id="jornadaHeOverviewCards"></div>
        <div class="panel"><div class="toolbar">
            <label class="btn primary file">⬆ Importar planilha de saldo<input type="file" accept=".xlsx" onchange="importJornadaSaldoPlanilha(this.files[0]);this.value=''"></label>
            <label class="btn primary file">⬆ Importar Listagem de HE (PDF)<input type="file" accept=".pdf" onchange="importJornadaListagemHe(this.files[0]);this.value=''"></label>
          </div>
          <p class="muted" style="font-size:12px;margin-top:-6px">Os dois arquivos são independentes — pode importar só um, o outro, ou os dois, em qualquer ordem.</p>
        </div>
      </div>

      <div class="jornadaHe-tabpane" data-pane="banco">
        <div class="panel"><h2>Banco de horas — período mais recente</h2>
          <div class="tablewrap"><table><thead><tr><th>Colaborador</th><th>Saldo anterior</th><th>Movimento do período</th><th>Saldo total</th></tr></thead><tbody id="jornadaHeBancoTable"></tbody></table></div>
        </div>
      </div>

      <div class="jornadaHe-tabpane" data-pane="he">
        <div class="panel"><h2>HE do período mais recente</h2>
          <div class="tablewrap"><table><thead><tr><th>Colaborador</th><th>Horas extras</th><th>Atraso</th><th>Falta</th><th>Abono</th><th>Ad. noturno</th></tr></thead><tbody id="jornadaHeExtrasTable"></tbody></table></div>
        </div>
      </div>

      <div class="jornadaHe-tabpane" data-pane="historico">
        <div class="panel"><h2>Períodos importados</h2>
          <div class="tablewrap"><table><thead><tr><th>Período</th><th>Colaboradores</th><th>Saldo líquido</th><th>vs. período anterior</th></tr></thead><tbody id="jornadaHeHistoricoTable"></tbody></table></div>
        </div>
      </div>
    </section>
```

- [ ] **Step 5: função `switchJornadaHeTab`**

Logo após `importJornadaListagemHe` (Task 5), inserir:
```js
function switchJornadaHeTab(tab){
  document.querySelectorAll('#jornadaHeTabs .role-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  document.querySelectorAll('#jornadaHe .jornadaHe-tabpane').forEach(p=>p.classList.toggle('active',p.dataset.pane===tab));
}
```

- [ ] **Step 6: Verificar sintaxe e balanceamento**

Run:
```bash
node -e "
const fs=require('fs');
const html=fs.readFileSync('renderer/app.html','utf-8');
const s=html.indexOf('<script>'),e=html.indexOf('</script>');
fs.writeFileSync('/tmp/check.js',html.slice(s+8,e));
"
node --check /tmp/check.js
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

- [ ] **Step 7: Commit**

```bash
git add renderer/app.html
git commit -m "Adiciona tela do modulo Jornada/HE (nav, secao, abas)"
```

---

## Task 7: Renderização das 4 abas

**Files:**
- Modify: `renderer/app.html` (nova função logo após `switchJornadaHeTab`; wiring dentro de `render()`, linha ~3230+)

**Interfaces:**
- Consumes: `latestJornadaPeriod()`, `db.jornadaPeriods`, `escHtml`.
- Produces: `fmtSignedMin(min)`, `fmtDurationMin(min)`, `renderJornadaHe()` — chamada de dentro de `render()`.

- [ ] **Step 1: Formatadores + render**

Logo após `switchJornadaHeTab` (Task 6, Step 5), inserir:
```js
function fmtSignedMin(min){
  if(min===null||min===undefined)return '—';
  const sign=min<0?'-':'';
  const abs=Math.abs(min);
  return `${sign}${String(Math.floor(abs/60)).padStart(2,'0')}:${String(abs%60).padStart(2,'0')}`;
}
function fmtDurationMin(min){
  if(min===null||min===undefined)return '—';
  return `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`;
}
function renderJornadaHe(){
  const el=$('jornadaHeOverviewCards');if(!el)return;
  const period=latestJornadaPeriod();
  if(!period){
    el.innerHTML='<p class="muted">Nenhum período importado ainda.</p>';
    $('jornadaHeBancoTable').innerHTML='<tr><td colspan="4" class="muted">Nenhum período importado ainda.</td></tr>';
    $('jornadaHeExtrasTable').innerHTML='<tr><td colspan="6" class="muted">Nenhum período importado ainda.</td></tr>';
    $('jornadaHeHistoricoTable').innerHTML='<tr><td colspan="4" class="muted">Nenhum período importado ainda.</td></tr>';
    return;
  }
  const activeEmployees=period.employees.filter(e=>e.employeeId);
  const saldoLiquido=activeEmployees.reduce((s,e)=>s+(e.bhSaldoTotalMin||0),0);
  const negativos=activeEmployees.filter(e=>(e.bhSaldoTotalMin||0)<0).length;
  const heTotalMin=activeEmployees.reduce((s,e)=>s+(e.horasExtraMin||0),0);
  el.innerHTML=`
    <div class="card ${saldoLiquido<0?'accent-red':'accent-teal'}"><div class="k">Saldo líquido da equipe</div><div class="v">${fmtSignedMin(saldoLiquido)}</div></div>
    <div class="card accent-amber"><div class="k">Colaboradores com saldo negativo</div><div class="v">${negativos}</div></div>
    <div class="card accent-indigo"><div class="k">HE total do período</div><div class="v">${fmtDurationMin(heTotalMin)}</div></div>
    <div class="card"><div class="k">Período</div><div class="v" style="font-size:15px">${period.periodoIni.split('-').reverse().join('/')} a ${period.periodoFim.split('-').reverse().join('/')}</div></div>`;

  const byName=[...activeEmployees].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  $('jornadaHeBancoTable').innerHTML=byName.map(e=>`<tr><td>${escHtml(e.nome)}</td>
    <td style="color:${(e.bhSaldoAnteriorMin||0)<0?'var(--red)':'inherit'}">${fmtSignedMin(e.bhSaldoAnteriorMin)}</td>
    <td style="color:${(e.bhSaldoPeriodoMin||0)<0?'var(--red)':'inherit'}">${fmtSignedMin(e.bhSaldoPeriodoMin)}</td>
    <td style="font-weight:700;color:${(e.bhSaldoTotalMin||0)<0?'var(--red)':'var(--selbetti-dark)'}">${fmtSignedMin(e.bhSaldoTotalMin)}</td></tr>`).join('')
    ||'<tr><td colspan="4" class="muted">Nenhum colaborador neste período.</td></tr>';

  $('jornadaHeExtrasTable').innerHTML=byName.map(e=>`<tr><td>${escHtml(e.nome)}</td>
    <td style="font-weight:700">${fmtDurationMin(e.horasExtraMin)}</td>
    <td>${fmtDurationMin(e.horasAtrasoMin)}</td><td>${fmtDurationMin(e.horasFaltaMin)}</td>
    <td>${fmtDurationMin(e.horasAbonoMin)}</td><td>${fmtDurationMin(e.horasAdNoturnoMin)}</td></tr>`).join('')
    ||'<tr><td colspan="6" class="muted">Nenhum colaborador neste período.</td></tr>';

  const periods=[...(db.jornadaPeriods||[])].sort((a,b)=>b.id.localeCompare(a.id));
  $('jornadaHeHistoricoTable').innerHTML=periods.map((p,i)=>{
    const prev=periods[i+1];
    const total=p.employees.reduce((s,e)=>s+(e.bhSaldoTotalMin||0),0);
    let deltaTxt='—';
    if(prev){
      const prevTotal=prev.employees.reduce((s,e)=>s+(e.bhSaldoTotalMin||0),0);
      const delta=total-prevTotal;
      deltaTxt=`${delta>=0?'▲':'▼'} ${fmtSignedMin(Math.abs(delta))}`;
    }
    return `<tr><td>${p.periodoIni.split('-').reverse().join('/')} a ${p.periodoFim.split('-').reverse().join('/')}</td>
      <td>${p.employees.length}</td><td>${fmtSignedMin(total)}</td><td>${deltaTxt}</td></tr>`;
  }).join('')||'<tr><td colspan="4" class="muted">Nenhum período importado ainda.</td></tr>';
}
```

- [ ] **Step 2: Wiring dentro de `render()`**

Localizar `function render(){` (linha ~3230) e a chamada `renderRH();` dentro dela (buscar com `grep -n "renderRH();" renderer/app.html`). Logo depois dessa linha, adicionar:
```js
  renderJornadaHe();
```

- [ ] **Step 3: Verificar sintaxe**

Run: mesmo comando de extração + `node --check` (Task 2, Step 4).
Expected: sem saída.

- [ ] **Step 4: Commit**

```bash
git add renderer/app.html
git commit -m "Adiciona renderizacao das abas do Jornada/HE"
```

---

## Task 8: Atualizar Meu Painel (operador) para ler do Jornada/HE

**Files:**
- Modify: `renderer/app.html` (dentro da função que renderiza `operadorHome`, linhas ~3969-3984)

**Interfaces:**
- Consumes: `latestJornadaPeriod()`, `findJornadaEmployeeRecord()`, `fmtSignedMin`, `fmtDurationMin` (Tasks 2 e 7).

- [ ] **Step 1: Substituir o bloco de exibição do saldo**

Localizar (linha ~3969-3975):
```js
  if(e&&e.hourBank){
    $('opHourBank').innerHTML=`<div class="metricline"><span>Saldo atual</span><strong style="color:${e.hourBank.sign<0?'var(--red)':'var(--selbetti-dark)'}">${fmtSaldoHM(e.hourBank)}</strong></div>
      <div class="metricline"><span>Atualizado em</span><strong>${e.hourBank.asOf?e.hourBank.asOf.split('-').reverse().join('/'):'—'}</strong></div>
      <p class="muted" style="font-size:12px;margin-top:8px">Saldo informado pela gestão através da planilha de banco de horas da equipe.</p>`;
  }else{
    $('opHourBank').innerHTML='<p class="muted">Seu banco de horas ainda não foi informado pela gestão.</p>';
  }
```
Trocar por:
```js
  const jhPeriod=latestJornadaPeriod();
  const jhRec=e?findJornadaEmployeeRecord(jhPeriod,e.id):null;
  if(jhRec){
    $('opHourBank').innerHTML=`<div class="metricline"><span>Saldo atual</span><strong style="color:${(jhRec.bhSaldoTotalMin||0)<0?'var(--red)':'var(--selbetti-dark)'}">${fmtSignedMin(jhRec.bhSaldoTotalMin)}</strong></div>
      <div class="metricline"><span>Horas extras do período</span><strong>${fmtDurationMin(jhRec.horasExtraMin)}</strong></div>
      <div class="metricline"><span>Período</span><strong>${jhPeriod.periodoIni.split('-').reverse().join('/')} a ${jhPeriod.periodoFim.split('-').reverse().join('/')}</strong></div>
      <p class="muted" style="font-size:12px;margin-top:8px">Saldo e HE informados pela gestão através do módulo Jornada/HE.</p>`;
  }else{
    $('opHourBank').innerHTML='<p class="muted">Seu banco de horas ainda não foi informado pela gestão.</p>';
  }
```

- [ ] **Step 2: Substituir o alerta de "desatualizado"**

Localizar (linha ~3978-3984):
```js
  const alerts=[{severity:'warn',text:'Feedz e PDI em dia?',detail:'Não esqueça de acessar o Feedz e manter seu Plano de Desenvolvimento Individual (PDI) atualizado.'}];
  if(e){
    if(!e.hourBank||!e.hourBank.asOf){
      alerts.push({severity:'warn',text:'Seu banco de horas ainda não foi informado.',detail:'A gestão atualiza esse saldo periodicamente pela planilha de banco de horas da equipe.'});
    }else{
      const ageDays=Math.floor((now-new Date(e.hourBank.asOf+'T12:00:00'))/86400000);
      if(ageDays>45)alerts.push({severity:'warn',text:'Seu banco de horas está desatualizado.',detail:`Último saldo informado há ${ageDays} dia(s) (${e.hourBank.asOf.split('-').reverse().join('/')}).`});
    }
```
Trocar por:
```js
  const alerts=[{severity:'warn',text:'Feedz e PDI em dia?',detail:'Não esqueça de acessar o Feedz e manter seu Plano de Desenvolvimento Individual (PDI) atualizado.'}];
  if(e){
    if(!jhRec){
      alerts.push({severity:'warn',text:'Seu banco de horas ainda não foi informado.',detail:'A gestão atualiza esse saldo periodicamente pelo módulo Jornada/HE.'});
    }else{
      const ageDays=Math.floor((now-new Date(jhPeriod.periodoFim+'T12:00:00'))/86400000);
      if(ageDays>45)alerts.push({severity:'warn',text:'Seu banco de horas está desatualizado.',detail:`Último período informado há ${ageDays} dia(s) (${jhPeriod.periodoFim.split('-').reverse().join('/')}).`});
    }
```

- [ ] **Step 3: Verificar sintaxe**

Run: mesmo comando de extração + `node --check`.
Expected: sem saída.

- [ ] **Step 4: Commit**

```bash
git add renderer/app.html
git commit -m "Atualiza Meu Painel para ler banco de horas/HE do Jornada/HE"
```

---

## Task 9: Atualizar resumo de pagamento estimado (perfil individual)

**Files:**
- Modify: `renderer/app.html` (função `computeTimesheetPayroll`, linhas ~3029-3057; texto explicativo em `renderProfileTimesheets`, linha ~4249)

**Interfaces:**
- Consumes: `jornadaPeriodId`, `jornadaPeriodByMonthId`, `findJornadaEmployeeRecord` (Task 2).
- Produces: `computeTimesheetPayroll(emp,ts)` mantém a MESMA forma de retorno de antes (`{sched,dailyMinutes,scheduledDays,divisorHoras,hourlyRate,saldoAtual,bancoMinutes,bancoValor,rubricas,extras65Minutes,extras65Valor,faltaMinutes,faltaValor,salarioBase,total}` + `jhPeriod,jhRec` novos) — **`renderProfileTimesheets` não precisa mudar a forma como lê `p.saldoAtual`/`p.bancoValor`/etc, só o texto explicativo.**

- [ ] **Step 1: Reescrever `computeTimesheetPayroll`**

Trocar a função inteira (linhas ~3029-3057):
```js
/* valor a receber estimado: salário base + banco de horas (saldo já fechado pelo sistema de ponto,
   ledger contínuo entre competências) + horas intra/interjornada sempre pagas a 65% de adicional −
   faltas não justificadas. Divisor de horas dinâmico = dias programados no período × jornada diária. */
function computeTimesheetPayroll(emp,ts){
  const sched=parseHorarioRaw(ts.horarioRaw)||{dailyMinutes:0};
  const dailyMinutes=sched.dailyMinutes||528;
  const daysSet=parseDiasSemana(sched.daysStr);
  const scheduledDays=countScheduledDaysInRange(pdfDateToIso(ts.periodoInicio||ts.periodStart),pdfDateToIso(ts.periodoFim||ts.periodEnd),daysSet);
  const divisorHoras=scheduledDays*(dailyMinutes/60);
  const hourlyRate=divisorHoras>0?(+emp.salary||0)/divisorHoras:0;

  const saldoAtual=pontoSaldoParse(ts.saldoAtual);
  const bancoMinutes=saldoAtual.minutes*saldoAtual.sign;
  const bancoValor=bancoMinutes/60*hourlyRate;

  const rubricas=(ts.rubricas||[]).map(r=>typeof r==='string'?pontoRubricaParse(r):r);
  const extras65=rubricas.filter(r=>/intrajornada|interjornada/i.test(r.description||''));
  const extras65Minutes=extras65.reduce((s,r)=>s+(r.minutes||0),0);
  const extras65Valor=extras65Minutes/60*hourlyRate*1.65;

  const faltaMinutes=(ts.rows||[]).reduce((s,r)=>s+sumPontoCell(r.falta),0);
  const faltaValor=faltaMinutes/60*hourlyRate;

  const salarioBase=+emp.salary||0;
  const total=salarioBase+bancoValor+extras65Valor-faltaValor;

  return {sched,dailyMinutes,scheduledDays,divisorHoras,hourlyRate,saldoAtual,bancoMinutes,bancoValor,
    rubricas,extras65Minutes,extras65Valor,faltaMinutes,faltaValor,salarioBase,total};
}
```
por:
```js
/* valor a receber estimado: salário base + banco de horas + horas intra/interjornada (65% de
   adicional) − faltas. Divisor de horas dinâmico = dias programados no período × jornada diária.
   Banco de horas / intra-interjornada / falta agora vêm do módulo Jornada/HE (db.jornadaPeriods,
   casado pelo mês da competência), não mais de ts.saldoAtual/ts.rubricas/ts.rows — ts (Cartão de
   Ponto) continua servindo pro horário e pra tabela diária. HE (horasExtraMin) NÃO entra aqui —
   só alimenta o banco de horas, só vira pagamento quando fechado pela regra dos 180 dias (Fase 2). */
function computeTimesheetPayroll(emp,ts){
  const sched=parseHorarioRaw(ts.horarioRaw)||{dailyMinutes:0};
  const dailyMinutes=sched.dailyMinutes||528;
  const daysSet=parseDiasSemana(sched.daysStr);
  const scheduledDays=countScheduledDaysInRange(pdfDateToIso(ts.periodoInicio||ts.periodStart),pdfDateToIso(ts.periodoFim||ts.periodEnd),daysSet);
  const divisorHoras=scheduledDays*(dailyMinutes/60);
  const hourlyRate=divisorHoras>0?(+emp.salary||0)/divisorHoras:0;

  const jhPeriod=jornadaPeriodByMonthId(jornadaPeriodId(pdfDateToIso(ts.periodoFim||ts.periodEnd)));
  const jhRec=findJornadaEmployeeRecord(jhPeriod,emp.id);

  const bancoSignedMin=jhRec&&jhRec.bhSaldoPeriodoMin!=null?jhRec.bhSaldoPeriodoMin:0;
  const saldoAtual={minutes:Math.abs(bancoSignedMin),sign:bancoSignedMin<0?-1:1};
  const bancoMinutes=bancoSignedMin;
  const bancoValor=bancoMinutes/60*hourlyRate;

  const extras65Minutes=jhRec?((jhRec.intrajornadaMin||0)+(jhRec.interjornadaMin||0)):0;
  const extras65Valor=extras65Minutes/60*hourlyRate*1.65;

  const faltaMinutes=jhRec&&jhRec.horasFaltaMin!=null?jhRec.horasFaltaMin:0;
  const faltaValor=faltaMinutes/60*hourlyRate;

  const rubricas=(ts.rubricas||[]).map(r=>typeof r==='string'?pontoRubricaParse(r):r);
  const salarioBase=+emp.salary||0;
  const total=salarioBase+bancoValor+extras65Valor-faltaValor;

  return {sched,dailyMinutes,scheduledDays,divisorHoras,hourlyRate,jhPeriod,jhRec,saldoAtual,bancoMinutes,bancoValor,
    rubricas,extras65Minutes,extras65Valor,faltaMinutes,faltaValor,salarioBase,total};
}
```

- [ ] **Step 2: Atualizar o texto explicativo e avisar quando não há dado do Jornada/HE**

Em `renderProfileTimesheets` (linha ~4249), trocar:
```js
    <p class="muted" style="font-size:11px;margin-top:-4px">Estimativa com base no saldo já fechado pelo sistema de ponto nesta competência (ledger contínuo entre importações). Divisor: ${p.scheduledDays} dia(s) programado(s) × ${(p.dailyMinutes/60).toFixed(2).replace('.',',')}h/dia = ${p.divisorHoras.toFixed(2).replace('.',',')}h. Valor da hora: ${fmtBRL(p.hourlyRate)}. O banco de horas é apenas o saldo corrente apurado pelo ponto (crédito ou débito acumulado, só vira pagamento/desconto efetivo quando fechado pela regra dos 180 dias). Já as horas intra/interjornada são sempre pagas com adicional de 65% (1,65×) no próprio período. Faltas são descontadas à parte.</p>
```
por:
```js
    <p class="muted" style="font-size:11px;margin-top:-4px">Estimativa com base nos dados do módulo Jornada/HE para esta competência${p.jhRec?'':' — nenhum dado do Jornada/HE encontrado pra esse mês ainda; valores de banco de horas/intra-interjornada/falta abaixo estão zerados'}. Divisor: ${p.scheduledDays} dia(s) programado(s) × ${(p.dailyMinutes/60).toFixed(2).replace('.',',')}h/dia = ${p.divisorHoras.toFixed(2).replace('.',',')}h. Valor da hora: ${fmtBRL(p.hourlyRate)}. O banco de horas é o movimento do período (crédito ou débito), só vira pagamento/desconto efetivo quando fechado pela regra dos 180 dias. Horas extras (HE) não entram aqui pelo mesmo motivo. Já as horas intra/interjornada são sempre pagas com adicional de 65% (1,65×) no próprio período. Faltas são descontadas à parte.</p>
```

- [ ] **Step 3: Verificar sintaxe**

Run: mesmo comando de extração + `node --check`.
Expected: sem saída.

- [ ] **Step 4: Commit**

```bash
git add renderer/app.html
git commit -m "Atualiza resumo de pagamento estimado para ler do Jornada/HE"
```

---

## Task 10: Remover o painel antigo "Banco de horas da equipe"

**Files:**
- Modify: `renderer/app.html` (HTML da Visão Geral, linhas ~789-793; JS de `renderHome`, linhas ~3319-3325)

**Interfaces:**
- Nenhuma nova — só remoção. `importHourBank`/`parseHourBankCell`/`findHeaderRow`/`parsePtBrReportDate`/`readFirstSheet`/`findCol` continuam existindo (reaproveitados pelos importadores novos) — só o painel e a chamada que grava em `emp.hourBank` saem.

- [ ] **Step 1: Remover o painel HTML**

Linhas ~789-793, remover:
```html
      <div class="panel"><div class="toolbar"><h2 style="margin:0">🕒 Banco de horas da equipe</h2>
        <label class="btn primary file" style="font-size:12px">⬆ Importar planilha de banco de horas<input type="file" accept=".xlsx" onchange="importHourBank(this.files[0]);this.value=''"></label></div>
        <p class="muted" style="margin:0 0 8px;font-size:12px">Saldo atual (crédito ou débito) por colaborador, atualizado pela planilha de banco de horas enviada pela gestão.</p>
        <div id="teamHourBank"></div>
      </div>
```

- [ ] **Step 2: Remover o bloco de renderização em `renderHome`**

Linhas ~3319-3325, remover:
```js
  const bankList=db.employees.filter(x=>x.status!=='Inativo'&&x.hourBank).sort((a,b)=>Math.abs(b.hourBank.minutes)-Math.abs(a.hourBank.minutes));
  const bankTotalMin=bankList.reduce((s,x)=>s+x.hourBank.minutes*x.hourBank.sign,0);
  $('teamHourBank').innerHTML=bankList.length?`
    <div class="metricline"><span><b>Saldo líquido da equipe</b></span><strong style="color:${bankTotalMin<0?'var(--red)':'var(--selbetti-dark)'}">${fmtSaldoHM({minutes:Math.abs(bankTotalMin),sign:bankTotalMin<0?-1:1})}</strong></div>
    <div class="tablewrap" style="margin-top:8px"><table><thead><tr><th>Colaborador</th><th>Cargo</th><th>Saldo</th><th>Apurado em</th></tr></thead><tbody>
      ${bankList.map(x=>`<tr><td>${escHtml(x.name)}</td><td>${escHtml(x.role||'—')}</td><td style="color:${x.hourBank.sign<0?'var(--red)':'var(--selbetti-dark)'};font-weight:700">${fmtSaldoHM(x.hourBank)}</td><td>${x.hourBank.asOf?x.hourBank.asOf.split('-').reverse().join('/'):'—'}</td></tr>`).join('')}
    </tbody></table></div>`:'<p class="muted">Nenhum saldo de banco de horas apurado ainda. Importe as folhas de ponto no perfil de cada colaborador.</p>';

```
(mantendo em branco só uma linha entre o bloco anterior e o próximo `const alerts=[...vacationDeadlineAlerts()...`).

- [ ] **Step 3: Conferir que não sobrou nenhuma referência solta a `hourBank`/`teamHourBank`/`importHourBank`**

Run:
```bash
grep -n "hourBank\|teamHourBank" renderer/app.html
```
Expected: **zero ocorrências**. Se aparecer alguma (ex. numa exportação de roster/CSV que não foi coberta por este plano), ajustar naquele ponto antes de prosseguir — remover a referência ou trocar pela leitura equivalente do Jornada/HE, seguindo o mesmo padrão da Task 8.

- [ ] **Step 4: Verificar sintaxe e balanceamento**

Run: os dois comandos da Task 6, Step 6 (script `node --check` + contagem de `div`/`section`).
Expected: sem saída no `node --check`; pares de `div`/`section` iguais.

- [ ] **Step 5: Commit**

```bash
git add renderer/app.html
git commit -m "Remove painel antigo de banco de horas da equipe (substituido pelo Jornada/HE)"
```

---

## Task 11: QA manual completo + build

**Files:** nenhum (só verificação)

- [ ] **Step 1: Rodar o app localmente**

```bash
unset ELECTRON_RUN_AS_NODE   # ou Remove-Item Env:\ELECTRON_RUN_AS_NODE no PowerShell
npm start
```
Expected: app abre sem erro no console (DevTools).

- [ ] **Step 2: Testar o importador da planilha de saldo**

No menu Jornada/HE → Visão Geral → "Importar planilha de saldo" → selecionar `F:\Projetos DEV\Modulo RH\Planilha_Saldo_Horas.xlsx`.
Expected: alerta de sucesso com contagem de atualizados/não encontrados. Se algum colaborador da planilha (ex. "QUELISSON QUINTO DINIZ") já existir em Colaboradores com nome ou matrícula compatível, ele deve aparecer atualizado; senão, aparece em "não encontrado(s)" — comportamento correto.

- [ ] **Step 3: Testar o importador da Listagem de HE**

"Importar Listagem de HE (PDF)" → selecionar `F:\Projetos DEV\Modulo RH\Listagem_de_HE_FA_AT_e_AB_Portal_MEU_RH.pdf`.
Expected: alerta de sucesso, período "26/07/2026 a 25/08/2026". Aba "Banco de Horas" e "HE do período" devem mostrar os colaboradores casados.

- [ ] **Step 4: Reimportar o mesmo período duas vezes**

Importar a Listagem de HE de novo (mesmo arquivo).
Expected: `db.jornadaPeriods` continua com **1** período pro mês `2026-08` (não duplica) — conferir na aba Histórico, que deve ter só 1 linha pra esse período.

- [ ] **Step 5: Importar só um arquivo por vez**

Com um `db` limpo de teste (ou observando um colaborador que só apareça num dos dois arquivos), confirmar que os campos do arquivo não importado ficam `—`/vazios na tela, sem erro no console.

- [ ] **Step 6: Conferir Meu Painel**

Logar como operador de um colaborador que tenha dado no Jornada/HE (matrícula casada). Verificar que "Meu banco de horas" mostra o saldo e a HE do período mais recente.

- [ ] **Step 7: Conferir resumo de pagamento no perfil individual**

Como gestor, abrir o perfil de um colaborador com folha de ponto (Cartão de Ponto) importada E dado do Jornada/HE pro mesmo mês. Conferir que o "Resumo de pagamento (estimado)" mostra banco de horas/intra-interjornada vindos do Jornada/HE (não mais de `ts.saldoAtual`).

- [ ] **Step 8: Confirmar que o painel antigo sumiu**

Na Visão Geral, confirmar que "Banco de horas da equipe" não aparece mais.

- [ ] **Step 9: Build completo**

```bash
npx electron-builder --win
```
Expected: build termina com exit code 0, gera `dist\GO-Enterprise-Setup-<versão>.exe`.

- [ ] **Step 10: Commit final (se algum ajuste tiver sido feito durante o QA)**

```bash
git add -A
git commit -m "Ajustes de QA do modulo Jornada/HE"
```
(pular este commit se nenhum ajuste foi necessário)

---

## Self-review desta plan (já aplicado)

- **Cobertura da spec:** modelo de dados (Task 2), importador da planilha (Task 3), importador do PDF (Tasks 4-5), UI com as 4 abas (Tasks 6-7), Meu Painel (Task 8), resumo de pagamento (Task 9), remoção do painel antigo (Task 10), testes (Task 11) — todas as seções da spec têm task correspondente.
- **Sem placeholders:** todo código é real, extraído/adaptado do próprio `app.html` ou validado contra os arquivos reais em `Modulo RH`.
- **Consistência de tipos:** `computeTimesheetPayroll` mantém a mesma forma de retorno (`saldoAtual={minutes,sign}`) que `renderProfileTimesheets` já espera — nenhuma mudança de interface no consumidor. `upsertJornadaEmployeeRecord` tem a mesma assinatura em todas as 3 chamadas (Tasks 3, 5, e nenhuma outra).
