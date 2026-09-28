"use strict";

const SPECIAL = [
  "<PAD>",
  "<UNK>",
  "<BOS>",
  "<EOS>",
  "<USER>",
  "<ASSISTANT>",
  "<DOC>",
  "<MEMORY>"
];

function pieces(text) {
  const input = String(text);

  return (
    input.match(
      /<PAD>|<UNK>|<BOS>|<EOS>|<USER>|<ASSISTANT>|<DOC>|<MEMORY>|\r\n|\n|\t| +|[A-Za-z_$][A-Za-z0-9_$]*|\d+(?:\.\d+)?|[^\sA-Za-z0-9_$]/gu
    ) || []
  );
}

class SubwordTokenizer {
  constructor() {
    this.idToToken = [];
    this.tokenToId = new Map();

    for (const token of SPECIAL) {
      this.add(token);
    }

    // Byte fallback means arbitrary unseen text and source code can still encode.
    for (let i = 0; i < 256; i++) {
      this.add(
        `<BYTE:${i.toString(16).padStart(2, "0")}>`
      );
    }
  }

  add(token) {
    if (!this.tokenToId.has(token)) {
      const id = this.idToToken.length;
      this.idToToken.push(token);
      this.tokenToId.set(token, id);
    }

    return this.tokenToId.get(token);
  }

  build(texts, maxVocab = 8192) {
    const frequency = new Map();

    for (const text of texts) {
      for (const piece of pieces(text)) {
        if (SPECIAL.includes(piece)) continue;

        frequency.set(
          piece,
          (frequency.get(piece) || 0) + 1
        );
      }
    }

    this.idToToken = [];
    this.tokenToId = new Map();

    for (const token of SPECIAL) {
      this.add(token);
    }

    for (let i = 0; i < 256; i++) {
      this.add(
        `<BYTE:${i.toString(16).padStart(2, "0")}>`
      );
    }

    const reserved = this.idToToken.length;

    const ranked = [...frequency.entries()]
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return b[0].length - a[0].length;
      })
      .slice(
        0,
        Math.max(
          0,
          maxVocab - reserved
        )
      );

    for (const [piece] of ranked) {
      this.add(piece);
    }
  }

  encode(text, options = {}) {
    const ids = [];

    if (options.bos) {
      ids.push(
        this.tokenToId.get("<BOS>")
      );
    }

    for (const piece of pieces(text)) {
      const known =
        this.tokenToId.get(piece);

      if (known !== undefined) {
        ids.push(known);
        continue;
      }

      const bytes =
        Buffer.from(
          piece,
          "utf8"
        );

      for (const byte of bytes) {
        ids.push(
          this.tokenToId.get(
            `<BYTE:${byte.toString(16).padStart(2, "0")}>`
          )
        );
      }
    }

    if (options.eos) {
      ids.push(
        this.tokenToId.get("<EOS>")
      );
    }

    return ids;
  }

  decode(ids, options = {}) {
    const skipSpecial =
      options.skipSpecial !== false;

    let output = "";
    let byteBuffer = [];

    const flushBytes = () => {
      if (!byteBuffer.length) return;

      output +=
        Buffer.from(byteBuffer)
          .toString("utf8");

      byteBuffer = [];
    };

    for (const id of ids) {
      const token =
        this.idToToken[id] ||
        "<UNK>";

      const byteMatch =
        token.match(
          /^<BYTE:([0-9a-f]{2})>$/i
        );

      if (byteMatch) {
        byteBuffer.push(
          parseInt(
            byteMatch[1],
            16
          )
        );

        continue;
      }

      flushBytes();

      if (
        skipSpecial &&
        SPECIAL.includes(token)
      ) {
        continue;
      }

      output += token;
    }

    flushBytes();

    return output;
  }

  toJSON() {
    return {
      version: 2,
      type: "hybrid-piece-byte-fallback",
      idToToken:
        this.idToToken
    };
  }

  static fromJSON(data) {
    const tokenizer =
      new SubwordTokenizer();

    tokenizer.idToToken =
      data.idToToken.slice();

    tokenizer.tokenToId =
      new Map(
        tokenizer.idToToken.map(
          (token, index) =>
            [token, index]
        )
      );

    return tokenizer;
  }
}

module.exports = {
  SubwordTokenizer,
  SPECIAL,
  pieces
};
