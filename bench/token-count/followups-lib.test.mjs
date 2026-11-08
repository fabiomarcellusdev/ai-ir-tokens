// Tests for followups-lib.mjs: the writing side (W) and finer code views (V) of docs/contract.md, "Two follow-up
// measurements before the decision". Skipped only where a bench package is missing, as corpus-lib.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";

let lib = null, views = null;
try {
  lib = await import("./followups-lib.mjs");
  views = await import("./views.mjs");
} catch (e) {
  const missingPackage = e?.code === "ERR_MODULE_NOT_FOUND" && /'(typescript|parse5|postcss|js-tiktoken)'/.test(e.message);
  if (!missingPackage) throw e;
}
const t = lib ? test : test.skip;
const L = lib ?? {};

const OLD = [
  'import { db } from "./db";', //        1
  "", //                                   2
  "export class Store {", //               3
  "  get(id: string) {", //                4
  "    return db.get(id);", //             5
  "  }", //                                6
  "  put(id: string, v: number) {", //     7
  "    return db.put(id, v);", //          8
  "  }", //                                9
  "}", //                                  10
  "", //                                   11
  "export const limit = 10;", //           12
].join("\n");
const hunk = (oldStart, oldCount, oldLines, newLines) => ({ oldStart, oldCount, newStart: oldStart, newCount: newLines.length, oldLines, newLines });

// ---------------- the diff ----------------

t("hunks: a change, a pure insertion, a deletion, an insertion at line 0, and the no-newline marker", () => {
  const diff = ["@@ -5 +5 @@ class Store {", "-    return db.get(id);", "+    return db.get(id) ?? null;", "@@ -11,0 +12,2 @@", "+// note", "+",
    "@@ -12 +13,0 @@", "-export const limit = 10;", "\\ No newline at end of file", "@@ -0,0 +1 @@", "+// first"].join("\n");
  assert.deepEqual(L.hunksOf(diff), [
    { oldStart: 5, oldCount: 1, newStart: 5, newCount: 1, oldLines: ["    return db.get(id);"], newLines: ["    return db.get(id) ?? null;"] },
    { oldStart: 11, oldCount: 0, newStart: 12, newCount: 2, oldLines: [], newLines: ["// note", ""] },
    { oldStart: 12, oldCount: 1, newStart: 13, newCount: 0, oldLines: ["export const limit = 10;"], newLines: [] },
    { oldStart: 0, oldCount: 0, newStart: 1, newCount: 1, oldLines: [], newLines: ["// first"] },
  ]);
});

t("norm: CRLF becomes LF, a lone CR a space, so the line numbers stay those of git", () => {
  assert.equal(L.norm("a\r\nb\rc\r\r\nd"), "a\nb c \nd");
});

// ---------------- W ----------------

t("search and replace: the exact old text, grown by whole lines until unique", () => {
  const [call] = L.searchReplaceCalls("s.ts", OLD, [hunk(5, 1, ["    return db.get(id);"], ["    return db.get(id) ?? null;"])]);
  assert.deepEqual(JSON.parse(call), { file_path: "s.ts", old_string: "    return db.get(id);", new_string: "    return db.get(id) ?? null;" }, "unique already: no context");
  // "  }" occurs twice (lines 6 and 9): one line on each side makes it unique.
  const [brace] = L.searchReplaceCalls("s.ts", OLD, [hunk(6, 1, ["  }"], ["  } // end"])]);
  assert.deepEqual(JSON.parse(brace), { file_path: "s.ts", old_string: "    return db.get(id);\n  }\n  put(id: string, v: number) {", new_string: "    return db.get(id);\n  } // end\n  put(id: string, v: number) {" });
});

t("search and replace: an insertion takes one line of context first (the line before), then grows", () => {
  // After line 3 ("export class Store {", unique): the line before alone is enough.
  const [ins] = L.searchReplaceCalls("s.ts", OLD, [hunk(3, 0, [], ["  // the store"])]);
  assert.deepEqual(JSON.parse(ins), { file_path: "s.ts", old_string: "export class Store {", new_string: "export class Store {\n  // the store" });
  // After line 10 ("}"): "}" also occurs inside "  }", so the context grows until it is unique.
  const [grown] = L.searchReplaceCalls("s.ts", OLD, [hunk(10, 0, [], ["// after"])]);
  assert.equal(L.occurrences(OLD, JSON.parse(grown).old_string), 1);
  const [first] = L.searchReplaceCalls("s.ts", OLD, [hunk(0, 0, [], ["// top"])]);
  assert.deepEqual(JSON.parse(first), { file_path: "s.ts", old_string: 'import { db } from "./db";', new_string: '// top\nimport { db } from "./db";' }, "at line 0 only the line after exists");
  const [whole] = L.searchReplaceCalls("s.ts", "a\na\na", [hunk(2, 1, ["a"], ["b"])]);
  assert.equal(JSON.parse(whole).old_string, "a\na\na", "a text that is never unique stops at the whole file");
});

t("occurrences counts overlapping matches; an empty needle is never unique", () => {
  assert.equal(L.occurrences("aaa", "aa"), 2);
  assert.equal(L.occurrences("abc", "x"), 0);
  assert.equal(L.occurrences("abc", ""), Infinity);
});

t("edit operations: the address, a hash, the range inside the declaration, and the new lines only", () => {
  const [op] = L.editOperations("s.ts", OLD, [hunk(5, 1, ["    return db.get(id);"], ["    return db.get(id) ?? null;"])]);
  const o = JSON.parse(op);
  assert.equal(o.address, "s.ts:Store");
  assert.match(o.hash, /^[0-9a-f]{8}$/);
  assert.equal(o.at, "L3-3", "line 5 is the 3rd line of the class");
  assert.equal(o.text, "    return db.get(id) ?? null;");
  assert.ok(!op.includes("return db.get(id);"), "the old text is not repeated");
  assert.equal(JSON.parse(L.editOperations("s.ts", OLD, [hunk(1, 1, [], ["x"])])[0]).address, "s.ts:@import");
  assert.equal(JSON.parse(L.editOperations("a.css", ".a{}", [hunk(1, 1, [".a{}"], [".b{}"])])[0]).address, "a.css");
  assert.equal(JSON.parse(L.editOperations("s.ts", OLD, [hunk(11, 0, [], ["// n"])])[0]).address, "s.ts", "between declarations: the file");
});

t("rewrite: one call with the new full text", () => {
  assert.deepEqual(JSON.parse(L.rewriteCall("a.ts", "x\n")), { file_path: "a.ts", content: "x\n" });
});

// ---------------- V ----------------

t("V1: the method, in the compact view, after the outline line of its class", () => {
  const code = L.tsInnermostCode("s.ts", OLD, [{ from: 5, to: 5 }]);
  assert.match(code, /^export class Store \{\n/);
  assert.match(code, /get\(id: string\)/);
  assert.doesNotMatch(code, /put\(/, "the other method is not sent");
  assert.doesNotMatch(code, /return db\.get\(id\);/, "the compact view drops the semicolon, as the whole file's compact view does");
  const whole = views.tsCompact("s.ts", OLD, { inlineIds: false });
  assert.ok(whole.includes(code.split("\n").slice(1).join("\n").trim()), "the unit's text is what the whole file's compact view shows there");
});

t("V1: two units on one line; the one that holds the changed characters wins (review finding 1a)", () => {
  const src = "export function f(xs) {\n  return xs.filter((i) => i.ok).map((i) => i.id);\n}\n";
  const code = L.tsInnermostCode("f.ts", src, [{ from: 2, to: 2 }]);
  assert.match(code, /\.map\(/, "the change on line 2 is not inside one arrow function, so their function holds it");
  assert.match(code, /\.filter\(/);
  const jsx = "export const B = () => (\n  <button onClick={() => set(1)} className=\"x\">Go</button>\n);\n";
  assert.match(L.tsInnermostCode("b.tsx", jsx, [{ from: 2, to: 2 }]), /className|\.x/, "a changed className is not lost to the arrow on the same line");
});

t("V1: a nested arrow function alone; a range across two methods takes their class", () => {
  const arrow = L.tsInnermostCode("x.tsx", "export const A = () => {\n  const f = (n: number) => {\n    return n + 1;\n  };\n  return <p>{f(1)}</p>;\n};\n", [{ from: 3, to: 3 }]);
  assert.match(arrow, /return n \+ 1/);
  assert.doesNotMatch(arrow, /\| |<p>|\bp\b/, "the inner arrow function, not the component");
  const span = L.tsInnermostCode("s.ts", OLD, [{ from: 5, to: 8 }]);
  assert.match(span, /get\(/);
  assert.match(span, /put\(/);
});

t("V1: changed lines that no unit holds are sent as written, never dropped (review finding 1d)", () => {
  assert.equal(L.tsInnermostCode("s.ts", OLD, [{ from: 1, to: 1 }]), 'import { db } from "./db";\n');
  assert.equal(L.tsInnermostCode("s.ts", OLD, [{ from: 2, to: 2 }]), "", "only a blank line changed");
  assert.equal(L.cssInnermostCode("/* a */\n.a { color: red; }", [{ from: 1, to: 1 }]), "/* a */\n");
});

t("V1 for HTML: the smallest element, after the heads of its ancestors (review finding 1c)", () => {
  const html = "<main>\n<section class=\"prices\">\n<p>One</p>\n<p>Two</p>\n</section>\n</main>";
  const h = L.htmlInnermostCode(html, [{ from: 4, to: 4 }]);
  assert.match(h, /Two/);
  assert.doesNotMatch(h, /One/);
  assert.match(h, /section\.prices/, "the enclosing section's head line");
});

t("V1 for CSS: the smallest rule in the compact view, after its @media line; the tie on a minified line", () => {
  const css = ".a { color: red; }\n@media (min-width: 1px) {\n  .b { color: blue; }\n}";
  assert.equal(L.cssInnermostCode(css, [{ from: 3, to: 3 }]), "@media (min-width: 1px)\n.b  color blue\n");
  const minified = ".a{color:red}.b{color:blue}";
  const both = L.cssInnermostCode(minified, [{ from: 1, to: 1 }]);
  assert.match(both, /\.a/);
  assert.match(both, /\.b/, "a change somewhere on a line with two rules sends both, not the last one");
});

t("rangeChars: from the first to the last non-blank character of the lines", () => {
  assert.deepEqual(L.rangeChars("ab\n  cd  \n", 2, 2), [5, 7]);
  assert.deepEqual(L.rangeChars("ab\n\ncd", 1, 3), [0, 6]);
  assert.equal(L.rangeChars("ab\n   \n", 2, 2), null);
});

t("V2, the floor: the changed lines with 3 lines of context; windows that touch merge", () => {
  const text = Array.from({ length: 20 }, (_, i) => `l${i + 1}`).join("\n");
  assert.equal(L.floorCode(text, [{ from: 10, to: 10 }]), "l7\nl8\nl9\nl10\nl11\nl12\nl13\n");
  assert.equal(L.floorCode(text, [{ from: 2, to: 2 }, { from: 6, to: 6 }]), "l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\n");
  assert.equal(L.floorCode(text, [{ from: 19, to: 20 }]), "l16\nl17\nl18\nl19\nl20\n");
});

// ---------------- the summary ----------------

t("verdict: reached, not reached, and a band of 5 points the same way on both sides", () => {
  assert.equal(L.verdict(0.6, 0.4).result, "reached");
  assert.equal(L.verdict(0.2, 0.4).result, "not reached");
  assert.match(L.verdict(0.45, 0.4).result, /^within 5 points/);
  assert.match(L.verdict(0.35, 0.4).result, /^within 5 points/, "exactly 5 points below is in the band too");
  assert.equal(L.verdict(0.3449, 0.4).result, "not reached", "34.4 points is 5.6 below");
  assert.equal(L.verdict(null, 0.4).result, "no result");
});

t("across repositories: the median of 17 medians, or no result when one is missing", () => {
  const seventeen = Array.from({ length: 17 }, (_, i) => i / 16);
  assert.equal(L.acrossRepositories(seventeen).median, 0.5);
  assert.equal(L.acrossRepositories(seventeen).q1, 0.25);
  const lost = [...seventeen.slice(0, 16), null];
  assert.deepEqual(L.acrossRepositories(lost), { median: null, q1: null, q3: null, missing: 1 });
  assert.equal(L.verdict(L.acrossRepositories(lost).median, 0.4).result, "no result");
});
