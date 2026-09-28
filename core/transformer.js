"use strict";

const fs = require("fs");
const path = require("path");
const {
  tf,
  backendKind
} = require("./tf_backend");

function gelu(x) {
  return tf.tidy(() => {
    const c =
      Math.sqrt(
        2 / Math.PI
      );

    const x3 =
      x.pow(
        tf.scalar(3)
      );

    const inner =
      x.add(
        x3.mul(0.044715)
      ).mul(c);

    return x.mul(0.5)
      .mul(
        tf.tanh(inner)
          .add(1)
      );
  });
}

class CausalTransformerLM {
  constructor(config) {
    this.config = {
      vocabSize:
        config.vocabSize,
      contextSize:
        config.contextSize || 128,
      dModel:
        config.dModel || 128,
      heads:
        config.heads || 4,
      layers:
        config.layers || 4,
      dFF:
        config.dFF || 512,
      learningRate:
        config.learningRate || 0.0003,
      seed:
        config.seed || 1337
    };

    if (
      this.config.dModel %
      this.config.heads !==
      0
    ) {
      throw new Error(
        "dModel must be divisible by heads."
      );
    }

    this.headDim =
      this.config.dModel /
      this.config.heads;

    this.vars =
      new Map();

    this.maskCache =
      new Map();

    this.steps = 0;

    this.createVariables();
  }

  variable(
    name,
    shape,
    stddev = 0.02,
    zero = false,
    one = false
  ) {
    let initial;

    if (zero) {
      initial =
        tf.zeros(shape);
    } else if (one) {
      initial =
        tf.ones(shape);
    } else {
      initial =
        tf.randomNormal(
          shape,
          0,
          stddev,
          "float32",
          this.config.seed +
          this.vars.size
        );
    }

    const variable =
      tf.variable(
        initial,
        true,
        name
      );

    initial.dispose();

    this.vars.set(
      name,
      variable
    );

    return variable;
  }

  createVariables() {
    const {
      vocabSize: V,
      contextSize: C,
      dModel: D,
      layers: L,
      dFF: F
    } = this.config;

    this.tokenEmbedding =
      this.variable(
        "token_embedding",
        [V, D],
        0.02
      );

    this.positionEmbedding =
      this.variable(
        "position_embedding",
        [C, D],
        0.02
      );

    for (
      let layer = 0;
      layer < L;
      layer++
    ) {
      const prefix =
        `layer_${layer}`;

      this.variable(
        `${prefix}_ln1_g`,
        [D],
        0,
        false,
        true
      );

      this.variable(
        `${prefix}_ln1_b`,
        [D],
        0,
        true
      );

      this.variable(
        `${prefix}_wq`,
        [D, D],
        0.02
      );

      this.variable(
        `${prefix}_wk`,
        [D, D],
        0.02
      );

      this.variable(
        `${prefix}_wv`,
        [D, D],
        0.02
      );

      this.variable(
        `${prefix}_wo`,
        [D, D],
        0.02
      );

      this.variable(
        `${prefix}_ln2_g`,
        [D],
        0,
        false,
        true
      );

      this.variable(
        `${prefix}_ln2_b`,
        [D],
        0,
        true
      );

      this.variable(
        `${prefix}_ff1`,
        [D, F],
        0.02
      );

      this.variable(
        `${prefix}_ff1_b`,
        [F],
        0,
        true
      );

      this.variable(
        `${prefix}_ff2`,
        [F, D],
        0.02
      );

      this.variable(
        `${prefix}_ff2_b`,
        [D],
        0,
        true
      );
    }

    this.finalLnG =
      this.variable(
        "final_ln_g",
        [D],
        0,
        false,
        true
      );

    this.finalLnB =
      this.variable(
        "final_ln_b",
        [D],
        0,
        true
      );

    this.outputBias =
      this.variable(
        "output_bias",
        [V],
        0,
        true
      );
  }

  get(name) {
    const value =
      this.vars.get(name);

    if (!value) {
      throw new Error(
        `Missing model variable: ${name}`
      );
    }

    return value;
  }

  variableList() {
    return [
      ...this.vars.values()
    ];
  }

  parameterCount() {
    let total = 0;

    for (const variable of this.vars.values()) {
      total +=
        variable.shape.reduce(
          (a, b) => a * b,
          1
        );
    }

    return total;
  }

  layerNorm(
    x,
    gamma,
    beta
  ) {
    return tf.tidy(() => {
      const {
        mean,
        variance
      } =
        tf.moments(
          x,
          -1,
          true
        );

      return x.sub(mean)
        .mul(
          tf.rsqrt(
            variance.add(1e-5)
          )
        )
        .mul(gamma)
        .add(beta);
    });
  }

  linear3d(
    x,
    weight,
    bias = null
  ) {
    return tf.tidy(() => {
      const [
        batch,
        time,
        inputDim
      ] = x.shape;

      const outputDim =
        weight.shape[1];

      let y =
        x.reshape(
          [
            batch * time,
            inputDim
          ]
        )
        .matMul(weight);

      if (bias) {
        y = y.add(bias);
      }

      return y.reshape(
        [
          batch,
          time,
          outputDim
        ]
      );
    });
  }

  causalMask(time) {
    if (
      this.maskCache.has(time)
    ) {
      return this.maskCache.get(time);
    }

    const data =
      new Float32Array(
        time * time
      );

    for (
      let row = 0;
      row < time;
      row++
    ) {
      for (
        let col = 0;
        col < time;
        col++
      ) {
        data[
          row * time + col
        ] =
          col <= row
            ? 0
            : -1e9;
      }
    }

    const mask =
      tf.keep(
        tf.tensor4d(
          data,
          [
            1,
            1,
            time,
            time
          ]
        )
      );

    this.maskCache.set(
      time,
      mask
    );

    return mask;
  }

  attention(
    x,
    layer
  ) {
    return tf.tidy(() => {
      const {
        dModel: D,
        heads: H
      } = this.config;

      const [
        batch,
        time
      ] = x.shape;

      const prefix =
        `layer_${layer}`;

      const q =
        this.linear3d(
          x,
          this.get(
            `${prefix}_wq`
          )
        );

      const k =
        this.linear3d(
          x,
          this.get(
            `${prefix}_wk`
          )
        );

      const v =
        this.linear3d(
          x,
          this.get(
            `${prefix}_wv`
          )
        );

      const reshapeHeads =
        tensor =>
          tensor
            .reshape(
              [
                batch,
                time,
                H,
                this.headDim
              ]
            )
            .transpose(
              [0, 2, 1, 3]
            );

      const qh =
        reshapeHeads(q);

      const kh =
        reshapeHeads(k);

      const vh =
        reshapeHeads(v);

      let scores =
        tf.matMul(
          qh,
          kh.transpose(
            [0, 1, 3, 2]
          )
        )
        .div(
          Math.sqrt(
            this.headDim
          )
        );

      scores =
        scores.add(
          this.causalMask(time)
        );

      const weights =
        tf.softmax(
          scores,
          -1
        );

      const context =
        tf.matMul(
          weights,
          vh
        )
        .transpose(
          [0, 2, 1, 3]
        )
        .reshape(
          [
            batch,
            time,
            D
          ]
        );

      return this.linear3d(
        context,
        this.get(
          `${prefix}_wo`
        )
      );
    });
  }

  forward(inputIds) {
    return tf.tidy(() => {
      const {
        contextSize: C,
        dModel: D,
        layers: L,
        vocabSize: V
      } = this.config;

      if (
        inputIds.rank !== 2
      ) {
        throw new Error(
          "inputIds must have shape [batch,time]."
        );
      }

      const [
        batch,
        time
      ] =
        inputIds.shape;

      if (time > C) {
        throw new Error(
          `Input length ${time} exceeds context size ${C}.`
        );
      }

      const token =
        tf.gather(
          this.tokenEmbedding,
          inputIds
        );

      const positions =
        tf.range(
          0,
          time,
          1,
          "int32"
        );

      const position =
        tf.gather(
          this.positionEmbedding,
          positions
        )
        .reshape(
          [1, time, D]
        );

      let x =
        token.add(position);

      for (
        let layer = 0;
        layer < L;
        layer++
      ) {
        const prefix =
          `layer_${layer}`;

        const norm1 =
          this.layerNorm(
            x,
            this.get(
              `${prefix}_ln1_g`
            ),
            this.get(
              `${prefix}_ln1_b`
            )
          );

        const attended =
          this.attention(
            norm1,
            layer
          );

        x =
          x.add(attended);

        const norm2 =
          this.layerNorm(
            x,
            this.get(
              `${prefix}_ln2_g`
            ),
            this.get(
              `${prefix}_ln2_b`
            )
          );

        const ff =
          this.linear3d(
            norm2,
            this.get(
              `${prefix}_ff1`
            ),
            this.get(
              `${prefix}_ff1_b`
            )
          );

        const activated =
          gelu(ff);

        const projected =
          this.linear3d(
            activated,
            this.get(
              `${prefix}_ff2`
            ),
            this.get(
              `${prefix}_ff2_b`
            )
          );

        x =
          x.add(projected);
      }

      x =
        this.layerNorm(
          x,
          this.finalLnG,
          this.finalLnB
        );

      const flat =
        x.reshape(
          [
            batch * time,
            D
          ]
        );

      const logits =
        flat
          .matMul(
            this.tokenEmbedding,
            false,
            true
          )
          .add(
            this.outputBias
          )
          .reshape(
            [
              batch,
              time,
              V
            ]
          );

      return logits;
    });
  }

  loss(
    inputIds,
    targetIds
  ) {
    return tf.tidy(() => {
      const V =
        this.config.vocabSize;

      const logits =
        this.forward(inputIds);

      const flatLogits =
        logits.reshape(
          [-1, V]
        );

      const labels =
        targetIds
          .reshape([-1]);

      const oneHot =
        tf.oneHot(
          labels,
          V
        );

      const logProb =
        tf.logSoftmax(
          flatLogits,
          -1
        );

      const perToken =
        oneHot
          .mul(logProb)
          .sum(-1)
          .neg();

      const mask =
        labels
          .notEqual(
            tf.scalar(
              0,
              "int32"
            )
          )
          .toFloat();

      const numerator =
        perToken
          .mul(mask)
          .sum();

      const denominator =
        mask
          .sum()
          .maximum(1);

      return numerator
        .div(denominator);
    });
  }

  trainBatch(
    inputIds,
    targetIds,
    optimizer
  ) {
    const loss =
      optimizer.minimize(
        () =>
          this.loss(
            inputIds,
            targetIds
          ),
        true,
        this.variableList()
      );

    const value =
      loss.dataSync()[0];

    loss.dispose();

    this.steps++;

    return value;
  }

  nextLogits(ids) {
    return tf.tidy(() => {
      const C =
        this.config.contextSize;

      const context =
        ids.slice(-C);

      const input =
        tf.tensor2d(
          [context],
          [
            1,
            context.length
          ],
          "int32"
        );

      const logits =
        this.forward(input);

      const last =
        logits
          .slice(
            [
              0,
              context.length - 1,
              0
            ],
            [
              1,
              1,
              this.config.vocabSize
            ]
          )
          .reshape(
            [
              this.config.vocabSize
            ]
          );

      return last.clone();
    });
  }

  sampleFromLogits(
    logits,
    generated,
    options = {}
  ) {
    const temperature =
      Math.max(
        0.05,
        Number(
          options.temperature ?? 0.72
        )
      );

    const topK =
      Math.max(
        1,
        Math.floor(
          Number(
            options.topK ?? 40
          )
        )
      );

    const topP =
      Math.max(
        0.05,
        Math.min(
          1,
          Number(
            options.topP ?? 0.92
          )
        )
      );

    const repetitionPenalty =
      Math.max(
        0,
        Number(
          options.repetitionPenalty ??
          0.75
        )
      );

    const values =
      Array.from(
        logits.dataSync()
      );

    const recent =
      generated.slice(-64);

    const counts =
      new Map();

    for (const id of recent) {
      counts.set(
        id,
        (counts.get(id) || 0) + 1
      );
    }

    const specialsToBlock =
      new Set(
        options.blockIds || []
      );

    const scored = [];

    for (
      let id = 0;
      id < values.length;
      id++
    ) {
      if (
        specialsToBlock.has(id)
      ) {
        continue;
      }

      let score =
        values[id] /
        temperature;

      const repeats =
        counts.get(id) || 0;

      if (repeats) {
        score -=
          repetitionPenalty *
          repeats;
      }

      scored.push({
        id,
        score
      });
    }

    scored.sort(
      (a, b) =>
        b.score - a.score
    );

    const shortlisted =
      scored.slice(
        0,
        Math.min(
          topK,
          scored.length
        )
      );

    const max =
      shortlisted[0]?.score ??
      0;

    let sum = 0;

    for (const item of shortlisted) {
      item.weight =
        Math.exp(
          item.score - max
        );

      sum += item.weight;
    }

    let cumulative = 0;
    const filtered = [];

    for (const item of shortlisted) {
      const probability =
        item.weight /
        Math.max(
          sum,
          1e-12
        );

      filtered.push({
        ...item,
        probability
      });

      cumulative +=
        probability;

      if (
        cumulative >= topP &&
        filtered.length >= 2
      ) {
        break;
      }
    }

    const filteredTotal =
      filtered.reduce(
        (total, item) =>
          total +
          item.probability,
        0
      );

    let roll =
      Math.random() *
      filteredTotal;

    for (const item of filtered) {
      roll -=
        item.probability;

      if (roll <= 0) {
        return {
          id: item.id,
          probability:
            item.probability /
            filteredTotal
        };
      }
    }

    const fallback =
      filtered[
        filtered.length - 1
      ];

    return {
      id:
        fallback?.id ?? 3,
      probability:
        fallback?.probability ?? 1
    };
  }

  generate(
    tokenizer,
    prompt,
    options = {}
  ) {
    const maxTokens =
      Math.max(
        1,
        Math.min(
          400,
          Number(
            options.maxTokens || 160
          )
        )
      );

    const bos =
      tokenizer.tokenToId.get(
        "<BOS>"
      );

    const eos =
      tokenizer.tokenToId.get(
        "<EOS>"
      );

    const blocked = [
      tokenizer.tokenToId.get(
        "<PAD>"
      ),
      tokenizer.tokenToId.get(
        "<UNK>"
      ),
      tokenizer.tokenToId.get(
        "<BOS>"
      ),
      tokenizer.tokenToId.get(
        "<USER>"
      ),
      tokenizer.tokenToId.get(
        "<DOC>"
      ),
      tokenizer.tokenToId.get(
        "<MEMORY>"
      )
    ].filter(
      id =>
        id !== undefined
    );

    const sequence = [
      bos,
      ...tokenizer.encode(
        prompt
      )
    ];

    const generated = [];

    let probabilitySum = 0;
    let stopReason =
      "max-tokens";

    for (
      let step = 0;
      step < maxTokens;
      step++
    ) {
      const logits =
        this.nextLogits(
          sequence
        );

      const choice =
        this.sampleFromLogits(
          logits,
          generated,
          {
            ...options,
            blockIds:
              blocked
          }
        );

      logits.dispose();

      if (
        choice.id === eos
      ) {
        stopReason = "eos";
        break;
      }

      generated.push(
        choice.id
      );

      sequence.push(
        choice.id
      );

      probabilitySum +=
        choice.probability;

      if (
        generated.length >= 12
      ) {
        const tail =
          generated.slice(-4)
            .join(",");

        let repeated = 0;

        for (
          let i = 0;
          i <=
            generated.length - 8;
          i++
        ) {
          if (
            generated.slice(
              i,
              i + 4
            ).join(",") ===
            tail
          ) {
            repeated++;
          }
        }

        if (repeated >= 2) {
          stopReason =
            "repetition";
          break;
        }
      }
    }

    return {
      text:
        tokenizer.decode(
          generated
        ).trim(),
      ids:
        generated,
      averageSampleProbability:
        generated.length
          ? probabilitySum /
            generated.length
          : 0,
      stopReason
    };
  }

  async save(directory, metadata = {}) {
    fs.mkdirSync(
      directory,
      { recursive: true }
    );

    const named = {};

    for (
      const [name, variable]
      of this.vars.entries()
    ) {
      named[name] =
        variable;
    }

    const encoded =
      await tf.io.encodeWeights(
        named
      );

    fs.writeFileSync(
      path.join(
        directory,
        "weights.bin"
      ),
      Buffer.from(
        encoded.data
      )
    );

    fs.writeFileSync(
      path.join(
        directory,
        "model.json"
      ),
      JSON.stringify(
        {
          version: 1,
          architecture:
            "causal-transformer",
          backendKind,
          config:
            this.config,
          steps:
            this.steps,
          specs:
            encoded.specs,
          metadata
        },
        null,
        2
      ),
      "utf8"
    );
  }

  load(directory) {
    const modelFile =
      path.join(
        directory,
        "model.json"
      );

    const weightsFile =
      path.join(
        directory,
        "weights.bin"
      );

    if (
      !fs.existsSync(modelFile) ||
      !fs.existsSync(weightsFile)
    ) {
      return false;
    }

    const saved =
      JSON.parse(
        fs.readFileSync(
          modelFile,
          "utf8"
        )
      );

    const current =
      JSON.stringify(
        this.config
      );

    const expected =
      JSON.stringify(
        saved.config
      );

    if (
      current !== expected
    ) {
      throw new Error(
        "Saved Transformer configuration does not match the selected profile."
      );
    }

    const buffer =
      fs.readFileSync(
        weightsFile
      );

    const arrayBuffer =
      buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset +
        buffer.byteLength
      );

    const decoded =
      tf.io.decodeWeights(
        arrayBuffer,
        saved.specs
      );

    for (
      const [name, variable]
      of this.vars.entries()
    ) {
      if (!decoded[name]) {
        throw new Error(
          `Saved Transformer is missing ${name}.`
        );
      }

      variable.assign(
        decoded[name]
      );
    }

    for (const tensor of Object.values(decoded)) {
      tensor.dispose();
    }

    this.steps =
      Number(saved.steps || 0);

    return true;
  }

  dispose() {
    for (const variable of this.vars.values()) {
      variable.dispose();
    }

    for (const mask of this.maskCache.values()) {
      mask.dispose();
    }

    this.vars.clear();
    this.maskCache.clear();
  }
}

module.exports = {
  CausalTransformerLM,
  backendKind
};
