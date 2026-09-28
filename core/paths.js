"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

function fallbackRoot() {
  return path.join(
    process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
    "Syntra",
    "Veyra"
  );
}

function dataRoot() {
  return process.env.VEYRA_DATA_ROOT || fallbackRoot();
}

function ensure() {
  const root = dataRoot();
  const dirs = [
    root,
    path.join(root, "minds"),
    path.join(root, "memory"),
    path.join(root, "knowledge"),
    path.join(root, "knowledge", "starter"),
    path.join(root, "settings"),
    path.join(root, "aratis"),
    path.join(root, "logs"),
    path.join(root, "cache")
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return root;
}

function file(...parts) {
  return path.join(dataRoot(), ...parts);
}

module.exports = { dataRoot, ensure, file };
