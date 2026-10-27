// The window.xepherDesktop API the web UI uses (see web/src/bridge.ts).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("xepherDesktop", {
  setExpanded: (expanded) => ipcRenderer.send("set-expanded", !!expanded),
  moveBy: (dx, dy) => ipcRenderer.send("move-by", Number(dx), Number(dy)),
  dictate: () => ipcRenderer.send("dictate"),
  openLink: (url) => ipcRenderer.send("open-link", String(url)),
  hasClaude: () => ipcRenderer.invoke("has-claude"),
  runLocal: async (job, onEvent) => {
    const id = Math.random().toString(36).slice(2);
    const listener = (_e, ev) => onEvent(ev);
    ipcRenderer.on(`job-${id}`, listener);
    try {
      const { reply, sessionId } = await ipcRenderer.invoke("run-local", id, job);
      onEvent({ type: "reply", text: reply, sessionId });
    } catch (e) {
      // Electron wraps the message as "Error invoking remote method 'run-local': Error: …"
      throw new Error(String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ""));
    } finally {
      ipcRenderer.removeListener(`job-${id}`, listener);
    }
  },
  onHookStatus: (cb) => ipcRenderer.on("hook-status", (_e, s) => cb(s)),
  onHotkey: (cb) => ipcRenderer.on("hotkey", () => cb()),
  hooksInstalled: () => ipcRenderer.invoke("hooks-installed"),
  installHooks: () => ipcRenderer.invoke("install-hooks"),
});
