// dataStore.js — le^ e escreve o banco de dados do GO Enterprise num arquivo JSON dentro da pasta
// compartilhada (OneDrive/Google Drive/Dropbox) escolhida nas Configurações. Cada PC instalado aponta
// para a MESMA pasta sincronizada; o cliente de nuvem (OneDrive etc.) é quem propaga o arquivo entre
// as máquinas — este módulo só cuida de ler, escrever com segurança e observar mudanças externas.
//
// IMPORTANTE — limite conhecido: isto NÃO é um banco de dados multiusuário de verdade. Se dois
// computadores salvarem ao mesmo tempo (janela de poucos segundos, antes do arquivo sincronizar),
// pode haver conflito. Para reduzir o risco: (1) ao salvar, sempre relê o arquivo em disco primeiro;
// (2) se detectar que alguém escreveu por fora desde a última leitura desta instância, faz uma mesclagem
// por id (registro por registro) em vez de sobrescrever tudo; (3) quando dois lados mudaram o MESMO
// registro de formas diferentes, a versão perdedora não é apagada — vai para "db.syncConflicts" para
// o gestor revisar depois. Ainda assim, edições simultâneas no mesmo registro exigem atenção humana.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const chokidar = require('chokidar');

// coleções tratadas como arrays de registros com "id" (mescladas item a item)
const ARRAY_COLLECTIONS = [
  'production', 'finance', 'expenses', 'losses', 'employees', 'absences', 'vacations',
  'suppliers', 'imports', 'history', 'activities', 'timesheets', 'manuals', 'news'
];
// coleções tratadas como objeto-mapa { chave: registro } (mescladas por chave)
const MAP_COLLECTIONS = ['sla'];

let filePath = null;
let watcher = null;
let lastSelfWriteMs = 0;
let baseSavedAt = null; // savedAt do envelope que ESTA instância leu por último

function setFilePath(p) {
  filePath = p;
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function readEnvelope() {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[dataStore] Falha ao ler/parsear arquivo de dados:', e.message);
    return null;
  }
}

// leitura "de fora" (chamada pelo main process ao iniciar ou quando o watcher detecta mudança externa)
function readData() {
  const env = readEnvelope();
  if (!env) return { data: null, savedAt: null };
  baseSavedAt = env.savedAt || null;
  return { data: env.data, savedAt: env.savedAt || null, savedBy: env.savedBy || null };
}

function deepEqual(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
}

function mergeArrayCollection(diskArr, incomingArr, conflictsOut, label) {
  const diskArrSafe = Array.isArray(diskArr) ? diskArr : [];
  const incomingArrSafe = Array.isArray(incomingArr) ? incomingArr : [];
  const byId = new Map();
  diskArrSafe.forEach(item => { if (item && item.id != null) byId.set(item.id, item); });
  incomingArrSafe.forEach(item => {
    if (item == null || item.id == null) return;
    const existing = byId.get(item.id);
    if (!existing || deepEqual(existing, item)) {
      byId.set(item.id, item);
      return;
    }
    // mesmo id, conteúdo diferente nos dois lados: decide por updatedAt quando disponível
    const existingTs = existing.updatedAt ? Date.parse(existing.updatedAt) : null;
    const incomingTs = item.updatedAt ? Date.parse(item.updatedAt) : null;
    if (incomingTs != null && existingTs != null) {
      byId.set(item.id, incomingTs >= existingTs ? item : existing);
      conflictsOut.push({ collection: label, id: item.id, kept: incomingTs >= existingTs ? 'incoming' : 'disk', at: new Date().toISOString() });
    } else {
      // sem updatedAt em algum dos lados: prioriza a edição que está sendo salva agora (incoming),
      // mas guarda a versão do disco no log de conflitos para não perder silenciosamente
      byId.set(item.id, item);
      conflictsOut.push({ collection: label, id: item.id, kept: 'incoming', discarded: existing, at: new Date().toISOString() });
    }
  });
  return Array.from(byId.values());
}

function mergeMapCollection(diskMap, incomingMap, conflictsOut, label) {
  const out = { ...(diskMap && typeof diskMap === 'object' ? diskMap : {}) };
  const incomingSafe = incomingMap && typeof incomingMap === 'object' ? incomingMap : {};
  Object.keys(incomingSafe).forEach(key => {
    const existing = out[key];
    const item = incomingSafe[key];
    if (existing === undefined || deepEqual(existing, item)) { out[key] = item; return; }
    // sem timestamp por registro nesta coleção (SLA importado): a edição atual prevalece,
    // versão anterior vai para o log de conflitos
    conflictsOut.push({ collection: label, id: key, kept: 'incoming', discarded: existing, at: new Date().toISOString() });
    out[key] = item;
  });
  return out;
}

// mescla o db em disco com o db que esta instância quer salvar
function mergeDb(diskDb, incomingDb) {
  const conflicts = [];
  const merged = { ...incomingDb };
  ARRAY_COLLECTIONS.forEach(key => {
    merged[key] = mergeArrayCollection(diskDb ? diskDb[key] : [], incomingDb[key], conflicts, key);
  });
  MAP_COLLECTIONS.forEach(key => {
    merged[key] = mergeMapCollection(diskDb ? diskDb[key] : {}, incomingDb[key], conflicts, key);
  });
  // config: mesclagem rasa, o que está sendo salvo agora prevalece por campo
  merged.config = { ...(diskDb && diskDb.config), ...incomingDb.config };
  if (conflicts.length) {
    merged.syncConflicts = [...(incomingDb.syncConflicts || []), ...conflicts].slice(-200);
  }
  return { merged, conflicts };
}

// grava o db com segurança: relê o disco, mescla se necessário, grava atômico (arquivo temporário + rename)
function writeData(incomingDb) {
  if (!filePath) throw new Error('Nenhuma pasta compartilhada configurada.');
  ensureDir(filePath);
  const onDisk = readEnvelope();
  let finalDb = incomingDb;
  let conflicts = [];
  const diskIsNewer = onDisk && onDisk.savedAt && baseSavedAt && onDisk.savedAt !== baseSavedAt;
  const diskExistsButNeverRead = onDisk && !baseSavedAt;
  if (diskIsNewer || diskExistsButNeverRead) {
    const result = mergeDb(onDisk.data, incomingDb);
    finalDb = result.merged;
    conflicts = result.conflicts;
  }
  const savedAt = new Date().toISOString();
  const envelope = {
    formatVersion: 1,
    savedAt,
    savedBy: os.hostname(),
    data: finalDb
  };
  const tmpPath = filePath + '.tmp-' + process.pid;
  fs.writeFileSync(tmpPath, JSON.stringify(envelope), 'utf-8');
  fs.renameSync(tmpPath, filePath);
  lastSelfWriteMs = Date.now();
  baseSavedAt = savedAt;
  return { savedAt, conflicts, data: finalDb };
}

// observa mudanças externas no arquivo (feitas por outro PC via sincronização da nuvem) e chama
// onExternalChange(data, savedAt) quando detectar. Ignora eventos causados pela própria escrita
// (usa uma janela curta de tempo desde o último writeData local).
function watch(onExternalChange) {
  if (!filePath) return;
  stopWatch();
  ensureDir(filePath);
  watcher = chokidar.watch(filePath, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 150 } });
  watcher.on('add', handleFsEvent);
  watcher.on('change', handleFsEvent);
  function handleFsEvent() {
    // se a mudança aconteceu muito perto de uma escrita nossa, provavelmente somos nós mesmos —
    // ainda assim relê (é barato) mas não trata como "mudança externa" pra fins de aviso na tela
    const sinceSelfWrite = Date.now() - lastSelfWriteMs;
    const env = readEnvelope();
    if (!env) return;
    if (env.savedAt === baseSavedAt) return; // nada novo de fato
    baseSavedAt = env.savedAt;
    const external = sinceSelfWrite > 3000; // fora de uma janela de 3s após nossa própria escrita
    onExternalChange(env.data, env.savedAt, external, env.savedBy);
  }
}

function stopWatch() {
  if (watcher) { watcher.close(); watcher = null; }
}

module.exports = { setFilePath, readData, writeData, watch, stopWatch, mergeDb };
