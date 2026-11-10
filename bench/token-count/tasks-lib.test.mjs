// Tests for tasks-lib.mjs: C0's task rule on a throwaway repository. Skipped only where a bench package is missing, as
// corpus-lib.test.mjs. Each test makes its own folder.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

let L = null;
try {
  L = await import("./tasks-lib.mjs");
} catch (e) {
  const missingPackage = e?.code === "ERR_MODULE_NOT_FOUND" && /'(typescript|parse5|postcss|js-tiktoken)'/.test(e.message);
  if (!missingPackage) throw e;
}
const t = L ? test : test.skip;

const env = () => {
  const e = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k)));
  return { ...e, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_DATE: "2026-11-07T15:00:00+0000", GIT_COMMITTER_DATE: "2026-11-07T15:00:00+0000" };
};

/** A throwaway repository; `run(args)` runs git in it; `commit(files, message, author)` writes, adds and commits. */
function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tasks-lib-"));
  const run = (args) => spawnSync("git", args, { cwd: dir, encoding: "utf8", env: env() });
  run(["init", "-q", "-b", "main"]);
  const commit = (files, message = "x", author = "A Person <a@example.invalid>") => {
    for (const [f, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      if (text === null) fs.rmSync(path.join(dir, f));
      else fs.writeFileSync(path.join(dir, f), text);
    }
    run(["add", "-A"]);
    run(["-c", "user.name=A", "-c", "user.email=a@example.invalid", "commit", "-q", "--author", author, "-m", message]);
    return run(["rev-parse", "HEAD"]).stdout.trim();
  };
  return { dir, run, commit };
}

const FN = "export function f() {\n  return 1;\n}\n";
const FN2 = "export function f() {\n  return 2;\n}\n";

t("a commit that changes a function of a source file passes, with its files and its parent", () => {
  const r = makeRepo();
  try {
    const base = r.commit({ "src/a.ts": FN });
    const c = r.commit({ "src/a.ts": FN2 });
    const task = L.taskOf(r.dir, c, { withBaseline: true });
    assert.deepEqual(task.files, ["src/a.ts"]);
    assert.equal(task.parent, base);
    assert.ok(task.baseline > 0);
  } finally { fs.rmSync(r.dir, { recursive: true, force: true }); }
});

t("rule 1: a merge, a root commit and a bot's commit do not pass", () => {
  const r = makeRepo();
  try {
    const root = r.commit({ "src/a.ts": FN });
    assert.equal(L.taskOf(r.dir, root), null, "a root commit has no parent");
    const bot = r.commit({ "src/a.ts": FN2 }, "bump", "dependabot[bot] <bot@example.invalid>");
    assert.equal(L.taskOf(r.dir, bot), null, "a bot");
    r.run(["switch", "-q", "-c", "side"]);
    r.commit({ "src/b.ts": FN });
    r.run(["switch", "-q", "main"]);
    r.commit({ "src/c.ts": FN });
    r.run(["-c", "user.name=A", "-c", "user.email=a@example.invalid", "merge", "-q", "--no-ff", "-m", "merge", "side"]);
    const merge = r.run(["rev-parse", "HEAD"]).stdout.trim();
    assert.equal(L.taskOf(r.dir, merge), null, "a merge");
  } finally { fs.rmSync(r.dir, { recursive: true, force: true }); }
});

t("rule 2: tests, added files and more than 5 files do not count", () => {
  const r = makeRepo();
  try {
    r.commit({ "src/a.ts": FN, "src/a.test.ts": FN, "README.md": "x\n" });
    const onlyTest = r.commit({ "src/a.test.ts": FN2 });
    assert.equal(L.taskOf(r.dir, onlyTest), null, "a test file alone");
    const onlyDoc = r.commit({ "README.md": "y\n" });
    assert.equal(L.taskOf(r.dir, onlyDoc), null, "a document alone");
    const added = r.commit({ "src/new.ts": FN });
    assert.equal(L.taskOf(r.dir, added), null, "an added file");
    const many = {};
    for (let i = 0; i < 6; i++) many[`src/m${i}.ts`] = FN;
    r.commit(many);
    const manyChanged = {};
    for (let i = 0; i < 6; i++) manyChanged[`src/m${i}.ts`] = FN2;
    assert.equal(L.taskOf(r.dir, r.commit(manyChanged)), null, "6 files");
  } finally { fs.rmSync(r.dir, { recursive: true, force: true }); }
});

t("rule 3: a change outside every declaration does not pass", () => {
  const r = makeRepo();
  try {
    r.commit({ "src/a.ts": "// a comment\n" + FN });
    const c = r.commit({ "src/a.ts": "// another comment\n" + FN });
    assert.equal(L.taskOf(r.dir, c), null, "only a comment changed");
  } finally { fs.rmSync(r.dir, { recursive: true, force: true }); }
});

t("the walk returns the first commits that pass, newest first, and stops at max", () => {
  const r = makeRepo();
  try {
    r.commit({ "src/a.ts": FN });
    const c1 = r.commit({ "src/a.ts": FN2 });
    r.commit({ "README.md": "z\n" });
    const c2 = r.commit({ "src/a.ts": FN });
    const head = r.commit({ "src/a.ts": FN2 });
    const all = L.walkTasks(r.dir, head, { max: 10 });
    assert.deepEqual(all.map((x) => x.commit), [head, c2, c1]);
    assert.deepEqual(L.walkTasks(r.dir, head, { max: 2 }).map((x) => x.commit), [head, c2]);
    assert.throws(() => L.walkTasks(r.dir, "--output=x", { max: 1 }), /bad pin/);
  } finally { fs.rmSync(r.dir, { recursive: true, force: true }); }
});
