// Tests for corpus-lib.mjs: the task rule, the changed lines, the code needed, the map and the formula of gate C0
// (docs/contract.md, "Gate C0 in detail"). They need the bench packages (typescript, parse5, postcss); where those are
// not installed, the tests are skipped, as in tools/code-scanning.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";

// Skip only when a bench package is missing. Any other error (a syntax error, a lost export) fails the tests.
let lib = null;
try {
  lib = await import("./corpus-lib.mjs");
} catch (e) {
  const missingPackage = e?.code === "ERR_MODULE_NOT_FOUND" && /'(typescript|parse5|postcss|js-tiktoken)'/.test(e.message);
  if (!missingPackage) throw e;
}
const t = lib ? test : test.skip;
const L = lib ?? {};

// ---------------- the task rule ----------------

t("excluded files: tests, generated, minified, third-party and lockfiles; a substring is not enough", () => {
  for (const p of ["src/__tests__/a.ts", "test/a.ts", "pkg/tests/x.js", "spec/a.ts", "a.test.ts", "a.spec.tsx", "a_test.js", "a-spec.mjs",
    "dist/a.js", "packages/x/build/y.js", "vendor/z.css", "node_modules/a/b.js", "a.min.js", "styles.min.css", "pnpm-lock.yaml"]) {
    assert.equal(L.isExcluded(p), true, p);
  }
  for (const p of ["src/latest.ts", "src/contest.ts", "attest/a.ts", "src/testing-utils/a.ts", "src/specification.ts", "app/build-info.ts"]) {
    assert.equal(L.isExcluded(p), false, p);
  }
});

t("task files: source extensions only; .vue and .svelte only in a sizing repository", () => {
  assert.equal(L.isTaskFile("a/b.tsx"), true);
  assert.equal(L.isTaskFile("a/b.HTML"), true);
  assert.equal(L.isTaskFile("a/b.md"), false);
  assert.equal(L.isTaskFile("a/b.json"), false);
  assert.equal(L.isTaskFile("a/b.vue"), false);
  assert.equal(L.isTaskFile("a/b.vue", { sizing: true }), true);
  assert.equal(L.isTaskFile("a/b.svelte", { sizing: true }), true);
});

t("bots: [bot], Dependabot and Renovate, by name or e-mail", () => {
  assert.equal(L.isBot("dependabot[bot]"), true);
  assert.equal(L.isBot("Renovate Bot", ""), true);
  assert.equal(L.isBot("Alice", "12+renovate@users.noreply.github.com"), true);
  assert.equal(L.isBot("Alice", "alice@example.com"), false);
  assert.equal(L.isBot("Robot Ross", "r@example.com"), false);
});

t("name-status with NUL separators keeps odd paths exact, and splits renames into two paths", () => {
  const out = ["M", "src/a b.ts", "R087", "old/x.ts", "new/x.ts", "A", "src/ä\tt.ts", "D", "gone.css", ""].join("\0");
  assert.deepEqual(L.parseNameStatusZ(out), [
    { status: "M", path: "src/a b.ts" },
    { status: "R", oldPath: "old/x.ts", path: "new/x.ts" },
    { status: "A", path: "src/ä\tt.ts" },
    { status: "D", path: "gone.css" },
  ]);
  assert.deepEqual(L.parseNameStatusZ(""), []);
});

t("a commit qualifies with 1 to 5 modified task files; merges, bots, added and renamed files do not count", () => {
  const e = (status, p) => ({ status, path: p });
  const base = { parents: 1, authorName: "Alice", authorEmail: "a@example.com" };
  assert.deepEqual(L.qualifyingFiles({ ...base, entries: [e("M", "src/a.ts"), e("A", "src/b.ts"), e("R", "src/c.ts"), e("M", "README.md")] }), ["src/a.ts"]);
  assert.equal(L.qualifyingFiles({ ...base, parents: 2, entries: [e("M", "src/a.ts")] }), null);
  assert.equal(L.qualifyingFiles({ ...base, authorName: "dependabot[bot]", entries: [e("M", "src/a.ts")] }), null);
  assert.equal(L.qualifyingFiles({ ...base, entries: [e("A", "src/a.ts"), e("M", "src/a.test.ts")] }), null);
  const five = [1, 2, 3, 4, 5].map((i) => e("M", `src/f${i}.ts`));
  assert.equal(L.qualifyingFiles({ ...base, entries: five }).length, 5);
  assert.equal(L.qualifyingFiles({ ...base, entries: [...five, e("M", "src/f6.ts")] }), null);
  assert.equal(L.qualifyingFiles({ ...base, entries: [e("M", "src/App.vue")] }), null);
  assert.deepEqual(L.qualifyingFiles({ ...base, entries: [e("M", "src/App.vue")] }, { sizing: true }), ["src/App.vue"]);
});

// ---------------- changed lines ----------------

t("changed ranges of the old file; a pure insertion touches the lines on both sides of it", () => {
  const diff = [
    "diff --git a/x.ts b/x.ts",
    "@@ -10,3 +10,4 @@ function f() {",
    "@@ -5 +6 @@",
    "@@ -7,0 +9,2 @@",
    "@@ -0,0 +1,3 @@",
    "+@@ -99,1 +99,1 @@ this is an added line, not a hunk header",
  ].join("\n");
  assert.deepEqual(L.changedRanges(diff), [{ from: 10, to: 12 }, { from: 5, to: 5 }, { from: 7, to: 8 }, { from: 1, to: 1 }]);
  assert.deepEqual(L.changedRanges(""), []);
});

// ---------------- the code needed: TypeScript ----------------

const TS = [
  'import { db } from "./db";', //                 1
  "", //                                            2
  "/** Makes a user. */", //                        3
  "export async function createUser(email: string): Promise<User> {", // 4
  "  return db.insert({ email: normalize(email) });", // 5
  "}", //                                           6
  "", //                                            7
  "export class Store {", //                        8
  "  get(id: string) { return id; }", //            9
  "}", //                                           10
  "const a = 1; const b = '😀';", //                11
].join("\n");

t("changed statements: a JSDoc line counts for its function; an import alone is no statement", () => {
  const names = (ranges) => L.tsChangedStatements("x.ts", TS, ranges).map((s) => L.declaredNames(s).join(","));
  assert.deepEqual(names([{ from: 3, to: 3 }]), ["createUser"]);
  assert.deepEqual(names([{ from: 1, to: 1 }]), []);
  assert.deepEqual(names([{ from: 6, to: 8 }]), ["createUser", "Store"]);
  assert.deepEqual(names([{ from: 11, to: 11 }]), ["a", "b"]);
  assert.deepEqual(L.tsChangedStatements("x.ts", "﻿" + TS, [{ from: 9, to: 9 }]).map((s) => L.declaredNames(s)[0]), ["Store"]);
  assert.deepEqual(L.tsChangedStatements("x.ts", "", [{ from: 1, to: 1 }]), []);
  assert.doesNotThrow(() => L.tsChangedStatements("x.ts", "function (( {", [{ from: 1, to: 1 }]));
});

t("compact code of the chosen statements only; a statement that shares a line still appears in full", () => {
  const [fn] = L.tsChangedStatements("x.ts", TS, [{ from: 5, to: 5 }]);
  const code = L.tsCompactOf("x.ts", TS, [fn]);
  assert.match(code, /createUser/);
  assert.doesNotMatch(code, /class Store/);
  assert.doesNotMatch(code, /^@f\d/m, "no inline ID in the code needed");
  const [, b] = L.tsChangedStatements("x.ts", TS, [{ from: 11, to: 11 }]);
  assert.match(L.tsCompactOf("x.ts", TS, [b]), /😀/, "the second statement on line 11 is not lost");
});

t("names used: identifiers and types; not property names after a dot, not the declared name", () => {
  const [fn] = L.tsChangedStatements("x.ts", TS, [{ from: 5, to: 5 }]);
  const names = L.namesUsed([fn]);
  for (const n of ["db", "normalize", "User", "Promise", "email"]) assert.ok(names.has(n), n);
  assert.ok(!names.has("insert"), "a property name after a dot");
  assert.ok(!names.has("createUser"), "its own name");
});

t("map entries by ID; a class keeps its member lines", () => {
  const entries = L.mapEntries("x.ts\n  imports ./db\n  @f1 export fn a()  L1-2\n  @c2 class S  L3-9\n    get(id)\n    put(v)\n  @v3 const k = 1  L10-10\n");
  assert.deepEqual([...entries.keys()], ["f1", "c2", "v3"]);
  assert.equal(entries.get("c2"), "  @c2 class S  L3-9\n    get(id)\n    put(v)\n");
});

t("imports: default, named with an alias, and a namespace", () => {
  const im = L.importsOf("x.ts", 'import D, { a as b, c } from "./m";\nimport * as ns from "@/lib/n";\nimport "./side";\n');
  assert.deepEqual(Object.fromEntries(im), {
    D: { from: "./m", name: "default" },
    b: { from: "./m", name: "a" },
    c: { from: "./m", name: "c" },
    ns: { from: "@/lib/n", name: "*" },
  });
});

// ---------------- resolving modules ----------------

t("resolve: relative paths with and without extensions, index files, .js for .ts, aliases, packages", () => {
  const files = new Set(["src/a.ts", "src/lib/index.tsx", "src/util/x.ts", "src/c.mjs"]);
  const al = [{ prefix: "@/", targets: ["src/"] }];
  assert.deepEqual(L.resolveImport("./a", "src/b.ts", files), { kind: "own", path: "src/a.ts" });
  assert.deepEqual(L.resolveImport("./lib", "src/b.ts", files), { kind: "own", path: "src/lib/index.tsx" });
  assert.deepEqual(L.resolveImport("../util/x.js", "src/lib/y.ts", files), { kind: "own", path: "src/util/x.ts" });
  assert.deepEqual(L.resolveImport("./c.mjs", "src/b.ts", files), { kind: "own", path: "src/c.mjs" });
  assert.deepEqual(L.resolveImport("@/util/x", "src/b.ts", files, al), { kind: "own", path: "src/util/x.ts" });
  assert.deepEqual(L.resolveImport("./missing", "src/b.ts", files), { kind: "own-unresolved" });
  assert.deepEqual(L.resolveImport("react", "src/b.ts", files, al), { kind: "external" });
  assert.deepEqual(L.resolveImport("../../../../etc/passwd", "src/b.ts", files), { kind: "own-unresolved" });
});

t("aliases from a tsconfig with comments, trailing commas, a BOM and a URL in a string", () => {
  const cfg = '﻿{\n  // the site\n  "$schema": "https://json.schemastore.org/tsconfig",\n  "compilerOptions": {\n    "baseUrl": ".", /* root */\n    "paths": { "@/*": ["./src/*",], "~/*": ["app/*"], "exact": ["x.ts"], },\n  },\n}\n';
  assert.deepEqual(L.aliasesFrom(cfg), [{ prefix: "@/", targets: ["src/"] }, { prefix: "~/", targets: ["app/"] }]);
  assert.deepEqual(L.aliasesFrom("not json"), []);
  assert.deepEqual(L.aliasesFrom("{}"), []);
});

// ---------------- the code needed: HTML and CSS ----------------

const HTML = [
  "<!doctype html>", //                          1
  "<html><head><title>T</title></head>", //      2
  "<body>", //                                   3
  "<nav><a href=/>Home</a></nav>", //           4
  "<main>", //                                   5
  "<section><h2>Prices</h2>", //                 6
  "<p>Ten</p>", //                               7
  "</section>", //                               8
  "</main>", //                                  9
  "</body></html>", //                           10
].join("\n");

t("HTML: the smallest landmark that holds the change; the head; nothing outside them", () => {
  const sec = L.htmlChangedCode(HTML, [{ from: 7, to: 7 }]);
  assert.match(sec, /section/);
  assert.match(sec, /Ten/);
  assert.doesNotMatch(sec, /Home/);
  assert.match(L.htmlChangedCode(HTML, [{ from: 4, to: 4 }]), /Home/);
  assert.match(L.htmlChangedCode(HTML, [{ from: 2, to: 2 }]), /title/);
  const both = L.htmlChangedCode(HTML, [{ from: 7, to: 7 }, { from: 9, to: 9 }]);
  assert.equal((both.match(/Ten/g) ?? []).length, 1, "a section inside a chosen main is not repeated");
  assert.equal(L.htmlChangedCode("", [{ from: 1, to: 1 }]), "");
});

const CSS = [
  ".card { padding: 1rem; }", //                  1
  ".card__title { font-weight: 700; }", //         2
  ".nav { display: flex; }", //                    3
  "@media (min-width: 40rem) {", //                4
  "  .card { padding: 2rem; }", //                 5
  "}", //                                          6
].join("\n");

t("CSS: every rule of the changed block, also inside an at-rule; nothing for a change outside rules", () => {
  const code = L.cssChangedCode(CSS, [{ from: 2, to: 2 }]);
  assert.match(code, /\.card /);
  assert.match(code, /&__title|\.card__title/);
  assert.match(code, /2rem/);
  assert.doesNotMatch(code, /\.nav/);
  assert.equal(L.cssChangedCode(CSS, [{ from: 6, to: 6 }]).includes(".nav"), false);
  assert.equal(L.cssChangedCode("/* only a comment */", [{ from: 1, to: 1 }]), "");
  assert.throws(() => L.cssChangedCode(".a { color: red", [{ from: 1, to: 1 }]));
});

// ---------------- the map ----------------

t("file maps by kind; a file the views cannot read gets one line", () => {
  assert.match(L.fileMap("a.ts", TS), /createUser/);
  assert.match(L.fileMap("i.html", HTML), /nav/);
  assert.match(L.fileMap("s.css", CSS), /card/);
  assert.equal(L.fileMap("bad.css", ".a { color: red"), "bad.css (not parsed)\n");
  assert.equal(L.fileMap("App.vue", "<template/>"), "App.vue (not supported)\n");
});

t("folder overview: one line per folder with its source files, sorted; no node_modules, dist or minified files", () => {
  const paths = ["src/a.ts", "src/b.tsx", "src/x/c.css", "README.md", "index.html", "node_modules/r/i.js", "dist/a.js", "src/v.min.js", "src/App.vue"];
  assert.equal(L.folderOverview(paths), "./ 1\nsrc/ 2\nsrc/x/ 1\n");
  assert.equal(L.folderOverview(paths, { sizing: true }), "./ 1\nsrc/ 3\nsrc/x/ 1\n");
  assert.equal(L.folderOverview([]), "\n");
});

// ---------------- the formula ----------------

t("saving, median and quartiles; an empty baseline gives no saving; non-numbers are left out", () => {
  assert.equal(L.saving(25, 100), 0.75);
  assert.equal(L.saving(150, 100), -0.5, "a layer larger than the baseline is a negative saving, kept as it is");
  assert.equal(L.saving(10, 0), null);
  assert.equal(L.median([3, 1, 2]), 2);
  assert.equal(L.median([4, 1, 3, 2]), 2.5);
  assert.equal(L.median([5, null, NaN, 1]), 3);
  assert.equal(L.median([]), null);
  assert.equal(L.quantile([1, 2, 3, 4, 5], 0.25), 2);
  assert.equal(L.quantile([1, 2, 3, 4, 5], 0.75), 4);
  assert.equal(L.quantile([7], 0.25), 7);
});

// ---------------- the review's findings (2026-11-08) ----------------

t("HTML: a change that spans two blocks keeps both (finding F2)", () => {
  const code = L.htmlChangedCode(HTML, [{ from: 4, to: 6 }]);
  assert.match(code, /Home/, "the nav");
  assert.match(code, /Prices/, "the section");
});

t("CSS: at-rules with declarations and nested rules are on the layer side (finding F4)", () => {
  const css = ['@font-face { font-family: X; src: url(x.woff2); }', '.a { color: red; &:hover { color: blue; } }', '@theme { --color-brand: #f00; }', '.b { color: green; }'].join("\n");
  assert.match(L.cssChangedCode(css, [{ from: 1, to: 1 }]), /font-family: X/);
  const nested = L.cssChangedCode(css, [{ from: 2, to: 2 }]);
  assert.match(nested, /&:hover/);
  assert.match(nested, /blue/);
  assert.match(L.cssChangedCode(css, [{ from: 3, to: 3 }]), /--color-brand/);
  assert.doesNotMatch(L.cssChangedCode(css, [{ from: 4, to: 4 }]), /font-family|hover|brand/);
});

t("map entries: a variable statement with several names keeps every line (finding F11)", () => {
  const e = L.mapEntries("x.ts\n  @v1 export const a = 1  L1-1\n  @v1 export const b = 2  L1-1\n  @f2 fn c()  L2-2\n");
  assert.equal(e.get("v1"), "  @v1 export const a = 1  L1-1\n  @v1 export const b = 2  L1-1\n");
});

t("imports: CommonJS require and import-equals (finding F3)", () => {
  const im = L.importsOf("x.js", 'const db = require("./db");\nconst { a, b: c } = require("../lib/m");\nimport fs = require("fs");\nconst n = 1;\n');
  assert.deepEqual(Object.fromEntries(im), {
    db: { from: "./db", name: "*" },
    a: { from: "../lib/m", name: "a" },
    c: { from: "../lib/m", name: "b" },
    fs: { from: "fs", name: "*" },
  });
});

t("exports: a declaration, export default of a name, a local export list, a re-export, export * (finding F3)", () => {
  const m = 'function f() {}\nexport class K {}\nconst inner = 1;\nexport { inner as outer };\nexport default f;\nexport { Q } from "./q";\nexport * from "./all";\n';
  assert.deepEqual(L.declaredNames(L.findExport("m.ts", m, "K").statement), ["K"]);
  assert.deepEqual(L.declaredNames(L.findExport("m.ts", m, "default").statement), ["f"]);
  assert.deepEqual(L.declaredNames(L.findExport("m.ts", m, "outer").statement), ["inner"]);
  assert.deepEqual(L.findExport("m.ts", m, "Q"), { from: "./q", name: "Q" });
  assert.deepEqual(L.findExport("m.ts", m, "Z"), { from: "./all", name: "Z", stars: ["./all"] });
  assert.equal(L.findExport("n.ts", "const x = 1;", "Z"), null);
});

t("resolve: workspace packages and baseUrl are the repository's own code (finding F3)", () => {
  const files = new Set(["packages/db/src/index.ts", "packages/db/src/schema.ts", "packages/ui/lib/main.ts", "src/app/x.ts"]);
  const ws = L.workspacePackages([
    { path: "packages/db/package.json", text: '{ "name": "@acme/db" }' },
    { path: "packages/ui/package.json", text: '﻿{ "name": "@acme/ui", "main": "./lib/main.js" }' },
    { path: "package.json", text: "not json" },
  ]);
  const ctx = { workspaces: ws };
  assert.deepEqual(L.resolveImport("@acme/db", "apps/web/a.ts", files, ctx), { kind: "own", path: "packages/db/src/index.ts" });
  assert.deepEqual(L.resolveImport("@acme/db/schema", "apps/web/a.ts", files, ctx), { kind: "own", path: "packages/db/src/schema.ts" });
  assert.deepEqual(L.resolveImport("@acme/ui", "apps/web/a.ts", files, ctx), { kind: "own", path: "packages/ui/lib/main.ts" });
  assert.deepEqual(L.resolveImport("@acme/db/missing", "apps/web/a.ts", files, ctx), { kind: "own-unresolved" });
  assert.deepEqual(L.resolveImport("@acme/dbx", "apps/web/a.ts", files, ctx), { kind: "external" }, "a name prefix is not a package");
  assert.deepEqual(L.resolveImport("app/x", "src/b.ts", files, { baseUrl: "src" }), { kind: "own", path: "src/app/x.ts" });
  assert.deepEqual(L.resolveImport("react", "src/b.ts", files, { baseUrl: "src" }), { kind: "external" });
  assert.equal(L.baseUrlFrom('{ "compilerOptions": { "baseUrl": "./src" } }'), "src");
  assert.equal(L.baseUrlFrom('{ "compilerOptions": { "baseUrl": "." } }'), ".");
  assert.equal(L.baseUrlFrom("{}"), null);
});

t("an unresolved name is charged one typical map line, never zero (finding F3)", () => {
  const maps = "a.ts\n  @f1 fn a()  L1-1\n  @f2 export fn longerName(x: number): string  L2-9\n  @c3 class C  L10-20\n";
  assert.equal(L.unresolvedCharge(maps, 0), "");
  assert.equal(L.unresolvedCharge(maps, 2), "  @c3 class C  L10-20\n".repeat(2));
  assert.ok(L.unresolvedCharge("", 1).length > 10, "a stand-in line when the maps have none");
});

const repo = (name, role, savings, extra = {}) => ({
  repo: name, role, category: extra.category ?? "react-app", band: extra.band ?? "small",
  tasks: savings.map((s, i) => ({ commit: `${name}-${i}`, saving: { o200k: s, claude: s, o200kWholeMap: s - 0.1 }, unresolvedNames: 1, unsupportedFiles: [] })),
  median: { o200k: L.median(savings), claude: L.median(savings), o200kWholeMap: L.median(savings) - 0.1 },
});

t("summary: a verdict only with exactly 17 gate repositories of 3 tasks or more (finding F1)", () => {
  const seventeen = Array.from({ length: 17 }, (_, i) => repo(`r${i}`, "gate", [0.6, 0.7, 0.8]));
  assert.equal(L.summarize(seventeen).gate.result, "pass");
  assert.equal(L.summarize(seventeen.map((r) => repo(r.repo, "gate", [0.1, 0.2, 0.3]))).gate.result, "miss");
  const short = [...seventeen.slice(0, 16), repo("thin", "gate", [0.9, 0.9])];
  assert.match(L.summarize(short).gate.result, /^no result: 16 of 17/);
  assert.match(L.summarize(seventeen.slice(0, 1)).gate.result, /^no result: 1 of 17/, "one repository never gives a verdict");
  assert.equal(L.summarize(seventeen, { proxyOnly: true }).gate.result, "no result: proxy only");
  assert.deepEqual(L.summarize(short).needReserve, ["thin"]);
  const withSizing = L.summarize([...seventeen, repo("vue", "sizing", [0.0, 0.0, 0.0])]);
  assert.equal(withSizing.gateRepositories, 17, "a sizing repository never enters the gate");
  assert.equal(withSizing.sizing[0].repo, "vue");
  assert.equal(withSizing.unresolvedNames, 18 * 3);
});

t("summary: spread, groups and the worst cases per counter; the median of medians", () => {
  const rs = [repo("a", "gate", [0.2, 0.4, 0.6], { band: "small" }), repo("b", "gate", [0.5, 0.5, 0.5], { band: "large", category: "node-service" }), repo("c", "gate", [0.9, 0.1, 0.8])];
  const s = L.summarize(rs, { gateSize: 3 });
  assert.equal(s.claude.spread.median, 0.5);
  assert.equal(s.claude.byBand.large, 0.5);
  assert.equal(s.claude.byCategory["node-service"], 0.5);
  assert.equal(s.claude.worst.repository.repo, "a");
  assert.equal(s.claude.worst.task.saving, 0.1);
  assert.equal(s.o200kWholeMap.median, 0.4);
});
