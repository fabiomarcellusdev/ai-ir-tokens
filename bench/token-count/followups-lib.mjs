// followups-lib.mjs: the pure parts of the two measurements before the C0 decision (docs/contract.md, "Two follow-up
// measurements before the decision"): W, the writing side, and V, finer code views. No git, no network: followups.mjs
// feeds it text, so every rule here has a test (followups-lib.test.mjs).

import crypto from "node:crypto";
import ts from "typescript";
import * as parse5 from "parse5";
import postcss from "postcss";
import { parseTs, tsCompactRange, topLevelIds, htmlRender, htmlHead, htmlIds, walk, cssCompact } from "./views.mjs";
import { declaredNames, median, quantile } from "./corpus-lib.mjs";

// ---------------- Text and the diff ----------------

/** Text as corpus.mjs reads it: CRLF becomes LF, a lone CR a space, so git and the parsers agree on line numbers. */
export const norm = (s) => s.replace(/\r\n/g, "\n").replace(/\r/g, " ");

/**
 * The hunks of a `git diff -U0` for one file: [{ oldStart, oldCount, newStart, newCount, oldLines, newLines }]. Old
 * lines are those starting with "-", new lines those starting with "+", inside each hunk. "\ No newline at end of
 * file" is a marker, not a line.
 */
export function hunksOf(diff) {
  const hunks = [];
  let h = null;
  for (const line of diff.split("\n")) {
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (m) {
      h = { oldStart: Number(m[1]), oldCount: m[2] === undefined ? 1 : Number(m[2]), newStart: Number(m[3]), newCount: m[4] === undefined ? 1 : Number(m[4]), oldLines: [], newLines: [] };
      hunks.push(h);
      continue;
    }
    if (!h) continue;
    if (line.startsWith("-")) h.oldLines.push(line.slice(1));
    else if (line.startsWith("+")) h.newLines.push(line.slice(1));
  }
  return hunks;
}

// ---------------- W: three ways to write a change ----------------

/** How often `needle` occurs in `hay` (overlapping occurrences count). */
export function occurrences(hay, needle) {
  if (!needle) return Infinity;
  let n = 0;
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) n++;
  return n;
}

/**
 * One search-and-replace call per hunk, as Claude Code's Edit tool takes it: the file path, the old text and the new
 * text. The old text grows by whole lines of context, on both sides, until it occurs once in the old file. A pure
 * insertion takes at least one line of context: first the line before it, then the line after it, then both, then
 * both sides grow. Returns the calls as JSON text.
 */
export function searchReplaceCalls(file, oldText, hunks) {
  const lines = oldText.split("\n");
  return hunks.map((h) => {
    // The old lines, as 0-based indexes [a0, b0) of the old file. A pure insertion after line n has a0 = b0 = n.
    const a0 = h.oldCount === 0 ? h.oldStart : h.oldStart - 1;
    const b0 = h.oldCount === 0 ? h.oldStart : a0 + h.oldCount;
    const steps = h.oldCount === 0 ? [[1, 0], [0, 1], [1, 1]] : [[0, 0]];
    for (let k = steps.at(-1)[0] + 1; k <= lines.length; k++) steps.push([k, k]);
    for (const [before, after] of steps) {
      const a = Math.max(0, a0 - before), b = Math.min(lines.length, b0 + after);
      const ctxBefore = lines.slice(a, a0), ctxAfter = lines.slice(b0, b);
      const oldBlock = [...ctxBefore, ...lines.slice(a0, b0), ...ctxAfter].join("\n");
      if (occurrences(oldText, oldBlock) === 1 || (a === 0 && b === lines.length)) {
        return JSON.stringify({ file_path: file, old_string: oldBlock, new_string: [...ctxBefore, ...h.newLines, ...ctxAfter].join("\n") });
      }
    }
    return JSON.stringify({ file_path: file, old_string: oldText, new_string: oldText }); // not reached: the last step is the whole file
  });
}

/** One file-write call per modified file, with its new full text. */
export const rewriteCall = (file, newText) => JSON.stringify({ file_path: file, content: newText });

/**
 * The address of the line range [from, to] (1-based) of a TypeScript or JavaScript file: the top-level declaration
 * that holds it, by its name (or its map ID when it has none), with its first line. A range outside any declaration
 * (between declarations) is addressed to the file itself.
 */
export function tsAddress(file, text, from, to) {
  const sf = parseTs(file, text);
  const ids = topLevelIds(sf);
  const line = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  for (const s of sf.statements) {
    const a = line(s.getStart(sf, true)), b = line(s.end);
    if (a <= from && b >= Math.max(from, to)) {
      const name = declaredNames(s)[0] ?? (ids.has(s) ? `@${ids.get(s)}` : "@import");
      return { address: `${file}:${name}`, firstLine: a, text: text.split("\n").slice(a - 1, b).join("\n") };
    }
  }
  return { address: file, firstLine: 1, text };
}

/**
 * One edit operation per hunk: the address of the declaration that holds it, an 8-character content hash of that
 * declaration (a stale edit is refused), the changed lines' range inside it, and the new lines. The old text is not
 * repeated. HTML, CSS and other files are addressed to the file itself, by line range.
 */
export function editOperations(file, oldText, hunks) {
  const isTs = /\.(tsx?|jsx?|mjs|cjs)$/i.test(file);
  return hunks.map((h) => {
    const from = Math.max(1, h.oldStart), to = h.oldCount === 0 ? from : h.oldStart + h.oldCount - 1;
    const where = isTs ? tsAddress(file, oldText, from, to) : { address: file, firstLine: 1, text: oldText };
    const rel = (n) => n - where.firstLine + 1;
    const at = h.oldCount === 0 ? `after L${rel(h.oldStart)}` : `L${rel(from)}-${rel(to)}`;
    const hash = crypto.createHash("sha256").update(where.text).digest("hex").slice(0, 8);
    return JSON.stringify({ address: where.address, hash, at, text: h.newLines.join("\n") });
  });
}

// ---------------- V: finer code views ----------------

/** The text offsets [start, end) that cover every non-blank character of lines from..to (1-based); null if all blank. */
export function rangeChars(text, from, to) {
  const lines = text.split("\n");
  const starts = [0];
  for (const l of lines) starts.push(starts.at(-1) + l.length + 1);
  let start = null, end = null;
  for (let n = Math.max(1, from); n <= Math.min(lines.length, to); n++) {
    const l = lines[n - 1], a = l.search(/\S/);
    if (a < 0) continue;
    if (start === null) start = starts[n - 1] + a;
    end = starts[n - 1] + l.trimEnd().length;
  }
  return start === null ? null : [start, end];
}

/** The lines from..to as written, for changed lines that no unit holds (a stray comment, an import). */
const linesAsWritten = (text, from, to) => text.split("\n").slice(Math.max(0, from - 1), to).join("\n") + "\n";

/**
 * Picks, for each changed range, the smallest unit whose characters cover every non-blank character of the range.
 * `units` are [{ node, start, end }] (text offsets). A range that no unit holds is returned in `loose`.
 */
function innermost(text, ranges, units) {
  const chosen = new Set(), loose = [];
  for (const r of ranges) {
    const chars = rangeChars(text, r.from, r.to);
    if (!chars) continue; // only blank lines changed
    const holding = units.filter((u) => u.start <= chars[0] && u.end >= chars[1]);
    if (holding.length) chosen.add(holding.reduce((best, u) => (u.end - u.start < best.end - best.start ? u : best)));
    else loose.push(r);
  }
  const top = [...chosen].filter((u) => ![...chosen].some((o) => o !== u && o.start <= u.start && o.end >= u.end));
  return { chosen: top, loose };
}

const FUNCTION_LIKE = (n) => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n)
  || ts.isConstructorDeclaration(n) || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n);
const isUnit = (n, sf) => (n.parent === sf && !ts.isImportDeclaration(n)) || ts.isClassElement(n) || FUNCTION_LIKE(n);

/**
 * V1 for TypeScript and JavaScript: for each changed range, the smallest unit (a top-level declaration, a class member,
 * or a function, arrow function or method) whose characters cover the whole change, in the compact view (the whole
 * file's compact edits inside the unit), with the first line of each unit around it. Changed lines that no unit holds
 * (an import, a comment between declarations) are sent as written.
 */
export function tsInnermostCode(file, text, ranges) {
  const sf = parseTs(file, text);
  const units = [];
  const visit = (n) => { if (n !== sf && isUnit(n, sf)) units.push({ node: n, start: n.getStart(sf, true), end: n.end }); ts.forEachChild(n, visit); };
  visit(sf);
  const { chosen, loose } = innermost(text, ranges, units);
  const firstLine = (n) => text.slice(n.getStart(sf), n.end).split("\n")[0].trim();
  const parts = chosen.sort((a, b) => a.start - b.start).map((u) => {
    const outline = [];
    for (let p = u.node.parent; p && p !== sf; p = p.parent) if (isUnit(p, sf)) outline.unshift(firstLine(p));
    return (outline.length ? outline.join("\n") + "\n" : "") + tsCompactRange(file, text, u.start, u.end);
  });
  return parts.join("") + loose.map((r) => linesAsWritten(text, r.from, r.to)).join("");
}

/** V1 for HTML: the smallest element that holds each change, in the compact view, after the heads of its ancestors. */
export function htmlInnermostCode(text, ranges) {
  const doc = parse5.parse(text, { sourceCodeLocationInfo: true });
  const ids = htmlIds(doc);
  const units = [];
  walk(doc, (n) => { if (n.tagName && n.sourceCodeLocation) units.push({ node: n, start: n.sourceCodeLocation.startOffset, end: n.sourceCodeLocation.endOffset ?? n.sourceCodeLocation.startOffset }); });
  const { chosen, loose } = innermost(text, ranges, units);
  const parts = chosen.sort((a, b) => a.start - b.start).map((u) => {
    const outline = [];
    for (let p = u.node.parentNode; p && p.tagName; p = p.parentNode) outline.unshift(htmlHead(p, new Map(), { shortAttrs: true }));
    return (outline.length ? outline.join("\n") + "\n" : "") + htmlRender(u.node, text, ids, { elide: false, inlineIds: false });
  });
  return parts.join("") + loose.map((r) => linesAsWritten(text, r.from, r.to)).join("");
}

/**
 * V1 for CSS: the smallest rule or at-rule that holds each change, after the heads of the at-rules and rules around it.
 * A rule without nested rules is in the compact view; anything the compact view cannot show is sent as written.
 */
export function cssInnermostCode(text, ranges) {
  const root = postcss.parse(text);
  const lines = text.split("\n");
  const starts = [0];
  for (const l of lines) starts.push(starts.at(-1) + l.length + 1);
  const at = (p) => starts[p.line - 1] + p.column - 1;
  const units = [];
  root.walk((n) => { if ((n.type === "rule" || n.type === "atrule") && n.source?.start && n.source?.end) units.push({ node: n, start: at(n.source.start), end: at(n.source.end) + 1 }); });
  const { chosen, loose } = innermost(text, ranges, units);
  const head = (n) => (n.type === "atrule" ? `@${n.name} ${n.params}` : n.selector);
  const parts = chosen.sort((a, b) => a.start - b.start).map((u) => {
    const outline = [];
    for (let p = u.node.parent; p && p.type !== "root"; p = p.parent) outline.unshift(head(p));
    const n = u.node;
    const simple = n.type === "rule" && (n.nodes ?? []).every((c) => c.type === "decl" || c.type === "comment");
    const body = simple ? cssCompact(postcss.root().append(n.clone()), { inlineIds: false }) : n.toString().trim() + "\n";
    return (outline.length ? outline.join("\n") + "\n" : "") + body;
  });
  return parts.join("") + loose.map((r) => linesAsWritten(text, r.from, r.to)).join("");
}

/** V2, the floor: the changed lines of the old file with `context` lines on each side; overlapping windows merge. */
export function floorCode(text, ranges, context = 3) {
  const lines = text.split("\n");
  const windows = ranges.map((r) => [Math.max(1, r.from - context), Math.min(lines.length, r.to + context)]).sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const w of windows) {
    const last = merged.at(-1);
    if (last && w[0] <= last[1] + 1) last[1] = Math.max(last[1], w[1]);
    else merged.push([...w]);
  }
  return merged.map(([a, b]) => lines.slice(a - 1, b).join("\n") + "\n").join("");
}

// ---------------- The summary ----------------

/**
 * The verdict on one threshold. "Within 5 points" compares percentage points rounded to one decimal, the same way
 * above and below the threshold; such a result is decided by Anthropic's counter in a run by the owner.
 */
export function verdict(value, threshold, near = 5) {
  if (value === null || value === undefined) return { threshold, median: null, result: "no result" };
  const points = Math.round(value * 1000) / 10, bar = Math.round(threshold * 1000) / 10;
  const result = Math.abs(points - bar) <= near ? `within ${near} points of the threshold: Anthropic's counter decides (the owner's run)` : points >= bar ? "reached" : "not reached";
  return { threshold, median: value, result };
}

/**
 * The median over the repositories of each repository's median, with the quartiles. It gives "no result" unless every
 * one of the `expected` repositories has a number, so a lost repository can never shrink the sample in silence.
 */
export function acrossRepositories(values, expected = 17) {
  const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (nums.length !== expected) return { median: null, q1: null, q3: null, missing: expected - nums.length };
  return { median: median(nums), q1: quantile(nums, 0.25), q3: quantile(nums, 0.75), missing: 0 };
}
