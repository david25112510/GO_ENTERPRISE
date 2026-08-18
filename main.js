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
const mediaStore = require('./src/mediaStore');

const APP_VERSION = require('./package.json').version;

let mainWindow = null;
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
    [mainWindow, tvController.get(), selbNewsController.get()]
      .filter(w => w && !w.isDestroyed())
      .forEach(w => w.webContents.send('data:changedExternally', payload));
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
    // se alguma janela de TV estiver aberta (Dashboard TV ou SELBNEWS TV), fechar a janela principal
    // não deve derrubar o app inteiro nem a TV — a janela some pra bandeja e continua rodando em
    // segundo plano. Sem nenhuma TV aberta, fecha normalmente.
    const anyTvOpen = tvController.get() || selbNewsController.get();
    if (!isQuitting && anyTvOpen) {
      e.preventDefault();
      mainWindow.hide();
    } else {
      mainWindow = null;
    }
  });
}

// fábrica de controlador de janela "kiosk" (TV): encapsula a lógica de escolher o monitor certo,
// abrir sem moldura desde a criação (setKiosk depois falha silenciosamente em algumas TVs/segundas
// telas) e liberar a referência ao fechar. Usada tanto pelo Dashboard TV operacional quanto pelo
// SELBNEWS TV — cada um com sua própria janela, seu próprio hash de rota e sua própria preferência
// de monitor em settingsStore, mas sem duplicar essa lógica duas vezes.
function createKioskWindowController({ settingsKey, hash, title, bgColor }) {
  let win = null;
  function pickDisplay() {
    const displays = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();
    const cfg = settingsStore.get()[settingsKey];
    if (cfg && cfg.displayId != null) {
      const chosen = displays.find(d => d.id === cfg.displayId);
      if (chosen) return chosen;
    }
    // por padrão, prefere um monitor secundário (o mais comum: TV ligada como segunda tela)
    const secondary = displays.find(d => d.id !== primary.id);
    return secondary || primary;
  }
  function open() {
    if (win && !win.isDestroyed()) { win.focus(); return win; }
    const display = pickDisplay();
    const cfg = settingsStore.get()[settingsKey];
    const autoFullscreen = !cfg || cfg.autoFullscreen !== false;
    win = new BrowserWindow({
      x: display.bounds.x + 40,
      y: display.bounds.y + 40,
      width: Math.min(1600, display.bounds.width - 80),
      height: Math.min(900, display.bounds.height - 80),
      title,
      backgroundColor: bgColor || '#04140d',
      frame: !autoFullscreen,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });
    win.loadFile(RENDERER_PATH, { hash });
    win.once('ready-to-show', () => {
      if (autoFullscreen) {
        win.setBounds(display.bounds);
        win.setKiosk(true);
      }
      win.show();
    });
    win.on('close', () => { win = null; });
    return win;
  }
  function close() { if (win && !win.isDestroyed()) win.close(); }
  function isSelf(webContents) {
    const w = BrowserWindow.fromWebContents(webContents);
    return !!(win && w && w.id === win.id);
  }
  return { open, close, isSelf, get: () => win };
}

const tvController = createKioskWindowController({
  settingsKey: 'tv', hash: 'dashboard', title: 'GO Enterprise — Dashboard TV'
});
const selbNewsController = createKioskWindowController({
  settingsKey: 'selbnews', hash: 'selbnewstv', title: 'GO Enterprise — SELBNEWS TV'
});

function buildMenu() {
  const template = [
    {
      label: 'GO Enterprise',
      submenu: [
        { label: 'Abrir Dashboard TV', click: () => tvController.open() },
        { label: 'Abrir SELBNEWS TV', click: () => selbNewsController.open() },
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
      { label: 'Abrir Dashboard TV', click: () => tvController.open() },
      { label: 'Abrir SELBNEWS TV', click: () => selbNewsController.open() },
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
    const targets = [mainWindow, tvController.get(), selbNewsController.get()].filter(w => w && !w.isDestroyed());
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

ipcMain.handle('tv:open', () => { tvController.open(); return true; });
ipcMain.handle('tv:close', () => { tvController.close(); return true; });
ipcMain.handle('tv:isSelf', (e) => tvController.isSelf(e.sender));

ipcMain.handle('selbnews:open', () => { selbNewsController.open(); return true; });
ipcMain.handle('selbnews:close', () => { selbNewsController.close(); return true; });
ipcMain.handle('selbnews:isSelf', (e) => selbNewsController.isSelf(e.sender));
ipcMain.handle('selbnews:isOpen', () => !!selbNewsController.get());
ipcMain.handle('selbnews:saveImage', (_e, dataUrl, subfolder) => mediaStore.saveImage(dataUrl, subfolder));
ipcMain.handle('selbnews:deleteImage', (_e, relativePath) => { mediaStore.deleteImage(relativePath); return true; });
ipcMain.handle('selbnews:resolveMediaPath', (_e, relativePath) => mediaStore.resolveFileUrl(relativePath));

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
