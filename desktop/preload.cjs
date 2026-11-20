// The window.xepherDesktop API the web UI uses (see web/src/bridge.ts).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("xepherDesktop", {
  setExpanded: (expanded) => ipcRenderer.send("set-expanded", !!expanded),
  moveBy: (dx, dy) => ipcRenderer.send("move-by", Number(dx), Number(dy)),
  onHotkey: (cb) => ipcRenderer.on("hotkey", () => cb()),
  checkUpdates: (repo, token) => ipcRenderer.send("check-updates", String(repo), String(token)),
  onUpdateReady: (cb) => ipcRenderer.on("update-ready", (_e, version) => cb(version)),
  installUpdate: () => ipcRenderer.send("install-update"),
});
