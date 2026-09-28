"use strict";

const fs = require("fs");
const paths = require("./paths");

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJSON(file, value) {
  const temp = file + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(temp, file);
}

const STOP = new Set(
  "the a an and or to of in on at for with is are was were be been being this that it i you we they he she my your our their do does did have has had can could should would will just very from as by about into over after before not no yes".split(" ")
);

function keywords(text) {
  return [...new Set(
    String(text)
      .toLowerCase()
      .match(/[a-z0-9_$-]{3,}/g) || []
  )]
    .filter(x => !STOP.has(x))
    .slice(0, 32);
}

function files() {
  paths.ensure();
  return {
    turns: paths.file("memory", "turns.json"),
    profile: paths.file("memory", "profile.json")
  };
}

function turns() {
  return readJSON(files().turns, []);
}

function add(user, assistant, metadata = {}) {
  const list = turns();
  list.push({
    id: Date.now().toString(36),
    time: new Date().toISOString(),
    user: String(user),
    assistant: String(assistant),
    keywords: keywords(`${user} ${assistant}`),
    metadata
  });

  // Keep full recent history reasonably bounded on disk.
  if (list.length > 3000) list.splice(0, list.length - 3000);
  writeJSON(files().turns, list);
}

function recent(n = 8) {
  return turns().slice(-n);
}

function relevant(query, n = 8) {
  const q = new Set(keywords(query));
  if (!q.size) return [];

  return turns()
    .map((turn, index, all) => {
      const overlap = turn.keywords.filter(k => q.has(k)).length;
      const recency = index / Math.max(1, all.length) * 0.08;
      return { turn, score: overlap + recency };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(x => x.turn);
}

function context(query) {
  const r = relevant(query, 6);
  const recentTurns = recent(8);
  const seen = new Set();
  const lines = [];

  for (const turn of [...r, ...recentTurns]) {
    if (seen.has(turn.id)) continue;
    seen.add(turn.id);
    lines.push(`User: ${turn.user}\nAssistant: ${turn.assistant}`);
  }

  return lines.join("\n\n").slice(-12000);
}

function reactionSignals() {
  const last = recent(3);
  const joined = last.map(x => x.user).join("\n").toLowerCase();
  const signals = [];

  if (/\b(still|again|broken|not working|doesn't work|doesnt work|wrong|worse|bug|glitch)\b/.test(joined)) {
    signals.push("recent_failure");
  }
  if (/\b(stop talking|less talking|just do it|faster|too much|shorter)\b/.test(joined)) {
    signals.push("prefer_action");
  }
  if (/\b(explain|why|teach|more detail|how does)\b/.test(joined)) {
    signals.push("wants_explanation");
  }
  if (/\b(good|nice|perfect|works|worked|thanks|thank you)\b/.test(joined)) {
    signals.push("positive_reaction");
  }

  return { recent: last, signals };
}

function stats() {
  const list = turns();
  return { totalTurns: list.length };
}

function clear() {
  writeJSON(files().turns, []);
}

module.exports = { add, recent, relevant, context, reactionSignals, stats, clear };
