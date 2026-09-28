"use strict";

const fs = require("fs");
const path = require("path");
const paths = require("./paths");
const registry = require("./registry");
const { SubwordTokenizer } = require("./subword_tokenizer");
const { CausalTransformerLM } = require("./transformer");

class Mind {
  constructor(id) {
    this.id = id;
    this.info = registry.MINDS[id];
    this.model = null;
    this.tokenizer = null;
    this.ready = false;
    this.load();
  }

  mindDir() {
    return paths.file("minds", this.id);
  }

  load() {
    const modelFile = path.join(this.mindDir(), "model.json");
    const tokFile = paths.file("minds", "shared-tokenizer.json");

    if (!fs.existsSync(modelFile) || !fs.existsSync(tokFile)) return false;

    try {
      const saved = JSON.parse(fs.readFileSync(modelFile, "utf8"));
      this.tokenizer = SubwordTokenizer.fromJSON(JSON.parse(fs.readFileSync(tokFile, "utf8")));
      this.model = new CausalTransformerLM(saved.config);
      this.model.load(this.mindDir());
      this.ready = true;
      return true;
    } catch {
      this.ready = false;
      return false;
    }
  }

  generate(prompt, options = {}) {
    if (!this.ready) return { text: "", ready: false, quality: 0 };

    const result = this.model.generate(this.tokenizer, prompt, {
      maxTokens: options.maxTokens || 180,
      temperature: options.temperature ?? .68,
      topK: options.topK ?? 42,
      topP: options.topP ?? .92,
      repetitionPenalty: options.repetitionPenalty ?? .84
    });

    return { ...result, ready: true };
  }

  status() {
    return {
      id: this.id,
      name: this.info.name,
      role: this.info.role,
      ready: this.ready,
      parameters: this.ready ? this.model.parameterCount() : 0,
      steps: this.ready ? this.model.steps : 0
    };
  }
}

class MindPool {
  constructor() {
    paths.ensure();
    this.minds = {};
    for (const id of Object.keys(registry.MINDS)) this.minds[id] = new Mind(id);
  }

  get(id) { return this.minds[id]; }
  ready(id) { return !!this.minds[id]?.ready; }
  statuses() { return Object.values(this.minds).map(x => x.status()); }
  reload() {
    for (const id of Object.keys(this.minds)) this.minds[id] = new Mind(id);
  }
}

module.exports = { Mind, MindPool };
