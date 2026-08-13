# Modelo de dados

Não existe banco relacional nem schema formal — tudo vive num único objeto JavaScript `db` (variável
global no `renderer/app.html`, seção **3. MODELO DE DADOS**), serializado como JSON e gravado no
arquivo compartilhado (ver [SINCRONIZACAO_E_PERSISTENCIA.md](SINCRONIZACAO_E_PERSISTENCIA.md)).

`normalizeDb(x)` (app.html) é a função que toda leitura passa — garante que campos ausentes num
arquivo antigo virem `[]`/`{}` em vez de `undefined`, e é o lugar certo pra adicionar um campo novo
com valor padrão quando o formato dos dados mudar.

## Estrutura raiz

```js
db = {
  production: [],      // vestigial — nunca é escrito, sempre vazio (ver nota abaixo)
  sla: {},              // objeto-mapa { "<numero da OS>": registro } — as Ordens de Serviço importadas
  finance: [],           // registros financeiros (lembretes de cobrança/vencimento)
  expenses: [],            // gastos por fornecedor — isto SIM entra no cálculo de "Gastos"
  losses: [],                // perda de papel, um registro por competência (mês)
  employees: [],               // colaboradores
  absences: [],                  // faltas
  vacations: [],                   // férias
  suppliers: [],                     // fornecedores
  imports: [],                         // log das últimas importações de planilha (histórico, até 30)
  history: [],                           // snapshots automáticos dos dados cadastrais (até 8)
  activities: [],                          // atividades registradas no perfil do colaborador
  timesheets: [],                            // folhas de ponto importadas (PDF)
  manuals: [...seed...],                       // manuais de equipamento (pré-cadastrados + editáveis)
  news: [],                                      // notícias exibidas na TV
  alerts: [],                                      // alertas customizados exibidos na TV
  dailyMessages: [],                                 // pool de mensagens do rodapé da TV
  config: { ...parâmetros operacionais... }
}
```

> **`db.production` é vestigial.** Ninguém escreve nele (`grep` confirma zero `db.production.push`).
> A "produção diária" de verdade é **derivada em tempo real** a partir de `db.sla` pela função
> `dailyProduction()`, que agrupa os registros importados por `deliveryDate`. Se um dia for mexer em
> "produção", é ali que a lógica está — não espere achar dados em `db.production`.

## `db.sla` — Ordens de Serviço (produção)

Mapa `{ [numeroDaOS]: registro }`, alimentado por **Produção → Importar planilha de produção/SLA**
(`importSLA()`, chave única = Número da OS; reimportar atualiza em vez de duplicar):

| Campo | Origem/formato |
|---|---|
| `os` | Número da OS (chave) |
| `status` | Texto livre vindo da planilha (ex.: "FINALIZADA") |
| `received` / `delivered` | Data+hora formatada `DD/MM/AAAA HH:MM` |
| `deliveryDate` | Data de entrega em `AAAA-MM-DD` — é o campo usado para agrupar por dia/mês em todo o sistema |
| `sla` | Texto ("DENTRO DO PRAZO" / "FORA DO PRAZO", casado por regex `/DENTRO/i`, `/FORA/i`) |
| `objects` / `prints` | Quantidades numéricas |
| `document` / `serrilha` | Metadados da OS |

`dailyProduction()` deriva `[{date, prints, objects, count}]` somando por `deliveryDate`. Praticamente
toda tela de produção/financeiro/dashboard parte daqui.

## `db.finance` — Registros financeiros

Cadastrados em **Financeiro → + Registro financeiro** (`addFinance()`). **Servem só de lembrete de
cobrança/vencimento** — desde a correção de agosto/2026, **não entram** no total de "Gastos" (ver
[HISTORICO_E_DECISOES.md](HISTORICO_E_DECISOES.md)).

| Campo | Notas |
|---|---|
| `id`, `createdAt` | |
| `type` | "Medição" / "Pedido" / "Nota Fiscal" / "Fluxo" |
| `supplierId`, `supplier` | Referência a `db.suppliers` (nome copiado no momento do cadastro) |
| `ref` | Competência `AAAA-MM` |
| `value` | Numérico (ver `numVal()` — aceita vírgula) |
| `status` | "Aguardando envio" / "Enviado para Contabilidade" / "Pago" / "Cancelado" |
| `dueDate` | Usado por `financeDueAlerts()` para os avisos de vencimento |
| `document`, `order`, `flow`, `responsible`, `note` | Campos livres |

## `db.expenses` — Gastos por fornecedor

Cadastrados em **Financeiro → + Lançar gasto** (`addExpense()`). **Isto é o que soma em "Gastos"** em
`financeTotals()`.

| Campo | Notas |
|---|---|
| `id`, `createdAt` | |
| `supplierId`, `supplier` | |
| `ref` | Competência `AAAA-MM` |
| `date` | Data do gasto |
| `category` | Texto livre (padrão "Geral") |
| `value` | Numérico |
| `document`, `note` | |

## `db.losses` — Perda de papel

**Um registro por competência** (mês), diferente de `finance`/`expenses` que são um-registro-por-
lançamento. `normalizeLosses()` migra automaticamente um formato antigo (um registro por pesagem) para
este:

```js
{ id, ref: 'AAAA-MM', unit: 4.7 /* peso unitário da folha, g */,
  weighings: [{ id, date, weight }],  // uma pesagem por evento
  resmasPagas: 0 }
```

`lossMetrics(rec)` calcula, sempre a partir dessas duas listas: peso final (soma das pesagens) → qtd.
folhas (peso ÷ peso unitário) → qtd. resmas (folhas ÷ 500) → défice (resmas medidas − resmas pagas) →
valor de perdas (folhas × valor por impressão).

## `db.employees` — Colaboradores

O registro mais "vivo" do sistema — vários módulos escrevem campos adicionais nele ao longo do tempo.

| Campo | Origem |
|---|---|
| `id`, `reg` (matrícula), `name`, `role`, `costCenter`, `shift`, `admission`, `birthDate`, `salary`, `status` (Ativo/Inativo), `photo` (data URL) | Cadastro manual (RH → + Colaborador) ou importação de planilha (`importEmployeesRoster`, casa por matrícula e depois por nome) |
| `schedule`, `sector`, `timesheetPeriod` | Preenchidos automaticamente ao importar a folha de ponto em PDF (`importTimesheet`, perfil do colaborador — uso do gestor) |
| `hourBank` | `{ minutes, sign, asOf }` — saldo do banco de horas. **Única fonte desde ago/2026: a planilha "Banco de horas da equipe"** (`importHourBank`, Visão Geral). Não é mais alterado pela folha de ponto PDF. Ver [HISTORICO_E_DECISOES.md](HISTORICO_E_DECISOES.md). |

`salary` só é visível para o papel `gestor` na UI (campo marcado `.gestor-only`), mas **fica no JSON
como qualquer outro campo** — não há criptografia por campo, só a criptografia opcional do arquivo
inteiro (ver [SEGURANCA_E_ACESSO.md](SEGURANCA_E_ACESSO.md)).

## `db.absences` — Faltas

```js
{ id, employeeId, reg, name, role, shift, date, type: 'Justificada'|'Injustificada'|'Atestado', note,
  source? }  // source:'ponto' quando criada automaticamente por syncAbsencesFromTimesheet()
```

## `db.vacations` — Férias

```js
{ id, employeeId, reg, name, role, shift, start, end, days, aqStart, aqEnd /* período aquisitivo */,
  note, createdAt, cancelled? }
```
`normalizeVacation()` tenta extrair `aqStart`/`aqEnd` de dentro do texto de `note` em registros antigos
que não tinham esses campos (regex por duas datas `DD/MM/AAAA`).

## `db.suppliers` — Fornecedores

```js
{ id, name, type: 'Fixo'|'Avulso', contract, status: 'Ativo'|'Inativo' }
```

## `db.timesheets` — Folhas de ponto importadas (PDF)

Um registro por competência por colaborador, criado por `importTimesheet()` (seção 7B — parser de PDF
sem lib externa). Guarda tudo que foi extraído do PDF, inclusive as linhas diárias, para permitir a
estimativa de pagamento (`computeTimesheetPayroll`) e a sincronização de faltas
(`syncAbsencesFromTimesheet`):

```js
{ id, employeeId, periodStart, periodEnd /* AAAA-MM-DD */, periodoInicio, periodoFim /* DD/MM/AAAA, como no PDF */,
  empregador, cnpj, endereco, funcao, carteira, localizacao, matricula, nome, horarioRaw,
  saldoAnterior, saldoPeriodo, saldoAtual /* texto cru do PDF, ex.: "02:30 (A PAGAR)" */,
  rubricas: [{code, description, minutes}], rows: [...linhas diárias...],
  importedAt, sourceFile }
```

> Desde a mudança do banco de horas para planilha, este registro **não** alimenta mais
> `employee.hourBank` — só serve para turno/horário/localização automáticos, sincronia de faltas e a
> estimativa de "valor a receber" no perfil do colaborador.

## `db.activities` — Atividades no perfil do colaborador

```js
{ id, employeeId, date, shift, title, note, createdAt }
```

## `db.manuals` — Manuais de equipamento

```js
{ id, name, category, coverImage, summary,
  steps: [{ id, title, text, images: [dataURL, ...] }],
  updatedAt }
```
Vem pré-populado por `seedManuals()` (equipamentos reais da operação, com fotos extraídas de manuais
oficiais onde disponível) e é 100% editável pela tela **Manuais**.

## `db.news` / `db.alerts` / `db.dailyMessages` — Conteúdo da TV

```js
// news
{ id, title, text, image?, updatedAt }

// alerts
{ id, title, text, image?, severity: 'warn'|'bad', createdAt }

// dailyMessages
{ id, text }  // um item por dia é escolhido por todaysMessage() — rotação determinística por dia do ano
```

## `db.imports` / `db.history` — Metadados operacionais

- `imports`: log das últimas 30 importações de planilha (`{at, file, total, added, updated, same, errors}`)
  — toda função `importX()` empurra um registro aqui.
- `history`: até 8 snapshots automáticos de `lightSnapshot()` (tudo exceto `sla`/`imports`/`history`,
  por serem grandes e facilmente reimportáveis), criados a cada `save()` via `pushHistorySnapshot()`.
  Restauráveis em Administração → Histórico de versões.

## `db.config` — Parâmetros operacionais

```js
config: {
  printValue: 0.053,        // R$ por impressão — usado no faturamento, perda de papel, etc.
  paperWeight: 4.7,          // peso unitário da folha (g) — padrão da perda de papel
  slaGoal: 95,                 // meta de SLA (%)
  payrollTax: 70,                // encargos da folha (%)
  dailyPrintGoal: 580000,          // meta diária de impressões
  dailyObjectGoal: 260000,           // meta diária de objetos
  security: {
    enabled, pinHash, salt, iterations,   // PIN do gestor
    encryptionEnabled,                     // criptografia opcional do arquivo inteiro
    hint,
    tvEnabled, tvPinHash, tvSalt, tvHint    // PIN separado para o papel "tv"
  }
}
```
Editável em **Administração → Configurações operacionais** (`saveConfig()`) e **Segurança**. Todos os
campos numéricos desta tela usam `numVal()` (aceitam vírgula — ver
[HISTORICO_E_DECISOES.md](HISTORICO_E_DECISOES.md)).
