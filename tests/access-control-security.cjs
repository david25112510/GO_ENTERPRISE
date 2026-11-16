const { test } = require('node:test');
const assert = require('node:assert/strict');
const access = require('../src/accessControl');

const fixture = {
  config: { slaGoal: 92, dailyPrintGoal: 700000, printValue: 0.5, payrollTax: 0.2, security: { pinHash: 'secret' } },
  finance: [{ id: 'f1', value: 1000 }],
  employees: [
    { id: 'e1', name: 'Ana', reg: '001', status: 'Ativo', salary: 9000, bankAccount: 'private', birthDay: 1 },
    { id: 'e2', name: 'Bia', reg: '002', status: 'Ativo', salary: 8000, birthDay: 2 }
  ],
  timesheets: [{ id: 't1', employeeId: 'e1', hours: 8 }, { id: 't2', employeeId: 'e2', hours: 8 }],
  jornadaPeriods: [{ id: '2026-11', employees: [{ employeeId: 'e1', bhSaldoTotalMin: 10 }, { employeeId: 'e2', bhSaldoTotalMin: 20 }] }],
  sla: { '1': { os: '1', status: 'FINALIZADA', prints: 200, revenue: 500 } }
};

test('operator projection contains only own HR records and no financial fields', () => {
  const result = access.projectOperatorData(fixture, 'e1');
  assert.deepEqual(result.employees.map(e => e.id), ['e1']);
  assert.equal('salary' in result.employees[0], false);
  assert.equal('bankAccount' in result.employees[0], false);
  assert.deepEqual(result.timesheets.map(t => t.id), ['t1']);
  assert.deepEqual(result.jornadaPeriods[0].employees.map(e => e.employeeId), ['e1']);
  assert.equal('finance' in result, false);
  assert.equal('payrollTax' in result.config, false);
  assert.equal(result.config.printValue, 0);
  assert.equal('revenue' in result.sla['1'], false);
});

test('TV projection omits salary and finance but keeps public operational data', () => {
  const result = access.projectTvData(fixture);
  assert.equal('finance' in result, false);
  assert.equal('salary' in result.employees[0], false);
  assert.deepEqual(result.employees.map(e => e.name), ['Ana', 'Bia']);
  assert.equal(result.sla['1'].prints, 200);
  assert.equal('revenue' in result.sla['1'], false);
  assert.equal(result.config.printValue, 0);
});

test('TV import writeback accepts only operational SLA fields', () => {
  const result = access.sanitizeTvSla({
    '1': { os: '1', status: 'FINALIZADA', prints: '200', salary: 9000, script: '<script>' }
  });
  assert.deepEqual(result['1'], {
    os: '1', status: 'FINALIZADA', received: '', delivered: '', deliveryDate: '', sla: '',
    objects: 0, prints: 200, document: '', serrilha: ''
  });
});
