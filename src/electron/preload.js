import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("crossplaySolver", {
  health: () => ipcRenderer.invoke("solver:health"),
  solve: (payload) => ipcRenderer.invoke("solver:solve", payload)
});
