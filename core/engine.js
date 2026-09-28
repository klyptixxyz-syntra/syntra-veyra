"use strict";

const registry = require("./registry");
const aratis = require("./aratis");
const memory = require("./memory");
const solvers = require("./solvers");
const knowledge = require("./knowledge");
const { MindPool } = require("./minds");

function quality(text) {
  const clean = String(text || "").trim();
  if (!clean) return 0;
  const words = clean.match(/[A-Za-z0-9_$]+/g) || [];
  if (words.length < 2) return .15;
  const diversity = new Set(words.map(x => x.toLowerCase())).size / words.length;
  let score = 1;
  if (words.length > 15 && diversity < .34) score -= .45;
  if ((clean.match(/\b(User|Assistant)\b/gi) || []).length > 2) score -= .35;
  if (/([:;,.!?])\1{2,}/.test(clean)) score -= .25;
  return Math.max(0, Math.min(1, score));
}

class VeyraEngine {
  constructor() {
    this.pool = new MindPool();
  }

  status() {
    const minds = this.pool.statuses();
    return {
      ready: minds.every(x => x.ready),
      minds,
      memory: memory.stats(),
      models: registry.MODELS,
      efforts: registry.EFFORTS
    };
  }

  reload() {
    this.pool.reload();
    return this.status();
  }

  async answer(input, options = {}) {
    const prompt = String(input || "").trim();
    if (!prompt) return { text: "Message is empty.", mode: "error" };

    const model = registry.model(options.model);
    const plan = aratis.integrationPlan(prompt, {
      model: model.id,
      effort: options.effort
    });

    // Exact helpers beat probabilistic guessing.
    const exact = solvers.direct(prompt);
    if (exact) {
      let text = exact.type === "math"
        ? exact.text
        : `\`\`\`javascript\n${exact.text}\n\`\`\``;

      memory.add(prompt, text, { mode: exact.type, model: model.id, effort: plan.effort });
      return {
        text,
        mode: exact.type,
        aratis: { ...plan, regretRisk: 0, checkedOutcomes: Math.min(plan.outcomeBudget, 2) }
      };
    }

    let research = knowledge.localSearch(prompt, 3);
    if (!research.length && plan.task === "research") {
      try { research = await knowledge.wikipedia(prompt, 2); } catch {}
    }

    const memoryContext = memory.context(prompt);
    const researchContext = research.map(x => x.text).join("\n\n").slice(0, 16000);

    const adaptRules = [];
    if (plan.reactions.signals.includes("prefer_action")) adaptRules.push("Be action-first and avoid unnecessary explanation.");
    if (plan.reactions.signals.includes("recent_failure")) adaptRules.push("Do not repeat the recently failed approach. Verify the proposed fix more carefully.");
    if (plan.reactions.signals.includes("wants_explanation")) adaptRules.push("Explain the important reasoning clearly.");

    const baseContext = [
      "You are Veyra, an AI by Syntra.",
      "Answer the user's current request directly.",
      "Do not invent current facts when reliable reference context is available.",
      adaptRules.join(" "),
      memoryContext ? `<MEMORY>\n${memoryContext}` : "",
      researchContext ? `<REFERENCE>\n${researchContext}` : "",
      `<USER>\n${prompt}\n<ASSISTANT>`
    ].filter(Boolean).join("\n\n");

    const mindOutputs = [];

    for (const id of plan.selectedMinds) {
      const mind = this.pool.get(id);
      if (!mind?.ready) continue;

      let instruction = "";
      if (id === "builder") instruction = "Focus on correct implementation, debugging, edge cases, and producing usable code/results.";
      if (id === "reasoning") instruction = "Focus on logic, decomposition, calculations, assumptions, and tradeoffs.";
      if (id === "context") instruction = "Focus on the user's constraints, prior project context, continuity, and avoiding requirement drift.";
      if (id === "general") instruction = "Focus on clarity, usefulness, communication, and a natural final answer.";
      if (id === "brainstem") instruction = `Act as ARATIS Brainstem. Task=${plan.task}. Complexity=${plan.complexity}. Effort=${plan.effortName}. Identify likely regret/failure risks and the best response strategy.`;

      const result = mind.generate(
        `${instruction}\n\n${baseContext}`,
        {
          maxTokens: id === "brainstem" ? 130 : Math.min(model.maxTokens, 260),
          temperature: id === "brainstem" ? .55 : .68
        }
      );

      if (result.text) {
        mindOutputs.push({ id, text: result.text, quality: quality(result.text) });
      }
    }

    if (!mindOutputs.length) {
      const fallback = research[0]?.text ||
        "Veyra's five minds are not trained yet. Finish first-run setup, then try again.";
      return { text: fallback, mode: research.length ? "research" : "not-trained", aratis: plan };
    }

    // Choose best non-brainstem draft, then use brainstem as critic.
    let candidates = mindOutputs.filter(x => x.id !== "brainstem");
    if (!candidates.length) candidates = mindOutputs;
    candidates.sort((a, b) => b.quality - a.quality);

    let draft = candidates[0].text;
    let check = aratis.check(prompt, draft, plan);

    const brainstem = this.pool.get("brainstem");

    for (let pass = 0; pass < plan.repairPasses && check.failures.length && brainstem?.ready; pass++) {
      const repair = aratis.repairPrompt(check);
      const improved = brainstem.generate(
        `You are the ARATIS repair brainstem.\n${repair}\n\nUser request:\n${prompt}\n\nDraft:\n${draft}\n\nReturn only a repaired final answer.`,
        { maxTokens: model.maxTokens, temperature: .48, topP: .88 }
      );

      if (improved.text && quality(improved.text) >= quality(draft) * .85) {
        draft = improved.text;
      }

      check = aratis.check(prompt, draft, plan);
    }

    // Second Anti-Regrettable pass.
    if (plan.stages.secondAntiRegret) {
      check = aratis.check(prompt, draft, plan);
    }

    memory.add(prompt, draft, {
      mode: "aratis-multi-mind",
      model: model.id,
      effort: plan.effort,
      task: plan.task,
      regretRisk: check.regretRisk
    });

    return {
      text: draft,
      mode: "aratis-multi-mind",
      model: model.id,
      effort: plan.effort,
      aratis: {
        ...plan,
        regretRisk: check.regretRisk,
        checkedOutcomes: check.tested.length,
        repairs: Math.min(plan.repairPasses, check.failures.length ? plan.repairPasses : 0),
        activeMinds: mindOutputs.map(x => x.id)
      }
    };
  }
}

module.exports = { VeyraEngine };
