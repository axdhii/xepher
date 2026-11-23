// Xepher for Windows: a transparent, always-on-top window holding the robot.
const { app, BrowserWindow, ipcMain, screen, shell, Tray, Menu, globalShortcut, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const { autoUpdater } = require("electron-updater");

const BUBBLE = { width: 150, height: 150 };
const PANEL = { width: 1000, height: 680 }; // shrunk to fit smaller screens
const MARGIN = 16;

let win;
let tray;

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => win?.show());

function createWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    ...BUBBLE,
    x: area.x + area.width - BUBBLE.width - MARGIN,
    y: area.y + area.height - BUBBLE.height - MARGIN,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: false },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true);
  win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  // Links clicked inside Xepher open in the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
}

// Grow and shrink around the bottom-right corner, kept inside the screen.
ipcMain.on("set-expanded", (_e, expanded) => {
  const [x, y] = win.getPosition();
  const [w, h] = win.getSize();
  const area = screen.getDisplayNearestPoint({ x, y }).workArea;
  const size = expanded ? { width: Math.min(PANEL.width, area.width), height: Math.min(PANEL.height, area.height) } : BUBBLE;
  const nx = Math.min(Math.max(x + w - size.width, area.x), area.x + area.width - size.width);
  const ny = Math.min(Math.max(y + h - size.height, area.y), area.y + area.height - size.height);
  win.setBounds({ x: nx, y: ny, ...size });
  if (expanded) win.focus();
});

ipcMain.on("move-by", (_e, dx, dy) => {
  const [x, y] = win.getPosition();
  win.setPosition(Math.round(x + dx), Math.round(y + dy));
});

// Updates come from this repo's GitHub releases. The repo is private, so the
// renderer hands over the GitHub token from its settings.
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on("update-downloaded", (info) => win?.webContents.send("update-ready", info.version));
// Show progress and errors in the panel, the same way Android does, so a slow
// download or a failed check doesn't look like "no update".
const updateStatus = (text) =>
  win?.webContents.executeJavaScript(`window.__xepherUpdate && window.__xepherUpdate(${JSON.stringify(text)})`).catch(() => {});
autoUpdater.on("update-available", (info) => updateStatus(`Downloading Xepher ${info.version}…`));
autoUpdater.on("download-progress", (p) => updateStatus(`Downloading the update… ${Math.round(p.percent)}%`));
autoUpdater.on("error", (e) => updateStatus(`Update check failed: ${e.message}`));
ipcMain.on("check-updates", (_e, repo, token) => {
  if (!app.isPackaged || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) return;
  const [owner, name] = repo.split("/");
  autoUpdater.setFeedURL({ provider: "github", owner, repo: name, private: true, token });
  autoUpdater.checkForUpdates().catch(() => {}); // reported by the "error" event
});
ipcMain.on("install-update", () => autoUpdater.quitAndInstall(true, true));

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, "icon.png")).resize({ width: 16, height: 16 }));
  const menu = () =>
    Menu.buildFromTemplate([
      { label: "Show / hide Xepher", click: () => (win.isVisible() ? win.hide() : win.show()) },
      {
        label: "Start with Windows",
        type: "checkbox",
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
      },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]);
  tray.setToolTip("Xepher");
  tray.setContextMenu(menu());
  tray.on("click", () => win.show());
}

app.whenReady().then(() => {
  // First run: start with Windows, since Xepher is meant to always be there.
  const firstRun = path.join(app.getPath("userData"), "first-run-done");
  if (!fs.existsSync(firstRun)) {
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });
    fs.mkdirSync(path.dirname(firstRun), { recursive: true });
    fs.writeFileSync(firstRun, "");
  }
  createWindow();
  createTray();
  globalShortcut.register("CommandOrControl+Shift+X", () => {
    win.show();
    win.webContents.send("hotkey");
  });
});

app.on("will-quit", () => globalShortcut.unregisterAll());
