// Tests for r2-select-lib.mjs: the mechanical tests of gate R2's repository selection. Standard library only (the
// library imports no package).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORIES, FRESH_RESERVES, countFiles, recordProblem, publishedPackage, filesProblem, taskCountProblem, walkCategory,
} from "./r2-select-lib.mjs";

const TODAY = "2026-11-10";
const good = () => ({ full_name: "a/b", private: false, fork: false, archived: false, is_template: false, license: { spdx_id: "MIT" }, pushed_at: "2026-10-20T00:00:00Z", topics: ["react"] });

test("the categories and the reserves match the contract: 4 + 3 + 2 + 3 + 1 new, and 4 fresh reserves", () => {
  assert.deepEqual(CATEGORIES.map((c) => c.take), [4, 3, 2, 3, 1]);
  assert.equal(CATEGORIES[0].query, "topic:react language:TypeScript");
  assert.equal(FRESH_RESERVES.length, 4);
  const per = (cat) => FRESH_RESERVES.filter((r) => r.category === cat).length + CATEGORIES.find((c) => c.name === cat).take;
  assert.deepEqual([per("react-app"), per("static-site"), per("tailwind-site")], [6, 4, 2], "C0's gate mix for these categories");
});

test("test 1 and the topics of test 4: each reason is found, and a good record passes", () => {
  assert.equal(recordProblem(good(), TODAY), null);
  assert.match(recordProblem({ ...good(), fork: true }, TODAY), /fork/);
  assert.match(recordProblem({ ...good(), archived: true }, TODAY), /archived/);
  assert.match(recordProblem({ ...good(), is_template: true }, TODAY), /is_template/);
  assert.match(recordProblem({ ...good(), license: { spdx_id: "GPL-3.0" } }, TODAY), /licence GPL-3.0/);
  assert.match(recordProblem({ ...good(), license: null }, TODAY), /licence none/);
  assert.match(recordProblem({ ...good(), topics: ["react", "boilerplate"] }, TODAY), /topic boilerplate/);
  for (const l of ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC"]) assert.equal(recordProblem({ ...good(), license: { spdx_id: l } }, TODAY), null, l);
});

test("test 2's push date: the 90 days before the selection day, the day itself counts", () => {
  assert.equal(recordProblem({ ...good(), pushed_at: "2026-08-12T00:00:00Z" }, TODAY), null, "exactly 90 days");
  assert.match(recordProblem({ ...good(), pushed_at: "2026-08-11T23:59:59Z" }, TODAY), /90 days/);
  assert.match(recordProblem({ ...good(), pushed_at: "not a date" }, TODAY), /90 days/, "a bad date fails closed");
});

test("a reserve skips the topic test (test 4) and keeps the others", () => {
  assert.equal(recordProblem({ ...good(), topics: ["template"] }, TODAY, { reserve: true }), null);
  assert.match(recordProblem({ ...good(), fork: true }, TODAY, { reserve: true }), /fork/);
});

test("test 4's package part: a public package with an entry point is a library; a private app or a bare package is not", () => {
  assert.equal(publishedPackage({ name: "x", main: "index.js" }), true);
  assert.equal(publishedPackage({ name: "x", exports: {} }), true);
  assert.equal(publishedPackage({ name: "x", bin: "cli.js" }), true);
  assert.equal(publishedPackage({ name: "x", module: "m.js" }), true);
  assert.equal(publishedPackage({ name: "x", private: true, main: "index.js" }), false);
  assert.equal(publishedPackage({ name: "x", scripts: {} }), false);
  assert.equal(publishedPackage(null), false);
});

test("tests 2 and 3: source files counted as corpus.json counts them, Vue, Svelte and Astro at most 10%", () => {
  const src = Array.from({ length: 20 }, (_, i) => `src/f${i}.ts`);
  assert.equal(filesProblem(src), null, "exactly 20 files pass");
  assert.match(filesProblem(src.slice(0, 19)), /19 source files/);
  assert.equal(countFiles(["node_modules/x/a.js", "dist/b.js", "build/c.css", "vendor/d.js", "README.md", "src/a.ts"]).source, 1);
  // 18 TypeScript files and 2 Vue files: 10.0%, which passes; 3 Vue files: over 10%.
  const ten = [...Array.from({ length: 18 }, (_, i) => `a${i}.ts`), "a.vue", "b.vue"];
  assert.equal(filesProblem(ten), null);
  const over = [...Array.from({ length: 17 }, (_, i) => `a${i}.ts`), "a.vue", "b.vue", "c.vue"];
  assert.match(filesProblem(over), /test 3/);
  const astro = [...Array.from({ length: 20 }, (_, i) => `a${i}.ts`), ...Array.from({ length: 5 }, (_, i) => `p${i}.astro`)];
  assert.match(filesProblem(astro), /test 3/, "Astro files count against the share although they are not counted source files");
  assert.equal(countFiles(["node_modules/a.astro"]).markup, 0, "a vendored file does not count");
});

test("test 5: at least 10 qualifying commits", () => {
  assert.equal(taskCountProblem(10), null);
  assert.match(taskCountProblem(9), /9 qualifying/);
});

test("the walk takes the first N that pass, skips what is taken or in corpus.json, and records each skip with its reason", () => {
  const results = ["a/1", "a/2", "a/3", "a/4", "a/5", "a/6"].map((n) => ({ full_name: n }));
  const taken = new Set(["a/2"]);
  const corpus = new Set(["a/1"]);
  const check = (r) => (r.full_name === "a/3" ? "test 5: 4 qualifying commits within 500, under 10" : null);
  const { picked, skips } = walkCategory(results, { take: 2, taken, corpus, check });
  assert.deepEqual(picked.map((r) => r.full_name), ["a/4", "a/5"]);
  assert.deepEqual(skips.map((s) => s.repo), ["a/1", "a/2", "a/3"]);
  assert.match(skips[0].reason, /corpus\.json/);
  assert.match(skips[1].reason, /earlier category/);
  assert.ok(taken.has("a/4") && taken.has("a/5"), "a repository taken here is skipped in a later category");
});

test("the walk stops at N and never runs the costly check past it", () => {
  let calls = 0;
  const results = Array.from({ length: 10 }, (_, i) => ({ full_name: `a/${i}` }));
  walkCategory(results, { take: 3, taken: new Set(), corpus: new Set(), check: () => { calls++; return null; } });
  assert.equal(calls, 3);
});
