'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const snmp = require('net-snmp');

const POLL_MS = 30_000;
const DEFAULT_STATUS_OID = '1.3.6.1.2.1.25.3.5.1.1.1';

class LiveOperations {
  constructor(userDataPath, getConfig, getTelemetryPath) {
    this.configPath = path.join(userDataPath, 'operacao-ao-vivo-config.json');
    this.getConfig = getConfig;
    this.getTelemetryPath = getTelemetryPath;
    this.timer = null;
    this.busy = false;
    this.collectorActive = false;
    this.collectorLockPath = null;
    this.collectorToken = `${os.hostname()}:${process.pid}:${Date.now()}`;
    this.config = this.readConfig();
    this.data = this.readTelemetry();
  }

  readJson(filePath, fallback) {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
    catch (_) { return fallback; }
  }

  readConfig() { return this.readJson(this.configPath, { printers: {} }); }
  readTelemetry() { return this.readJson(this.getTelemetryPath(), { printers: {}, samples: [], collectorHost: null, updatedAt: null }); }
  list() { return Object.values(this.config.printers || {}); }

  saveConfig() {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    const tmp = `${this.configPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.config), 'utf8');
    fs.renameSync(tmp, this.configPath);
  }

  saveTelemetry() {
    const filePath = this.getTelemetryPath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp-${os.hostname()}-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(this.data), 'utf8');
    fs.renameSync(tmp, filePath);
  }

  setPrinters(printers) {
    const previous = this.config.printers || {};
    const next = {};
    for (const p of (Array.isArray(printers) ? printers : [])) {
      const id = String(p.id || '').slice(0, 80);
      const name = String(p.name || '').trim().slice(0, 80);
      const host = String(p.host || '').trim().slice(0, 253);
      if (!id || !name || !host) continue;
      next[id] = {
        id, name, host,
        port: Math.max(1, Math.min(65535, Number(p.port) || 161)),
        community: String(p.community || previous[id]?.community || 'public').slice(0, 4096),
        statusOid: String(p.statusOid || DEFAULT_STATUS_OID).trim().slice(0, 128),
        counterOid: String(p.counterOid || '').trim().slice(0, 128),
        capacityPpm: Math.max(0, Number(p.capacityPpm) || 0),
        enabled: p.enabled !== false
      };
    }
    this.config.printers = next;
    this.saveConfig();
    if (this.collectorActive) {
      this.data = this.readTelemetry();
      for (const id of Object.keys(this.data.printers || {})) if (!next[id]) delete this.data.printers[id];
      this.saveTelemetry();
    }
    return this.snapshot();
  }

  start() {
    this.stop();
    if (!this.getConfig().enabled) return;
    this.pollAll().catch(e => console.warn('[Operação ao vivo] Coleta falhou:', e.message));
    this.timer = setInterval(() => this.pollAll().catch(e => console.warn('[Operação ao vivo] Coleta falhou:', e.message)), POLL_MS);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.collectorActive && this.collectorLockPath) {
      try {
        const lock = JSON.parse(fs.readFileSync(this.collectorLockPath, 'utf8'));
        if (lock.token === this.collectorToken) fs.unlinkSync(this.collectorLockPath);
      } catch (_) {}
    }
    this.collectorActive = false;
    this.collectorLockPath = null;
  }

  claimCollector() {
    const telemetryPath = this.getTelemetryPath();
    const lockPath = `${telemetryPath}.collector-lock`;
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, JSON.stringify({ token: this.collectorToken, host: os.hostname(), at: Date.now() }));
      fs.closeSync(fd);
      this.collectorLockPath = lockPath;
      this.collectorActive = true;
      return true;
    } catch (_) {
      try {
        const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        if (Date.now() - Number(lock.at || 0) > 90_000) {
          fs.unlinkSync(lockPath);
          return this.claimCollector();
        }
      } catch (_) {}
      return this.collectorActive;
    }
  }

  heartbeatCollector() {
    if (!this.collectorActive || !this.collectorLockPath) return;
    try {
      const lock = JSON.parse(fs.readFileSync(this.collectorLockPath, 'utf8'));
      if (lock.token !== this.collectorToken) { this.collectorActive = false; this.collectorLockPath = null; return; }
      const tmp = `${this.collectorLockPath}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, JSON.stringify({ ...lock, at: Date.now() }));
      fs.renameSync(tmp, this.collectorLockPath);
    } catch (_) { this.collectorActive = false; this.collectorLockPath = null; }
  }

  async pollAll() {
    if (this.busy || !this.getConfig().enabled) return;
    if (!this.collectorActive && !this.claimCollector()) return;
    this.busy = true;
    try {
      this.data = this.readTelemetry(); // incorpora a leitura mais recente gravada na pasta compartilhada
      this.data.printers = this.data.printers || {};
      const activePrinters = this.list().filter(p => p.enabled);
      const samples = await Promise.all(activePrinters.map(printer => this.pollPrinter(printer)));
      for (let index = 0; index < activePrinters.length; index++) {
        const printer = activePrinters[index];
        const sample = samples[index];
        const record = this.data.printers[printer.id] || { monthStats: {} };
        this.updateStats(record, sample);
        record.name = printer.name;
        record.host = printer.host;
        record.capacityPpm = printer.capacityPpm;
        record.statusOid = printer.statusOid;
        record.counterOid = printer.counterOid;
        record.last = sample;
        record.monthStats = record.monthStats || {};
        this.data.printers[printer.id] = record;
        this.data.samples.push(sample);
      }
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const buckets = new Map();
      for (const sample of this.data.samples) {
        const timestamp = Date.parse(sample.at);
        if (timestamp < cutoff) continue;
        const bucket = `${sample.printerId}:${Math.floor(timestamp / (30 * 60 * 1000))}`;
        if (!buckets.has(bucket) || timestamp > Date.parse(buckets.get(bucket).at)) buckets.set(bucket, sample);
      }
      this.data.samples = Array.from(buckets.values());
      this.data.collectorHost = os.hostname();
      this.data.updatedAt = new Date().toISOString();
      this.saveTelemetry();
      this.heartbeatCollector();
    } finally { this.busy = false; }
  }

  updateStats(record, sample) {
    const date = new Date(sample.at);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const stats = record.monthStats[month] || (record.monthStats[month] = { pages: 0, printingMinutes: 0, idleMinutes: 0, offlineMinutes: 0, unknownMinutes: 0 });
    const previous = record.last;
    if (!previous) return;
    const duration = Math.max(0, Math.min(POLL_MS * 1.5, Date.parse(sample.at) - Date.parse(previous.at))) / 60000;
    const key = ({ printing: 'printingMinutes', idle: 'idleMinutes', offline: 'offlineMinutes', unknown: 'unknownMinutes' })[previous.state];
    if (key) stats[key] += duration;
    if (previous.counter != null && sample.counter != null && sample.counter >= previous.counter) stats.pages += sample.counter - previous.counter;
  }

  pollPrinter(printer) {
    return new Promise(resolve => {
      let session;
      const sample = { printerId: printer.id, at: new Date().toISOString(), state: 'offline', counter: null };
      try {
        const community = this.getConfig().decryptCommunity(printer.community);
        session = snmp.createSession(printer.host, community, { port: printer.port, version: snmp.Version2c, timeout: 4000, retries: 0 });
        const oids = [printer.statusOid];
        if (printer.counterOid) oids.push(printer.counterOid);
        session.get(oids, (err, varbinds) => {
          try {
            if (!err && varbinds && varbinds.length) {
              sample.state = snmp.isVarbindError(varbinds[0]) ? 'unknown' : Number(varbinds[0].value) === 4 ? 'printing' : Number(varbinds[0].value) === 3 ? 'idle' : 'unknown';
              if (printer.counterOid && varbinds[1] && !snmp.isVarbindError(varbinds[1])) {
                const value = Number(varbinds[1].value);
                sample.counter = Number.isFinite(value) ? value : null;
              }
            }
          } finally { session.close(); resolve(sample); }
        });
      } catch (_) { if (session) session.close(); resolve(sample); }
    });
  }

  snapshot() {
    this.data = this.readTelemetry();
    const telemetryPrinters = this.data.printers || {};
    const ids = new Set([...Object.keys(telemetryPrinters), ...Object.keys(this.config.printers || {})]);
    const printers = Array.from(ids).map(id => {
      const cfg = this.config.printers[id] || {};
      const record = telemetryPrinters[id] || {};
      return { id, name: cfg.name || record.name || 'Impressora', host: cfg.host || record.host || '', capacityPpm: cfg.capacityPpm || record.capacityPpm || 0, statusOid: cfg.statusOid || record.statusOid || DEFAULT_STATUS_OID, counterOid: cfg.counterOid || record.counterOid || '', enabled: cfg.enabled !== false, last: record.last || null };
    });
    let activeCollector = null;
    try {
      const lock = JSON.parse(fs.readFileSync(`${this.getTelemetryPath()}.collector-lock`, 'utf8'));
      if (Date.now() - Number(lock.at || 0) < 90_000) activeCollector = lock.host || null;
    } catch (_) {}
    const configurable = !activeCollector || activeCollector === os.hostname();
    return {
      printers,
      samples: this.data.samples || [],
      monthStats: Object.fromEntries(Object.entries(telemetryPrinters).map(([id, record]) => [id, record.monthStats || {}])),
      intervalSeconds: POLL_MS / 1000,
      collectorEnabled: this.collectorActive,
      collectorHost: this.data.collectorHost || null,
      updatedAt: this.data.updatedAt || null,
      configurable
    };
  }
}

module.exports = { LiveOperations, POLL_MS, DEFAULT_STATUS_OID };
