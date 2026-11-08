// Regression tests for the two CodeQL alerts of 2026-11-07 (js/incomplete-sanitization in vet-package.mjs and
// js/incomplete-multi-character-sanitization in count.mjs), and for the security review of their fix.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validName, registryUrl, downloadsUrl, parseArgs } from "./vet-package.mjs";
import { commentRanges, removeRanges } from "../bench/token-count/html-text.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// --- vet-package: names and URLs ---

test("validName accepts real npm names", () => {
  for (const n of ["parse5", "postcss", "js-tiktoken", "@types/node", "@scope/a.b_c~d", "JSONStream", "a",
    "@scope/_private", "@_scope/x", "@.scope/x", "@scope/.x"]) {
    assert.equal(validName(n), true, n);
  }
});

test("validName refuses names that could change a URL", () => {
  for (const n of ["", "a/b/c", "@scope/a/b", "../x", "x/../y", "x?y", "x#y", "x y", "x%2fy", "@/x", "@scope/",
    ".hidden", "_under", "@scope/..", "@scope/.", "@../x", "@./x", "a".repeat(215), undefined, null, 5]) {
    assert.equal(validName(n), false, String(n));
  }
});

test("registryUrl encodes the one slash of a scoped name and refuses a second one", () => {
  assert.equal(registryUrl("parse5"), "https://registry.npmjs.org/parse5");
  assert.equal(registryUrl("@types/node"), "https://registry.npmjs.org/@types%2fnode");
  // The old code put "a/b/c" into the URL as "a%2fb/c". Since validName refuses a second slash, `replace` and
  // `replaceAll` now give the same result; validName is the defence this test holds.
  assert.throws(() => registryUrl("a/b/c"), /not a valid npm package name/);
  assert.throws(() => registryUrl("../../-/user"), /not a valid npm package name/);
});

test("every accepted name keeps both URLs on their host and path, with no dot segment", () => {
  const names = ["parse5", "@types/node", "@scope/_p", "@.s/.x", "@s/.x.", "a.b", "a..b", "@s/a..b", "~", "-"];
  for (const n of names) {
    for (const [url, prefix] of [[registryUrl(n), "/"], [downloadsUrl(n), "/downloads/point/last-week/"]]) {
      const u = new URL(url);
      assert.ok(["registry.npmjs.org", "api.npmjs.org"].includes(u.host), url);
      assert.equal(u.search + u.hash, "", url);
      assert.ok(u.pathname.startsWith(prefix), `${url} -> ${u.pathname}`);
      assert.equal(u.href, url, `the URL parser changed ${url}`);
    }
  }
  assert.throws(() => downloadsUrl("@scope/.."), /not a valid npm package name/);
});

test("parseArgs reads the age flag only when it is there", () => {
  // The old code read args[0] (the name) as the age when the flag was missing: a package named "5" got 5 days.
  assert.equal(parseArgs(["5", "1.0.0"]).minAgeDays, 60);
  assert.equal(parseArgs(["parse5", "7.1.2"]).minAgeDays, 60);
  assert.equal(parseArgs(["parse5", "7.1.2", "--min-age-days", "90"]).minAgeDays, 90);
  assert.equal(parseArgs(["parse5", "7.1.2", "--min-age-days"]).minAgeDays, 60);
  assert.equal(parseArgs(["parse5", "7.1.2", "--min-age-days", "-3"]).minAgeDays, 60);
  assert.equal(parseArgs(["--min-age-days", "7.1.2"]).minAgeDays, 60);
});

// --- count.mjs: HTML comments found by the parser ---

const comment = (s, e) => ({ nodeName: "#comment", sourceCodeLocation: { startOffset: s, endOffset: e } });

test("removeRanges removes exactly the ranges and keeps the rest byte for byte", () => {
  assert.equal(removeRanges("abcdef", []), "abcdef");
  assert.equal(removeRanges("abcdef", [[1, 3]]), "adef");
  assert.equal(removeRanges("abcdef", [[0, 2], [4, 6]]), "cd");
  assert.equal(removeRanges("", []), "");
  assert.throws(() => removeRanges("abc", [[2, 3], [1, 2]]), /bad range/);
  assert.equal(removeRanges("abc", [[1, 4]]), "a"); // parse5's end of an unclosed comment
  assert.throws(() => removeRanges("abc", [[4, 5]]), /bad range/);
});

test("commentRanges finds nested, <template> and top-level comments in order", () => {
  const tree = { nodeName: "#document", childNodes: [comment(0, 4), { nodeName: "html", childNodes: [
    { nodeName: "template", childNodes: [], content: { nodeName: "#document-fragment", childNodes: [comment(20, 25)] } },
    { nodeName: "p", childNodes: [{ nodeName: "#text" }, comment(10, 15)] }] }] };
  assert.deepEqual(commentRanges(tree), [[0, 4], [10, 15], [20, 25]]);
  assert.throws(() => commentRanges({ nodeName: "#comment" }), /no source location/);
});

// With the real parser: the inputs that the regex versions got wrong. parse5 lives in bench/token-count's
// node_modules; the test is skipped where those packages are not installed (CI installs them before `full`).
let parse5;
try {
  parse5 = createRequire(path.join(HERE, "../bench/token-count/package.json"))("parse5");
} catch {
  parse5 = undefined;
}
const plain = (html) => removeRanges(html, commentRanges(parse5.parse(html, { sourceCodeLocationInfo: true })));

test("the parser-based removal follows the HTML rules", { skip: !parse5 && "parse5 is not installed" }, () => {
  const cases = [
    ["<p>a</p><!-- x --><p>b</p>", "<p>a</p><p>b</p>"],
    // `<!--` that is not a comment stays (the old regex fix cut the text here).
    ['<script>const s = "<!--";</script><p>rest</p>', '<script>const s = "<!--";</script><p>rest</p>'],
    ['<a title="<!--">x</a><p>rest</p>', '<a title="<!--">x</a><p>rest</p>'],
    ["<textarea><!--</textarea><p>rest</p>", "<textarea><!--</textarea><p>rest</p>"],
    // `<!-->` is an empty comment; what follows is content.
    ["<p>a</p><!--> <p>b</p>", "<p>a</p> <p>b</p>"],
    // A broken nested comment: one regex pass left "<!--" here.
    ["<!<!---->--x", "--x"],
    // An unclosed comment runs to the end of the file.
    ["<p>keep</p><!-- open", "<p>keep</p>"],
  ];
  for (const [html, want] of cases) assert.equal(plain(html), want, html);
});
