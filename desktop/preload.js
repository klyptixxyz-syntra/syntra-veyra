"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("veyra", {
  status: () => ipcRenderer.invoke("veyra:status"),
  startSetup: () => ipcRenderer.invoke("veyra:start-setup"),
  generate: payload => ipcRenderer.invoke("veyra:generate", payload),
  clearMemory: () => ipcRenderer.invoke("veyra:clear-memory"),
  reload: () => ipcRenderer.invoke("veyra:reload"),
  checkUpdates: () => ipcRenderer.invoke("veyra:check-updates"),
  installUpdate: () => ipcRenderer.invoke("veyra:install-update"),
  openData: () => ipcRenderer.invoke("veyra:open-data"),
  onEvent: callback => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("veyra:event", handler);
    return () => ipcRenderer.removeListener("veyra:event", handler);
  }
});
