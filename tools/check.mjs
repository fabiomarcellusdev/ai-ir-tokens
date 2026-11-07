// check.mjs: the checks that must pass at each milestone (docs/testing.md).
//
//   node tools/check.mjs fast            every commit (the pre-commit hook runs it)
//   node tools/check.mjs full            every push and pull request (the pre-push hook runs it)
//   node tools/check.mjs gate            a phase gate: full, plus the gate tests in tests/gates/
//   node tools/check.mjs update-golden   re-pin the sample views after an explained, intended change
//
// Uses Node built-ins only. Exit 0 when every check passes, 1 when one fails.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BENCH = path.join(ROOT, "bench", "token-count");
const MIN_AGE_MINUTES = 86400; // 60 days (decision 0002)

// ---------------------------------------------------------------------------------------------
// Pure checks, exported for tools/check.test.mjs
// ---------------------------------------------------------------------------------------------

/** Problems with the package pins and pnpm's safety settings. An empty list means the guards are intact. */
export function guardProblems({ packageJson, workspaceYaml, settingsJson }, today = new Date()) {
  const p = [];
  const pkg = JSON.parse(packageJson);
  for (const [name, spec] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
    if (!/^\d+\.\d+\.\d+$/.test(spec)) p.push(`${name} is "${spec}", not an exact version`);
  }
  if (!/^pnpm@\d+\.\d+\.\d+\+sha512\.[0-9a-f]{128}$/.test(pkg.packageManager ?? "")) p.push("packageManager is not pnpm pinned with a sha512 hash");
  if (pkg.devEngines?.packageManager?.name !== "pnpm" || pkg.devEngines?.packageManager?.onFail !== "error") p.push("devEngines.packageManager is not pnpm with onFail: error");
  if (pkg.private !== true) p.push('the package is not "private": true');

  const setting = (key) => workspaceYaml.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m"))?.[1];
  const age = Number(setting("minimumReleaseAge"));
  if (!(age >= MIN_AGE_MINUTES)) p.push(`minimumReleaseAge is ${setting("minimumReleaseAge")}, below ${MIN_AGE_MINUTES} minutes`);
  const want = {
    minimumReleaseAgeStrict: "true", trustPolicy: "no-downgrade", blockExoticSubdeps: "true", strictDepBuilds: "true",
    allowBuilds: "{}", ignoreScripts: "true", verifyDepsBeforeRun: "error", autoInstallPeers: "false", pmOnFail: "error", saveExact: "true",
  };
  for (const [k, v] of Object.entries(want)) if (setting(k) !== v) p.push(`${k} is ${setting(k) ?? "missing"}, not ${v}`);

  // Every security exception carries a removal date; an expired one fails.
  for (const m of workspaceYaml.matchAll(/Remove this entry on or after (\d{4}-\d{2}-\d{2})/g)) {
    if (new Date(`${m[1]}T00:00:00Z`) <= today) p.push(`a minimumReleaseAgeExclude entry expired on ${m[1]}; remove it (decision 0002)`);
  }

  p.push(...hookProblems(settingsJson));
  return p;
}

// Each guard must run as a PreToolUse hook, on the tools it guards, as "node <the guard>", and block on failure.
const REQUIRED_HOOKS = [
  { file: "package-guard.mjs", tools: ["Bash", "PowerShell"] },
  { file: "security-guard.mjs", tools: ["Bash", "PowerShell", "WebFetch", "mcp__.*"] },
  { file: "quiet-hours-guard.mjs", tools: ["*"] },
];

/** Problems with the guard hooks in .claude/settings.json. An empty list means each guard runs as required. */
export function hookProblems(settingsJson) {
  const groups = JSON.parse(settingsJson).hooks?.PreToolUse ?? [];
  const problems = [];
  for (const req of REQUIRED_HOOKS) {
    const cmd = new RegExp(`^node\\s+"?\\$CLAUDE_PROJECT_DIR/\\.claude/hooks/${req.file.replace(".", "\\.")}"?$`);
    const ok = groups.some((g) => {
      const matcher = g.matcher ?? "*";
      const covers = req.tools[0] === "*" ? matcher === "*" || matcher === "" : matcher === "*" || req.tools.every((t) => matcher.split("|").includes(t));
      return covers && (g.hooks ?? []).some((h) => h.type === "command" && cmd.test(h.command ?? "") && h.onFailure === "block");
    });
    if (!ok) problems.push(`.claude/settings.json must run ${req.file} as a PreToolUse hook on ${req.tools.join(", ")}, as "node $CLAUDE_PROJECT_DIR/.claude/hooks/${req.file}", with onFailure "block"`);
  }
  return problems;
}

/** Problems with the git hooks: each must run git-guard before the checks. */
export function gitHookProblems(preCommit, prePush) {
  const p = [];
  if (!/node tools\/git-guard\.mjs pre-commit[^\n]*\|\| exit 1[\s\S]*node tools\/check\.mjs fast/.test(preCommit)) p.push(".githooks/pre-commit must run git-guard pre-commit, then check.mjs fast");
  if (!/node tools\/git-guard\.mjs pre-push[^\n]*\|\| exit 1[\s\S]*node tools\/check\.mjs full/.test(prePush)) p.push(".githooks/pre-push must run git-guard pre-push, then check.mjs full");
  return p;
}

/** Lines of `text` that contain a private term (case-insensitive). */
export function privateHits(text, terms) {
  const hits = [];
  const lower = terms.map((t) => t.toLowerCase());
  text.split(/\r?\n/).forEach((line, i) => {
    const l = line.toLowerCase();
    for (const t of lower) if (l.includes(t)) hits.push({ line: i + 1, term: t });
  });
  return hits;
}

/** File names that differ between two folders: missing, extra or changed. */
export function folderDiff(expectedDir, actualDir, ignore = new Set()) {
  const list = (d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => !ignore.has(f)).sort() : []);
  const exp = list(expectedDir), act = list(actualDir);
  const diffs = [];
  for (const f of exp) {
    if (!act.includes(f)) diffs.push(`missing: ${f}`);
    else if (!fs.readFileSync(path.join(expectedDir, f)).equals(fs.readFileSync(path.join(actualDir, f)))) diffs.push(`changed: ${f}`);
  }
  for (const f of act) if (!exp.includes(f)) diffs.push(`new: ${f}`);
  return diffs;
}

// ---------------------------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------------------------

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `\n      ${detail.split("\n").join("\n      ")}` : ""}`);
}
const run = (args, opts = {}) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", ...opts });
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function unitTests() {
  const r = run(["--test", ".claude/hooks/*.test.mjs", "tools/*.test.mjs"]);
  const summary = (r.stdout ?? "").split("\n").filter((l) => /^ℹ (tests|pass|fail)|^# (tests|pass|fail)|✖/.test(l)).join("\n");
  record("unit tests (guards and tools)", r.status === 0, r.status === 0 ? summary : `${summary}\n${r.stderr ?? ""}`.trim());
}

function voiceLint() {
  const r = run(["tools/voice-lint.mjs"]);
  record("voice lint (docs/voice.md terms)", r.status === 0, (r.stdout + r.stderr).trim());
}

function guards() {
  const problems = guardProblems({
    packageJson: read("bench/token-count/package.json"),
    workspaceYaml: read("bench/token-count/pnpm-workspace.yaml"),
    settingsJson: read(".claude/settings.json"),
  });
  problems.push(...gitHookProblems(read(".githooks/pre-commit"), read(".githooks/pre-push")));
  record("package guards intact (decision 0002)", problems.length === 0, problems.join("\n"));
}

function privacy() {
  const termsFile = path.join(ROOT, "private-docs", "privacy-terms.txt");
  if (!fs.existsSync(termsFile)) {
    record("privacy lint (skipped: no private-docs/privacy-terms.txt here)", true);
    return;
  }
  const terms = fs.readFileSync(termsFile, "utf8").split(/\r?\n/).map((t) => t.trim()).filter((t) => t && !t.startsWith("#"));
  const git = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" });
  if (git.status !== 0) return record("privacy lint", false, "git ls-files failed");
  const allowed = new Set(["docs/measurements/2026-11-06-sample-corpus.json"]); // raw record, kept as measured
  const hits = [];
  for (const f of git.stdout.split("\n").filter(Boolean)) {
    if (allowed.has(f)) continue;
    const buf = fs.readFileSync(path.join(ROOT, f));
    if (buf.includes(0)) continue; // binary
    for (const h of privateHits(buf.toString("utf8"), terms)) hits.push(`${f}:${h.line} contains "${h.term}"`);
  }
  record("privacy lint (no private term in a file that git would publish)", hits.length === 0, hits.join("\n"));
}

function golden() {
  if (!fs.existsSync(path.join(BENCH, "node_modules"))) {
    return record("golden sample views", false, "bench/token-count/node_modules is missing. Install with the owner's yes (CLAUDE.md, Packages).");
  }
  const r = run([path.join(BENCH, "count.mjs")], { cwd: BENCH });
  if (r.status !== 0) return record("golden sample views", false, r.stderr);
  const diffs = folderDiff(path.join(BENCH, "golden"), path.join(BENCH, "out"));
  record(
    "golden sample views (bench/token-count/golden)",
    diffs.length === 0,
    diffs.length ? `${diffs.join("\n")}\nIf the change is intended: explain it, run "node tools/check.mjs update-golden", and commit both together.` : "",
  );
}

function osv() {
  const r = run(["tools/osv-check.mjs", "bench/token-count/pnpm-lock.yaml"]);
  const last = (r.stdout ?? "").trim().split("\n").slice(-2).join("\n");
  record("known vulnerabilities (osv.dev)", r.status === 0, r.status === 0 ? last : `${r.stdout}\n${r.stderr}`.trim());
}

function gateTests() {
  const dir = path.join(ROOT, "tests", "gates");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".test.mjs")) : [];
  if (!files.length) return record("gate tests (none yet: tests/gates/ is empty until a phase adds its gate)", true);
  const r = run(["--test", ...files.map((f) => path.join("tests", "gates", f))]);
  record("gate tests (tests/gates)", r.status === 0, (r.stdout ?? "").split("\n").filter((l) => /^ℹ (pass|fail)|✖/.test(l)).join("\n"));
}

function updateGolden() {
  const r = run([path.join(BENCH, "count.mjs")], { cwd: BENCH });
  if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
  const g = path.join(BENCH, "golden");
  fs.rmSync(g, { recursive: true, force: true });
  fs.mkdirSync(g);
  for (const f of fs.readdirSync(path.join(BENCH, "out"))) fs.copyFileSync(path.join(BENCH, "out", f), path.join(g, f));
  console.log("Golden files updated. Explain the change in the commit message, and commit the golden files with it.");
}

const mode = process.argv[2];
// By file name, so a symlinked or junctioned checkout still runs the checks (a path comparison would skip them).
const isMain = process.argv[1] && path.basename(process.argv[1]) === "check.mjs";
if (isMain) {
  if (mode === "update-golden") updateGolden();
  else if (["fast", "full", "gate"].includes(mode)) {
    console.log(`ai-ir-tokens checks: ${mode}\n`);
    unitTests(); voiceLint(); guards(); privacy();
    if (mode !== "fast") { golden(); osv(); }
    if (mode === "gate") gateTests();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
    process.exit(failed.length ? 1 : 0);
  } else {
    console.error("Usage: node tools/check.mjs <fast|full|gate|update-golden>");
    process.exit(2);
  }
}
