// Tests for r1-lib.mjs: the rules of gate R1 (docs/contract.md, "Gate R1 in detail"). Skipped only where a bench
// package is missing, as corpus-lib.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";

let lib = null;
try {
  lib = await import("./r1-lib.mjs");
} catch (e) {
  const missingPackage = e?.code === "ERR_MODULE_NOT_FOUND" && /'(typescript|parse5|postcss|js-tiktoken)'/.test(e.message);
  if (!missingPackage) throw e;
}
const t = lib ? test : test.skip;
const L = lib ?? {};

/** A token counter for the tests: one token per character, so budgets are easy to read. */
const chars = (s) => s.length;

t("the candidates include tests, and leave out third-party, built and minified files", () => {
  assert.equal(L.isCandidate("src/user.ts"), true);
  assert.equal(L.isCandidate("src/user.test.ts"), true, "a test file is a candidate; leaving it out would exploit the task rule");
  assert.equal(L.isCandidate("styles/main.css"), true);
  assert.equal(L.isCandidate("node_modules/x/index.js"), false);
  assert.equal(L.isCandidate("dist/app.js"), false);
  assert.equal(L.isCandidate("public/app.min.js"), false);
  assert.equal(L.isCandidate("README.md"), false);
});

t("the budget is 25% of the baseline, rounded down", () => {
  assert.equal(L.budgetFor(1003), 250);
  assert.equal(L.budgetFor(1000), 250);
  assert.equal(L.budgetFor(3), 0);
  assert.equal(L.budgetFor(1000, 0.5), 500);
});

t("the map stops at the first entry that does not fit, and never skips it to fit a later one", () => {
  const ranked = [{ path: "a", entry: "aaaa" }, { path: "b", entry: "bbbbbbbb" }, { path: "c", entry: "cc" }];
  // a (4) fits in 10; a+b (12) does not; c would fit after a (6), but the map stops at b.
  assert.deepEqual(L.cutMap(ranked, 10, chars).paths, ["a"]);
  assert.deepEqual(L.cutMap(ranked, 14, chars).paths, ["a", "b", "c"]);
  assert.deepEqual(L.cutMap(ranked, 12, chars).paths, ["a", "b"], "the budget is inclusive");
  assert.deepEqual(L.cutMap(ranked, 3, chars).paths, [], "the first entry alone may not fit");
  assert.equal(L.cutMap(ranked, 12, chars).text, "aaaabbbbbbbb", "the cut map is the entries joined in order");
});

t("a task passes only when every modified file is in the cut map", () => {
  assert.equal(L.passes(["a", "b"], ["a", "b"]), true);
  assert.equal(L.passes(["a", "b", "c"], ["b"]), true);
  assert.equal(L.passes(["a"], ["a", "b"]), false, "one missing file fails the task");
});

t("words split at non-letters and at case changes, lowercased, 3 characters or more, each once", () => {
  assert.deepEqual([...L.words("Fix createUserForm in user-form.tsx; fix it")].sort(), ["create", "fix", "form", "tsx", "user"]);
  assert.deepEqual(L.wordList("user user Users"), ["user", "user", "users"]);
});

t("a description names a file by its path, its file name, or its stem as a whole word", () => {
  assert.equal(L.namesFile("Update src/api/user.ts for the new fields", "src/api/user.ts"), true);
  assert.equal(L.namesFile("Fix a bug in Header.tsx", "src/components/Header.tsx"), true);
  assert.equal(L.namesFile("Fix the header component", "src/components/Header.tsx"), true, "the stem, case ignored");
  assert.equal(L.namesFile("Fix the headers of the table", "src/components/Header.tsx"), false, "a longer word is not the stem");
  assert.equal(L.namesFile("Fix it", "src/a.ts"), false, "a stem under 3 characters never counts");
});

t("the reference ranking counts description words in each entry; ties go to the shorter entry, then the path", () => {
  const entries = [
    { path: "z.ts", entry: "z.ts\n  user 1-2\n" },
    { path: "b.ts", entry: "b.ts\n  user profile 1-9\n" },
    { path: "a.ts", entry: "a.ts\n  user 1-2\n" },
    { path: "c.ts", entry: "c.ts\n  other 1-2\n" },
  ];
  const order = L.referenceRank(entries, "Show the user profile").map((e) => e.path);
  assert.deepEqual(order, ["b.ts", "a.ts", "z.ts", "c.ts"]);
});

t("the verdict: 70% reaches the gate, 65.0% to 75.0% (ends included) is no result until Anthropic's counter decides", () => {
  assert.equal(L.r1Verdict(55, 85, 0).gate, "missed", "64.7%");
  assert.equal(L.r1Verdict(56, 85, 0).gate, "no result", "65.9%");
  assert.equal(L.r1Verdict(63, 85, 0).gate, "no result", "74.1%");
  assert.equal(L.r1Verdict(64, 85, 0).gate, "reached", "75.3%");
  assert.equal(L.r1Verdict(13, 20, 0).gate, "no result", "exactly 65.0% is inside the band");
  assert.equal(L.r1Verdict(15, 20, 0).gate, "no result", "exactly 75.0% is inside the band");
  assert.equal(L.r1Verdict(12, 20, 0).gate, "missed");
  assert.equal(L.r1Verdict(16, 20, 0).gate, "reached");
});

t("the comparison needs 10 points or more over the reference, counted exactly", () => {
  assert.equal(L.r1Verdict(30, 85, 21).beatsReferenceBy10Points, true, "9 tasks of 85 is 10.6 points");
  assert.equal(L.r1Verdict(30, 85, 22).beatsReferenceBy10Points, false, "8 tasks of 85 is 9.4 points");
  assert.equal(L.r1Verdict(12, 20, 10).beatsReferenceBy10Points, true, "exactly 10 points counts");
});

t("code names in a description: camel case, underscores and dotted parts, 4 characters or more", () => {
  const ids = [...L.identifiers("Fix createUser and API_URL; call store.getItems, not the user list")].sort();
  assert.deepEqual(ids, ["API_URL", "createUser", "getItems"]);
});

/** Builds prepared candidates from {path, entry, text}. */
const prep = (files) => files.map((f) => L.prepare({ path: f.path, entry: f.entry, entryTokens: f.tokens ?? f.entry.length / 4 }, f.text ?? ""));

t("the project's ranking puts the file that matches the description first", () => {
  const files = prep([
    { path: "src/billing/invoice.ts", entry: "src/billing/invoice.ts\n  createInvoice 1-20\n", text: "export function createInvoice() {}" },
    { path: "src/auth/login.ts", entry: "src/auth/login.ts\n  login 1-20\n", text: "export function login() {}" },
    { path: "src/ui/button.tsx", entry: "src/ui/button.tsx\n  Button 1-20\n", text: "export function Button() {}" },
  ]);
  assert.equal(L.projectRank(files, "Round the invoice totals")[0].path, "src/billing/invoice.ts");
  assert.equal(L.projectRank(files, "Allow login with email")[0].path, "src/auth/login.ts");
});

t("stop words do not rank a file", () => {
  const files = prep([
    { path: "src/fix.ts", entry: "src/fix.ts\n", text: "fix update add" },
    { path: "src/cart.ts", entry: "src/cart.ts\n", text: "cart" },
  ]);
  assert.equal(L.projectRank(files, "fix: update the cart")[0].path, "src/cart.ts");
});

t("an exact code name in the description lifts the file that declares it", () => {
  const files = prep([
    { path: "src/a.ts", entry: "src/a.ts\n  parseConfig 1-9\n", text: "" },
    { path: "src/b.ts", entry: "src/b.ts\n  other 1-9\n", text: "" },
  ]);
  const w = { ...L.DEFAULT_WEIGHTS, path: 0, names: 0, text: 0 };
  assert.equal(L.projectRank(files, "Handle parseConfig errors", { ...w, ident: 15 })[0].path, "src/a.ts");
  assert.equal(L.projectRank(files, "Handle parseConfig errors", { ...w, ident: 0 })[0].path, "src/b.ts", "control: without the boost, the tie goes to the shorter entry");
  const swapped = prep([
    { path: "src/a.ts", entry: "src/a.ts\n  other 1-9 xxxxxxxx\n", text: "" },
    { path: "src/b.ts", entry: "src/b.ts\n  parseConfig 1-9\n", text: "" },
  ]);
  assert.equal(L.projectRank(swapped, "Handle parseConfig errors", { ...w, ident: 15 })[0].path, "src/b.ts");
});

t("a large entry is demoted when the scores are equal, because it would block the entries after it", () => {
  const files = prep([
    { path: "src/big/cart.ts", entry: "src/big/cart.ts\n", text: "cart", tokens: 5000 },
    { path: "src/small/cart.ts", entry: "src/small/cart.ts\n", text: "cart", tokens: 50 },
  ]);
  assert.equal(L.projectRank(files, "cart", { ...L.DEFAULT_WEIGHTS, path: 0, size: 0.3 })[0].path, "src/small/cart.ts");
});

t("a file connected by an import shares part of its neighbour's score", () => {
  const files = prep([
    { path: "src/cart.ts", entry: "src/cart.ts\n", text: "cart" },
    { path: "src/totals.ts", entry: "src/totals.ts\n", text: "" },
    { path: "src/unrelated.ts", entry: "src/unrelated.ts\n", text: "" },
  ]);
  const neighbors = new Map([["src/cart.ts", new Set(["src/totals.ts"])], ["src/totals.ts", new Set(["src/cart.ts"])], ["src/unrelated.ts", new Set()]]);
  const w = { ...L.DEFAULT_WEIGHTS, size: 0, imports: 0.3 };
  const order = L.projectRank(files, "cart", w, { neighbors }).map((e) => e.path);
  assert.deepEqual(order.slice(0, 2), ["src/cart.ts", "src/totals.ts"]);
  const without = L.projectRank(files, "cart", { ...w, imports: 0 }, { neighbors }).map((e) => e.path);
  assert.equal(without[1], "src/totals.ts", "control: a tie goes to the shorter entry");
  const withoutScores = L.projectRank(files, "cart", { ...w, imports: 0 }, { neighbors });
  assert.equal(withoutScores[1].score, withoutScores[2].score, "without the import signal the two others tie");
  const withScores = L.projectRank(files, "cart", w, { neighbors });
  assert.ok(withScores[1].score > withScores[2].score, "with it, the imported file scores higher");
});

t("the cut counts the joined text, not the sum of each entry's count", () => {
  // A counter that rounds up per 3 characters: entries of 2 characters each count 1 alone, but 2 when joined in pairs.
  const thirds = (s) => Math.ceil(s.length / 3);
  const ranked = [{ path: "a", entry: "aa" }, { path: "b", entry: "bb" }, { path: "c", entry: "cc" }];
  // Joined: "aa"=1, "aabb"=2, "aabbcc"=2. Summed per entry it would be 1, 2, 3.
  assert.deepEqual(L.cutMap(ranked, 2, thirds).paths, ["a", "b", "c"]);
});

t("the candidate rule: .min. only in the file name, and folder names in any case", () => {
  assert.equal(L.isCandidate("lib/foo.min.x/index.js"), true, "a folder named with .min. does not exclude its files");
  assert.equal(L.isCandidate("Build/app.js"), false);
  assert.equal(L.isCandidate("src/Vendor/x.ts"), false);
});

t("words: only a lowercase-to-uppercase change splits, and any letter or digit counts", () => {
  assert.deepEqual([...L.words("md5Hash fooBar")].sort(), ["bar", "foo", "md5hash"]);
  assert.deepEqual([...L.words("Größe ändern")].sort(), ["größe", "ändern"]);
});

t("the file-name count for the results leaves out the stem; the ranking keeps it", () => {
  assert.equal(L.namesFile("Update the app layout", "src/app.tsx", { stem: false }), false);
  assert.equal(L.namesFile("Update the app layout", "src/app.tsx"), true);
  assert.equal(L.namesFile("Fix app.tsx", "src/app.tsx", { stem: false }), true);
  assert.equal(L.namesFile("Fix (blog)/[slug].tsx now", "app/(blog)/[slug].tsx", { stem: false }), true, "a file name with pattern characters");
});

t("ties in a path go by code point, not by UTF-16 unit", () => {
  // U+FF5E (one UTF-16 unit, 0xFF5E) against U+1F600 (a surrogate pair starting 0xD83D): by code point, U+FF5E is first.
  assert.ok(L.byCodePoint("～", "\u{1F600}") < 0);
  assert.ok("～" > "\u{1F600}", "control: JavaScript's < gives the other order");
  assert.equal(L.byCodePoint("a", "a"), 0);
  assert.ok(L.byCodePoint("a", "ab") < 0);
});

t("a map entry holds a line when one of its ranges contains it", () => {
  const entry = "src/a.ts\n  @e1 EnumDeclaration  L3-3\n  @f2 export fn f()  L4-6\n";
  assert.equal(L.entryHoldsLine(entry, 3), true);
  assert.equal(L.entryHoldsLine(entry, 5), true);
  assert.equal(L.entryHoldsLine(entry, 7), false);
  assert.equal(L.entryHoldsLine("a.css\n  @r1 .a\n", 1), false, "a CSS entry written before the ranges has none");
});

t("a name or a title that looks like a range is not read as one", () => {
  assert.equal(L.entryHoldsLine("a.html\n  title See L1-99\n  @n1 section#x  L2-3\n", 50), false, "a title");
  assert.equal(L.entryHoldsLine("a.css\n  @r1 .L1-99  L1-1\n", 50), false, "a class name");
  assert.equal(L.entryHoldsLine("a.html\n  @n1 section#L5-80  L2-3\n", 50), false, "an id");
  assert.equal(L.entryHoldsLine("a.html\n  @n1 h1  L2-60  h1 \"x\"\n", 50), true, "a real range before a summary");
});

t("the test run happens once, from a clean commit; a rerun only after a crash, with the same method", () => {
  const base = { prior: [], dirty: [], rerunReason: null, lib: "L1", weights: { a: 1 } };
  assert.equal(L.refuseTestRun(base), null, "the first run is allowed");
  assert.match(L.refuseTestRun({ ...base, dirty: ["bench/token-count/r1-lib.mjs"] }), /clean commit/);
  assert.match(L.refuseTestRun({ ...base, rerunReason: "x" }), /no earlier run/);
  const started = [{ status: "started", lib: "L1", weights: { a: 1 } }];
  assert.match(L.refuseTestRun({ ...base, prior: started }), /rerun is allowed only after a crash/);
  assert.equal(L.refuseTestRun({ ...base, prior: started, rerunReason: "out of memory" }), null);
  assert.match(L.refuseTestRun({ ...base, prior: started, rerunReason: "x", lib: "L2" }), /same r1-lib/);
  assert.match(L.refuseTestRun({ ...base, prior: started, rerunReason: "x", weights: { a: 2 } }), /same weights/);
  assert.match(L.refuseTestRun({ ...base, prior: [{ status: "finished", lib: "L1", weights: { a: 1 } }], rerunReason: "x" }), /already finished/);
});
