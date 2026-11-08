// corpus.mjs: phase 0's measurement on real repositories (docs/contract.md, "Gate C0 in detail"; docs/roadmap.md,
// phase 0). NOT timed: token counts are deterministic.
//
//   node corpus.mjs [--repos owner/name,...] [--replace <gate repo>=<reserve> --reason "<why>"]... [--model <id>]
//                   [--proxy-only] [--cache <dir>] [--out <name>] [--clean] [--allow-dirty]
//
// For each repository in corpus.json it makes a shallow clone with no working files, picks the tasks by the contract's
// commit rule, and counts both sides of each task: the baseline (the full text of the modified files) and the layer
// (the folder overview, the folder maps, the code needed and the signatures it names). It reads old file versions
// from git only: it never checks out, installs or runs the repositories' code. Their content is untrusted: sizes are
// checked before reading, and a file that a parser cannot handle skips its task, never the run.
//
// Token counts: o200k_base locally, and Anthropic's token-counting endpoint (free; decision 0003) when the environment
// holds ANTHROPIC_API_KEY. Without the key, with --proxy-only, or when the endpoint refuses a probe, the results say
// "proxy only" and the gate has no result. The key is read from the environment only, is never written or printed,
// and is not passed to git.
//
// Results: docs/measurements/<date>-phase0-corpus.json and .md. The clones stay in the cache folder (a private folder
// in the system's temporary folder by default) until --clean removes them.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tok, tsMap, topLevelIds, parseTs } from "./views.mjs";
import {
  parseNameStatusZ, qualifyingFiles, changedRanges, tsChangedStatements, tsCompactOf, namesUsed, declaredNames, mapEntries,
  importsOf, findExport, resolveImport, aliasesFrom, baseUrlFrom, workspacePackages, htmlChangedCode, cssChangedCode,
  fileMap, folderOverview, saving, median, summarize, unresolvedCharge, SOURCE_EXT, SIZING_EXT,
} from "./corpus-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const E = "o200k_base";
const MAX_FILE_BYTES = 1024 * 1024; // a larger file is not read: its task is skipped, or its map is one line
const BATCH_BYTES = 128 * 1024 * 1024;

// ---------------- Options ----------------

const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const flag = (name) => argv.includes(`--${name}`);
const MODEL = opt("model", "claude-opus-5-5");
if (!/^[\w.-]+$/.test(MODEL)) throw new Error("--model takes a model id: letters, digits, '.', '-' and '_'");
const ANTHROPIC_VERSION = opt("anthropic-version", "2023-06-01");
const CACHE = path.resolve(opt("cache", path.join(os.tmpdir(), "ai-ir-tokens-corpus")));
const MARKER = path.join(CACHE, ".ai-ir-tokens-corpus-cache");
const TASKS_PER_REPO = 5, WALK_LIMIT = 500, CLONE_DEPTH = 700, GATE_SIZE = 17;
const today = new Date().toISOString().slice(0, 10);
const OUT = opt("out", `${today}-phase0-corpus`);
if (!/^[\w.-]+$/.test(OUT)) throw new Error("--out takes a file name without a folder");
let proxyReason = flag("proxy-only") ? "--proxy-only" : process.env.ANTHROPIC_API_KEY ? null : "no ANTHROPIC_API_KEY in the environment";

// ---------------- The repositories ----------------

const corpus = JSON.parse(fs.readFileSync(path.join(here, "corpus.json"), "utf8"));
const replacements = [];
let repoList = corpus.repositories.map((r) => ({ ...r }));
// Each `--replace <corpus repository>=<reserve>` is followed by its own `--reason "<why>"`; there may be several.
argv.forEach((a, k) => {
  if (a !== "--replace") return;
  const [out, inn] = (argv[k + 1] ?? "").split("=");
  const reason = argv[k + 2] === "--reason" ? argv[k + 3] : null;
  const i = repoList.findIndex((r) => r.repo === out), reserve = corpus.reserves.find((r) => r.repo === inn);
  if (i < 0 || !reserve || !reason || replacements.some((x) => x.by === inn)) {
    throw new Error("each --replace <corpus repository>=<reserve> needs two names from corpus.json, a reserve used once, and its own --reason right after it");
  }
  // The reserve takes the role and the category of the repository it replaces (docs/contract.md).
  repoList[i] = { ...reserve, role: repoList[i].role, category: repoList[i].category, replaces: out };
  replacements.push({ replaced: out, by: inn, reason });
});
const only = opt("repos") ? new Set(opt("repos").split(",")) : null;
const selected = repoList.filter((r) => !only || only.has(r.repo));
for (const r of selected) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(r.repo) || !/^[0-9a-f]{40}$/.test(r.sha)) throw new Error(`corpus.json: a bad name or pin: ${r.repo}`);
}

// ---------------- git ----------------

// No GIT_* variable from the caller (a hook's GIT_DIR, for example) and no API key reach git, and git never asks for
// a password. Paths are literal (a file named "[ab].ts" is not a pattern), and no signature is checked (no gpg).
const gitEnv = {
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k) && k !== "ANTHROPIC_API_KEY")),
  GIT_TERMINAL_PROMPT: "0",
};
function git(dir, args, { input, buffer = false, ok = false } = {}) {
  const r = spawnSync("git", ["--literal-pathspecs", "-c", "core.quotePath=false", "-c", "log.showSignature=false", ...args],
    { cwd: dir, env: gitEnv, input, maxBuffer: BATCH_BYTES * 2, ...(buffer ? {} : { encoding: "utf8" }) });
  if (ok) return r;
  if (r.status !== 0) throw new Error(`git ${args[0]} failed in ${path.basename(dir)}: ${String(r.stderr).trim().slice(0, 300)}`);
  return r.stdout;
}

/** The cache folder: private, and marked as this script's, so --clean never removes a folder it did not make. */
function prepareCache() {
  if (fs.existsSync(CACHE)) {
    if (!fs.existsSync(MARKER) && fs.readdirSync(CACHE).length) throw new Error(`the cache folder exists and is not this script's: ${path.basename(CACHE)}. Name another with --cache.`);
    const st = fs.lstatSync(CACHE);
    if (st.isSymbolicLink() || !st.isDirectory()) throw new Error("the cache folder is a link or not a folder");
    if (typeof process.getuid === "function" && st.uid !== process.getuid()) throw new Error("the cache folder belongs to another user");
  } else fs.mkdirSync(CACHE, { recursive: true, mode: 0o700 });
  fs.writeFileSync(MARKER, "phase 0 corpus clones; bench/token-count/corpus.mjs --clean removes this folder's clones\n");
}

function ensureClone({ repo, sha }) {
  const dir = path.join(CACHE, repo.replace("/", "__"));
  const url = `https://github.com/${repo}.git`;
  if (fs.existsSync(path.join(dir, ".git"))) {
    const origin = git(dir, ["config", "--get", "remote.origin.url"], { ok: true }).stdout?.trim();
    if (origin !== url) throw new Error(`the cached clone of ${repo} points elsewhere; remove ${path.basename(dir)} from the cache`);
  } else {
    git(CACHE, ["-c", "transfer.fsckObjects=true", "clone", "--quiet", "--no-checkout", "--single-branch", "--no-tags", "--depth", String(CLONE_DEPTH), url, dir]);
  }
  // Always fetch the pin to the full depth: a clone made when the branch had moved on may hold the pin but too little
  // of the history behind it.
  git(dir, ["-c", "transfer.fsckObjects=true", "fetch", "--quiet", "--no-tags", "--depth", String(CLONE_DEPTH), "origin", sha]);
  return dir;
}

/** Every file of a commit, as [{ id, path, size }], from `git ls-tree -r -l -z`. */
function tree(dir, commit) {
  return git(dir, ["ls-tree", "-r", "-l", "-z", commit]).split("\0").filter(Boolean).flatMap((e) => {
    const m = /^\d+ blob ([0-9a-f]+) +(\d+)\t([\s\S]+)$/.exec(e);
    return m ? [{ id: m[1], size: Number(m[2]), path: m[3] }] : [];
  });
}

/**
 * Reads blobs through `git cat-file --batch`, in batches of at most BATCH_BYTES, skipping any blob over
 * MAX_FILE_BYTES. Returns Map(path -> text). CRLF becomes LF; a lone CR becomes a space, because git does not count it
 * as a line end and TypeScript does, and the two must agree on line numbers.
 */
function readBlobs(dir, items) {
  const out = new Map();
  const wanted = items.filter((i) => i && i.size <= MAX_FILE_BYTES);
  for (let start = 0; start < wanted.length; ) {
    let bytes = 0, end = start;
    while (end < wanted.length && (end === start || bytes + wanted[end].size <= BATCH_BYTES)) bytes += wanted[end++].size;
    const batch = wanted.slice(start, end);
    const buf = git(dir, ["cat-file", "--batch"], { input: batch.map((i) => i.id).join("\n") + "\n", buffer: true });
    let at = 0;
    for (const item of batch) {
      const nl = buf.indexOf(10, at);
      if (nl < 0) break;
      const m = /^([0-9a-f]+) (\w+) (\d+)$/.exec(buf.subarray(at, nl).toString("utf8"));
      if (!m) { at = nl + 1; continue; } // "<id> missing"
      const size = Number(m[3]);
      out.set(item.path, buf.subarray(nl + 1, nl + 1 + size).toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, " "));
      at = nl + 1 + size + 1;
    }
    start = end;
  }
  return out;
}

// ---------------- Anthropic's token counter ----------------

const countCachePath = path.join(CACHE, `claude-counts-${MODEL}.json`);
let countCache = {};
const proxyOnly = () => proxyReason !== null;
async function claudeCount(text) {
  if (proxyOnly()) return null;
  if (!text) return 0;
  const k = crypto.createHash("sha256").update(text).digest("hex");
  if (countCache[k] !== undefined) return countCache[k];
  let lastError = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": ANTHROPIC_VERSION },
        body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: text }] }),
      });
    } catch (e) {
      lastError = `network error: ${e.cause?.code ?? e.message}`;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    if (res.status === 429 || res.status >= 500) { lastError = `HTTP ${res.status}`; await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt)); continue; }
    if (!res.ok) throw new Error(`token counting refused: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    const n = (await res.json()).input_tokens;
    if (!Number.isInteger(n)) throw new Error("token counting returned no input_tokens");
    countCache[k] = n;
    const tmp = `${countCachePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(countCache));
    fs.renameSync(tmp, countCachePath);
    return n;
  }
  throw new Error(`token counting failed after retries: ${lastError}`);
}

// ---------------- One task ----------------

const kindOf = (p) => (/\.(tsx?|jsx?|mjs|cjs)$/i.test(p) ? "ts" : /\.html?$/i.test(p) ? "html" : /\.css$/i.test(p) ? "css" : "other");

/** The map entry of the declaration a module exports as `name`, following up to 3 re-exports. */
function exportEntry(cache, parent, file, name, ctx, depth = 0) {
  if (depth > 3) return null;
  const t = cache.byPath(parent).get(file);
  const text = t && cache.read([t]).get(file);
  if (text === undefined) return null;
  const hit = findExport(file, text, name);
  if (!hit) return null;
  if (hit.statement) {
    const ids = topLevelIds(parseTs(file, text));
    const byPos = new Map([...ids].map(([s, id]) => [s.pos, id]));
    const entry = mapEntries(tsMap(file, text)).get(byPos.get(hit.statement.pos));
    return entry ? `${file}\n${entry}` : null;
  }
  for (const from of hit.stars ?? [hit.from]) {
    const r = resolveImport(from, file, cache.fileSet(parent), ctx);
    if (r.kind !== "own") continue;
    const e = exportEntry(cache, parent, r.path, hit.stars ? name : hit.name, ctx, depth + 1);
    if (e) return e;
  }
  return null;
}

function measureTask(dir, entry, commit, parent, files, cache) {
  const sizing = entry.role === "sizing";
  const parentTree = cache.tree(parent);
  const byPath = cache.byPath(parent);
  const tooLarge = files.filter((f) => (byPath.get(f)?.size ?? 0) > MAX_FILE_BYTES);
  if (tooLarge.length) return { skip: `a modified file is over ${MAX_FILE_BYTES} bytes` };
  const texts = cache.read(files.map((f) => byPath.get(f)));
  const ctx = cache.ctx(parent);

  let code = "", signatures = "", parsedUnits = 0, unresolved = 0;
  const unsupported = [], seenSig = new Set();
  const addSig = (key, text) => { if (text && !seenSig.has(key)) { seenSig.add(key); signatures += text; } };
  for (const f of files) {
    const text = texts.get(f);
    if (text === undefined) continue;
    const ranges = changedRanges(git(dir, ["diff", "-U0", "--no-color", "--no-ext-diff", "--no-textconv", parent, commit, "--", f]));
    const kind = kindOf(f);
    if (kind === "ts") {
      const stmts = tsChangedStatements(f, text, ranges);
      if (!stmts.length) continue;
      parsedUnits += stmts.length;
      code += `// ${f}\n` + tsCompactOf(f, text, stmts);
      const changed = new Set(stmts.map((s) => s.pos));
      const sf = parseTs(f, text);
      const own = new Map();
      for (const s of sf.statements) for (const n of declaredNames(s)) if (!changed.has(s.pos)) own.set(n, s);
      const ids = topLevelIds(sf), entries = mapEntries(tsMap(f, text));
      const imports = importsOf(f, text);
      for (const n of namesUsed(stmts)) {
        if (own.has(n)) { addSig(`${f}#${n}`, entries.get(ids.get(own.get(n)))); continue; }
        if (!imports.has(n)) continue;
        const im = imports.get(n);
        const r = resolveImport(im.from, f, cache.fileSet(parent), ctx);
        if (r.kind === "external") continue;
        if (r.kind === "own-unresolved" || im.name === "*") { unresolved++; continue; }
        const sig = exportEntry(cache, parent, r.path, im.name, ctx);
        if (sig) addSig(`${r.path}#${im.name}`, sig);
        else unresolved++;
      }
    } else if (kind === "html") {
      const c = htmlChangedCode(text, ranges);
      if (c) { parsedUnits++; code += `// ${f}\n${c}`; }
    } else if (kind === "css") {
      let c = "";
      try { c = cssChangedCode(text, ranges); } catch { c = ""; }
      if (c) { parsedUnits++; code += `// ${f}\n${c}`; }
    } else if (sizing && SIZING_EXT.test(f)) {
      // The layer cannot read a .vue or .svelte file before 1.0: the whole file counts on the layer side too.
      unsupported.push(f);
      code += `// ${f}\n${text}`;
    }
  }
  if (!parsedUnits && !unsupported.length) return null; // the contract's rule 3

  const isSource = (p) => SOURCE_EXT.test(p) || (sizing && SIZING_EXT.test(p));
  const folders = new Set(files.map((f) => path.posix.dirname(f)));
  const folderFiles = parentTree.filter((t) => folders.has(path.posix.dirname(t.path)) && isSource(t.path));
  const folderTexts = cache.read(folderFiles);
  const overview = folderOverview(parentTree.map((t) => t.path), { sizing });
  const folderMaps = folderFiles.map((t) => cache.map(t, folderTexts.get(t.path))).join("");
  const charge = unresolvedCharge(folderMaps, unresolved);
  const baseline = files.filter((f) => texts.has(f)).map((f) => `// ${f}\n${texts.get(f)}`).join("\n");
  const layer = overview + folderMaps + code + signatures + charge;
  return { baseline, layer, parts: { overview, folderMaps, code, signatures, charge }, unresolved, unsupported, wholeMapItems: parentTree.filter((t) => isSource(t.path)) };
}

// ---------------- One repository ----------------

/** A path from a repository, made safe to store: no control characters, at most 200 characters. */
const safePath = (p) => p.replace(/[\u0000-\u001f\u007f]/g, "?").slice(0, 200);

async function measureRepo(entry) {
  const dir = ensureClone(entry);
  const sizing = entry.role === "sizing";
  const trees = new Map(), byPaths = new Map(), fileSets = new Map(), ctxs = new Map(), mapCache = new Map(), mapTokens = new Map();
  const cache = {
    tree: (c) => { if (!trees.has(c)) trees.set(c, tree(dir, c)); return trees.get(c); },
    byPath: (c) => { if (!byPaths.has(c)) byPaths.set(c, new Map(cache.tree(c).map((t) => [t.path, t]))); return byPaths.get(c); },
    fileSet: (c) => { if (!fileSets.has(c)) fileSets.set(c, new Set(cache.tree(c).map((t) => t.path))); return fileSets.get(c); },
    read: (items) => readBlobs(dir, items.filter(Boolean)),
    ctx: (c) => {
      if (!ctxs.has(c)) {
        const t = cache.tree(c);
        const cfg = t.find((x) => x.path === "tsconfig.json");
        const cfgText = cfg ? readBlobs(dir, [cfg]).get(cfg.path) ?? "" : "";
        const pkgs = t.filter((x) => /(^|\/)package\.json$/.test(x.path) && !x.path.split("/").includes("node_modules"));
        const pkgTexts = readBlobs(dir, pkgs);
        ctxs.set(c, { aliases: aliasesFrom(cfgText), baseUrl: cfg ? baseUrlFrom(cfgText) : null, workspaces: workspacePackages(pkgs.map((p) => ({ path: p.path, text: pkgTexts.get(p.path) ?? "" }))) });
      }
      return ctxs.get(c);
    },
    map: (t, text) => {
      const k = `${t.id}:${t.path}`;
      if (!mapCache.has(k)) {
        let m;
        try { m = text === undefined ? `${t.path} (not read: over ${MAX_FILE_BYTES} bytes)\n` : fileMap(t.path, text); }
        catch { m = `${t.path} (not parsed)\n`; }
        mapCache.set(k, m);
      }
      return mapCache.get(k);
    },
  };
  const wholeMapTokens = (items) => {
    const missing = items.filter((t) => !mapTokens.has(`${t.id}:${t.path}`));
    for (let i = 0; i < missing.length; i += 500) {
      const chunk = missing.slice(i, i + 500), texts = readBlobs(dir, chunk);
      for (const t of chunk) mapTokens.set(`${t.id}:${t.path}`, tok(cache.map(t, texts.get(t.path)))[E]);
    }
    return items.reduce((sum, t) => sum + mapTokens.get(`${t.id}:${t.path}`), 0);
  };

  const commits = git(dir, ["rev-list", "--first-parent", `--max-count=${WALK_LIMIT}`, entry.sha]).split("\n").filter(Boolean);
  const tasks = [], skipped = [];
  let walked = 0;
  for (const c of commits) {
    if (tasks.length >= TASKS_PER_REPO) break;
    walked++;
    const [, ...parents] = git(dir, ["rev-list", "--parents", "-n", "1", c]).trim().split(" ");
    if (parents.length !== 1) continue;
    const [authorName, authorEmail] = git(dir, ["log", "-1", "--no-show-signature", "--format=%an%x00%ae", c]).split("\0");
    const entries = parseNameStatusZ(git(dir, ["diff-tree", "-r", "-z", "--no-commit-id", "--name-status", "-M", parents[0], c]));
    const files = qualifyingFiles({ parents: parents.length, authorName, authorEmail, entries }, { sizing });
    if (!files) continue;
    let m;
    try {
      m = measureTask(dir, entry, c, parents[0], files, cache);
    } catch (e) {
      // A hostile or broken file (a stack overflow on deep nesting, for example) skips its task, never the run.
      skipped.push({ commit: c, reason: `parse failure: ${String(e?.name ?? "Error")}` });
      continue;
    }
    if (!m) continue;
    if (m.skip) { skipped.push({ commit: c, reason: m.skip }); continue; }
    const bClaude = await claudeCount(m.baseline), lClaude = await claudeCount(m.layer);
    const b = tok(m.baseline)[E], l = tok(m.layer)[E], whole = wholeMapTokens(m.wholeMapItems);
    const rest = tok(m.parts.code + m.parts.signatures + m.parts.charge)[E];
    tasks.push({
      commit: c, parent: parents[0], files: files.map(safePath),
      unsupportedFiles: m.unsupported.map(safePath), unresolvedNames: m.unresolved,
      o200k: { baseline: b, layer: l, overview: tok(m.parts.overview)[E], folderMaps: tok(m.parts.folderMaps)[E], code: tok(m.parts.code)[E], signatures: tok(m.parts.signatures)[E], unresolvedCharge: tok(m.parts.charge)[E], wholeMap: whole },
      claude: proxyOnly() ? null : { baseline: bClaude, layer: lClaude },
      // codeOnly is reported beside the gate, never in its place: the code needed and its signatures without any map.
      saving: { o200k: saving(l, b), claude: proxyOnly() ? null : saving(lClaude, bClaude), o200kWholeMap: saving(whole + rest, b), o200kCodeOnly: saving(rest, b) },
    });
    process.stderr.write(`  ${entry.repo}: task ${tasks.length} (${c.slice(0, 10)}), saving ${tasks.at(-1).saving.o200k?.toFixed(2)} (o200k)\n`);
  }
  const shallowEnd = commits.length < WALK_LIMIT && git(dir, ["rev-parse", "--is-shallow-repository"]).trim() === "true";
  const med = (k) => median(tasks.map((t) => t.saving[k]));
  const note = [
    tasks.length < 3 ? `fewer than 3 qualifying commits in ${walked} walked: replace with a reserve` : tasks.length < 5 ? `only ${tasks.length} qualifying commits in ${walked} walked` : null,
    shallowEnd ? `the history ends after ${commits.length} commits (the repository is younger, or the clone is too shallow)` : null,
    skipped.length ? `${skipped.length} commits skipped (see "skipped")` : null,
  ].filter(Boolean).join("; ") || null;
  const share = (part) => median(tasks.map((t) => (t.o200k.layer ? t.o200k[part] / t.o200k.layer : null)));
  return {
    ...entry, walked, tasks, skipped, note,
    median: { o200k: med("o200k"), claude: med("claude"), o200kWholeMap: med("o200kWholeMap"), o200kCodeOnly: med("o200kCodeOnly") },
    layerShare: { overview: share("overview"), folderMaps: share("folderMaps"), code: share("code"), signatures: share("signatures"), unresolvedCharge: share("unresolvedCharge") },
  };
}

// ---------------- The report ----------------

const pct = (x) => (x === null || x === undefined ? "–" : `${(x * 100).toFixed(1)}%`);
function report(meta, repos, s) {
  const L = [];
  const counterName = meta.proxyOnly ? "o200k_base" : `Claude (${meta.model})`;
  const main = meta.proxyOnly ? s.o200k : s.claude;
  L.push(`# Phase 0 corpus run (${meta.date})`, "");
  L.push(`**Gate C0:** ${s.gate.result}${s.gate.median !== undefined ? ` (median saving ${pct(s.gate.median)}, threshold 50%)` : ""}.`);
  if (meta.proxyReason) L.push("", `**Proxy only:** ${meta.proxyReason}. The numbers below are o200k_base, a proxy; the gate has no result until Anthropic's counter has counted them.`);
  L.push("", "**Conditions:** " + [
    `${s.gateRepositories} of ${GATE_SIZE} gate repositories with 3 tasks or more`, `this repository's commit ${meta.commit}${meta.dirty ? " with uncommitted changes" : ""}`,
    `tokenizers: ${meta.tokenizers.join("; ")}`, `Node ${meta.node}`, `git ${meta.git}`, "NOT timed",
  ].join("; ") + ".");
  L.push("", "Both sides know which files each commit changed, so this measures the cost of reading, not of finding (docs/contract.md). Anthropic's count includes a small fixed overhead per message on both sides, which makes the saving slightly smaller, not larger.");
  if (meta.replacements.length) L.push("", "**Replacements:** " + meta.replacements.map((r) => `${r.replaced} by ${r.by} (${r.reason})`).join("; ") + ".");
  L.push("", "| Repository | Role | Band | Tasks | Median saving (Claude) | Median saving (o200k) | With the whole map (o200k) | Note |", "|---|---|---|---|---|---|---|---|");
  for (const r of repos) L.push(`| ${r.repo} | ${r.role} | ${r.band} | ${r.tasks.length} | ${pct(r.median.claude)} | ${pct(r.median.o200k)} | ${pct(r.median.o200kWholeMap)} | ${r.note ?? ""} |`);
  L.push("", `**Spread over the gate repositories (${counterName}):** lower quartile ${pct(main.spread.q1)}, median ${pct(main.spread.median)}, upper quartile ${pct(main.spread.q3)}.`);
  if (!meta.proxyOnly) L.push(`**The same with o200k_base:** lower quartile ${pct(s.o200k.spread.q1)}, median ${pct(s.o200k.spread.median)}, upper quartile ${pct(s.o200k.spread.q3)}.`);
  L.push(`**With the whole-repository map instead of the folder map (o200k):** median ${pct(s.o200kWholeMap.median)}.`);
  L.push(`**The code needed and its signatures alone, without any map (o200k; beside the gate, never in its place):** median ${pct(s.o200kCodeOnly.median)}.`);
  L.push("", "**Where the layer's tokens go** (the median share of each part, per repository, o200k):", "", "| Repository | Folder overview | Folder maps | Code needed | Signatures | Unresolved charge |", "|---|---|---|---|---|---|");
  for (const r of repos) L.push(`| ${r.repo} | ${pct(r.layerShare.overview)} | ${pct(r.layerShare.folderMaps)} | ${pct(r.layerShare.code)} | ${pct(r.layerShare.signatures)} | ${pct(r.layerShare.unresolvedCharge)} |`);
  L.push("");
  if (main.worst.repository) L.push(`**Worst repository:** ${main.worst.repository.repo} (${pct(main.worst.repository.median)}). **Worst task:** ${main.worst.task.repo} ${main.worst.task.commit.slice(0, 10)} (${pct(main.worst.task.saving)}).`);
  L.push("", `**By category (${counterName}):** ` + Object.entries(main.byCategory).map(([k, v]) => `${k} ${pct(v)}`).join(", ") + ".");
  L.push(`**By size band (${counterName}):** ` + Object.entries(main.byBand).map(([k, v]) => `${k} ${pct(v)}`).join(", ") + ".");
  L.push(`**Names not resolved** (each charged one typical map line on the layer side): ${s.unresolvedNames}.`);
  if (s.sizing.length) L.push("", "**Vue and Svelte apps (sizing, not in the gate):** " + s.sizing.map((z) => `${z.repo} ${z.tasks} tasks, median ${pct(z.median)} (o200k), ${z.unsupportedFiles} .vue or .svelte files read whole`).join("; ") + ".");
  if (s.needReserve.length) L.push("", `**Need a reserve (fewer than 3 tasks):** ${s.needReserve.join(", ")}.`);
  L.push("", "**First-pass limits, written down:** the signatures come from names, through relative imports, the root tsconfig's `paths` and `baseUrl`, workspace packages and up to 3 re-exports; a name that cannot be resolved is charged one typical map line. A changed class or component counts in full. The whole-repository map is o200k only, the sum of the per-file maps. Files over 1 MB are not read.");
  return L.join("\n") + "\n";
}

// ---------------- Run ----------------

const status = git(repoRoot, ["status", "--porcelain"]).trim();
if (status && !flag("allow-dirty")) throw new Error("this repository has uncommitted changes, so the results could not name the code that ran. Commit first, or pass --allow-dirty for a test run.");
prepareCache();
if (fs.existsSync(countCachePath)) countCache = JSON.parse(fs.readFileSync(countCachePath, "utf8"));
if (!proxyOnly()) {
  try { await claudeCount("A probe of the token counter."); }
  catch (e) { proxyReason = `the token counter refused a probe (${String(e.message).replace(/sk-[\w-]+/g, "<REDACTED>").slice(0, 200)})`; }
}
console.error(`Phase 0 corpus run: ${selected.length} repositories, ${proxyOnly() ? `o200k_base only (${proxyReason})` : `o200k_base and ${MODEL}`}. NOT timed.`);
const repos = [];
for (const entry of selected) {
  console.error(`${entry.repo} (${entry.role})`);
  repos.push(await measureRepo(entry));
}
const meta = {
  date: today, commit: git(repoRoot, ["rev-parse", "HEAD"]).trim(), dirty: Boolean(status), node: process.version,
  git: git(repoRoot, ["--version"]).trim().replace(/^git version /, ""),
  tokenizers: proxyOnly() ? [E] : [E, `Anthropic count_tokens (${MODEL}, anthropic-version ${ANTHROPIC_VERSION})`],
  model: proxyOnly() ? null : MODEL, proxyOnly: proxyOnly(), proxyReason, replacements,
  tasksPerRepo: TASKS_PER_REPO, walkLimit: WALK_LIMIT, gateSize: GATE_SIZE, maxFileBytes: MAX_FILE_BYTES,
  repositoriesSelected: only ? [...only] : "all",
};
const s = summarize(repos, { gateSize: GATE_SIZE, proxyOnly: proxyOnly() });
const outDir = path.join(repoRoot, "docs", "measurements");
fs.writeFileSync(path.join(outDir, `${OUT}.json`), JSON.stringify({ meta, summary: s, repositories: repos }, null, 2) + "\n");
fs.writeFileSync(path.join(outDir, `${OUT}.md`), report(meta, repos, s));
console.error(`Results: docs/measurements/${OUT}.json and .md. Gate C0: ${s.gate.result}.`);
if (flag("clean")) {
  // Only this script's own clones and count cache, in a folder that carries its marker.
  for (const r of selected) fs.rmSync(path.join(CACHE, r.repo.replace("/", "__")), { recursive: true, force: true });
  fs.rmSync(countCachePath, { force: true });
  fs.rmSync(MARKER, { force: true });
  if (!fs.readdirSync(CACHE).length) fs.rmdirSync(CACHE);
}
