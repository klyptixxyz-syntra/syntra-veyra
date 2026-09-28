"use strict";

const fs = require("fs");
const path = require("path");
const paths = require("../core/paths");

paths.ensure();

const topics = [
  "JavaScript","HTML","CSS","Node.js","computer programming","algorithm","data structure",
  "database","computer network","software engineering","debugging","game development",
  "artificial intelligence","machine learning","language model","neural network",
  "mathematics","algebra","geometry","probability","statistics","physics","chemistry",
  "biology","Earth","Solar System","history","geography","economics","business",
  "computer security","operating system","web development","user interface"
];

const outDir = paths.file("knowledge", "starter");
fs.mkdirSync(outDir, { recursive: true });

async function topicExtract(topic) {
  const search = new URL("https://en.wikipedia.org/w/api.php");
  search.searchParams.set("action","query");
  search.searchParams.set("list","search");
  search.searchParams.set("srsearch",topic);
  search.searchParams.set("srlimit","3");
  search.searchParams.set("format","json");
  search.searchParams.set("origin","*");

  const sr = await fetch(search, { headers: { "User-Agent":"Syntra-Veyra/6.0" } }).then(r=>r.json());
  const titles = (sr?.query?.search || []).map(x=>x.title);

  for (const title of titles) {
    const u = new URL("https://en.wikipedia.org/w/api.php");
    u.searchParams.set("action","query");
    u.searchParams.set("prop","extracts");
    u.searchParams.set("explaintext","1");
    u.searchParams.set("titles",title);
    u.searchParams.set("format","json");
    u.searchParams.set("origin","*");

    const data = await fetch(u, { headers: { "User-Agent":"Syntra-Veyra/6.0" } }).then(r=>r.json());
    const page = Object.values(data?.query?.pages || {})[0];
    if (!page?.extract) continue;

    const safe = title.replace(/[^a-z0-9_-]+/gi,"_").slice(0,80);
    fs.writeFileSync(path.join(outDir, `${safe}.txt`), `TITLE: ${title}\nSOURCE: Wikipedia\n\n${page.extract}`, "utf8");
  }
}

async function main() {
  let done = 0;
  const concurrency = 6;
  let index = 0;

  async function worker() {
    while (index < topics.length) {
      const current = topics[index++];
      try { await topicExtract(current); } catch {}
      done++;
      process.send?.({ type:"knowledge-progress", progress:done/topics.length, topic:current });
    }
  }

  await Promise.all(new Array(concurrency).fill(0).map(worker));
  process.send?.({ type:"knowledge-done" });
}

main().catch(error=>{
  process.send?.({ type:"knowledge-error", error:error.message });
  process.exit(0); // Knowledge download failure should not destroy installation.
});
