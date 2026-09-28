"use strict";

const fs = require("fs");
const path = require("path");
const paths = require("./paths");

function words(text) {
  return new Set((String(text).toLowerCase().match(/[a-z0-9]{3,}/g) || []));
}

function localSearch(query, limit = 4) {
  const dir = paths.file("knowledge", "starter");
  if (!fs.existsSync(dir)) return [];

  const q = words(query);
  const results = [];

  for (const name of fs.readdirSync(dir).filter(x => x.endsWith(".txt")).slice(-3000)) {
    const file = path.join(dir, name);
    let text;
    try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
    const w = words(text.slice(0, 12000));
    let overlap = 0;
    for (const token of q) if (w.has(token)) overlap++;
    if (!overlap) continue;
    results.push({ score: overlap / Math.max(1, q.size), text: text.slice(0, 8000), file: name });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

async function wikipedia(query, limit = 2) {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", query);
  url.searchParams.set("srlimit", String(limit));
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  const search = await fetch(url, { headers: { "User-Agent": "Syntra-Veyra/6.0" } }).then(r => r.json());
  const titles = (search?.query?.search || []).map(x => x.title);
  const out = [];

  for (const title of titles) {
    const u = new URL("https://en.wikipedia.org/w/api.php");
    u.searchParams.set("action", "query");
    u.searchParams.set("prop", "extracts");
    u.searchParams.set("explaintext", "1");
    u.searchParams.set("exintro", "1");
    u.searchParams.set("titles", title);
    u.searchParams.set("format", "json");
    u.searchParams.set("origin", "*");

    const data = await fetch(u, { headers: { "User-Agent": "Syntra-Veyra/6.0" } }).then(r => r.json());
    const page = Object.values(data?.query?.pages || {})[0];
    if (page?.extract) out.push({ title, text: page.extract.slice(0, 9000) });
  }

  return out;
}

module.exports = { localSearch, wikipedia };
