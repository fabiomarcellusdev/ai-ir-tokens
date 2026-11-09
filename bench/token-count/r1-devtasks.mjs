// r1-devtasks.mjs: picks gate R1's development tasks (docs/contract.md, "Gate R1 in detail", "The tasks", item 2) and
// writes them to r1-devtasks.json, which is committed before any work on the ranking starts. NOT timed.
//
//   node r1-devtasks.mjs [--from <C0 results JSON>] [--cache <dir>] [--allow-dirty]
//
// For each of the 17 gate repositories it walks further back from the oldest test task, along the first parent, and
// takes the next 5 commits that pass C0's task rule: rules 1 to 3, a modified file over 1 MB skips the commit, and the
// walk stops 500 commits from the pin. It reads old files from the cached clones only (corpus.mjs's cache, fetched the
// same way when missing); it never checks out, installs or runs the repositories' code.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tok } from "./views.mjs";
import { parseNameStatusZ, qualifyingFiles, changedRanges, tsChangedStatements, htmlChangedCode, cssChangedCode } from "./corpus-lib.mjs";
import { norm } from "./followups-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const FROM = path.resolve(repoRoot, opt("from", "docs/measurements/2026-11-08-phase0-corpus.json"));
const CACHE = path.resolve(opt("cache", path.join(os.tmpdir(), "ai-ir-tokens-corpus")));
const PER_REPO = 5, WALK_LIMIT = 500, CLONE_DEPTH = 700, MAX_FILE_BYTES = 1024 * 1024;

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
  git(dir, ["-c", "transfer.fsckObjects=true", "fetch", "--quiet", "--no-tags", "--depth", String(CLONE_DEPTH), "origin", sha]);
  return dir;
}

/** Rule 3: at least one modified file has a declaration, landmark or CSS rule group that the change touches. */
function touchesParsedUnit(dir, commit, parent, files) {
  for (const f of files) {
    const text = norm(git(dir, ["cat-file", "blob", `${parent}:${f}`]));
    const ranges = changedRanges(norm(git(dir, ["diff", "-U0", "--no-color", "--no-ext-diff", "--no-textconv", parent, commit, "--", f])));
    try {
      if (/\.(tsx?|jsx?|mjs|cjs)$/i.test(f) && tsChangedStatements(f, text, ranges).length) return true;
      if (/\.html?$/i.test(f) && htmlChangedCode(text, ranges)) return true;
      if (/\.css$/i.test(f) && cssChangedCode(text, ranges)) return true;
    } catch { /* a file a parser cannot read does not count */ }
  }
  return false;
}

const status = git(repoRoot, ["status", "--porcelain"]).trim();
if (status && !argv.includes("--allow-dirty")) throw new Error("this repository has uncommitted changes; commit first, or pass --allow-dirty for a test run");
const c0 = JSON.parse(fs.readFileSync(FROM, "utf8"));
const gate = c0.repositories.filter((r) => r.role === "gate" && r.tasks.length >= 3);
if (gate.length !== 17) throw new Error(`the C0 results have ${gate.length} gate repositories, not 17`);

const repos = [];
for (const r of gate) {
  const dir = clone(r.repo, r.sha);
  const commits = git(dir, ["rev-list", "--first-parent", `--max-count=${WALK_LIMIT}`, r.sha]).split("\n").filter(Boolean);
  const testIndex = r.tasks.map((t) => commits.indexOf(t.commit));
  if (testIndex.some((i) => i < 0)) throw new Error(`${r.repo}: a test task is not in the walk`);
  const tasks = [];
  let walked = 0;
  for (const c of commits.slice(Math.max(...testIndex) + 1)) {
    if (tasks.length >= PER_REPO) break;
    walked++;
    const [, ...parents] = git(dir, ["rev-list", "--parents", "-n", "1", c]).trim().split(" ");
    if (parents.length !== 1) continue;
    const [authorName, authorEmail] = git(dir, ["log", "-1", "--no-show-signature", "--format=%an%x00%ae", c]).split("\0");
    const entries = parseNameStatusZ(git(dir, ["diff-tree", "-r", "-z", "--no-commit-id", "--name-status", "-M", parents[0], c]));
    const files = qualifyingFiles({ parents: 1, authorName, authorEmail, entries });
    if (!files) continue;
    const sizes = git(dir, ["ls-tree", "-l", "-z", parents[0], "--", ...files]).split("\0").filter(Boolean).map((e) => Number(/^\d+ blob [0-9a-f]+ +(\d+)\t/.exec(e)?.[1] ?? 0));
    if (sizes.some((s) => s > MAX_FILE_BYTES)) continue;
    if (!touchesParsedUnit(dir, c, parents[0], files)) continue;
    const baseline = files.map((f) => `// ${f}\n${norm(git(dir, ["cat-file", "blob", `${parents[0]}:${f}`]))}`).join("\n");
    tasks.push({ commit: c, parent: parents[0], files, baseline: tok(baseline).o200k_base });
  }
  repos.push({ repo: r.repo, sha: r.sha, walked, note: tasks.length < PER_REPO ? `only ${tasks.length} development tasks within ${WALK_LIMIT} commits of the pin` : null, tasks });
  console.error(`${r.repo}: ${tasks.length} development tasks (walked ${walked} commits past the oldest test task)`);
}

const out = {
  about: "Gate R1's development tasks (docs/contract.md, \"Gate R1 in detail\"). Picked by r1-devtasks.mjs and committed before any work on the ranking started. The ranking is built and tuned on these tasks only; the 85 test tasks are the C0 tasks in docs/measurements/2026-11-08-phase0-corpus.json.",
  pickedAt: { date: new Date().toISOString().slice(0, 10), commit: git(repoRoot, ["rev-parse", "HEAD"]).trim(), dirty: Boolean(status) },
  rule: "Per repository: walking back from the oldest test task along the first parent, the next 5 commits that pass C0's task rule (rules 1 to 3; a modified file over 1 MB skips the commit), within 500 commits of the pin. baseline: o200k_base tokens of the modified files at the parent, as C0 counts them.",
  repositories: repos,
};
fs.writeFileSync(path.join(here, "r1-devtasks.json"), JSON.stringify(out, null, 2) + "\n");
console.error(`Wrote bench/token-count/r1-devtasks.json: ${repos.reduce((n, r) => n + r.tasks.length, 0)} development tasks.`);
