import electron from "electron";

const { contextBridge, ipcRenderer } = electron;

contextBridge.exposeInMainWorld("crossplaySolver", {
  health: () => ipcRenderer.invoke("solver:health"),
  solve: (payload) => ipcRenderer.invoke("solver:solve", payload)
});
