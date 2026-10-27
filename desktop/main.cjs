// Xepher for Windows: a transparent, always-on-top window holding the robot.
const { app, BrowserWindow, ipcMain, screen, shell, Tray, Menu, globalShortcut, nativeImage } = require("electron");
const { execFile } = require("child_process");
const http = require("http");
const os = require("os");
const path = require("path");
const fs = require("fs");
const hooks = require("./hooks.cjs");
const { hookStatus } = require("./claude-events.cjs");
const { runJob } = require("./runner.cjs");
const { autoUpdater } = require("electron-updater");

const BUBBLE = { width: 150, height: 150 };
const PANEL = { width: 390, height: 600 };
const MARGIN = 16;
const CLAUDE_SETTINGS = path.join(os.homedir(), ".claude", "settings.json");
const PROJECTS_DIR = path.join(os.homedir(), "Xepher");

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
  const size = expanded ? PANEL : BUBBLE;
  const [x, y] = win.getPosition();
  const [w, h] = win.getSize();
  const area = screen.getDisplayNearestPoint({ x, y }).workArea;
  const nx = Math.min(Math.max(x + w - size.width, area.x), area.x + area.width - size.width);
  const ny = Math.min(Math.max(y + h - size.height, area.y), area.y + area.height - size.height);
  win.setBounds({ x: nx, y: ny, ...size });
  if (expanded) win.focus();
});

ipcMain.on("move-by", (_e, dx, dy) => {
  const [x, y] = win.getPosition();
  win.setPosition(Math.round(x + dx), Math.round(y + dy));
});

// Windows voice typing (Win+H) types into whatever box has focus: our input.
ipcMain.on("dictate", () => {
  win.focus();
  const ps = `Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte b, byte s, uint f, UIntPtr e);' -Name K -Namespace W
[W.K]::keybd_event(0x5B,0,0,[UIntPtr]::Zero); [W.K]::keybd_event(0x48,0,0,[UIntPtr]::Zero)
[W.K]::keybd_event(0x48,0,2,[UIntPtr]::Zero); [W.K]::keybd_event(0x5B,0,2,[UIntPtr]::Zero)`;
  execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(ps, "utf16le").toString("base64")], { windowsHide: true });
});

// claude.ai project links open in their own floating window that remembers the login.
ipcMain.on("open-link", (_e, url) => {
  let u;
  try {
    u = new URL(url);
  } catch {
    return;
  }
  if (u.protocol !== "https:") return;
  if (u.hostname !== "claude.ai" && !u.hostname.endsWith(".claude.ai")) return shell.openExternal(url);
  const area = screen.getPrimaryDisplay().workArea;
  const w = new BrowserWindow({
    width: 480,
    height: Math.min(820, area.height - 40),
    alwaysOnTop: true,
    autoHideMenuBar: true,
    title: "Claude",
    webPreferences: { partition: "persist:claude" },
  });
  // A plain Chrome user agent, so sign-in pages treat it like a normal browser.
  w.webContents.setUserAgent(w.webContents.getUserAgent().replace(/\s(Electron|xepher)\/\S+/gi, ""));
  w.webContents.setWindowOpenHandler(({ url: next }) => {
    shell.openExternal(next);
    return { action: "deny" };
  });
  w.loadURL(url);
});

ipcMain.handle("has-claude", () =>
  new Promise((resolve) => execFile("claude", ["--version"], { shell: process.platform === "win32", timeout: 15000, windowsHide: true }, (err) => resolve(!err))),
);

ipcMain.handle("run-local", (e, id, job) =>
  runJob(job, (ev) => e.sender.send(`job-${id}`, ev), { projectsDir: PROJECTS_DIR }),
);

ipcMain.handle("hooks-installed", () => {
  try {
    return hooks.installed(hooks.readSettings(CLAUDE_SETTINGS));
  } catch {
    return false;
  }
});
ipcMain.handle("install-hooks", () => hooks.install(CLAUDE_SETTINGS));

// Updates come from this repo's GitHub releases. The repo is private, so the
// renderer hands over the GitHub token it already keeps for everything else.
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on("update-downloaded", (info) => win?.webContents.send("update-ready", info.version));
autoUpdater.on("error", (e) => console.error("update:", e.message));
ipcMain.on("check-updates", (_e, repo, token) => {
  if (!app.isPackaged || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) return;
  const [owner, name] = repo.split("/");
  autoUpdater.setFeedURL({ provider: "github", owner, repo: name, private: true, token });
  autoUpdater.checkForUpdates().catch((e) => console.error("update:", e.message));
});
ipcMain.on("install-update", () => autoUpdater.quitAndInstall(true, true));

// Claude Code hooks POST their event JSON here (see hooks.cjs).
function startHookServer() {
  http
    .createServer((req, res) => {
      let body = "";
      req.on("data", (d) => {
        body += d;
        if (body.length > 1e6) req.destroy();
      });
      req.on("end", () => {
        res.end("ok");
        try {
          const status = hookStatus(JSON.parse(body));
          if (status) win?.webContents.send("hook-status", status);
        } catch {}
      });
    })
    .on("error", () => {}) // port taken: live terminal status just stays off
    .listen(hooks.PORT, "127.0.0.1");
}

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
      { label: "Open projects folder", click: () => shell.openPath(PROJECTS_DIR) },
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
  startHookServer();
  globalShortcut.register("CommandOrControl+Shift+X", () => {
    win.show();
    win.webContents.send("hotkey");
  });
});

app.on("will-quit", () => globalShortcut.unregisterAll());
