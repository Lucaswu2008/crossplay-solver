const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopShell", {
  setTheme: (theme) => ipcRenderer.invoke("ui:set-theme", theme),
  loadAppState: () => ipcRenderer.invoke("state:load"),
  saveAppState: (payload) => ipcRenderer.invoke("state:save", payload),
  saveAppStateSync: (payload) => ipcRenderer.sendSync("state:save-sync", payload),
  getAppStatePath: () => ipcRenderer.invoke("state:path")
});
