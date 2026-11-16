'use strict';

const SLA_FIELDS = ['os', 'status', 'received', 'delivered', 'deliveryDate', 'sla', 'objects', 'prints', 'document', 'serrilha'];
const EMPLOYEE_PUBLIC_FIELDS = ['id', 'name', 'status', 'birthDay', 'birthMonth', 'birthDate'];
const EMPLOYEE_SELF_FIELDS = ['id', 'name', 'reg', 'status', 'role', 'shift', 'costCenter', 'admission', 'schedule', 'sector', 'photo'];

function pick(value, fields) {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(fields.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
}

function projectSla(sla) {
  return Object.fromEntries(Object.entries(sla && typeof sla === 'object' ? sla : {})
    .map(([key, row]) => [key, pick(row, SLA_FIELDS)]));
}

function projectConfig(config) {
  return {
    slaGoal: Number(config && config.slaGoal) || 90,
    dailyPrintGoal: Number(config && config.dailyPrintGoal) || 750000,
    dailyObjectGoal: Number(config && config.dailyObjectGoal) || 375000,
    paperWeight: Number(config && config.paperWeight) || 4.7,
    printValue: 0,
    security: { enabled: !!(config && config.security && config.security.enabled) }
  };
}

function projectTvData(data) {
  const source = data && typeof data === 'object' ? data : {};
  return {
    production: Array.isArray(source.production) ? source.production.map(row => pick(row, ['date', 'prints', 'objects'])) : [],
    sla: projectSla(source.sla),
    losses: Array.isArray(source.losses) ? source.losses.map(row => ({
      ref: row.ref, unit: row.unit, resmasPagas: row.resmasPagas,
      weighings: Array.isArray(row.weighings) ? row.weighings.map(w => pick(w, ['weight'])) : []
    })) : [],
    employees: Array.isArray(source.employees) ? source.employees.map(row => pick(row, EMPLOYEE_PUBLIC_FIELDS)) : [],
    developmentOrders: Array.isArray(source.developmentOrders) ? source.developmentOrders.map(row => pick(row, ['year', 'openedAt', 'deadline', 'deliveredAt', 'cancelled', 'state', 'orderType', 'serviceType'])) : [],
    news: Array.isArray(source.news) ? source.news : [],
    alerts: Array.isArray(source.alerts) ? source.alerts : [],
    dailyMessages: Array.isArray(source.dailyMessages) ? source.dailyMessages : [],
    selbNews: Array.isArray(source.selbNews) ? source.selbNews : [],
    selbAlerts: Array.isArray(source.selbAlerts) ? source.selbAlerts : [],
    config: projectConfig(source.config)
  };
}

function projectOperatorData(data, employeeId) {
  const source = data && typeof data === 'object' ? data : {};
  const employee = (Array.isArray(source.employees) ? source.employees : []).find(row => row && row.id === employeeId);
  const belongsToEmployee = row => row && row.employeeId === employeeId;
  const projectPeriod = period => ({
    ...pick(period, ['id', 'periodoIni', 'periodoFim', 'importedAt', 'updatedAt']),
    employees: (Array.isArray(period.employees) ? period.employees : []).filter(belongsToEmployee)
  });
  return {
    production: Array.isArray(source.production) ? source.production.map(row => pick(row, ['date', 'prints', 'objects'])) : [],
    sla: projectSla(source.sla),
    employees: employee ? [pick(employee, EMPLOYEE_SELF_FIELDS)] : [],
    absences: (Array.isArray(source.absences) ? source.absences : []).filter(belongsToEmployee),
    vacations: (Array.isArray(source.vacations) ? source.vacations : []).filter(belongsToEmployee),
    activities: (Array.isArray(source.activities) ? source.activities : []).filter(belongsToEmployee),
    timesheets: (Array.isArray(source.timesheets) ? source.timesheets : []).filter(belongsToEmployee),
    jornadaPeriods: (Array.isArray(source.jornadaPeriods) ? source.jornadaPeriods : []).map(projectPeriod).filter(p => p.employees.length),
    jornada180Windows: (Array.isArray(source.jornada180Windows) ? source.jornada180Windows : []).map(projectPeriod).filter(p => p.employees.length),
    manuals: Array.isArray(source.manuals) ? source.manuals : [],
    news: Array.isArray(source.news) ? source.news : [],
    alerts: Array.isArray(source.alerts) ? source.alerts : [],
    dailyMessages: Array.isArray(source.dailyMessages) ? source.dailyMessages : [],
    selbNews: Array.isArray(source.selbNews) ? source.selbNews : [],
    selbAlerts: Array.isArray(source.selbAlerts) ? source.selbAlerts : [],
    config: projectConfig(source.config)
  };
}

function projectData(data, role, employeeId) {
  if (role === 'gestor') return data;
  if (role === 'operador') return projectOperatorData(data, employeeId);
  if (role === 'tv') return projectTvData(data);
  return null;
}

function sanitizeTvSla(sla) {
  const source = sla && typeof sla === 'object' && !Array.isArray(sla) ? sla : {};
  const output = {};
  for (const [key, row] of Object.entries(source).slice(0, 100000)) {
    if (!row || typeof row !== 'object') continue;
    const safe = pick(row, SLA_FIELDS);
    safe.os = String(safe.os || key).slice(0, 80);
    safe.status = String(safe.status || '').slice(0, 80);
    safe.sla = String(safe.sla || '').slice(0, 80);
    safe.received = String(safe.received || '').slice(0, 80);
    safe.delivered = String(safe.delivered || '').slice(0, 80);
    safe.deliveryDate = String(safe.deliveryDate || '').slice(0, 32);
    safe.document = String(safe.document || '').slice(0, 120);
    safe.serrilha = String(safe.serrilha || '').slice(0, 120);
    safe.objects = Number.isFinite(Number(safe.objects)) ? Number(safe.objects) : 0;
    safe.prints = Number.isFinite(Number(safe.prints)) ? Number(safe.prints) : 0;
    output[String(key).slice(0, 80)] = safe;
  }
  return output;
}

function sanitizeTvImport(entry) {
  if (!entry || typeof entry !== 'object') return null;
  return {
    at: String(entry.at || '').slice(0, 80), file: String(entry.file || '').slice(0, 160),
    total: Number(entry.total) || 0, added: Number(entry.added) || 0,
    updated: Number(entry.updated) || 0, same: Number(entry.same) || 0, errors: Number(entry.errors) || 0
  };
}

module.exports = { projectData, projectTvData, projectOperatorData, projectSla, sanitizeTvSla, sanitizeTvImport };
