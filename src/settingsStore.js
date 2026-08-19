// settingsStore.js — configurações LOCAIS deste computador (não são dados de negócio, não vão para a
// pasta compartilhada). Ficam em app.getPath('userData')/settings.json, ex:
// C:\Users\<usuario>\AppData\Roaming\GO Enterprise\settings.json
'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  // pasta compartilhada (OneDrive/Google Drive/Dropbox) escolhida pelo usuário neste PC.
  // Ex: "C:\\Users\\fulano\\OneDrive\\GO Enterprise Compartilhado"
  sharedFolder: null,
  // subpasta dentro da pasta compartilhada onde fica o arquivo de dados
  dataSubfolder: 'dados',
  dataFileName: 'gestao_operacional.json',
  // subpasta onde ficam os instaladores/versão mais recente
  updatesSubfolder: 'atualizacoes',
  // preferências da janela da TV — mostra tanto o Dashboard TV quanto o SELBNEWS, revezando dentro
  // da mesma janela/monitor (ver enterKioskMode em renderer/app.html)
  tv: {
    displayId: null,     // id do monitor onde a TV deve abrir (null = deixa o usuário escolher/posicionar)
    autoFullscreen: true
  },
  // verificação automática de atualização
  autoCheckUpdates: true,
  updateCheckIntervalMinutes: 60,
  lastUpdateCheck: null
};

let settingsPath = null;
let cache = null;

function init(userDataPath) {
  settingsPath = path.join(userDataPath, 'settings.json');
  load();
}

function load() {
  try {
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, 'utf-8');
      cache = { ...DEFAULTS, ...JSON.parse(raw) };
    } else {
      cache = { ...DEFAULTS };
    }
  } catch (e) {
    console.warn('[settingsStore] Falha ao ler settings.json, usando padrão:', e.message);
    cache = { ...DEFAULTS };
  }
  return cache;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[settingsStore] Falha ao salvar settings.json:', e.message);
  }
}

function get() {
  return cache || load();
}

function set(partial) {
  cache = { ...get(), ...partial };
  save();
  return cache;
}

function dataFilePath() {
  const s = get();
  if (!s.sharedFolder) return null;
  return path.join(s.sharedFolder, s.dataSubfolder, s.dataFileName);
}

function updatesFolderPath() {
  const s = get();
  if (!s.sharedFolder) return null;
  return path.join(s.sharedFolder, s.updatesSubfolder);
}

module.exports = { init, load, save, get, set, dataFilePath, updatesFolderPath, DEFAULTS };
