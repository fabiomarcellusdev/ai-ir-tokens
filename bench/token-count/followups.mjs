// followups.mjs: the two measurements before the C0 decision (docs/contract.md, "Two follow-up measurements before
// the decision"): W, the writing side, and V, finer code views. NOT timed: token counts are deterministic.
//
//   node followups.mjs [--from <C0 results JSON>] [--cache <dir>] [--out <name>] [--allow-dirty]
//
// It takes the tasks of the 17 gate repositories from gate C0's official results, so it measures exactly the same 85
// changes, and reads the old and new files from the clones that corpus.mjs left in its cache folder (it fetches a
// missing clone the same way). Like corpus.mjs, it never checks out, installs or runs the repositories' code. The
// counter is o200k_base, a proxy, as the owner chose (2026-11-08).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tok } from "./views.mjs";
import { changedRanges, saving, median } from "./corpus-lib.mjs";
import { norm, hunksOf, searchReplaceCalls, editOperations, rewriteCall, tsInnermostCode, htmlInnermostCode, cssInnermostCode, floorCode, verdict, acrossRepositories } from "./followups-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const E = "o200k_base";
const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const FROM = path.resolve(repoRoot, opt("from", "docs/measurements/2026-11-08-phase0-corpus.json"));
const CACHE = path.resolve(opt("cache", path.join(os.tmpdir(), "ai-ir-tokens-corpus")));
const OUT = opt("out", `${new Date().toISOString().slice(0, 10)}-phase0-followups`);
if (!/^[\w.-]+$/.test(OUT)) throw new Error("--out takes a file name without a folder");
const THRESHOLD = { W: 0.4, V: 0.65 }, CLONE_DEPTH = 700;

const gitEnv = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k) && k !== "ANTHROPIC_API_KEY")), GIT_TERMINAL_PROMPT: "0" };
function git(dir, args, { ok = false } = {}) {
  const r = spawnSync("git", ["--literal-pathspecs", "-c", "core.quotePath=false", "-c", "log.showSignature=false", ...args], { cwd: dir, env: gitEnv, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (ok) return r;
  if (r.status !== 0) throw new Error(`git ${args[0]} failed in ${path.basename(dir)}: ${String(r.stderr).trim().slice(0, 300)}`);
  return r.stdout;
}

function clone(repo, sha) {
  const dir = path.join(CACHE, repo.replace("/", "__"));
  const url = `https://github.com/${repo}.git`;
  if (fs.existsSync(path.join(dir, ".git"))) {
    if (git(dir, ["config", "--get", "remote.origin.url"], { ok: true }).stdout?.trim() !== url) throw new Error(`the cached clone of ${repo} points elsewhere`);
  } else {
    fs.mkdirSync(CACHE, { recursive: true, mode: 0o700 });
    git(CACHE, ["-c", "transfer.fsckObjects=true", "clone", "--quiet", "--no-checkout", "--single-branch", "--no-tags", "--depth", String(CLONE_DEPTH), url, dir]);
  }
  if (spawnSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: dir, env: gitEnv }).status !== 0) {
    git(dir, ["-c", "transfer.fsckObjects=true", "fetch", "--quiet", "--no-tags", "--depth", String(CLONE_DEPTH), "origin", sha]);
  }
  return dir;
}

/** One task, measured both ways: W (three ways to write it) and V (two finer views), against C0's reading baseline. */
function measure(dir, task) {
  let baseline = "", rewrite = [], sr = [], ops = [], v1 = "", v2 = "";
  for (const f of task.files) {
    const old = norm(git(dir, ["cat-file", "blob", `${task.parent}:${f}`]));
    const neu = norm(git(dir, ["cat-file", "blob", `${task.commit}:${f}`]));
    const diff = norm(git(dir, ["diff", "-U0", "--no-color", "--no-ext-diff", "--no-textconv", task.parent, task.commit, "--", f]));
    const hunks = hunksOf(diff), ranges = changedRanges(diff);
    baseline += (baseline ? "\n" : "") + `// ${f}\n${old}`;
    rewrite.push(rewriteCall(f, neu));
    sr.push(...searchReplaceCalls(f, old, hunks));
    ops.push(...editOperations(f, old, hunks));
    let unit = "";
    try {
      unit = /\.(tsx?|jsx?|mjs|cjs)$/i.test(f) ? tsInnermostCode(f, old, ranges) : /\.html?$/i.test(f) ? htmlInnermostCode(old, ranges) : /\.css$/i.test(f) ? cssInnermostCode(old, ranges) : old;
    } catch {
      unit = old; // a file a parser cannot read counts in full
    }
    if (unit) v1 += `// ${f}\n${unit}`;
    v2 += `// ${f}\n${floorCode(old, ranges)}`;
  }
  const n = (s) => tok(s)[E];
  // The same baseline as gate C0, or the two measurements would not compare like with like.
  if (n(baseline) !== task.o200k.baseline) throw new Error(`the baseline of ${task.commit.slice(0, 10)} differs from C0 (${n(baseline)} against ${task.o200k.baseline})`);
  const c = { baseline: n(baseline), rewrite: n(rewrite.join("\n")), searchReplace: n(sr.join("\n")), operations: n(ops.join("\n")), v1: n(v1), v2: n(v2) };
  return {
    commit: task.commit, files: task.files, o200k: c,
    w: { opsVsSearchReplace: saving(c.operations, c.searchReplace), opsVsRewrite: saving(c.operations, c.rewrite), searchReplaceShareOfReading: c.baseline ? c.searchReplace / c.baseline : null },
    v: { v1: saving(c.v1, c.baseline), v2: saving(c.v2, c.baseline) },
  };
}

const pct = (x) => (x === null || x === undefined ? "–" : `${(x * 100).toFixed(1)}%`);

// ---------------- Run ----------------

const status = git(repoRoot, ["status", "--porcelain"]).trim();
if (status && !argv.includes("--allow-dirty")) throw new Error("this repository has uncommitted changes, so the results could not name the code that ran. Commit first, or pass --allow-dirty for a test run.");
const c0 = JSON.parse(fs.readFileSync(FROM, "utf8"));
const gateRepos = c0.repositories.filter((r) => r.role === "gate" && r.tasks.length >= 3);
if (gateRepos.length !== 17) throw new Error(`the C0 results have ${gateRepos.length} gate repositories, not 17`);
console.error(`Two follow-up measurements on ${gateRepos.reduce((n, r) => n + r.tasks.length, 0)} tasks of ${gateRepos.length} repositories, o200k_base. NOT timed.`);
const repos = [];
for (const r of gateRepos) {
  const dir = clone(r.repo, r.sha);
  const tasks = r.tasks.map((t) => measure(dir, t));
  const med = (f) => median(tasks.map(f));
  repos.push({
    repo: r.repo, category: r.category, band: r.band, tasks,
    median: { opsVsSearchReplace: med((t) => t.w.opsVsSearchReplace), opsVsRewrite: med((t) => t.w.opsVsRewrite), searchReplaceShareOfReading: med((t) => t.w.searchReplaceShareOfReading), v1: med((t) => t.v.v1), v2: med((t) => t.v.v2) },
  });
  console.error(`  ${r.repo}: W ${pct(repos.at(-1).median.opsVsSearchReplace)}, V1 ${pct(repos.at(-1).median.v1)}`);
}
const across = (k) => acrossRepositories(repos.map((r) => r.median[k]), 17);
const summary = {
  W: { ...verdict(across("opsVsSearchReplace").median, THRESHOLD.W), spread: across("opsVsSearchReplace"), opsVsRewrite: across("opsVsRewrite"), searchReplaceShareOfReading: across("searchReplaceShareOfReading") },
  V: { ...verdict(across("v1").median, THRESHOLD.V), spread: across("v1"), v2: across("v2") },
};
const meta = {
  date: new Date().toISOString().slice(0, 10), commit: git(repoRoot, ["rev-parse", "HEAD"]).trim(), dirty: Boolean(status),
  node: process.version, git: git(repoRoot, ["--version"]).trim().replace(/^git version /, ""), tokenizer: E,
  tasksFrom: path.relative(repoRoot, FROM).replace(/\\/g, "/"),
};
const L = [];
L.push(`# Two follow-up measurements before the C0 decision (${meta.date})`, "");
L.push(`**W, the writing side:** ${summary.W.result}. Edit operations by address cost ${pct(summary.W.median)} fewer tokens than search and replace (median; threshold ${pct(THRESHOLD.W)}).`);
L.push(`**V, finer code views:** ${summary.V.result}. The innermost unit saves ${pct(summary.V.median)} against the full files, with no map (median; threshold ${pct(THRESHOLD.V)}).`);
L.push("", "**Conditions:** " + [`the 85 tasks of the 17 gate repositories in ${meta.tasksFrom}`, `this repository's commit ${meta.commit}${meta.dirty ? " with uncommitted changes" : ""}`, `tokenizer ${E} (a proxy; the owner's choice)`, `Node ${meta.node}`, `git ${meta.git}`, "NOT timed"].join("; ") + ".", "");
L.push(`**W beside the threshold:** spread ${pct(summary.W.spread.q1)} to ${pct(summary.W.spread.q3)}; edit operations against rewriting the files: median ${pct(summary.W.opsVsRewrite.median)}. Search and replace costs ${pct(summary.W.searchReplaceShareOfReading.median)} of the reading baseline (median), so a writing saving moves the total cost far less than a reading saving would.`);
L.push(`**V beside the threshold:** spread ${pct(summary.V.spread.q1)} to ${pct(summary.V.spread.q3)}; V2, the floor (the changed lines with 3 lines of context): median ${pct(summary.V.v2.median)}.`, "");
L.push("| Repository | Band | W: operations against search and replace | Operations against rewriting | Search and replace as a share of reading | V1 | V2 (floor) |", "|---|---|---|---|---|---|---|");
for (const r of repos) L.push(`| ${r.repo} | ${r.band} | ${pct(r.median.opsVsSearchReplace)} | ${pct(r.median.opsVsRewrite)} | ${pct(r.median.searchReplaceShareOfReading)} | ${pct(r.median.v1)} | ${pct(r.median.v2)} |`);
L.push("", "**First-pass limits, written down:** search and replace adds whole lines of context until the old text is unique, as an agent must; an agent may add more. An edit operation addresses the top-level declaration that holds its hunk (the file, for HTML, CSS and code between declarations). V1 uses the compact view (the whole file's compact edits inside the unit); a CSS rule with nested rules, and changed lines that no unit holds, go in as written. Neither measurement shows finding the code or accuracy.");
const outDir = path.join(repoRoot, "docs", "measurements");
fs.writeFileSync(path.join(outDir, `${OUT}.json`), JSON.stringify({ meta, summary, repositories: repos }, null, 2) + "\n");
fs.writeFileSync(path.join(outDir, `${OUT}.md`), L.join("\n") + "\n");
console.error(`Results: docs/measurements/${OUT}.json and .md. W: ${summary.W.result}. V: ${summary.V.result}.`);
