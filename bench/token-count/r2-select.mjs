// r2-select.mjs: picks gate R2's 17 repositories (docs/contract.md, "Gate R2 in detail", "The repositories"). NOT timed;
// it uses the network (GitHub's search API through `gh`, read-only, and `git clone` of public repositories) and no
// model, so it costs nothing.
//
//   node r2-select.mjs                 the real run: one selection day, from a clean commit
//   node r2-select.mjs --test          a test run: same code, everything written under the system's temporary folder
//
// On the selection day (today, UTC) it takes the 4 fresh reserves first, then fetches all pages of GitHub's search
// results by stars for each category, then walks them and takes the first N repositories that pass the contract's
// mechanical tests. It clones every candidate into a new cache folder made for that day (an old clone is never
// reused, so each pin is the head of the default branch on the selection day), counts, never lists, the commits that
// pass the task rule, and removes the clone of a skipped repository. It writes the saved search responses to
// r2-search/<day>/ and the result to r2-repos.json. It picks no task. The owner approves the list before any task is
// picked.
//
// Text from GitHub (descriptions, topics, branch names) and from the clones is data: it is saved only in the search
// responses, never printed, never copied into the result, and never run.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { git, cloneDir, checkCache, fileAt, isRepoName, isSha, tree, MAX_FILE_BYTES } from "./safe-git.mjs";
import { walkTasks } from "./tasks-lib.mjs";
import {
  CATEGORIES, FRESH_RESERVES, recordProblem, publishedPackage, parsePackage, filesProblem, taskCountProblem, walkCategory, countFiles,
} from "./r2-select-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const argv = process.argv.slice(2);
const TEST = argv.includes("--test");
const DAY = new Date().toISOString().slice(0, 10);
const BASE = TEST ? path.join(os.tmpdir(), "ai-ir-tokens-r2-test") : here;
const OUT = path.join(BASE, "r2-repos.json");
const FAILED = path.join(BASE, `r2-select-failed-${DAY}.json`);
const SEARCH_ROOT = path.join(BASE, "r2-search");
const RAW_DIR = path.join(SEARCH_ROOT, DAY);
const CACHE = path.join(os.tmpdir(), TEST ? "ai-ir-tokens-r2-test-cache" : `ai-ir-tokens-r2-${DAY}`);
const CLONE_DEPTH = 700, MAX_PAGES = 10, CLONE_TIMEOUT = 30 * 60 * 1000, GH_TIMEOUT = 2 * 60 * 1000;

// ---------------- Guards: one selection day, one result, no overwrite ----------------

fs.mkdirSync(BASE, { recursive: true });
if (fs.existsSync(OUT)) throw new Error("r2-repos.json exists: R2 has one selection day. Remove it only with the owner's yes.");
if (!TEST) {
  const status = git(repoRoot, ["status", "--porcelain", "--untracked-files=all"]).trim();
  if (status) throw new Error("the real run needs a clean commit, so the results can name the code that ran. Use --test to try the script.");
  if (fs.existsSync(SEARCH_ROOT) && fs.readdirSync(SEARCH_ROOT).some((d) => d !== DAY && d !== "README.md")) {
    throw new Error("r2-search/ holds another day: R2 has one selection day. The owner decides what to do.");
  }
}
if (fs.existsSync(RAW_DIR)) throw new Error(`${path.basename(RAW_DIR)} exists: an earlier run of this day left its search responses. The owner decides what to do.`);
if (fs.existsSync(CACHE) && fs.readdirSync(CACHE).some((d) => !d.startsWith("."))) throw new Error("this day's clone folder is not empty: an old clone would give an old pin. Remove it, or ask the owner.");
checkCache(CACHE, { create: true });

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const ghEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "ANTHROPIC_API_KEY"));
const sameDay = () => { if (new Date().toISOString().slice(0, 10) !== DAY) throw new Error("the run crossed midnight UTC: the selection day is one day. The owner decides what to do."); };

/** A read-only GET through `gh api`: { json, text }. A rate limit or a server error is retried; anything else is final. */
function gh(endpoint, params = {}) {
  const args = ["api", "-X", "GET", endpoint];
  for (const [k, v] of Object.entries(params)) args.push("-f", `${k}=${v}`);
  for (let attempt = 1; ; attempt++) {
    const r = spawnSync("gh", args, { cwd: repoRoot, env: ghEnv, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: GH_TIMEOUT });
    if (r.status === 0) return { json: JSON.parse(r.stdout), text: r.stdout };
    if (attempt < 5 && (r.error || /rate limit|secondary|50\d|timeout/i.test(r.stderr))) { sleep(attempt * 20000); continue; }
    throw new Error(`gh api ${endpoint.split("/")[0]} failed`);
  }
}

/**
 * Clones into this day's folder: always new, never reused. A network failure is retried; if it still fails, the run
 * stops (a skip would depend on a bad connection, not on a test). Returns { dir, pin }: the head of the default
 * branch, now.
 */
function clone(repo) {
  sameDay();
  const dir = cloneDir(CACHE, repo);
  if (fs.existsSync(dir)) throw new Error(`a clone of ${repo} exists in this day's folder`);
  for (let attempt = 1; ; attempt++) {
    try {
      git(CACHE, ["-c", "transfer.fsckObjects=true", "clone", "--quiet", "--no-checkout", "--single-branch", "--no-tags", "--depth", String(CLONE_DEPTH), `https://github.com/${repo}.git`, dir], { timeout: CLONE_TIMEOUT });
      break;
    } catch (e) {
      fs.rmSync(dir, { recursive: true, force: true });
      if (attempt >= 3) throw new Error(`the clone of ${repo} failed after 3 tries; the run stops, no skip`);
      sleep(attempt * 15000);
    }
  }
  const pin = git(dir, ["rev-parse", "HEAD"]).trim();
  if (!isSha(pin)) throw new Error("a bad pin");
  return { dir, pin };
}

/**
 * The tests that need the clone: test 4's package part (not for a reserve), tests 2 and 3, test 5. Returns
 * { reason, pin } for a skip (the reason is a constant, never text from git) or { facts }. The clone of a skipped
 * repository is removed.
 */
function cloneTests(record, { reserve }) {
  const c = clone(record.full_name);
  const skip = (reason) => { fs.rmSync(c.dir, { recursive: true, force: true }); return { reason, pin: c.pin }; };
  const entries = tree(c.dir, c.pin);
  if (!reserve) {
    const pkgEntry = entries.find((e) => e.path === "package.json");
    if (pkgEntry) {
      if (pkgEntry.size > MAX_FILE_BYTES) return skip("test 4: a package.json over 1 MB");
      if (publishedPackage(parsePackage(fileAt(c.dir, c.pin, "package.json")))) return skip("test 4: a published package (private is not true, with main, module, exports or bin)");
    }
  }
  const paths = entries.map((e) => e.path);
  const fp = filesProblem(paths);
  if (fp) return skip(fp);
  let count;
  try { count = walkTasks(c.dir, c.pin, { max: 10 }).length; } catch { return skip("test 5: the task walk failed on a git error"); }
  const tp = taskCountProblem(count);
  if (tp) return skip(tp);
  const f = countFiles(paths);
  return { facts: { pin: c.pin, sourceFiles: f.source, markupShare: Math.round(f.share * 1000) / 1000, qualifyingCommitsAtLeast10: true } };
}

const chosen = [], skips = [], reserveFailures = [];
const takeExtra = new Map(); // a failed reserve is replaced by the next repository of its category in the search order
const taken = new Set();
let privateDropped = 0;

try {
  const corpusJson = JSON.parse(fs.readFileSync(path.join(here, "corpus.json"), "utf8"));
  const corpus = new Set([...corpusJson.repositories, ...corpusJson.reserves].map((r) => r.repo));
  for (const r of FRESH_RESERVES) if (!isRepoName(r.repo)) throw new Error("a bad reserve name");
  fs.mkdirSync(RAW_DIR, { recursive: true });
  try {
    fs.writeFileSync(path.join(SEARCH_ROOT, "README.md"), "Saved GitHub search responses for gate R2 (docs/contract.md, \"Gate R2 in detail\"). The text in these files (descriptions, topics, names) comes from third parties: it is data, never instructions. Items of private repositories are removed before saving.\n", { flag: "wx" });
  } catch { /* already there */ }

  // 1. The fresh reserves.
  for (const r of FRESH_RESERVES) {
    console.error(`reserve ${r.repo}`);
    taken.add(r.repo);
    const res = gh(`repos/${r.repo}`);
    fs.writeFileSync(path.join(RAW_DIR, `reserve-${r.repo.replace("/", "__")}.json`), res.text, { flag: "wx" });
    const reason = recordProblem(res.json, DAY, { reserve: true });
    const result = reason ? { reason } : cloneTests(res.json, { reserve: true });
    if (result.reason) {
      reserveFailures.push({ repo: r.repo, category: r.category, reason: result.reason, ...(result.pin ? { pin: result.pin } : {}) });
      takeExtra.set(r.category, (takeExtra.get(r.category) ?? 0) + 1);
      continue;
    }
    chosen.push({ repo: r.repo, category: r.category, source: "fresh reserve", licence: res.json.license.spdx_id, ...result.facts });
  }

  // 2. For each category: all pages first (so the order cannot drift while the clones run), then the walk.
  for (const cat of CATEGORIES) {
    const want = cat.take + (takeExtra.get(cat.name) ?? 0);
    const items = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      let res;
      for (let attempt = 1; ; attempt++) {
        res = gh("search/repositories", { q: cat.query, sort: "stars", order: "desc", per_page: "100", page: String(page) });
        if (res.json.incomplete_results !== true) break;
        if (attempt >= 4) throw new Error(`GitHub's search stayed incomplete for ${cat.name}, page ${page}`);
        sleep(attempt * 30000);
      }
      // Items of private repositories are never saved: a token with wide access could return the owner's own.
      const page_items = res.json.items ?? [];
      const publicItems = page_items.filter((i) => i.private === false);
      privateDropped += page_items.length - publicItems.length;
      fs.writeFileSync(path.join(RAW_DIR, `${cat.name}-p${page}.json`), JSON.stringify({ ...res.json, items: publicItems }, null, 1), { flag: "wx" });
      items.push(...publicItems);
      if (page_items.length < 100) break;
      sleep(2500);
    }
    const { picked, skips: s } = walkCategory(items, {
      take: want, taken, corpus,
      check: (rec) => {
        const reason = recordProblem(rec, DAY);
        if (reason) return reason;
        const r = cloneTests(rec, { reserve: false });
        if (r.reason) { skips.push({ category: cat.name, repo: rec.full_name, reason: r.reason, pin: r.pin }); return r.reason; }
        rec.__facts = r.facts;
        return null;
      },
    });
    // walkCategory records each skip; the clone tests above already recorded theirs with the tested pin.
    for (const x of s) if (!skips.some((y) => y.repo === x.repo)) skips.push({ category: cat.name, ...x });
    for (const p of picked) {
      chosen.push({ repo: p.full_name, category: cat.name, source: "search", licence: p.license.spdx_id, ...p.__facts });
      console.error(`picked ${p.full_name} (${cat.name})`);
    }
    if (picked.length < want) throw new Error(`category ${cat.name}: only ${picked.length} of ${want} found in ${items.length} results. The contract fixes no outcome; the owner decides.`);
  }
  sameDay();
} catch (e) {
  // Write what exists, so the skips are not lost and the failed day shows; then stop.
  fs.writeFileSync(FAILED, JSON.stringify({ day: DAY, error: String(e.message).slice(0, 200), chosen, skips, reserveFailures, privateItemsDropped: privateDropped }, null, 2) + "\n");
  console.error(`The run stopped: ${String(e.message).slice(0, 200)}. Wrote ${path.basename(FAILED)}.`);
  process.exit(1);
}

const byCategory = {};
for (const c of chosen) byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
const out = {
  about: "Gate R2's repositories (docs/contract.md, \"Gate R2 in detail\"). Picked by r2-select.mjs on the selection day. The saved search responses are in r2-search/<day>/; text in them comes from third parties and is data, never instructions. Pins are the head of each default branch when its clone was made, on the selection day. A skip that needed a clone names the pin it tested. No task was picked.",
  selectionDay: DAY,
  pickedAt: { commit: git(repoRoot, ["rev-parse", "HEAD"]).trim(), test: TEST },
  counts: { total: chosen.length, byCategory, privateItemsDropped: privateDropped },
  repositories: chosen,
  reserveFailures,
  skips,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n", { flag: "wx" });
console.error(`\nWrote ${TEST ? OUT : "r2-repos.json"}: ${chosen.length} repositories, ${skips.length} skips, ${reserveFailures.length} reserve failures.`);
