// main.js — processo principal do GO Enterprise (Electron).
//
// Responsável por: abrir a janela principal e (sob demanda) a janela independente do Dashboard TV,
// ler/escrever o banco de dados na pasta compartilhada configurada, observar mudanças feitas por
// outros computadores, verificar atualizações de versão e manter o app disponível em bandeja para
// que a TV continue funcionando mesmo se a janela principal for fechada.
'use strict';
const { app, BrowserWindow, Menu, Tray, ipcMain, dialog, shell, screen, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { fileURLToPath } = require('url');
const accessControl = require('./src/accessControl');

const settingsStore = require('./src/settingsStore');
const dataStore = require('./src/dataStore');
const updater = require('./src/updater');
const mediaStore = require('./src/mediaStore');
const { LiveOperations } = require('./src/liveOps');

const APP_VERSION = require('./package.json').version;

let mainWindow = null;
let tvWindow = null;
let tray = null;
let isQuitting = false;
let updateCheckTimer = null;
let liveOperations = null;
const rendererSessions = new Map();
const authenticationFailures = new Map();
const AUTH_FAILURE_LIMIT = 5;
const AUTH_LOCK_DURATION_MS = 30_000;

function liveOpsConfig() {
  return {
    enabled: !!(settingsStore.get().liveOps && settingsStore.get().liveOps.enabled),
    decryptCommunity: (value) => {
      if (String(value).startsWith('enc:')) {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('Armazenamento seguro do Windows indisponível.');
        return safeStorage.decryptString(Buffer.from(String(value).slice(4), 'base64'));
      }
      return String(value || 'public');
    }
  };
}

const RENDERER_PATH = path.join(__dirname, 'renderer', 'app.html');

function configureDataStoreFromSettings() {
  const s = settingsStore.get();
  const filePath = settingsStore.dataFilePath();
  dataStore.stopWatch();
  if (!filePath) return;
  dataStore.setFilePath(filePath);
  dataStore.watch((data, savedAt, external, savedBy) => {
    if (!external) return; // provocado pela nossa própria escrita, os renderers já têm o dado certo
    [mainWindow, tvWindow].forEach(win => {
      if (!win || win.isDestroyed()) return;
      const role = roleForSender(win.webContents);
      const visibleData = role ? accessControl.projectData(data, role, rendererSessions.get(win.webContents.id)?.employeeId)
        : bootstrapData(data);
      win.webContents.send('data:changedExternally', { data: visibleData, savedAt, savedBy });
    });
  });
}

function isTrustedRenderer(sender) {
  if (!sender || !((mainWindow && !mainWindow.isDestroyed() && sender === mainWindow.webContents) ||
      (tvWindow && !tvWindow.isDestroyed() && sender === tvWindow.webContents))) return false;
  try {
    const url = new URL(sender.getURL());
    return url.protocol === 'file:' && path.resolve(fileURLToPath(url)) === path.resolve(RENDERER_PATH);
  } catch (_) { return false; }
}

function roleForSender(sender) {
  if (tvWindow && !tvWindow.isDestroyed() && sender === tvWindow.webContents) return 'tv';
  return rendererSessions.get(sender && sender.id)?.role || null;
}

function requireTrustedRenderer(event) {
  if (!isTrustedRenderer(event.sender)) throw new Error('Janela do aplicativo não autorizada.');
}

function requireRole(event, roles) {
  requireTrustedRenderer(event);
  const role = roleForSender(event.sender);
  if (!role || !roles.includes(role)) throw new Error('Acesso não autorizado para este perfil.');
  return role;
}

function checkAuthenticationRateLimit(senderId) {
  const state = authenticationFailures.get(senderId);
  if (state && state.lockedUntil > Date.now()) throw new Error('Muitas tentativas. Aguarde e tente novamente.');
}

function rejectAuthentication(senderId, message) {
  const state = authenticationFailures.get(senderId) || { count: 0, lockedUntil: 0 };
  state.count++;
  if (state.count >= AUTH_FAILURE_LIMIT) {
    state.count = 0;
    state.lockedUntil = Date.now() + AUTH_LOCK_DURATION_MS;
  }
  authenticationFailures.set(senderId, state);
  throw new Error(message);
}

function clearAuthenticationFailures(senderId) {
  authenticationFailures.delete(senderId);
}

function readFullData() {
  const result = dataStore.readData();
  return result && result.data ? result : { data: null, savedAt: null };
}

function bootstrapData(data) {
  if (!data) return null;
  const security = data.config && data.config.security || {};
  return {
    config: { security: {
      enabled: !!security.enabled, hint: security.hint || '', tvEnabled: !!security.tvEnabled
    } },
    employees: []
  };
}

function authenticateHash(salt, value, expected) {
  if (!salt || !value || !expected) return false;
  const actual = crypto.createHash('sha256').update(String(salt) + String(value)).digest();
  const target = Buffer.from(String(expected), 'hex');
  return target.length === actual.length && crypto.timingSafeEqual(target, actual);
}

function authenticateMasterPassword(password) {
  try {
    const source = fs.readFileSync(path.join(__dirname, 'renderer', 'master-secret.js'), 'utf8');
    const salt = source.match(/(?:const|let|var)\s+MASTER_SALT\s*=\s*(['"])([^'"\r\n]+)\1/);
    const hash = source.match(/(?:const|let|var)\s+MASTER_PASSWORD_HASH\s*=\s*(['"])([^'"\r\n]+)\1/);
    return !!(salt && hash && authenticateHash(salt[2], password, hash[2]));
  } catch (_) { return false; }
}

function sessionData(role, employeeId) {
  const result = readFullData();
  if (!result.data || role === 'gestor') return result;
  return { ...result, data: accessControl.projectData(result.data, role, employeeId) };
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'GO Enterprise',
    backgroundColor: '#0d221d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: !app.isPackaged
    }
  });
  mainWindow.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) rendererSessions.delete(mainWindow.webContents.id);
  });
  mainWindow.loadFile(RENDERER_PATH);
  mainWindow.on('close', (e) => {
    // se a TV estiver aberta, fechar a janela principal não deve derrubar o app inteiro nem a TV —
    // a janela some pra bandeja e continua rodando em segundo plano. Sem TV aberta, fecha normalmente.
    if (!isQuitting && tvWindow && !tvWindow.isDestroyed()) {
      e.preventDefault();
      mainWindow.hide();
    } else {
      mainWindow = null;
    }
  });
}

function pickTvDisplay() {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const settings = settingsStore.get();
  if (settings.tv && settings.tv.displayId != null) {
    const chosen = displays.find(d => d.id === settings.tv.displayId);
    if (chosen) return chosen;
  }
  // por padrão, prefere um monitor secundário (o mais comum: TV ligada como segunda tela)
  const secondary = displays.find(d => d.id !== primary.id);
  return secondary || primary;
}

function createTvWindow() {
  if (tvWindow && !tvWindow.isDestroyed()) { tvWindow.focus(); return tvWindow; }
  const display = pickTvDisplay();
  const settings = settingsStore.get();
  const autoFullscreen = !settings.tv || settings.tv.autoFullscreen !== false;
  tvWindow = new BrowserWindow({
    x: display.bounds.x + 40,
    y: display.bounds.y + 40,
    width: Math.min(1600, display.bounds.width - 80),
    height: Math.min(900, display.bounds.height - 80),
    title: 'GO Enterprise — Dashboard TV',
    backgroundColor: '#04140d',
    // sem moldura/barra de menu desde a criação quando for abrir em tela cheia — não dá pra depender
    // só de setKiosk/setFullScreen em tempo de execução: em algumas TVs/segundas telas isso falha
    // silenciosamente, a barra de menu continua visível, encolhe a área útil e o conteúdo (que é mais
    // alto que essa área menor) acaba sendo empurrado por cima do cabeçalho/rodapé fixos.
    frame: !autoFullscreen,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: !app.isPackaged,
      // a TV fica ligada sem foco/interação humana o tempo todo — sem isso o Chromium sufoca
      // setInterval/setTimeout quando considera a janela "em segundo plano" (varia por ambiente/GPU),
      // travando relógio, atualização de dados e o rodízio Dashboard TV↔SELBNEWS.
      backgroundThrottling: false
    }
  });
  tvWindow.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) rendererSessions.delete(tvWindow.webContents.id);
  });
  tvWindow.loadFile(RENDERER_PATH, { hash: 'dashboard' });
  tvWindow.once('ready-to-show', () => {
    if (autoFullscreen) {
      tvWindow.setBounds(display.bounds);
      tvWindow.setKiosk(true);
    }
    tvWindow.show();
  });
  tvWindow.on('close', () => { tvWindow = null; });
  return tvWindow;
}

function buildMenu() {
  const template = [
    {
      label: 'GO Enterprise',
      submenu: [
        { label: 'Abrir Dashboard TV', click: () => createTvWindow() },
        { label: 'Verificar atualizações agora', click: () => runUpdateCheck(true) },
        { label: 'Abrir pasta compartilhada', click: () => openSharedFolder() },
        { type: 'separator' },
        { label: 'Sair', click: () => { isQuitting = true; app.quit(); } }
      ]
    }
  ];
  if (!app.isPackaged) template.push({
      label: 'Exibir',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }
      ]
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, 'build', 'tray.png');
    tray = fs.existsSync(iconPath) ? new Tray(iconPath) : null;
    if (!tray) return;
    const menu = Menu.buildFromTemplate([
      { label: 'Abrir GO Enterprise', click: () => { if (mainWindow) { mainWindow.show(); } else { createMainWindow(); } } },
      { label: 'Abrir Dashboard TV', click: () => createTvWindow() },
      { label: 'Verificar atualizações', click: () => runUpdateCheck(true) },
      { type: 'separator' },
      { label: 'Sair', click: () => { isQuitting = true; app.quit(); } }
    ]);
    tray.setToolTip('GO Enterprise');
    tray.setContextMenu(menu);
    tray.on('click', () => { if (mainWindow) mainWindow.show(); });
  } catch (e) {
    console.warn('[main] Não foi possível criar o ícone de bandeja:', e.message);
  }
}

function openSharedFolder() {
  const settings = settingsStore.get();
  if (!settings.sharedFolder) {
    dialog.showMessageBox({ message: 'Nenhuma pasta compartilhada configurada ainda. Abra Configurações > Sincronização.' });
    return;
  }
  shell.openPath(settings.sharedFolder);
}

function runUpdateCheck(manual) {
  const updatesFolder = settingsStore.updatesFolderPath();
  const result = updater.checkForUpdate(updatesFolder, APP_VERSION);
  settingsStore.set({ lastUpdateCheck: new Date().toISOString() });
  if (result.available) {
    const targets = [mainWindow, tvWindow].filter(w => w && !w.isDestroyed());
    targets.forEach(w => w.webContents.send('update:available', result));
  } else if (manual) {
    dialog.showMessageBox({
      message: result.reason === 'sem-pasta-configurada'
        ? 'Configure a pasta compartilhada antes de verificar atualizações.'
        : result.isNewer
          ? 'Uma versão nova foi publicada, mas o instalador ainda não terminou de sincronizar nesta pasta. Tente de novo em instantes.'
          : 'Você já está na versão mais recente.'
    });
  }
  return result;
}

function scheduleUpdateChecks() {
  clearInterval(updateCheckTimer);
  const settings = settingsStore.get();
  if (!settings.autoCheckUpdates) return;
  const minutes = settings.updateCheckIntervalMinutes || 60;
  updateCheckTimer = setInterval(() => runUpdateCheck(false), Math.max(5, minutes) * 60 * 1000);
}

// ---------------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------------
ipcMain.handle('app:getVersion', () => APP_VERSION);

ipcMain.handle('settings:get', () => settingsStore.get());
ipcMain.handle('settings:set', (e, partial) => {
  requireRole(e, ['gestor']);
  const updated = settingsStore.set(partial);
  configureDataStoreFromSettings();
  scheduleUpdateChecks();
  if (liveOperations) liveOperations.start();
  return updated;
});
ipcMain.handle('settings:chooseSharedFolder', async (e) => {
  if (settingsStore.get().sharedFolder) requireRole(e, ['gestor']);
  else requireTrustedRenderer(e);
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const result = await dialog.showOpenDialog(win, {
    title: 'Escolha a pasta compartilhada (OneDrive, Google Drive ou Dropbox)',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const folder = result.filePaths[0];
  const updated = settingsStore.set({ sharedFolder: folder });
  configureDataStoreFromSettings();
  if (liveOperations) liveOperations.start();
  return updated;
});
ipcMain.handle('settings:openSharedFolder', e => { requireRole(e, ['gestor']); openSharedFolder(); });
ipcMain.handle('settings:getDisplays', () => {
  return screen.getAllDisplays().map(d => ({
    id: d.id, bounds: d.bounds, isPrimary: d.id === screen.getPrimaryDisplay().id
  }));
});

ipcMain.handle('auth:loginManager', (e, credential) => {
  requireTrustedRenderer(e);
  checkAuthenticationRateLimit(e.sender.id);
  const stored = readFullData();
  if (!stored.data) {
    if (!authenticateMasterPassword(String(credential || ''))) return rejectAuthentication(e.sender.id, 'Credencial inválida.');
    rendererSessions.set(e.sender.id, { role: 'gestor' });
    clearAuthenticationFailures(e.sender.id);
    return stored;
  }
  const security = stored.data.config && stored.data.config.security || {};
  const valid = security.enabled
    ? authenticateHash(security.salt, String(credential || '').trim(), security.pinHash)
    : authenticateMasterPassword(String(credential || ''));
  if (!valid) return rejectAuthentication(e.sender.id, 'Credencial inválida.');
  rendererSessions.set(e.sender.id, { role: 'gestor' });
  clearAuthenticationFailures(e.sender.id);
  return stored;
});
ipcMain.handle('auth:loginOperator', (e, registration) => {
  requireTrustedRenderer(e);
  checkAuthenticationRateLimit(e.sender.id);
  const stored = readFullData();
  const wanted = String(registration || '').trim().toUpperCase();
  const employee = (stored.data && Array.isArray(stored.data.employees) ? stored.data.employees : [])
    .find(row => row && row.reg && String(row.reg).trim().toUpperCase() === wanted && row.status !== 'Inativo');
  if (!employee) return rejectAuthentication(e.sender.id, 'Matrícula não encontrada ou cadastro inativo.');
  rendererSessions.set(e.sender.id, { role: 'operador', employeeId: employee.id });
  clearAuthenticationFailures(e.sender.id);
  return { ...stored, data: accessControl.projectData(stored.data, 'operador', employee.id) };
});
ipcMain.handle('auth:loginTv', (e, pin) => {
  requireTrustedRenderer(e);
  checkAuthenticationRateLimit(e.sender.id);
  const stored = readFullData();
  const security = stored.data && stored.data.config && stored.data.config.security || {};
  if (!security.tvEnabled || !authenticateHash(security.tvSalt, String(pin || '').trim(), security.tvPinHash)) {
    return rejectAuthentication(e.sender.id, 'PIN da TV inválido.');
  }
  rendererSessions.set(e.sender.id, { role: 'tv' });
  clearAuthenticationFailures(e.sender.id);
  return { ...stored, data: accessControl.projectData(stored.data, 'tv') };
});
ipcMain.handle('auth:logout', e => { requireTrustedRenderer(e); rendererSessions.delete(e.sender.id); return true; });
ipcMain.handle('data:read', e => {
  requireTrustedRenderer(e);
  const role = roleForSender(e.sender);
  return role ? sessionData(role, rendererSessions.get(e.sender.id)?.employeeId) : (() => {
    const result = readFullData();
    return { ...result, data: bootstrapData(result.data) };
  })();
});
ipcMain.handle('data:write', (e, db) => {
  const role = requireRole(e, ['gestor', 'tv', 'operador']);
  if (role === 'tv' && tvWindow && e.sender === tvWindow.webContents) throw new Error('O Dashboard TV é somente leitura.');
  if (role === 'gestor') return dataStore.writeData(db);
  const current = readFullData();
  if (!current.data) throw new Error('Base compartilhada indisponível.');
  const incoming = db && typeof db === 'object' ? db : {};
  const latestImport = accessControl.sanitizeTvImport(Array.isArray(incoming.imports) ? incoming.imports[0] : null);
  const isDevelopmentImport = role === 'operador' && latestImport && latestImport.type === 'OS Desenvolvimento';
  const imports = Array.isArray(current.data.imports) ? [...current.data.imports] : [];
  if (latestImport && !(imports[0] && imports[0].at === latestImport.at && imports[0].file === latestImport.file && imports[0].type === latestImport.type)) {
    latestImport.id = crypto.randomUUID();
    imports.unshift(latestImport);
  }
  const nextData = {
    ...current.data,
    sla: accessControl.sanitizeTvSla(incoming.sla),
    imports: imports.slice(0, 500)
  };
  if (isDevelopmentImport) nextData.developmentOrders = accessControl.sanitizeDevelopmentOrders(incoming.developmentOrders);
  const saved = dataStore.writeData({
    ...nextData
  });
  return { savedAt: saved.savedAt, conflicts: saved.conflicts };
});

ipcMain.handle('tv:open', () => { createTvWindow(); return true; });
ipcMain.handle('tv:close', () => { if (tvWindow && !tvWindow.isDestroyed()) tvWindow.close(); return true; });
ipcMain.handle('tv:isSelf', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  return !!(tvWindow && w && w.id === tvWindow.id);
});

ipcMain.handle('liveOps:get', e => { requireRole(e, ['gestor', 'operador']); return liveOperations ? liveOperations.snapshot() : null; });
ipcMain.handle('liveOps:setPrinters', (e, printers) => {
  requireRole(e, ['gestor']);
  if (!liveOperations) throw new Error('Serviço Operação ao vivo indisponível.');
  if (!liveOperations.snapshot().configurable) throw new Error('A configuração fica disponível no computador que está atuando como coletor central.');
  if (!Array.isArray(printers)) throw new Error('Lista de impressoras inválida.');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Armazenamento seguro do Windows indisponível; não é seguro salvar a comunidade SNMP.');
  const previous = new Map(liveOperations.list().map(p => [p.id, p.community]));
  const secured = printers.map(p => {
    const secret = String(p.community || '');
    const community = secret ? `enc:${safeStorage.encryptString(secret).toString('base64')}` : previous.get(String(p.id)) || '';
    return { ...p, community };
  });
  return liveOperations.setPrinters(secured);
});
ipcMain.handle('liveOps:setCollector', (e, enabled) => {
  requireRole(e, ['gestor']);
  if (enabled && !settingsStore.get().sharedFolder) throw new Error('Configure a pasta compartilhada nas configurações antes de habilitar o coletor central.');
  if (enabled && !liveOperations.list().some(p => p.enabled)) throw new Error('Cadastre pelo menos uma impressora neste computador antes de habilitar o coletor central.');
  const liveOps = { ...(settingsStore.get().liveOps || {}), enabled: !!enabled };
  settingsStore.set({ liveOps });
  liveOperations.start();
  return liveOperations.snapshot();
});

// mídia do SELBNEWS (upload salvo como arquivo na pasta compartilhada — ver src/mediaStore.js).
// O conteúdo do SELBNEWS aparece dentro da MESMA janela de TV acima, revezando com o Dashboard TV
// (ver enterKioskMode/showKioskPhase em renderer/app.html) — não há uma segunda janela dedicada.
ipcMain.handle('selbnews:saveImage', (e, dataUrl, subfolder) => { requireRole(e, ['gestor']); return mediaStore.saveImage(dataUrl, subfolder); });
ipcMain.handle('selbnews:deleteImage', (e, relativePath) => { requireRole(e, ['gestor']); mediaStore.deleteImage(relativePath); return true; });
ipcMain.handle('selbnews:resolveMediaPath', (_e, relativePath) => mediaStore.resolveFileUrl(relativePath));

ipcMain.handle('update:check', () => runUpdateCheck(true));
ipcMain.handle('update:install', async (e, approvedVersion) => {
  requireRole(e, ['gestor']);
  const updatesFolder = settingsStore.updatesFolderPath();
  const current = updater.checkForUpdate(updatesFolder, APP_VERSION);
  if (!current.available || !current.installerPath || current.latestVersion !== String(approvedVersion || '')) {
    throw new Error('A atualização não está mais disponível. Verifique novamente antes de instalar.');
  }
  await updater.downloadAndLaunchInstaller(updatesFolder, current.installerPath);
  isQuitting = true;
  setTimeout(() => app.quit(), 500);
  return true;
});

// ---------------------------------------------------------------------------------
// ciclo de vida do app
// ---------------------------------------------------------------------------------
app.whenReady().then(() => {
  settingsStore.init(app.getPath('userData'));
  liveOperations = new LiveOperations(app.getPath('userData'), liveOpsConfig, () => {
    const s = settingsStore.get();
    return s.sharedFolder
      ? path.join(s.sharedFolder, s.dataSubfolder || 'dados', 'operacao_ao_vivo.json')
      : path.join(app.getPath('userData'), 'operacao_ao_vivo.json');
  });
  buildMenu();
  createTray();
  createMainWindow();
  configureDataStoreFromSettings();
  liveOperations.start();
  scheduleUpdateChecks();
  setTimeout(() => runUpdateCheck(false), 5000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else if (mainWindow) mainWindow.show();
  });
});

app.on('before-quit', () => { isQuitting = true; if (liveOperations) liveOperations.stop(); });

app.on('window-all-closed', () => {
  // no Windows, só sai de fato se não houver bandeja ativa (ou se o usuário pediu Sair explicitamente)
  if (isQuitting || !tray) app.quit();
});
