/**
 * EZI Desktop — Electron preload
 * Runs in the renderer context before the page loads.
 * contextIsolation is ON — only use contextBridge to expose APIs.
 */

// No extra APIs needed — the app uses standard web APIs (fetch, camera, print)
// window.print() works natively in Electron for the Print button