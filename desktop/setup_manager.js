"use strict";

const fs = require("fs");
const path = require("path");
const { fork } = require("child_process");
const paths = require("../core/paths");
const registry = require("../core/registry");

function stateFile() {
  return paths.file("settings", "install-state.json");
}

function readState() {
  try { return JSON.parse(fs.readFileSync(stateFile(),"utf8")); }
  catch {
    return {
      installed: false,
      version: 1,
      minds: {},
      aratisPassed: false,
      knowledgeReady: false
    };
  }
}

function writeState(value) {
  fs.writeFileSync(stateFile(), JSON.stringify(value, null, 2), "utf8");
}

function isInstalled() {
  const state = readState();
  return !!state.installed &&
    Object.keys(registry.MINDS).every(id => state.minds?.[id]?.done) &&
    state.aratisPassed;
}

function runARATISTests() {
  const { integrationPlan, check } = require("../core/aratis");

  const tests = [
    ["Hi", "Hi!", p => p.outcomeBudget === 0],
    ["What is 25% of 80?", "20", p => p.task === "math"],
    ["Fix this JavaScript game without breaking saves", "Here is a safe fix.", p => p.stages.antiRegret && p.selectedMinds.includes("brainstem")],
    ["Plan a large business system", "Plan", p => p.complexity >= 3]
  ];

  const results = tests.map(([input, answer, predicate]) => {
    const plan = integrationPlan(input, { model:"cipher", effort:"high" });
    const c = check(input, answer, plan);
    return { input, pass: !!predicate(plan) && Number.isFinite(c.regretRisk) };
  });

  return { pass: results.every(x => x.pass), results };
}

function startSetup(send) {
  paths.ensure();
  const state = readState();

  if (isInstalled()) {
    send({ type:"setup-complete", state });
    return;
  }

  const appRoot = path.join(__dirname, "..");
  const commonEnv = {
    ...process.env,
    VEYRA_DATA_ROOT: paths.dataRoot(),
    VEYRA_APP_ROOT: appRoot,
    ELECTRON_RUN_AS_NODE: "1"
  };

  const mindIds = Object.keys(registry.MINDS);
  const children = new Map();

  for (const id of mindIds) {
    state.minds[id] = state.minds[id] || { done:false, progress:0 };
    const child = fork(
      path.join(appRoot, "training", "train_mind.js"),
      [id],
      { env: commonEnv, silent:true }
    );

    children.set(id, child);

    child.on("message", message => {
      if (message.type === "progress") {
        state.minds[id] = {
          done:false,
          progress:message.progress,
          loss:message.loss,
          steps:message.steps
        };
        writeState(state);
        send({ type:"mind-progress", ...message });
      }

      if (message.type === "done") {
        state.minds[id] = { done:true, progress:1, steps:message.steps };
        writeState(state);
        send({ type:"mind-done", ...message });
        maybeFinish();
      }

      if (message.type === "error") {
        state.minds[id] = { done:false, progress:state.minds[id]?.progress || 0, error:message.error };
        writeState(state);
        send({ type:"mind-error", ...message });
      }
    });
  }

  const knowledge = fork(
    path.join(appRoot, "training", "turbo_knowledge.js"),
    [],
    { env: commonEnv, silent:true }
  );

  knowledge.on("message", message => {
    if (message.type === "knowledge-progress") send(message);
    if (message.type === "knowledge-done") {
      state.knowledgeReady = true;
      writeState(state);
      send(message);
    }
  });

  let finishing = false;
  function maybeFinish() {
    if (finishing) return;
    if (!mindIds.every(id => state.minds[id]?.done)) return;
    finishing = true;

    send({ type:"aratis-test-start" });
    const test = runARATISTests();
    state.aratisPassed = test.pass;
    state.aratisTest = test;
    state.installed = test.pass;
    state.completedAt = new Date().toISOString();
    writeState(state);

    if (test.pass) send({ type:"setup-complete", state });
    else send({ type:"setup-error", error:"ARATIS self-test did not pass.", state });
  }
}

module.exports = { readState, writeState, isInstalled, startSetup };
