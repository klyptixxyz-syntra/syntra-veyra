"use strict";

const registry = require("./registry");
const memory = require("./memory");
const solvers = require("./solvers");

const GREETING = /^(hi|hello|hey|yo|sup|thanks|thank you|ok|okay|cool|nice|bye|goodbye)[.!?\s]*$/i;

function classify(input) {
  const t = String(input).trim();
  if (GREETING.test(t)) return "social";
  if (/\b(code|javascript|html|css|node|function|bug|error|debug|game|website|script|api|database)\b/i.test(t)) return "coding";
  if (/\d/.test(t) && /\b(calculate|percent|percentage|how many|what is|solve|times|divide|plus|minus)\b/i.test(t)) return "math";
  if (/\b(plan|compare|strategy|architecture|design|business|tradeoff)\b/i.test(t)) return "planning";
  if (/\b(latest|current|today|research|source|who is|what happened)\b/i.test(t)) return "research";
  if (t.length < 24) return "simple";
  return "general";
}

function integrationPlan(input, options = {}) {
  const model = registry.model(options.model);
  const effort = registry.effort(options.effort, model.id);
  const task = classify(input);
  const reactions = memory.reactionSignals();

  let complexity = 1;
  if (["coding", "planning", "research"].includes(task)) complexity += 2;
  if (task === "math") complexity += 1;
  if (String(input).length > 500) complexity += 1;
  if (/\b(full|complete|entire|all|without breaking|production|large|complex)\b/i.test(input)) complexity += 1;
  complexity = Math.min(5, complexity);

  const trivial = task === "social" || (task === "simple" && String(input).length < 18);
  const antiRegret = !trivial && complexity >= 2;
  const adaptation = reactions.recent.length > 0;
  const thinking = !trivial;
  const secondAntiRegret = antiRegret && effort.id !== "low";

  let outcomeBudget = antiRegret ? effort.outcomes : 0;
  if (task === "math" && solvers.math(input)) outcomeBudget = Math.min(2, outcomeBudget);

  const order =
    task === "coding" ? ["builder", "reasoning", "context", "general", "brainstem"] :
    task === "math" ? ["reasoning", "general", "brainstem", "context", "builder"] :
    task === "planning" ? ["reasoning", "context", "builder", "general", "brainstem"] :
    task === "research" ? ["context", "reasoning", "general", "brainstem", "builder"] :
    ["general", "context", "reasoning", "brainstem", "builder"];

  const budget = Math.min(5, model.mindBudget + effort.mindBoost);
  const selected = order.slice(0, budget);
  if (!selected.includes("brainstem")) {
    if (selected.length >= budget) selected[selected.length - 1] = "brainstem";
    else selected.push("brainstem");
  }

  return {
    model: model.id,
    modelName: model.name,
    effort: effort.id,
    effortName: effort.name,
    task,
    complexity,
    outcomeBudget,
    repairPasses: antiRegret ? effort.repairPasses : 0,
    thinkingPasses: thinking ? effort.thinkingPasses : 0,
    selectedMinds: selected,
    reactions,
    stages: { antiRegret, adaptation, thinking, secondAntiRegret }
  };
}

function scenarios(input, answer, plan) {
  const all = [
    ["coverage", "The answer completes the user's actual request.", answer.trim().length > 2],
    ["regression", "The solution is unlikely to destroy unrelated existing work.", !/\b(delete everything|wipe everything|reset everything)\b/i.test(answer)],
    ["unfinished", "The answer contains no obvious TODO or placeholder.", !/\b(TODO|placeholder|implement later|coming soon)\b/i.test(answer)],
    ["reaction", "The answer does not repeat a recently rejected response style.", !(plan.reactions.signals.includes("prefer_action") && answer.length > 5000)],
    ["syntax", "Generated JavaScript code passes a syntax check.", solvers.syntax(answer).ok],
    ["directness", "The useful result is easy to find.", answer.trim().length > 0],
    ["state", "The answer does not obviously destroy save/state data.", !/\b(clear all data|delete save|drop table|format drive)\b/i.test(answer)],
    ["performance", "The answer avoids an obvious infinite-loop performance mistake.", !/\bwhile\s*\(\s*true\s*\)/i.test(answer)],
    ["repeat", "The answer avoids a known recent failure pattern.", !(plan.reactions.signals.includes("recent_failure") && /\bmaybe|you could try\b/i.test(answer))],
    ["compatibility", "The answer considers compatibility when relevant.", true],
    ["edge", "The answer considers obvious edge cases when relevant.", true],
    ["uncertainty", "The answer avoids pretending uncertain information is guaranteed.", true],
    ["security", "The answer avoids obvious unsafe handling of secrets/input.", true],
    ["testability", "The result can be checked after applying it.", true],
    ["scope", "The answer does not silently change the requested direction.", true],
    ["overthinking", "The answer depth is appropriate for the prompt.", !(plan.task === "social" && answer.length > 250)],
    ["memory", "The answer respects relevant prior project context.", true],
    ["final", "No obvious reason remains to regret sending the answer.", true]
  ];

  return all.slice(0, plan.outcomeBudget).map(([id, label, pass]) => ({ id, label, pass }));
}

function check(input, answer, plan) {
  const tested = scenarios(input, answer, plan);
  const failures = tested.filter(x => !x.pass);
  const risk = tested.length ? Math.round(failures.length / tested.length * 100) : 0;
  return { tested, failures, regretRisk: risk, pass: failures.length === 0 };
}

function repairPrompt(checkResult) {
  if (!checkResult.failures.length) return "";
  return "Repair these problems before sending:\n" +
    checkResult.failures.map(x => `- ${x.label}`).join("\n");
}

module.exports = { classify, integrationPlan, check, repairPrompt };
