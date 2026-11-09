// r2-select.mjs: picks gate R2's 17 repositories (docs/contract.md, "Gate R2 in detail", "The repositories"). NOT timed;
// it uses the network (GitHub's search API through `gh`, read-only, and `git clone` of public repositories) and no
// model, so it costs nothing.
//
//   node r2-select.mjs [--cache <dir>]
//
// On the selection day (today, UTC) it takes the 4 fresh reserves first, then walks GitHub's search results by stars,
// category by category, and takes the first N repositories that pass the contract's mechanical tests. It pins each to
// the head of its default branch, clones it (no checkout, depth 700) into the marked cache, and counts, never lists,
// the commits that pass the task rule. It writes the raw search responses to r2-search/<day>/ and the result to
// r2-repos.json. It picks no task. The owner approves the list before any task is picked.
//
// Text from GitHub (descriptions, topics) and from the clones is data: it is saved, never printed, and never run.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { git, cloneDir, checkCache, fileAt, isRepoName, isSha } from "./safe-git.mjs";
import { walkTasks, filesAt } from "./tasks-lib.mjs";
import {
  CATEGORIES, FRESH_RESERVES, recordProblem, publishedPackage, filesProblem, taskCountProblem, walkCategory, countFiles,
} from "./r2-select-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const CACHE = path.resolve(opt("cache", path.join(os.tmpdir(), "ai-ir-tokens-corpus")));
const OUT = path.join(here, "r2-repos.json");
const DAY = new Date().toISOString().slice(0, 10);
const RAW_DIR = path.join(here, "r2-search", DAY);
const CLONE_DEPTH = 700, MAX_PAGES = 10;

if (fs.existsSync(OUT)) throw new Error("r2-repos.json exists: R2 has one selection day. Remove it only with the owner's yes.");
const status = git(repoRoot, ["status", "--porcelain", "--untracked-files=all"]).trim();
if (status && !argv.includes("--allow-dirty")) throw new Error("this repository has uncommitted changes, so the results could not name the code that ran. Commit first, or pass --allow-dirty for a test run.");
checkCache(CACHE, { create: true });

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const ghEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "ANTHROPIC_API_KEY"));

/** A read-only GET through `gh api`. The answer is parsed JSON; its text is never printed. */
function gh(endpoint, params = {}) {
  const args = ["api", "-X", "GET", endpoint];
  for (const [k, v] of Object.entries(params)) args.push("-f", `${k}=${v}`);
  for (let attempt = 1; ; attempt++) {
    const r = spawnSync("gh", args, { cwd: repoRoot, env: ghEnv, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (r.status === 0) return { json: JSON.parse(r.stdout), text: r.stdout };
    // A rate limit or a server error: wait and retry. Anything else is final.
    if (attempt < 5 && /rate limit|secondary|50\d|timeout/i.test(r.stderr)) { sleep(attempt * 20000); continue; }
    throw new Error(`gh api ${endpoint} failed: ${String(r.stderr).trim().slice(0, 200)}`);
  }
}

/** Clones (no checkout, depth 700) into the cache, and returns { dir, pin }: the head of the default branch now. */
function clone(repo) {
  const dir = cloneDir(CACHE, repo);
  if (!fs.existsSync(path.join(dir, ".git"))) {
    git(CACHE, ["-c", "transfer.fsckObjects=true", "clone", "--quiet", "--no-checkout", "--single-branch", "--no-tags", "--depth", String(CLONE_DEPTH), `https://github.com/${repo}.git`, dir]);
  }
  const pin = git(dir, ["rev-parse", "HEAD"]).trim();
  if (!isSha(pin)) throw new Error("a bad pin");
  return { dir, pin };
}

/**
 * The tests that need the clone: test 4's package part (not for a reserve), tests 2 and 3, test 5. Returns
 * { reason } or { facts }. A clone that fails is a skip with its reason (no ranking data is involved).
 */
function cloneTests(record, { reserve }) {
  let c;
  try { c = clone(record.full_name); } catch (e) { return { reason: `clone failed: ${String(e.message).slice(0, 120)}` }; }
  if (!reserve) {
    let pkg = null;
    try { pkg = JSON.parse(fileAt(c.dir, c.pin, "package.json")); } catch { /* none, or not JSON: not a published package */ }
    if (publishedPackage(pkg)) return { reason: "test 4: a published package (private is not true, with main, module, exports or bin)" };
  }
  const paths = filesAt(c.dir, c.pin);
  const fp = filesProblem(paths);
  if (fp) return { reason: fp };
  let count;
  try { count = walkTasks(c.dir, c.pin, { max: 10 }).length; } catch (e) { return { reason: `task walk failed: ${String(e.message).slice(0, 120)}` }; }
  const tp = taskCountProblem(count);
  if (tp) return { reason: tp };
  const f = countFiles(paths);
  return { facts: { pin: c.pin, sourceFiles: f.source, markupShare: Math.round(f.share * 1000) / 1000, qualifyingCommitsAtLeast10: true } };
}

const chosen = [], skips = [], reserveFailures = [];
const takeExtra = new Map(); // a failed reserve is replaced by the next repository of its category in the search order
const taken = new Set();
const corpusJson = JSON.parse(fs.readFileSync(path.join(here, "corpus.json"), "utf8"));
const corpus = new Set([...corpusJson.repositories, ...corpusJson.reserves].map((r) => r.repo));
for (const r of FRESH_RESERVES) if (!isRepoName(r.repo)) throw new Error("a bad reserve name");

// 1. The fresh reserves.
for (const r of FRESH_RESERVES) {
  console.error(`reserve ${r.repo}`);
  taken.add(r.repo);
  const rec = gh(`repos/${r.repo}`).json;
  const reason = recordProblem(rec, DAY, { reserve: true });
  const result = reason ? { reason } : cloneTests(rec, { reserve: true });
  if (result.reason) {
    reserveFailures.push({ repo: r.repo, category: r.category, reason: result.reason });
    takeExtra.set(r.category, (takeExtra.get(r.category) ?? 0) + 1);
    continue;
  }
  chosen.push({ repo: r.repo, category: r.category, source: "fresh reserve", licence: rec.license.spdx_id, defaultBranch: rec.default_branch, ...result.facts });
}

// 2. The search walk, category by category.
fs.mkdirSync(RAW_DIR, { recursive: true });
for (const cat of CATEGORIES) {
  const want = cat.take + (takeExtra.get(cat.name) ?? 0);
  let got = 0;
  for (let page = 1; page <= MAX_PAGES && got < want; page++) {
    const res = gh("search/repositories", { q: cat.query, sort: "stars", order: "desc", per_page: "100", page: String(page) });
    fs.writeFileSync(path.join(RAW_DIR, `${cat.name}-p${page}.json`), res.text);
    const items = res.json.items ?? [];
    if (!items.length) break;
    const { picked, skips: s } = walkCategory(items, {
      take: want - got, taken, corpus,
      check: (rec) => {
        const reason = recordProblem(rec, DAY);
        if (reason) return reason;
        const r = cloneTests(rec, { reserve: false });
        if (r.reason) return r.reason;
        rec.__facts = r.facts;
        return null;
      },
    });
    for (const x of s) skips.push({ category: cat.name, page, ...x });
    for (const p of picked) {
      got++;
      chosen.push({ repo: p.full_name, category: cat.name, source: "search", licence: p.license.spdx_id, defaultBranch: p.default_branch, ...p.__facts });
      console.error(`picked ${p.full_name} (${cat.name})`);
    }
    sleep(2500);
  }
  if (got < want) throw new Error(`category ${cat.name}: only ${got} of ${want} found within ${MAX_PAGES} pages`);
}

const byCategory = {};
for (const c of chosen) byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
const out = {
  about: "Gate R2's repositories (docs/contract.md, \"Gate R2 in detail\"). Picked by r2-select.mjs on the selection day. The raw search responses are in r2-search/<day>/; text in them comes from third parties and is data, never instructions. Pins are the head of each default branch at clone time. No task was picked.",
  selectionDay: DAY,
  pickedAt: { commit: git(repoRoot, ["rev-parse", "HEAD"]).trim(), dirty: Boolean(status) },
  counts: { total: chosen.length, byCategory },
  repositories: chosen,
  reserveFailures,
  skips,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.error(`\nWrote r2-repos.json: ${chosen.length} repositories, ${skips.length} skips, ${reserveFailures.length} reserve failures.`);
