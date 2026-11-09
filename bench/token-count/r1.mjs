// r1.mjs: gate R1, step 1 of the rescope (docs/contract.md, "Gate R1 in detail"; decision 0007). NOT timed; no model
// is called, so it costs nothing.
//
//   node r1.mjs --dev  [--weights '<json>']           the development tasks (r1-devtasks.json): build and tune here
//   node r1.mjs --test [--rerun-after-crash "<why>"]  the 85 test tasks, once, from a clean commit that freezes the method
//
// For each task: the description is the full commit message; the candidates are the source files at the parent
// commit; each entry is the file's map (fileMap); the ranking orders the entries using the description and the files
// only; the map is cut at 25% of the task's baseline, stopping at the first entry that does not fit. The task passes
// when every modified task file has its entry in the cut map. It reads files from corpus.mjs's cached clones only.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { git, cloneDir, checkCache, checkClone, tree, readBlobs, commitMessage, fileAt, diffOf, isRepoName, isSha, MAX_FILE_BYTES } from "./safe-git.mjs";
import { fileURLToPath } from "node:url";
import { tok } from "./views.mjs";
import { fileMap, tsChangedStatements, changedRanges, median, importsOf, resolveImport } from "./corpus-lib.mjs";

/** The import specifiers of a TypeScript or JavaScript file (empty for any other file, or one that does not parse). */
function specifiersOf(file, text) {
  if (!/\.(tsx?|jsx?|mjs|cjs)$/i.test(file)) return [];
  try { return [...new Set([...importsOf(file, text).values()].map((v) => v.from))]; } catch { return []; }
}

/** Who imports whom, both ways, among the candidates: relative imports only, resolved against the parent's files. */
function neighborsOf(items) {
  const fileSet = new Set(items.map((x) => x.path));
  const nb = new Map(items.map((x) => [x.path, new Set()]));
  for (const x of items) {
    for (const spec of x.specs) {
      if (!spec.startsWith(".")) continue;
      const r = resolveImport(spec, x.path, fileSet);
      if (r.kind === "own" && nb.has(r.path)) { nb.get(x.path).add(r.path); nb.get(r.path).add(x.path); }
    }
  }
  return nb;
}
import { norm } from "./followups-lib.mjs";
import { isCandidate, budgetFor, cutMap, passes, namesFile, referenceRank, projectRank, prepare, r1Verdict, refuseTestRun, entryHoldsLine, CANDIDATE_RULE, DEFAULT_WEIGHTS } from "./r1-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
// Every argument is checked before any side effect, so a mistyped test-run call never uses up the one run.
const MODE = argv.includes("--test") ? "test" : argv.includes("--dev") ? "dev" : null;
if (!MODE || (argv.includes("--test") && argv.includes("--dev"))) throw new Error("say --dev or --test, not both");
const SWEEP = opt("sweep");
if (argv.includes("--sweep") && MODE !== "dev") throw new Error("--sweep runs on the development tasks only");
if (argv.includes("--sweep") && !["base", "signals"].includes(SWEEP)) throw new Error("say --sweep base or --sweep signals");
if (MODE === "test" && opt("weights")) throw new Error("the test run uses the frozen weights only");
if (MODE === "dev" && opt("rerun-after-crash")) throw new Error("--rerun-after-crash belongs to the test run");
const CACHE = path.resolve(opt("cache", path.join(os.tmpdir(), "ai-ir-tokens-corpus")));
// The development outputs go to their own temporary folder: out/ holds count.mjs's views, which the golden check compares.
const DEV_OUT = path.join(os.tmpdir(), "ai-ir-tokens-r1");
const WEIGHTS = opt("weights") ? { ...DEFAULT_WEIGHTS, ...JSON.parse(opt("weights")) } : DEFAULT_WEIGHTS;
const count = (s) => tok(s).o200k_base;

checkCache(CACHE);

/** Checks every task of a list before any git call: repository names and commit ids come from tracked files. */
function checkTasks(list) {
  for (const r of list) {
    if (!isRepoName(r.repo)) throw new Error(`a bad repository name in the task list: ${JSON.stringify(r.repo).slice(0, 80)}`);
    for (const t of r.tasks) if (!isSha(t.commit) || !isSha(t.parent) || !Array.isArray(t.files) || !Number.isInteger(t.baseline)) throw new Error(`a bad task in ${r.repo}`);
  }
  return list;
}

// ---------------- The tasks ----------------

const RUNS = path.join(repoRoot, "docs", "measurements", "r1-test-runs.json");
let tasksByRepo, status = "", runs = null;
if (MODE === "dev") {
  tasksByRepo = checkTasks(JSON.parse(fs.readFileSync(path.join(here, "r1-devtasks.json"), "utf8")).repositories.map((r) => ({ repo: r.repo, tasks: r.tasks.map((t) => ({ ...t })) })));
} else {
  // The tree must be clean, untracked files included (whatever the user's git settings say), except the run list.
  const runsRel = path.relative(repoRoot, RUNS).split(path.sep).join("/");
  const dirty = git(repoRoot, ["status", "--porcelain", "--untracked-files=all", "--ignore-submodules=none"]).split("\n").filter(Boolean).map((l) => l.slice(3)).filter((p) => p !== runsRel);
  status = dirty.join("\n");
  // Every test run is listed, also one that crashes: the list is written before the first task.
  const prior = fs.existsSync(RUNS) ? JSON.parse(fs.readFileSync(RUNS, "utf8")) : [];
  const lib = git(repoRoot, ["rev-parse", "HEAD:bench/token-count/r1-lib.mjs"]).trim();
  const refusal = refuseTestRun({ prior, dirty, rerunReason: opt("rerun-after-crash") ?? null, lib, weights: WEIGHTS });
  if (refusal) throw new Error(refusal);
  runs = [...prior, { started: new Date().toISOString(), commit: git(repoRoot, ["rev-parse", "HEAD"]).trim(), lib, weights: WEIGHTS, status: "started", rerunReason: opt("rerun-after-crash") ?? null }];
  fs.writeFileSync(RUNS, JSON.stringify(runs, null, 2) + "\n");
  // A crash or an interruption is recorded with its reason; the run then counts as started, never as finished.
  const record = (status, why) => { runs.at(-1).status = status; runs.at(-1).ended = new Date().toISOString(); runs.at(-1).error = String(why).slice(0, 500); fs.writeFileSync(RUNS, JSON.stringify(runs, null, 2) + "\n"); };
  process.on("uncaughtException", (e) => { record("crashed", e?.stack ?? e); console.error(e); process.exit(1); });
  process.on("SIGINT", () => { record("interrupted", "SIGINT"); process.exit(130); });
  const c0 = JSON.parse(fs.readFileSync(path.join(repoRoot, "docs", "measurements", "2026-11-08-phase0-corpus.json"), "utf8"));
  tasksByRepo = checkTasks(c0.repositories.filter((r) => r.role === "gate" && r.tasks.length >= 3).map((r) => ({ repo: r.repo, tasks: r.tasks.map((t) => ({ commit: t.commit, parent: t.parent, files: t.files, baseline: t.o200k.baseline })) })));
  if (tasksByRepo.length !== 17) throw new Error("the C0 results do not have 17 gate repositories");
}

// ---------------- One task ----------------

/**
 * The description and the candidates of one task: each candidate's entry is exactly fileMap(path, text) at the
 * parent commit. The cache is keyed by the file's content and its path, because the entry starts with the path.
 */
function candidatesOf(dir, task, cache) {
  const description = commitMessage(dir, task.commit);
  const all = tree(dir, task.parent).filter((t) => isCandidate(t.path));
  const key = (t) => `${t.id}\0${t.path}`;
  const missing = all.filter((t) => !cache.has(key(t)));
  const texts = readBlobs(dir, [...new Map(missing.map((t) => [t.id, t])).values()]);
  for (const t of missing) {
    // A file over 1 MB is not read; its entry is one line, as in C0 (corpus.mjs).
    const raw = texts.get(t.id);
    const text = raw === undefined ? "" : norm(raw);
    const entry = raw === undefined && t.size > MAX_FILE_BYTES ? `${t.path} (not read: over ${MAX_FILE_BYTES} bytes)\n` : fileMap(t.path, text), entryTokens = count(entry);
    cache.set(key(t), { prepared: prepare({ path: t.path, entry, entryTokens }, text), specs: specifiersOf(t.path, text) });
  }
  const prepared = all.map((t) => cache.get(key(t)).prepared);
  const neighbors = neighborsOf(all.map((t) => ({ path: t.path, specs: cache.get(key(t)).specs })));
  return { description, prepared, neighbors };
}

function measure(dir, task, cache) {
  const { description, prepared, neighbors } = candidatesOf(dir, task, cache);
  const entries = prepared.map(({ path, entry, entryTokens }) => ({ path, entry, entryTokens }));
  const project = projectRank(prepared, description, WEIGHTS, { neighbors });
  const reference = referenceRank(entries, description);
  const at = (ranked, budget) => cutMap(ranked, budget, count);
  const main = at(project, budgetFor(task.baseline));
  // Reported beside, item 2. TypeScript and JavaScript: every changed top-level statement (named or not, imports left
  // out), and whether the cut map holds a line range that contains it. HTML and CSS entries have line ranges since 2026-11-09, but this count is by file, so
  // for those files the count is of changed files whose entry is in the cut map.
  let decls = 0, declsIn = 0, markupFiles = 0, markupIn = 0;
  for (const f of task.files) {
    const inMap = main.paths.includes(f);
    if (!/\.(tsx?|jsx?|mjs|cjs)$/i.test(f)) { markupFiles++; if (inMap) markupIn++; continue; }
    const old = norm(fileAt(dir, task.parent, f));
    const ranges = changedRanges(norm(diffOf(dir, task.parent, task.commit, f)));
    const entry = entries.find((e) => e.path === f)?.entry ?? "";
    let statements = [];
    try { statements = tsChangedStatements(f, old, ranges); } catch { /* a file that does not parse has no statements */ }
    for (const s of statements) {
      decls++;
      // The statement's last line always lies inside its own range in the map.
      const lastLine = old.slice(0, Math.max(0, s.end - 1)).split("\n").length;
      if (inMap && entryHoldsLine(entry, lastLine)) declsIn++;
    }
  }
  const pass = (ranked, budget) => passes(at(ranked, budget).paths, task.files);
  // The ceiling, for information: a perfect ranking that puts exactly the changed files first, smallest entry first.
  const perfect = [...entries.filter((e) => task.files.includes(e.path)).sort((a, b) => a.entryTokens - b.entryTokens), ...entries.filter((e) => !task.files.includes(e.path))];
  return {
    ceiling: pass(perfect, budgetFor(task.baseline)),
    commit: task.commit, files: task.files, baseline: task.baseline, budget: budgetFor(task.baseline), candidates: entries.length,
    namesChangedFile: task.files.some((f) => namesFile(description, f, { stem: false })),
    pass: passes(main.paths, task.files),
    reference: pass(reference, budgetFor(task.baseline)),
    ranks: task.files.map((f) => project.findIndex((e) => e.path === f) + 1),
    declarations: { changed: decls, inMap: declsIn, markupFiles, markupInMap: markupIn },
    beside: {
      fixed1000: pass(project, 1000), fixed2000: pass(project, 2000),
      share10: pass(project, budgetFor(task.baseline, 0.1)), share50: pass(project, budgetFor(task.baseline, 0.5)), share100: pass(project, budgetFor(task.baseline, 1)),
    },
  };
}

// ---------------- Run ----------------

// --sweep (development tasks only): tries a grid of weights in one process, preparing each repository's files once.
if (SWEEP) {
  const grid = [];
  const off = { ...DEFAULT_WEIGHTS, folder: 0, imports: 0, ident: 0 };
  if (SWEEP === "base") {
    // Step 1: 720 combinations of the base weights, with no structural signal.
    for (const pathW of [2, 3, 5, 8]) for (const names of [1, 2, 4]) for (const text of [0.25, 0.5, 1, 2]) for (const size of [0, 0.15, 0.3, 0.6, 1]) for (const nf of [5, 15, 40]) grid.push({ ...off, path: pathW, names, text, size, namesFile: nf });
  } else {
    // Step 2: the best base weights of step 1 (its first row; ties keep the grid's order), with the three structural
    // signals on top (96 combinations).
    const stepOne = path.join(DEV_OUT, "r1-sweep-base.json");
    if (!fs.existsSync(stepOne)) throw new Error("run --sweep base first");
    const top = JSON.parse(fs.readFileSync(stepOne, "utf8"))[0].w;
    const best = { ...off, path: top.path, names: top.names, text: top.text, size: top.size, namesFile: top.namesFile };
    console.error(`step 2 starts from ${JSON.stringify(best)}`);
    for (const folder of [0, 0.15, 0.3, 0.6]) for (const imports of [0, 0.15, 0.3, 0.6]) for (const ident of [0, 5, 15]) for (const size of [0.3, 1]) grid.push({ ...best, folder, imports, ident, size });
  }
  const wins = new Array(grid.length).fill(0);
  for (const r of tasksByRepo) {
    const dir = cloneDir(CACHE, r.repo);
    checkClone(dir, r.repo);
    const cache = new Map();
    for (const task of r.tasks) {
      const { description, prepared, neighbors } = candidatesOf(dir, task, cache);
      const budget = budgetFor(task.baseline);
      grid.forEach((w, i) => { if (passes(cutMap(projectRank(prepared, description, w, { neighbors }), budget, count).paths, task.files)) wins[i]++; });
    }
    console.error(`${r.repo}: done`);
  }
  const ranked = grid.map((w, i) => ({ w, wins: wins[i] })).sort((a, b) => b.wins - a.wins);
  const keys = ["path", "names", "text", "size", "namesFile", "folder", "imports", "ident"];
  console.error(ranked.slice(0, 12).map((x) => `${x.wins}/85  ${JSON.stringify(Object.fromEntries(keys.map((k) => [k, x.w[k]])))}`).join("\n"));
  const spread = ranked.map((x) => x.wins);
  console.error(`${grid.length} combinations; best ${spread[0]}, median ${median(spread)}, worst ${spread.at(-1)} of 85`);
  fs.mkdirSync(DEV_OUT, { recursive: true });
  fs.writeFileSync(path.join(DEV_OUT, `r1-sweep-${SWEEP}.json`), JSON.stringify(ranked, null, 2) + "\n");
  process.exit(0);
}

const repos = [];
for (const r of tasksByRepo) {
  const dir = cloneDir(CACHE, r.repo);
  checkClone(dir, r.repo);
  const cache = new Map();
  const tasks = r.tasks.map((t) => measure(dir, t, cache));
  repos.push({ repo: r.repo, tasks, passed: tasks.filter((t) => t.pass).length });
  // The test run shows no result until the end, so nobody can stop it early on what they see.
  if (MODE === "test") console.error(`${r.repo}: done`);
  else console.error(`${r.repo}: ${tasks.filter((t) => t.pass).length}/${tasks.length} pass (reference ${tasks.filter((t) => t.reference).length}/${tasks.length}); ranks ${tasks.map((t) => t.ranks.join("+")).join(" ")}`);
}
const all = repos.flatMap((r) => r.tasks);
const rate = (f) => all.filter(f).length / all.length;
const summary = {
  tasks: all.length, passed: all.filter((t) => t.pass).length, passRate: rate((t) => t.pass),
  referencePassRate: rate((t) => t.reference),
  ceilingPassRate: rate((t) => t.ceiling),
  namesChangedFile: all.filter((t) => t.namesChangedFile).length,
  declarationsInMap: all.reduce((n, t) => n + t.declarations.inMap, 0) / (all.reduce((n, t) => n + t.declarations.changed, 0) || 1),
  changedStatements: all.reduce((n, t) => n + t.declarations.changed, 0),
  markupFilesInMap: all.reduce((n, t) => n + t.declarations.markupInMap, 0) / (all.reduce((n, t) => n + t.declarations.markupFiles, 0) || 1),
  markupFiles: all.reduce((n, t) => n + t.declarations.markupFiles, 0),
  beside: Object.fromEntries(["fixed1000", "fixed2000", "share10", "share50", "share100"].map((k) => [k, rate((t) => t.beside[k])])),
  medianCandidates: median(all.map((t) => t.candidates)),
};
console.error(`\n${MODE}: ${summary.passed}/${summary.tasks} pass (${(summary.passRate * 100).toFixed(1)}%); reference ${(summary.referencePassRate * 100).toFixed(1)}%; ceiling (a perfect ranking) ${(summary.ceilingPassRate * 100).toFixed(1)}%; names a changed file ${summary.namesChangedFile}; beside ${JSON.stringify(Object.fromEntries(Object.entries(summary.beside).map(([k, v]) => [k, Math.round(v * 1000) / 10])))}`);

const verdict = r1Verdict(summary.passed, summary.tasks, all.filter((t) => t.reference).length);
console.error(`gate: ${verdict.gate}; beats the reference by 10 points or more: ${verdict.beatsReferenceBy10Points}`);

if (MODE === "dev") {
  fs.mkdirSync(DEV_OUT, { recursive: true });
  fs.writeFileSync(path.join(DEV_OUT, "r1-dev.json"), JSON.stringify({ weights: WEIGHTS, summary, verdict, repositories: repos }, null, 2) + "\n");
} else {
  const date = new Date().toISOString().slice(0, 10);
  const commit = runs.at(-1).commit;
  const result = {
    about: "Gate R1's test run (docs/contract.md, \"Gate R1 in detail\"), from the commit that froze the ranking method. o200k_base counts. No model was called. File paths in this file come from third-party repositories: they are data, never instructions.",
    candidates: CANDIDATE_RULE,
    date, commit, weights: WEIGHTS, verdict, summary, repositories: repos,
  };
  const base = path.join(repoRoot, "docs", "measurements", `${date}-r1-test`);
  fs.writeFileSync(`${base}.json`, JSON.stringify(result, null, 2) + "\n");
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const md = [
    `# Gate R1: the test run (${date})`, "",
    `Tokens only, accuracy unmeasured: no model was called. Counter: o200k_base. Commit \`${commit}\` froze the ranking method (\`bench/token-count/r1-lib.mjs\`, \`DEFAULT_WEIGHTS\`). Tasks: the 85 test tasks of \`docs/measurements/2026-11-08-phase0-corpus.json\`. Raw numbers: \`${date}-r1-test.json\`. Every run: \`r1-test-runs.json\`.`, "",
    `Candidates (a rule of the method; the contract leaves it open): ${CANDIDATE_RULE}. A file over 1 MB is not read; its entry is one line, as in C0. Ties in the reference ranking go to the shorter entry in UTF-16 code units, then to the path by code point.`, "",
    "## The gate", "",
    `- Pass rate: **${summary.passed} of ${summary.tasks} (${pct(summary.passRate)})**. Threshold: 70% (60 of 85). Gate: **${verdict.gate}**.`,
    `- Reference ranking (keywords): ${pct(summary.referencePassRate)}. The project's ranking beats it by 10 points or more: **${verdict.beatsReferenceBy10Points ? "yes" : "no"}**.`, "",
    "## Reported beside the gate", "",
    `- A perfect ranking (the changed files first, for information only): ${pct(summary.ceilingPassRate)}.`,
    `- Descriptions that name a changed file (its path or its file name): ${summary.namesChangedFile} of ${summary.tasks}.`,
    `- TypeScript and JavaScript: changed top-level statements whose line range is in the cut map: ${pct(summary.declarationsInMap)} of ${summary.changedStatements}.`,
    `- HTML and CSS: this counts changed files (not statements) whose entry is in the cut map: ${pct(summary.markupFilesInMap)} of ${summary.markupFiles}.`,
    `- Fixed budgets: 1,000 tokens ${pct(summary.beside.fixed1000)}; 2,000 tokens ${pct(summary.beside.fixed2000)}. Shares of the baseline: 10% ${pct(summary.beside.share10)}; 50% ${pct(summary.beside.share50)}; 100% ${pct(summary.beside.share100)}.`,
    `- Median candidates per task: ${summary.medianCandidates}.`, "",
    "| Repository | Pass | Reference | Ranks of the changed files |", "|---|---|---|---|",
    ...repos.map((r) => `| ${r.repo} | ${r.passed}/${r.tasks.length} | ${r.tasks.filter((t) => t.reference).length}/${r.tasks.length} | ${r.tasks.map((t) => t.ranks.join("+")).join(", ")} |`), "",
  ].join("\n");
  fs.writeFileSync(`${base}.md`, md);
  runs.at(-1).status = "finished";
  runs.at(-1).finished = new Date().toISOString();
  fs.writeFileSync(RUNS, JSON.stringify(runs, null, 2) + "\n");
  console.error(`Wrote docs/measurements/${date}-r1-test.json and .md.`);
}
