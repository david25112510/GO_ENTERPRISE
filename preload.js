// preload.js — ponte segura entre o renderer (app.html, mesmo código de sempre) e o processo principal
// (main.js, que tem acesso ao sistema de arquivos). O renderer nunca fala com Node/fs diretamente;
// tudo passa por aqui via contextBridge, seguindo a recomendação de segurança do Electron
// (contextIsolation ligado, nodeIntegration desligado).
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('goDesktop', {
  isElectron: true,

  // ---- versão / atualização ----
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: (installerPath) => ipcRenderer.invoke('update:install', installerPath),
  onUpdateAvailable: (cb) => {
    const listener = (_e, info) => cb(info);
    ipcRenderer.on('update:available', listener);
    return () => ipcRenderer.removeListener('update:available', listener);
  },

  // ---- configurações locais deste PC ----
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial) => ipcRenderer.invoke('settings:set', partial),
  chooseSharedFolder: () => ipcRenderer.invoke('settings:chooseSharedFolder'),
  openSharedFolder: () => ipcRenderer.invoke('settings:openSharedFolder'),
  getDisplays: () => ipcRenderer.invoke('settings:getDisplays'),

  // ---- dados (arquivo compartilhado) ----
  readData: () => ipcRenderer.invoke('data:read'),
  writeData: (db) => ipcRenderer.invoke('data:write', db),
  onDataChangedExternally: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('data:changedExternally', listener);
    return () => ipcRenderer.removeListener('data:changedExternally', listener);
  },

  // ---- janela da TV (independente da janela principal) ----
  openTvWindow: () => ipcRenderer.invoke('tv:open'),
  closeTvWindow: () => ipcRenderer.invoke('tv:close'),
  isTvWindow: () => ipcRenderer.invoke('tv:isSelf'),

  // ---- janela do SELBNEWS TV (independente da janela principal e da Dashboard TV) ----
  openSelbNewsWindow: () => ipcRenderer.invoke('selbnews:open'),
  closeSelbNewsWindow: () => ipcRenderer.invoke('selbnews:close'),
  isSelbNewsWindow: () => ipcRenderer.invoke('selbnews:isSelf'),
  isSelbNewsWindowOpen: () => ipcRenderer.invoke('selbnews:isOpen'),

  // ---- mídia do SELBNEWS (upload salvo como arquivo na pasta compartilhada) ----
  saveSelbNewsImage: (dataUrl, subfolder) => ipcRenderer.invoke('selbnews:saveImage', dataUrl, subfolder),
  deleteSelbNewsImage: (relativePath) => ipcRenderer.invoke('selbnews:deleteImage', relativePath),
  resolveSelbNewsMediaUrl: (relativePath) => ipcRenderer.invoke('selbnews:resolveMediaPath', relativePath)
});
