"use strict";

const fs = require("fs");
const path = require("path");
const { tf } = require("../core/tf_backend");
const { SubwordTokenizer } = require("../core/subword_tokenizer");
const { CausalTransformerLM } = require("../core/transformer");
const registry = require("../core/registry");
const paths = require("../core/paths");

const mindId = process.argv[2];
const info = registry.MINDS[mindId];
if (!info) throw new Error(`Unknown mind: ${mindId}`);

paths.ensure();

const packagedRoot = process.env.VEYRA_APP_ROOT || path.join(__dirname, "..");
const seedDir = path.join(packagedRoot, "seed", "data");
const tokenizerFile = paths.file("minds", "shared-tokenizer.json");
const mindDir = paths.file("minds", mindId);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(txt|md|js|html|css|json)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

const corpus = walk(seedDir).map(file => {
  try { return fs.readFileSync(file, "utf8"); } catch { return ""; }
}).filter(Boolean);

const aratisCorpus = `
Syntra Veyra ARATIS.
ARATIS means Anti Regrettable Adapt Thinking Integration System.
Anti-Regrettable predicts multiple likely failure situations before sending important work.
Adapt inspects the user's recent reactions and adjusts how work is done.
Thinking rebuilds or improves the answer after the earlier checks.
Integration decides which stages and minds are worth using so simple prompts are not overthought.
The ARATIS Brainstem routes work and judges likely regret.
`;
if (mindId === "brainstem") corpus.push(aratisCorpus.repeat(80));

let tokenizer;
if (fs.existsSync(tokenizerFile)) {
  tokenizer = SubwordTokenizer.fromJSON(JSON.parse(fs.readFileSync(tokenizerFile, "utf8")));
} else {
  tokenizer = new SubwordTokenizer();
  tokenizer.build(corpus, 6000);
  fs.writeFileSync(tokenizerFile, JSON.stringify(tokenizer.toJSON()), "utf8");
}

const docs = corpus.map(text => tokenizer.encode(`<DOC>\n${text}`, { bos: true, eos: true })).filter(x => x.length >= 12);
const p = info.profile;

const model = new CausalTransformerLM({
  vocabSize: tokenizer.idToToken.length,
  contextSize: p.contextSize,
  dModel: p.dModel,
  heads: p.heads,
  layers: p.layers,
  dFF: p.dFF,
  learningRate: p.learningRate,
  seed: 1300 + Object.keys(registry.MINDS).indexOf(mindId)
});

fs.mkdirSync(mindDir, { recursive: true });
try { model.load(mindDir); } catch {}

const optimizer = tf.train.adam(p.learningRate);
const minimumMs = Math.max(10, info.trainMinutes) * 60_000;
const start = Date.now();
const deadline = start + minimumMs;
let lastSave = 0;
let lastReport = 0;

function batch() {
  const doc = docs[Math.floor(Math.random() * docs.length)];
  const c = p.contextSize;
  let seq;
  if (doc.length <= c + 1) seq = [...doc, ...new Array(c + 1 - doc.length).fill(0)];
  else {
    const start = Math.floor(Math.random() * Math.max(1, doc.length - c - 1));
    seq = doc.slice(start, start + c + 1);
  }

  return {
    input: tf.tensor2d([seq.slice(0, c)], [1, c], "int32"),
    target: tf.tensor2d([seq.slice(1, c + 1)], [1, c], "int32")
  };
}

async function main() {
  process.send?.({ type: "start", mind: mindId, name: info.name });
  while (Date.now() < deadline) {
    const b = batch();
    let loss;
    try { loss = model.trainBatch(b.input, b.target, optimizer); }
    finally { b.input.dispose(); b.target.dispose(); }

    const now = Date.now();
    if (now - lastReport >= 2500) {
      const progress = Math.min(1, (now - start) / minimumMs);
      process.send?.({ type: "progress", mind: mindId, progress, loss, steps: model.steps });
      lastReport = now;
    }

    if (now - lastSave >= 60_000) {
      await model.save(mindDir, { mindId, savedAt: new Date().toISOString() });
      lastSave = now;
    }
  }

  await model.save(mindDir, { mindId, savedAt: new Date().toISOString(), trainedMinutes: minimumMs / 60000 });
  process.send?.({ type: "done", mind: mindId, steps: model.steps });
  model.dispose();
  if (typeof optimizer.dispose === "function") optimizer.dispose();
}

main().catch(error => {
  process.send?.({ type: "error", mind: mindId, error: error.message });
  process.exit(1);
});
