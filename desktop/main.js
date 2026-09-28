"use strict";

const path = require("path");
const { app, BrowserWindow, ipcMain, shell } = require("electron");

app.setName("Veyra");

let mainWindow;
let engine;
let updater;

function send(message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("veyra:event", message);
  }
}

app.whenReady().then(async () => {
  const userData = path.join(app.getPath("appData"), "Syntra", "Veyra");
  app.setPath("userData", userData);

  process.env.VEYRA_DATA_ROOT = userData;
  process.env.VEYRA_APP_ROOT = path.join(__dirname, "..");

  const paths = require("../core/paths");
  paths.ensure();

  const setup = require("./setup_manager");
  const { VeyraEngine } = require("../core/engine");
  const memory = require("../core/memory");
  const { setupUpdater } = require("./updater");

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 650,
    backgroundColor: "#f6f6f4",
    title: "Veyra",
    icon: path.join(__dirname, "..", "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  await mainWindow.loadFile(path.join(__dirname, "..", "ui", "index.html"));

  updater = setupUpdater(send);

  ipcMain.handle("veyra:status", async () => {
    if (!setup.isInstalled()) {
      return {
        installed:false,
        setup:setup.readState()
      };
    }

    if (!engine) engine = new VeyraEngine();

    return {
      installed:true,
      setup:setup.readState(),
      engine:engine.status(),
      version:app.getVersion()
    };
  });

  ipcMain.handle("veyra:start-setup", async () => {
    setup.startSetup(message => {
      send(message);
      if (message.type === "setup-complete") {
        engine = new VeyraEngine();
        setTimeout(() => updater.check(), 5000);
      }
    });
    return { ok:true };
  });

  ipcMain.handle("veyra:generate", async (_, payload) => {
    if (!setup.isInstalled()) throw new Error("Finish first-run setup first.");
    if (!engine) engine = new VeyraEngine();
    return engine.answer(payload.prompt, {
      model:payload.model,
      effort:payload.effort
    });
  });

  ipcMain.handle("veyra:clear-memory", async () => {
    memory.clear();
    return { ok:true };
  });

  ipcMain.handle("veyra:reload", async () => {
    if (!engine) engine = new VeyraEngine();
    return engine.reload();
  });

  ipcMain.handle("veyra:check-updates", async () => {
    updater.check();
    return { ok:true };
  });

  ipcMain.handle("veyra:install-update", async () => {
    updater.install();
    return { ok:true };
  });

  ipcMain.handle("veyra:open-data", async () => {
    await shell.openPath(userData);
    return { ok:true };
  });

  if (setup.isInstalled()) {
    engine = new VeyraEngine();
    setTimeout(() => updater.check(), 5000);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
