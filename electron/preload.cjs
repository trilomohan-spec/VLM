/**
 * EZI Desktop — Electron preload
 * Runs in the renderer context before the page loads.
 * contextIsolation is ON — only use contextBridge to expose APIs.
 */

const { contextBridge, ipcRenderer } = require('electron');

// License API — used by LicenseGate.tsx
contextBridge.exposeInMainWorld('ezilicense', {
  getMachineId : ()    => ipcRenderer.invoke('license:getMachineId'),
  isLicensed   : ()    => ipcRenderer.invoke('license:isLicensed'),
  activate     : (key) => ipcRenderer.invoke('license:activate', key),
});

// window.print() works natively in Electron for the Print button
