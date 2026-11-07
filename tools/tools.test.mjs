// Offline tests for check.mjs, voice-lint.mjs and vet-package.mjs. Run: node --test "tools/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { guardProblems, hookProblems, gitHookProblems, privateHits, folderDiff } from "./check.mjs";
import { lint, BANNED } from "./voice-lint.mjs";
import { evaluate, clean } from "./vet-package.mjs";

// ---------------- check.mjs: guardProblems ----------------

const GOOD = {
  packageJson: JSON.stringify({
    private: true,
    packageManager: `pnpm@12.3.4+sha512.${"a".repeat(128)}`,
    devEngines: { packageManager: { name: "pnpm", version: "12.3.4", onFail: "error" } },
    dependencies: { postcss: "8.5.28" },
  }),
  workspaceYaml: [
    "minimumReleaseAge: 86400", "minimumReleaseAgeStrict: true", "trustPolicy: no-downgrade", "blockExoticSubdeps: true",
    "strictDepBuilds: true", "allowBuilds: {}", "ignoreScripts: true", "verifyDepsBeforeRun: error", "autoInstallPeers: false",
    "pmOnFail: error", "saveExact: true", "  # Remove this entry on or after 2026-11-29, when 1.2.2 is 60 days old.",
  ].join("\n"),
  settingsJson: JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: "*", hooks: [{ type: "command", command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/quiet-hours-guard.mjs"', onFailure: "block" }] },
        { matcher: "Bash|PowerShell", hooks: [{ type: "command", command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/package-guard.mjs"', onFailure: "block" }] },
        { matcher: "Bash|PowerShell|WebFetch|mcp__.*", hooks: [{ type: "command", command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/security-guard.mjs"', onFailure: "block" }] },
      ],
    },
  }),
};
const BEFORE_EXPIRY = new Date("2026-11-07T12:00:00Z");

test("intact guards give no problems", () => {
  assert.deepEqual(guardProblems(GOOD, BEFORE_EXPIRY), []);
});

// Negative controls: each weakening must be caught.
const weaken = {
  "a caret range": (g) => ({ ...g, packageJson: g.packageJson.replace('"8.5.28"', '"^8.5.28"') }),
  "pnpm without a hash": (g) => ({ ...g, packageJson: g.packageJson.replace(/\+sha512\.a+/, "") }),
  "not private": (g) => ({ ...g, packageJson: g.packageJson.replace('"private":true', '"private":false') }),
  "devEngines warn": (g) => ({ ...g, packageJson: g.packageJson.replace('"onFail":"error"', '"onFail":"warn"') }),
  "a 30-day age": (g) => ({ ...g, workspaceYaml: g.workspaceYaml.replace("86400", "43200") }),
  "scripts allowed": (g) => ({ ...g, workspaceYaml: g.workspaceYaml.replace("ignoreScripts: true", "ignoreScripts: false") }),
  "auto install before run": (g) => ({ ...g, workspaceYaml: g.workspaceYaml.replace("verifyDepsBeforeRun: error", "verifyDepsBeforeRun: install") }),
  "pnpm self-download": (g) => ({ ...g, workspaceYaml: g.workspaceYaml.replace("pmOnFail: error", "pmOnFail: download") }),
  "trust policy off": (g) => ({ ...g, workspaceYaml: g.workspaceYaml.replace("no-downgrade", "off") }),
  "a removed hook": (g) => ({ ...g, settingsJson: g.settingsJson.replace("security-guard.mjs", "x.mjs") }),
  "a removed quiet-hours hook": (g) => ({ ...g, settingsJson: g.settingsJson.replace("quiet-hours-guard.mjs", "x.mjs") }),
  // The forms the adversarial review showed a substring check would miss:
  "quiet-hours hook on a matcher that matches nothing": (g) => ({ ...g, settingsJson: g.settingsJson.replace('"matcher":"*"', '"matcher":"NoSuchTool"') }),
  "quiet-hours hook moved to PostToolUse": (g) => {
    const s = JSON.parse(g.settingsJson);
    s.hooks.PostToolUse = [s.hooks.PreToolUse.shift()];
    return { ...g, settingsJson: JSON.stringify(s) };
  },
  "a guard command that only echoes its name": (g) => ({ ...g, settingsJson: g.settingsJson.replace('node \\"$CLAUDE_PROJECT_DIR/.claude/hooks/quiet-hours-guard.mjs\\"', "echo quiet-hours-guard.mjs") }),
  "a guard that fails open": (g) => ({ ...g, settingsJson: g.settingsJson.replace('"onFailure":"block"', '"onFailure":"continue"') }),
  "the security guard not on WebFetch": (g) => ({ ...g, settingsJson: g.settingsJson.replace("Bash|PowerShell|WebFetch|mcp__.*", "Bash|PowerShell|mcp__.*") }),
  "the security guard not on MCP tools": (g) => ({ ...g, settingsJson: g.settingsJson.replace("|mcp__.*", "") }),
};
for (const [name, f] of Object.entries(weaken)) {
  test(`a weakened guard is caught: ${name}`, () => assert.ok(guardProblems(f(GOOD), BEFORE_EXPIRY).length > 0));
}

test("the git hooks must call git-guard before the checks", () => {
  const ok = ["node tools/git-guard.mjs pre-commit || exit 1\nexec node tools/check.mjs fast\n", 'node tools/git-guard.mjs pre-push "$@" || exit 1\nexec node tools/check.mjs full\n'];
  assert.deepEqual(gitHookProblems(...ok), []);
  assert.equal(gitHookProblems("exec node tools/check.mjs fast\n", ok[1]).length, 1);
  assert.equal(gitHookProblems(ok[0], "exec node tools/check.mjs full\n").length, 1);
  assert.equal(gitHookProblems(ok[0], 'node tools/git-guard.mjs pre-push "$@"\nexec node tools/check.mjs full\n').length, 1); // no "|| exit 1"
});

test("the real settings and git hooks pass the structure checks", () => {
  const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  assert.deepEqual(hookProblems(read(".claude/settings.json")), []);
  assert.deepEqual(gitHookProblems(read(".githooks/pre-commit"), read(".githooks/pre-push")), []);
});

test("an expired security exception fails", () => {
  assert.match(guardProblems(GOOD, new Date("2026-11-29T00:00:01Z")).join("\n"), /expired on 2026-11-29/);
});

// ---------------- check.mjs: privateHits and folderDiff ----------------

test("privateHits finds a term in any case, with its line", () => {
  assert.deepEqual(privateHits("ok\nSecret Plan here\n", ["secret plan"]), [{ line: 2, term: "secret plan" }]);
  assert.deepEqual(privateHits("nothing to see", ["secret plan"]), []);
});

test("folderDiff reports missing, new and changed files", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "ai-ir-golden-"));
  const a = path.join(base, "a"), b = path.join(base, "b");
  fs.mkdirSync(a); fs.mkdirSync(b);
  fs.writeFileSync(path.join(a, "same.txt"), "x"); fs.writeFileSync(path.join(b, "same.txt"), "x");
  fs.writeFileSync(path.join(a, "changed.txt"), "1"); fs.writeFileSync(path.join(b, "changed.txt"), "2");
  fs.writeFileSync(path.join(a, "gone.txt"), "x");
  fs.writeFileSync(path.join(b, "extra.txt"), "x");
  assert.deepEqual(folderDiff(a, b).sort(), ["changed: changed.txt", "missing: gone.txt", "new: extra.txt"]);
  fs.writeFileSync(path.join(b, "changed.txt"), "1"); // the same bytes again
  fs.rmSync(path.join(b, "extra.txt")); fs.writeFileSync(path.join(b, "gone.txt"), "x");
  assert.deepEqual(folderDiff(a, b), []);
  fs.rmSync(base, { recursive: true, force: true });
});

// ---------------- voice-lint.mjs ----------------

test("voice lint finds a banned word and honours voice-ok", () => {
  assert.equal(lint("The changeset is applied.")[0].use, "edit batch");
  assert.equal(lint("A Seamless experience").length, 1);
  assert.equal(lint("The changeset term is banned. voice-ok").length, 0);
  assert.equal(lint("The edit batch is applied.").length, 0);
});

test("every banned word appears in docs/voice.md, so the list cannot drift", () => {
  const voice = fs.readFileSync(new URL("../docs/voice.md", import.meta.url), "utf8").toLowerCase();
  for (const [word] of BANNED) assert.ok(voice.includes(word), `${word} is not in docs/voice.md`);
});

// ---------------- vet-package.mjs ----------------

const NOW = new Date("2026-11-07T00:00:00Z");
const meta = (over = {}) => ({
  name: "demo",
  maintainers: [{ name: "alice" }],
  time: { "1.0.0": "2026-01-01T00:00:00Z", "1.1.0": "2026-08-01T00:00:00Z" },
  versions: {
    "1.0.0": { license: "MIT", _npmUser: { name: "alice" }, dist: {} },
    "1.1.0": { license: "MIT", _npmUser: { name: "alice" }, dist: { attestations: {}, signatures: [{}] }, ...over },
  },
});
const ok = (r) => r.rules.every((x) => x.ok);

test("a clean, old, MIT version passes", () => assert.ok(ok(evaluate(meta(), "1.1.0", [], { now: NOW }))));
test("a young version fails the age rule", () => assert.ok(!ok(evaluate(meta(), "1.1.0", [], { now: new Date("2026-08-20T00:00:00Z") }))));
test("an install script fails", () => assert.ok(!ok(evaluate(meta({ scripts: { postinstall: "node x.js" } }), "1.1.0", [], { now: NOW }))));
test("an unknown licence fails", () => assert.ok(!ok(evaluate(meta({ license: "SSPL-1.0" }), "1.1.0", [], { now: NOW }))));
test("a high vulnerability fails; a low one passes", () => {
  assert.ok(!ok(evaluate(meta(), "1.1.0", [{ id: "GHSA-1", database_specific: { severity: "HIGH" } }], { now: NOW })));
  assert.ok(ok(evaluate(meta(), "1.1.0", [{ id: "GHSA-2", database_specific: { severity: "LOW" } }], { now: NOW })));
});
test("an unrated vulnerability fails", () => assert.ok(!ok(evaluate(meta(), "1.1.0", [{ id: "GHSA-3" }], { now: NOW }))));
test("a deprecated version fails", () => assert.ok(!ok(evaluate(meta({ deprecated: "use x" }), "1.1.0", [], { now: NOW }))));
test("a missing version fails", () => assert.ok(!ok(evaluate(meta(), "9.9.9", [], { now: NOW }))));
test("a change of publisher is flagged", () => {
  const info = evaluate(meta({ _npmUser: { name: "mallory" } }), "1.1.0", [], { now: NOW }).info;
  assert.match(info.find(([k]) => k.startsWith("publisher of the previous")).at(1), /CHANGED/);
});
test("untrusted text loses control and direction characters and is cut", () => {
  assert.equal(clean("a\u001b[31mb‮c"), "a [31mb c");
  assert.equal(clean("x".repeat(200), 10).length, 10);
});
