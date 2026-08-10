// main.js — processo principal do GO Enterprise (Electron).
//
// Responsável por: abrir a janela principal e (sob demanda) a janela independente do Dashboard TV,
// ler/escrever o banco de dados na pasta compartilhada configurada, observar mudanças feitas por
// outros computadores, verificar atualizações de versão e manter o app disponível em bandeja para
// que a TV continue funcionando mesmo se a janela principal for fechada.
'use strict';
const { app, BrowserWindow, Menu, Tray, ipcMain, dialog, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const settingsStore = require('./src/settingsStore');
const dataStore = require('./src/dataStore');
const updater = require('./src/updater');

const APP_VERSION = require('./package.json').version;

let mainWindow = null;
let tvWindow = null;
let tray = null;
let isQuitting = false;
let updateCheckTimer = null;

const RENDERER_PATH = path.join(__dirname, 'renderer', 'app.html');

function configureDataStoreFromSettings() {
  const s = settingsStore.get();
  const filePath = settingsStore.dataFilePath();
  dataStore.stopWatch();
  if (!filePath) return;
  dataStore.setFilePath(filePath);
  dataStore.watch((data, savedAt, external, savedBy) => {
    if (!external) return; // provocado pela nossa própria escrita, os renderers já têm o dado certo
    const payload = { data, savedAt, savedBy };
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('data:changedExternally', payload);
    if (tvWindow && !tvWindow.isDestroyed()) tvWindow.webContents.send('data:changedExternally', payload);
  });
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
      sandbox: false
    }
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
  tvWindow = new BrowserWindow({
    x: display.bounds.x + 40,
    y: display.bounds.y + 40,
    width: Math.min(1600, display.bounds.width - 80),
    height: Math.min(900, display.bounds.height - 80),
    title: 'GO Enterprise — Dashboard TV',
    backgroundColor: '#04140d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  tvWindow.loadFile(RENDERER_PATH, { hash: 'dashboard' });
  tvWindow.once('ready-to-show', () => {
    if (!settings.tv || settings.tv.autoFullscreen !== false) {
      tvWindow.setBounds(display.bounds);
      // modo kiosk (não só "tela cheia"): cobre o monitor por completo, incluindo a barra de tarefas
      // do Windows — é o modo dedicado do Electron para telas de sinalização/TV, mais confiável que
      // setFullScreen sozinho em monitores secundários.
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
    },
    {
      label: 'Exibir',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }
      ]
    }
  ];
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
ipcMain.handle('settings:set', (_e, partial) => {
  const updated = settingsStore.set(partial);
  configureDataStoreFromSettings();
  scheduleUpdateChecks();
  return updated;
});
ipcMain.handle('settings:chooseSharedFolder', async () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const result = await dialog.showOpenDialog(win, {
    title: 'Escolha a pasta compartilhada (OneDrive, Google Drive ou Dropbox)',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const folder = result.filePaths[0];
  const updated = settingsStore.set({ sharedFolder: folder });
  configureDataStoreFromSettings();
  return updated;
});
ipcMain.handle('settings:openSharedFolder', () => { openSharedFolder(); });
ipcMain.handle('settings:getDisplays', () => {
  return screen.getAllDisplays().map(d => ({
    id: d.id, bounds: d.bounds, isPrimary: d.id === screen.getPrimaryDisplay().id
  }));
});

ipcMain.handle('data:read', () => dataStore.readData());
ipcMain.handle('data:write', (_e, db) => dataStore.writeData(db));

ipcMain.handle('tv:open', () => { createTvWindow(); return true; });
ipcMain.handle('tv:close', () => { if (tvWindow && !tvWindow.isDestroyed()) tvWindow.close(); return true; });
ipcMain.handle('tv:isSelf', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  return !!(tvWindow && w && w.id === tvWindow.id);
});

ipcMain.handle('update:check', () => runUpdateCheck(true));
ipcMain.handle('update:install', async (_e, installerPath) => {
  await updater.downloadAndLaunchInstaller(installerPath);
  isQuitting = true;
  setTimeout(() => app.quit(), 500);
  return true;
});

// ---------------------------------------------------------------------------------
// ciclo de vida do app
// ---------------------------------------------------------------------------------
app.whenReady().then(() => {
  settingsStore.init(app.getPath('userData'));
  buildMenu();
  createTray();
  createMainWindow();
  configureDataStoreFromSettings();
  scheduleUpdateChecks();
  setTimeout(() => runUpdateCheck(false), 5000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else if (mainWindow) mainWindow.show();
  });
});

app.on('before-quit', () => { isQuitting = true; });

app.on('window-all-closed', () => {
  // no Windows, só sai de fato se não houver bandeja ativa (ou se o usuário pediu Sair explicitamente)
  if (isQuitting || !tray) app.quit();
});
