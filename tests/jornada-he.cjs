const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../renderer/app.html'), 'utf8');
function section(start, end) {
  const from = html.indexOf(start);
  assert(from >= 0 && html.indexOf(end, from) > from, 'Seção de código não encontrada');
  return html.slice(from, html.indexOf(end, from));
}
function setup() {
  const elements = {};
  const context = vm.createContext({
    db: { jornadaPeriods: [], employees: [{ id: 'a' }], timesheets: [{ id: 'ponto' }] },
    currentRole: 'gestor', confirm: () => true, save: async () => {},
    closeJhEmployeeDrawer: () => {}, jhPeriodLabel: id => id,
    escHtml: value => String(value ?? ''), fmtSignedMin: value => String(value),
    $: id => elements[id] ||= { hidden: true, innerHTML: '', textContent: '' }
  });
  vm.runInContext([
    section('function jornadaPeriodId(', '/* ===================== JORNADA/HE — Fase 2'),
    section('function pontoTimeToMinutes(', 'function pontoSaldoParse('),
    section('function pontoRubricaParse(', 'function parseDiasSemana('),
    section('function pdfDateToIso(', '/* absenteísmo'),
    section('function jhOverviewEmployees(', 'function jhOfensores('),
    section('function jhEvolucaoGeometry(', 'function jhRenderEvolucao('),
    section('const JH_EDIT_FIELDS=', '// série do saldo total'),
    section('function isValidJhIsoDate(', 'async function importTimesheet(')
  ].join('\n'), context);
  return { context, elements };
}
const employee = { id: 'a', reg: '001', name: 'Ana' };
function sheet(overrides = {}) {
  return {
    periodStart: '2026-09-21', periodEnd: '2026-10-20',
    saldoAnterior: '02:00 (A DESCONTAR)', saldoPeriodo: '03:30 (A PAGAR)', saldoAtual: '01:30 (A PAGAR)',
    rows: [
      { trab: '08:00', aut: '01:00', exec: '02:00', atraso: '', falta: '00:30', adNot: '00:10' },
      { trab: '08:30', aut: '00:30', exec: '01:00', atraso: '00:15', falta: '', adNot: '' }
    ], ...overrides
  };
}
test('sintaxe de todos os scripts inline', () => {
  for (const [, code] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(code);
});
test('visão geral inclui ativos sem importação e exclui inativos e registros órfãos', () => {
  const { context: c } = setup();
  c.db.employees = [
    { id: 'a', name: 'Ana', status: 'Ativo' },
    { id: 'b', name: 'Bruno', status: 'Ativo' },
    { id: 'c', name: 'Carla', status: 'Inativo' },
    { id: 'd', name: 'Diego' }
  ];
  const period = { employees: [
    { employeeId: 'a', nome: 'Nome antigo', horasExtraMin: 90 },
    { employeeId: 'c', horasExtraMin: 200 },
    { employeeId: 'deleted', horasExtraMin: 300 }
  ] };
  const result = c.jhOverviewEmployees(period);
  assert.deepEqual(Array.from(result, e => e.employeeId), ['a', 'b', 'd']);
  assert.equal(result[0].nome, 'Ana');
  assert.equal(result[0].horasExtraMin, 90);
  assert.equal(result[1].hasPeriodData, false);
  assert.equal(result[1].bhSaldoTotalMin, null);
  assert.equal(period.employees.length, 3);
});
test('ativos aparecem antes da primeira importação sem criar dados fictícios', () => {
  const { context: c } = setup();
  const before = JSON.stringify(c.db);
  const result = c.jhOverviewEmployees(null);
  assert.equal(result.length, 1);
  assert.equal(result[0].hasPeriodData, false);
  assert.equal(result[0].horasExtraMin, null);
  assert.equal(JSON.stringify(c.db), before);
});
test('gráfico suporta saldo negativo, série constante, zero e um único período', () => {
  const { context: c } = setup();
  for (const values of [[-600, 0, 1200], [30, 30], [0, 0], [0], [-120]]) {
    const g = c.jhEvolucaoGeometry(values);
    assert.equal(g.points.length, values.length);
    for (const p of g.points) {
      assert(Number.isFinite(p.x) && Number.isFinite(p.y));
      assert(p.y >= g.top && p.y <= g.bottom);
      assert(p.x >= g.left && p.x <= g.right);
    }
  }
  const g = c.jhEvolucaoGeometry([-600, 600]);
  assert(g.points[0].y > g.y(0) && g.points[1].y < g.y(0));
});
test('ponto cria competência com saldos assinados e HE autorizadas, sem somar executadas', () => {
  const { context: c } = setup();
  c.syncJornadaFromTimesheet(employee, sheet());
  const p = c.db.jornadaPeriods[0], r = p.employees[0];
  assert.equal(p.id, '2026-10');
  assert.equal(r.bhSaldoAnteriorMin, -120);
  assert.equal(r.bhSaldoPeriodoMin, 210);
  assert.equal(r.bhSaldoTotalMin, 90);
  assert.equal(r.horasTrabMin, 990);
  assert.equal(r.horasExtraMin, 90);
  assert.equal(r.horasFaltaMin, 30);
  assert.equal(r.horasAtrasoMin, 15);
  assert.equal(r.horasAdNoturnoMin, 10);
});
test('reimportação atualiza sem duplicar e mantém campos ausentes, colegas e histórico', () => {
  const { context: c } = setup();
  c.syncJornadaFromTimesheet(employee, sheet());
  const r = c.db.jornadaPeriods[0].employees[0];
  r.intrajornadaMin = 45;
  r.pendingSignatureDocs = [{ id: 'doc' }];
  c.syncJornadaFromTimesheet({ ...employee, id: 'b' }, sheet());
  c.syncJornadaFromTimesheet(employee, sheet({ periodStart: '2026-08-21', periodEnd: '2026-09-20' }));
  c.syncJornadaFromTimesheet(employee, sheet({ saldoAtual: '-04:00', rows: [{ aut: '' }] }));
  assert.equal(c.db.jornadaPeriods.length, 2);
  assert.equal(c.db.jornadaPeriods[0].employees.length, 2);
  assert.equal(r.bhSaldoTotalMin, -240);
  assert.equal(r.horasExtraMin, 0);
  assert.equal(r.horasTrabMin, 990);
  assert.equal(r.intrajornadaMin, 45);
  assert.equal(r.pendingSignatureDocs[0].id, 'doc');
  assert.equal(c.db.jornadaPeriods[1].employees[0].bhSaldoTotalMin, 90);
});
test('valores ausentes ou ilegíveis não zeram dados existentes', () => {
  const { context: c } = setup();
  c.syncJornadaFromTimesheet(employee, sheet());
  c.syncJornadaFromTimesheet(employee, sheet({ saldoAtual: 'ilegível', rows: [{ aut: 'inválido' }] }));
  assert.equal(c.db.jornadaPeriods[0].employees[0].bhSaldoTotalMin, 90);
  assert.equal(c.db.jornadaPeriods[0].employees[0].horasExtraMin, 90);
});
test('rubricas explícitas atualizam abonos e intra/interjornada', () => {
  const { context: c } = setup();
  c.syncJornadaFromTimesheet(employee, sheet({ rubricas: [
    { description: 'Horas intrajornada', minutes: 10 },
    { description: 'Horas interjornada', minutes: 20 },
    { description: 'Abono', minutes: 30 }
  ] }));
  const r = c.db.jornadaPeriods[0].employees[0];
  assert.equal(r.intrajornadaMin, 10);
  assert.equal(r.interjornadaMin, 20);
  assert.equal(r.horasAbonoMin, 30);
});
test('período inválido é recusado antes de alterar a base', () => {
  const { context: c } = setup();
  for (const periodEnd of ['2026-02-30', '2026-01-01', '', 'inválido']) {
    assert.throws(() => c.syncJornadaFromTimesheet(employee, sheet({ periodEnd })));
  }
  assert.equal(c.db.jornadaPeriods.length, 0);
});
test('edição valida minutos, sinal e campos vazios', () => {
  const { context: c } = setup();
  assert.equal(c.parseJhEditMinutes('-12:45', true), -765);
  assert.equal(c.parseJhEditMinutes('150:00', false), 9000);
  assert.equal(c.parseJhEditMinutes('', true), null);
  for (const value of ['01:60', 'abc', '1.5', '-01:00']) {
    assert.throws(() => c.parseJhEditMinutes(value, false));
  }
});
test('formulário aplica edição validada e mantém pendências', async () => {
  const { context: c, elements } = setup();
  c.syncJornadaFromTimesheet(employee, sheet());
  const record = c.db.jornadaPeriods[0].employees[0];
  record.pendingSignatureDocs = [{ id: 'doc' }];
  c.editJhEmployee('2026-10', 'a');
  const values = { horario: '08:00 às 17:00', bhSaldoTotalMin: '-02:30', horasExtraMin: '03:00' };
  await elements.jhEditForm.onsubmit({
    preventDefault() {},
    currentTarget: { elements: { namedItem: name => ({ value: values[name] || '' }) } }
  });
  assert.equal(record.bhSaldoTotalMin, -150);
  assert.equal(record.horasExtraMin, 180);
  assert.equal(record.horario, values.horario);
  assert.equal(record.pendingSignatureDocs[0].id, 'doc');
});
test('exclusão respeita cancelamento, papel e escopo do período', async () => {
  const { context: c } = setup();
  c.syncJornadaFromTimesheet(employee, sheet());
  c.syncJornadaFromTimesheet(employee, sheet({ periodStart: '2026-08-21', periodEnd: '2026-09-20' }));
  c.confirm = () => false;
  await c.deleteJhEmployee('2026-10', 'a');
  assert.equal(c.db.jornadaPeriods[0].employees.length, 1);
  c.confirm = () => true;
  c.currentRole = 'operador';
  await c.deleteJhEmployee('2026-10', 'a');
  assert.equal(c.db.jornadaPeriods[0].employees.length, 1);
  c.currentRole = 'gestor';
  await c.deleteJhEmployee('2026-10', 'a');
  assert.equal(c.db.jornadaPeriods[0].employees.length, 0);
  assert.equal(c.db.jornadaPeriods[1].employees.length, 1);
  assert.equal(c.db.employees.length, 1);
  assert.equal(c.db.timesheets.length, 1);
});
