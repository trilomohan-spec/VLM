/**
 * EZI Desktop — Electron main process
 * Trilo Automation
 */

const { app, BrowserWindow, shell, session, ipcMain } = require("electron");
const path = require("path");

let license = null;
try { license = require("./license.cjs"); } catch (e) { console.warn("License module unavailable:", e.message); }

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 420,
    minHeight: 680,
    title: "EZI — Serial Number Recognition System",
    // Use the CAT logo as the window icon (ico format preferred on Windows)
    // icon: path.join(__dirname, "../public/cat-logo.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // Allow the app to make plain http:// requests to the local OCR server
      webSecurity: false,
    },
  });

  // Load the Vite-built SPA
  win.loadFile(path.join(__dirname, "../dist/index.html"));

  // Open any <a target="_blank"> links in the system browser, not a new Electron window
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  // ── License IPC handlers ─────────────────────────────────────────────────
  if (license) {
    const userData = app.getPath("userData");
    ipcMain.handle("license:getMachineId", () => license.getMachineId());
    ipcMain.handle("license:isLicensed",   () => license.isLicensed(userData));
    ipcMain.handle("license:activate", (_event, key) => license.activateLicense(userData, key));
  }

  // Grant camera + microphone permissions without prompting
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      if (permission === "media" || permission === "mediaKeySystem") {
        callback(true);
      } else {
        callback(false);
      }
    }
  );

  createWindow();

  // macOS: re-create window when dock icon is clicked and no windows are open
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed (except on macOS)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
