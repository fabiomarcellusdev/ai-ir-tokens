// r2-digest.mjs: makes the committed record of gate R2's repository search (docs/contract.md, "Gate R2 in detail", "The
// repositories", and its amendment of 2026-11-10). The saved search responses (r2-search/<day>/) hold text from third
// parties and stay on this machine, git-ignored. This digest holds, for each search result in order, only the fields
// the contract's tests read, and the SHA-256 of each saved file, so anyone can repeat the walk and check the files.
//
//   node r2-digest.mjs        reads r2-search/<day>/ (the day in r2-repos.json) and writes r2-search-digest.json

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { EXCLUDED_TOPICS, safeLicence } from "./r2-select-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

/** The tested fields of one search item, and no free text: a licence id and the excluded topics only. */
export function digestItem(i) {
  return {
    name: i.full_name,
    stars: i.stargazers_count,
    private: i.private,
    fork: i.fork,
    archived: i.archived,
    isTemplate: i.is_template,
    licence: safeLicence(i.license?.spdx_id),
    pushedAt: i.pushed_at,
    excludedTopics: (i.topics ?? []).filter((t) => EXCLUDED_TOPICS.has(t)),
    hasTopics: Array.isArray(i.topics),
  };
}

/** The digest of one saved file's text. */
export function digestFile(text) {
  const json = JSON.parse(text);
  return {
    sha256: crypto.createHash("sha256").update(text).digest("hex"),
    totalCount: json.total_count ?? null,
    incompleteResults: json.incomplete_results ?? null,
    items: (json.items ?? []).map(digestItem),
  };
}

if (process.argv[1] && path.basename(process.argv[1]) === "r2-digest.mjs") {
  const repos = JSON.parse(fs.readFileSync(path.join(here, "r2-repos.json"), "utf8"));
  const dir = path.join(here, "r2-search", repos.selectionDay);
  const files = {};
  // The walk read each category's results in order up to its last pick; nothing after that point was read. Only that
  // prefix is listed (and any name from it that a skip or a pick already shows); later results keep their count and hash.
  const lastPick = {};
  for (const r of repos.repositories) if (r.source === "search") lastPick[r.category] = r.repo;
  const done = new Set(); // categories whose last pick has been passed
  const names = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort((a, b) => {
    const [ca, pa] = [a.replace(/-p\d+\.json$/, ""), Number(/-p(\d+)\.json$/.exec(a)?.[1] ?? 0)];
    const [cb, pb] = [b.replace(/-p\d+\.json$/, ""), Number(/-p(\d+)\.json$/.exec(b)?.[1] ?? 0)];
    return ca < cb ? -1 : ca > cb ? 1 : pa - pb;
  });
  for (const f of names) {
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    if (f.startsWith("reserve-")) {
      // A reserve's own record: the same tested fields, from one repository record.
      const json = JSON.parse(text);
      files[f] = { sha256: crypto.createHash("sha256").update(text).digest("hex"), items: [digestItem(json)] };
      continue;
    }
    const cat = f.replace(/-p\d+\.json$/, "");
    const d = digestFile(text);
    const kept = [];
    for (const item of d.items) {
      if (done.has(cat)) break;
      kept.push(item);
      if (item.name === lastPick[cat]) done.add(cat);
    }
    files[f] = { ...d, items: kept, itemsInFile: d.items.length, itemsListed: kept.length };
  }
  const out = {
    about: "The committed record of gate R2's repository search. The saved responses (r2-search/<day>/, git-ignored, on the machine that ran r2-select.mjs) hold third-party text; this digest keeps only the fields the tests read, in search order, and each file's SHA-256 (of the file as saved).",
    selectionDay: repos.selectionDay,
    files,
  };
  fs.writeFileSync(path.join(here, "r2-search-digest.json"), JSON.stringify(out, null, 1) + "\n");
  console.error(`Wrote r2-search-digest.json: ${Object.keys(files).length} files, ${Object.values(files).reduce((n, f) => n + f.items.length, 0)} items.`);
}
