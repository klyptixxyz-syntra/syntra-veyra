"use strict";

const MINDS = {
  general: {
    id: "general",
    name: "General Mind",
    role: "Natural conversation, explanations, writing, instruction following and final answer synthesis.",
    trainMinutes: 10,
    profile: { dModel: 96, heads: 4, layers: 3, dFF: 384, contextSize: 112, learningRate: 0.00042 }
  },
  reasoning: {
    id: "reasoning",
    name: "Reasoning Mind",
    role: "Math, logic, planning, tradeoffs, decomposition and structured problem solving.",
    trainMinutes: 10,
    profile: { dModel: 96, heads: 4, layers: 3, dFF: 384, contextSize: 112, learningRate: 0.00042 }
  },
  builder: {
    id: "builder",
    name: "Builder Mind",
    role: "Coding, debugging, software architecture, websites, games and implementation work.",
    trainMinutes: 10,
    profile: { dModel: 112, heads: 4, layers: 4, dFF: 448, contextSize: 128, learningRate: 0.00036 }
  },
  context: {
    id: "context",
    name: "Context Mind",
    role: "Long conversations, project constraints, continuity, requirements and memory relevance.",
    trainMinutes: 10,
    profile: { dModel: 80, heads: 4, layers: 3, dFF: 320, contextSize: 144, learningRate: 0.00046 }
  },
  brainstem: {
    id: "brainstem",
    name: "ARATIS Brainstem",
    role: "Integration, effort routing, Anti-Regrettable checks, adaptation signals, judging and repair decisions.",
    trainMinutes: 10,
    profile: { dModel: 112, heads: 4, layers: 4, dFF: 448, contextSize: 128, learningRate: 0.00034 }
  }
};

const MODELS = {
  neo: {
    id: "neo",
    name: "Veyra Neo",
    tagline: "Fast. Small. Efficient.",
    defaultEffort: "low",
    mindBudget: 2,
    maxTokens: 140
  },
  cipher: {
    id: "cipher",
    name: "Veyra Cipher",
    tagline: "Balanced intelligence for everyday work.",
    defaultEffort: "medium",
    mindBudget: 3,
    maxTokens: 220
  },
  vanta: {
    id: "vanta",
    name: "Veyra Vanta",
    tagline: "Built for serious projects.",
    defaultEffort: "high",
    mindBudget: 4,
    maxTokens: 300
  },
  zenith: {
    id: "zenith",
    name: "Veyra Zenith",
    tagline: "Maximum capability.",
    defaultEffort: "extra_high",
    mindBudget: 5,
    maxTokens: 420
  }
};

const EFFORTS = {
  low:        { id: "low",        name: "Low",        outcomes: 2,  repairPasses: 0, thinkingPasses: 1, mindBoost: 0 },
  medium:     { id: "medium",     name: "Medium",     outcomes: 4,  repairPasses: 1, thinkingPasses: 1, mindBoost: 0 },
  high:       { id: "high",       name: "High",       outcomes: 6,  repairPasses: 1, thinkingPasses: 2, mindBoost: 1 },
  extra_high: { id: "extra_high", name: "Extra High", outcomes: 8,  repairPasses: 2, thinkingPasses: 2, mindBoost: 1 },
  ultra:      { id: "ultra",      name: "Ultra",      outcomes: 12, repairPasses: 2, thinkingPasses: 3, mindBoost: 2 },
  overdrive:  { id: "overdrive",  name: "Overdrive",  outcomes: 18, repairPasses: 3, thinkingPasses: 3, mindBoost: 2 }
};

function model(id) {
  return MODELS[String(id || "").toLowerCase()] || MODELS.cipher;
}

function effort(id, modelId) {
  const key = String(id || "").toLowerCase().replace(/\s+/g, "_");
  return EFFORTS[key] || EFFORTS[model(modelId).defaultEffort];
}

module.exports = { MINDS, MODELS, EFFORTS, model, effort };
