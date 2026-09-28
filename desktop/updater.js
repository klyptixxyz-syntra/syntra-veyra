"use strict";

const { autoUpdater } = require("electron-updater");

function setupUpdater(send) {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => send({ type:"update-checking" }));
  autoUpdater.on("update-available", info => send({ type:"update-available", version:info.version }));
  autoUpdater.on("update-not-available", () => send({ type:"update-none" }));
  autoUpdater.on("download-progress", p => send({
    type:"update-progress",
    percent:p.percent,
    transferred:p.transferred,
    total:p.total
  }));
  autoUpdater.on("update-downloaded", info => send({ type:"update-ready", version:info.version }));
  autoUpdater.on("error", error => send({ type:"update-error", error:error.message }));

  return {
    check() {
      if (process.env.NODE_ENV === "development") return;
      autoUpdater.checkForUpdates().catch(()=>{});
    },
    install() {
      autoUpdater.quitAndInstall(false, true);
    }
  };
}

module.exports = { setupUpdater };
