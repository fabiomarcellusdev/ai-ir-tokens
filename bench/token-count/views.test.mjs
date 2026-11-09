// Tests for the line ranges of the HTML and CSS maps (views.mjs: htmlMap, cssMap). A range must point at the lines of
// the unit it names, also with CRLF, a BOM and characters outside the Basic Multilingual Plane. Skipped only where a
// bench package is missing, as corpus-lib.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";

let L = null;
try {
  L = await import("./corpus-lib.mjs");
} catch (e) {
  const missingPackage = e?.code === "ERR_MODULE_NOT_FOUND" && /'(typescript|parse5|postcss|js-tiktoken)'/.test(e.message);
  if (!missingPackage) throw e;
}
const t = L ? test : test.skip;

/** The text of lines `from` to `to` (1-based, inclusive) of `text`, with line ends as LF. */
const linesOf = (text, from, to) => text.replace(/\r\n/g, "\n").split("\n").slice(from - 1, to).join("\n");
/** Every `L<from>-<to>` of a map entry, in order. */
const ranges = (entry) => [...entry.matchAll(/\bL(\d+)-(\d+)\b/g)].map((m) => [Number(m[1]), Number(m[2])]);

const HTML = [
  "<!doctype html>", //                         1
  "<html>", //                                  2
  "<head><title>x</title></head>", //           3
  "<body>", //                                  4
  '<header id="top">', //                       5
  "  <h1>Hi \u{1F600}</h1>", //                 6
  "</header>", //                               7
  "<main>", //                                  8
  "  <p>one</p>", //                            9
  "  <p>two</p>", //                            10
  "</main>", //                                 11
  "<footer>end</footer>", //                    12
  "</body>", //                                 13
  "</html>", //                                 14
].join("\n") + "\n";

t("an HTML landmark's range holds the lines of that landmark", () => {
  const map = L.fileMap("a.html", HTML);
  const r = ranges(map);
  assert.deepEqual(r, [[5, 7], [8, 11], [12, 12]], map);
  assert.match(linesOf(HTML, ...r[0]), /^<header id="top">[\s\S]*<\/header>$/);
  assert.match(linesOf(HTML, ...r[1]), /^<main>[\s\S]*<\/main>$/);
});

t("an HTML range is the same with CRLF line ends and with a BOM", () => {
  const plain = ranges(L.fileMap("a.html", HTML));
  assert.deepEqual(ranges(L.fileMap("a.html", HTML.replace(/\n/g, "\r\n"))), plain);
  assert.deepEqual(ranges(L.fileMap("a.html", "﻿" + HTML)), plain);
});

const CSS = [
  ".a { color: red; }", //                      1
  ".a:hover { color: blue; }", //               2
  "", //                                        3
  ".b {", //                                    4
  "  content: \"\u{1F600}\";", //                5
  "}", //                                       6
  "@media (min-width: 40em) {", //              7
  "  .c { top: 0 }", //                         8
  "}", //                                       9
].join("\n") + "\n";

t("a CSS rule group's range runs from its first rule's first line to its last rule's last line", () => {
  const map = L.fileMap("a.css", CSS);
  assert.deepEqual(ranges(map), [[1, 2], [4, 6], [7, 9], [8, 8]], map);
  assert.match(map, /@r1-r2 \.a\* \(2 rules\)  L1-2/);
  assert.match(map, /@media \(min-width: 40em\)  L7-9/);
});

t("a CSS range is the same with CRLF line ends and with a BOM", () => {
  const plain = ranges(L.fileMap("a.css", CSS));
  assert.deepEqual(ranges(L.fileMap("a.css", CSS.replace(/\n/g, "\r\n"))), plain);
  assert.deepEqual(ranges(L.fileMap("a.css", "﻿" + CSS)), plain);
});

t("a CSS group with a gap between rules of the same key is two groups with two ranges", () => {
  const css = ".a { x: 1 }\n.b { x: 2 }\n.a { x: 3 }\n";
  assert.deepEqual(ranges(L.fileMap("a.css", css)), [[1, 1], [2, 2], [3, 3]]);
});

t("a CSS file with no rules has a map with no range", () => {
  assert.deepEqual(ranges(L.fileMap("a.css", "")), []);
  assert.deepEqual(ranges(L.fileMap("a.css", "/* only a comment */\n")), []);
});
