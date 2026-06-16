/**
 * EZI Desktop — Electron main process
 * Trilo Automation
 */

const { app, BrowserWindow, shell, session } = require("electron");
const path = require("path");

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