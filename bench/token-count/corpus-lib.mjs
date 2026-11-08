// corpus-lib.mjs: the pure parts of phase 0's corpus run (docs/contract.md, "Gate C0 in detail"). No network, no git,
// no file system: corpus.mjs feeds it text, so every rule here has a test (corpus-lib.test.mjs).

import path from "node:path";
import ts from "typescript";
import * as parse5 from "parse5";
import postcss from "postcss";
import { tsCompact, tsMap, tsPlain, topLevelIds, parseTs, htmlIds, htmlRender, htmlViews, cssCompact, cssMap, blockKey, walk } from "./views.mjs";

// ---------------- Which files and commits count ----------------

/** Source files that the views can read. */
export const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|html|css)$/i;
/** Templates the layer reads only after 1.0; they count in the 3 sizing repositories. */
export const SIZING_EXT = /\.(vue|svelte)$/i;

/**
 * Tests, generated, minified and third-party files never count (the contract's rule 2). A test is a path segment
 * named test, tests, spec, specs or __tests__, or a file name with .test. or .spec. in it. A substring is not enough:
 * "latest.ts" is not a test.
 */
export function isExcluded(p) {
  const segs = p.toLowerCase().split("/");
  const name = segs[segs.length - 1];
  if (segs.slice(0, -1).some((s) => ["test", "tests", "spec", "specs", "__tests__", "__mocks__"].includes(s))) return true;
  if (/\.(test|spec)\.[^.]+$|[._-](test|spec)\.[cm]?[jt]sx?$/.test(name)) return true;
  if (segs.slice(0, -1).some((s) => ["node_modules", "dist", "build", "vendor"].includes(s))) return true;
  return /\.min\./.test(name) || /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(p);
}

/** True for a source file that a task may count: the right extension, and not excluded. */
export function isTaskFile(p, { sizing = false } = {}) {
  return (SOURCE_EXT.test(p) || (sizing && SIZING_EXT.test(p))) && !isExcluded(p);
}

/** A bot author: a name with [bot], Dependabot or Renovate (the contract's rule 1). The e-mail is checked too. */
export const isBot = (name = "", email = "") => /\[bot\]|dependabot|renovate/i.test(`${name} ${email}`);

/**
 * Parses `git diff-tree -r -z --name-status -M` output. Each entry is a status, then one path, or two paths for a
 * rename or copy. NUL separators keep paths with spaces, tabs, quotes or non-ASCII characters exact.
 */
export function parseNameStatusZ(out) {
  const parts = out.split("\0");
  if (parts[parts.length - 1] === "") parts.pop();
  const entries = [];
  for (let i = 0; i < parts.length; ) {
    const status = parts[i++];
    if (!status) continue;
    if (/^[RC]/.test(status)) entries.push({ status: status[0], oldPath: parts[i++], path: parts[i++] });
    else entries.push({ status: status[0], path: parts[i++] });
  }
  return entries;
}

/**
 * The modified task files of a commit, or null when the commit does not qualify (rules 1 and 2). Added, deleted and
 * renamed files do not count; a commit qualifies with 1 to 5 modified task files.
 */
export function qualifyingFiles({ parents, authorName, authorEmail, entries }, { sizing = false } = {}) {
  if (parents !== 1 || isBot(authorName, authorEmail)) return null;
  const files = entries.filter((e) => e.status === "M" && isTaskFile(e.path, { sizing })).map((e) => e.path);
  return files.length >= 1 && files.length <= 5 ? files : null;
}

// ---------------- Which lines a commit changed ----------------

/**
 * The changed line ranges of the OLD file, from `git diff -U0` output. A pure insertion after line n touches lines n
 * and n + 1 (the code on both sides of it); after line 0 it touches line 1.
 */
export function changedRanges(diff) {
  const ranges = [];
  for (const m of diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/gm)) {
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (count === 0) ranges.push({ from: Math.max(1, start), to: Math.max(1, start + 1) });
    else ranges.push({ from: start, to: start + count - 1 });
  }
  return ranges;
}

const hits = (from, to, ranges) => ranges.some((r) => r.from <= to && r.to >= from);

// ---------------- The code needed: TypeScript and JavaScript ----------------

/** The top-level statements (not imports) whose lines, JSDoc included, meet a changed range. */
export function tsChangedStatements(file, text, ranges) {
  const sf = parseTs(file, text);
  const line = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  return sf.statements.filter((s) => !ts.isImportDeclaration(s) && hits(line(s.getStart(sf, true)), line(s.end), ranges));
}

/**
 * The compact view of the given top-level statements, by their IDs. If a statement does not start its own line (so
 * the compact view cannot be split at its ID), its plain text stands in, which costs more tokens, never fewer.
 */
export function tsCompactOf(file, text, statements) {
  const sf = parseTs(file, text);
  const ids = topLevelIds(sf);
  const chunks = new Map();
  for (const c of tsCompact(file, text).split(/\n(?=@[a-z]\d+ )/)) {
    const m = /^@([a-z]\d+) /.exec(c);
    if (m) chunks.set(m[1], c.slice(m[0].length).replace(/\n+$/, "") + "\n");
  }
  const byPos = new Map([...ids].map(([s, id]) => [s.pos, id]));
  return statements.map((s) => chunks.get(byPos.get(s.pos)) ?? tsPlain(file, text.slice(s.pos, s.end))).join("");
}

/** The names a statement uses, other than property names after a dot and its own declared name. */
export function namesUsed(statements) {
  const names = new Set();
  const visit = (n) => {
    if (ts.isIdentifier(n)) {
      const p = n.parent;
      const isPropName = p && ts.isPropertyAccessExpression(p) && p.name === n;
      const isOwnName = p && p.name === n && (ts.isFunctionDeclaration(p) || ts.isClassDeclaration(p) || ts.isVariableDeclaration(p)
        || ts.isInterfaceDeclaration(p) || ts.isTypeAliasDeclaration(p) || ts.isEnumDeclaration(p));
      if (!isPropName && !isOwnName) names.add(n.text);
    }
    ts.forEachChild(n, visit);
  };
  for (const s of statements) visit(s);
  return names;
}

/** The declared names of a top-level statement (a variable statement can declare several). */
export function declaredNames(s) {
  if (ts.isVariableStatement(s)) return s.declarationList.declarations.flatMap((d) => (ts.isIdentifier(d.name) ? [d.name.text] : []));
  return s.name && ts.isIdentifier(s.name) ? [s.name.text] : [];
}

/** The map entry of each top-level ID (a class entry includes its member lines). */
export function mapEntries(mapText) {
  const entries = new Map();
  let id = null;
  for (const l of mapText.split("\n")) {
    const m = /^ {2}@([a-z]\d+) /.exec(l);
    // A variable statement that declares several names has one line per name, all with the same ID.
    if (m) { id = m[1]; entries.set(id, (entries.get(id) ?? "") + l + "\n"); }
    else if (id && /^ {4}\S/.test(l)) entries.set(id, entries.get(id) + l + "\n");
    else id = null;
  }
  return entries;
}

/** `require("x")` as an expression, or null. */
function requireOf(e) {
  return e && ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === "require" && e.arguments.length === 1 && ts.isStringLiteral(e.arguments[0])
    ? e.arguments[0].text : null;
}

/**
 * The imports of a file: each local name, with the module it comes from and its name there. ES imports,
 * `import x = require("y")`, and CommonJS `const x = require("y")` and `const { a, b: c } = require("y")`.
 */
export function importsOf(file, text) {
  const sf = parseTs(file, text);
  const out = new Map();
  for (const s of sf.statements) {
    if (ts.isImportEqualsDeclaration(s) && ts.isExternalModuleReference(s.moduleReference) && ts.isStringLiteral(s.moduleReference.expression)) {
      out.set(s.name.text, { from: s.moduleReference.expression.text, name: "*" });
      continue;
    }
    if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) {
        const from = requireOf(d.initializer);
        if (!from) continue;
        if (ts.isIdentifier(d.name)) out.set(d.name.text, { from, name: "*" });
        else if (ts.isObjectBindingPattern(d.name)) {
          for (const el of d.name.elements) {
            if (ts.isIdentifier(el.name)) out.set(el.name.text, { from, name: el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : el.name.text });
          }
        }
      }
      continue;
    }
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier)) continue;
    const from = s.moduleSpecifier.text;
    const c = s.importClause;
    if (!c) continue;
    if (c.name) out.set(c.name.text, { from, name: "default" });
    const b = c.namedBindings;
    if (b && ts.isNamedImports(b)) for (const e of b.elements) out.set(e.name.text, { from, name: (e.propertyName ?? e.name).text });
    if (b && ts.isNamespaceImport(b)) out.set(b.name.text, { from, name: "*" });
  }
  return out;
}

/**
 * Where a module's export `name` is declared. Returns { statement } for a declaration in this file (also through
 * `export default X;` and a local `export { a as name }`), or { from, name } to follow a re-export (`export { name }
 * from "./x"`, `export * from "./x"`), or null.
 */
export function findExport(file, text, name) {
  const sf = parseTs(file, text);
  const local = (n) => sf.statements.find((s) => declaredNames(s).includes(n)) ?? null;
  const isDefault = (s) => (ts.getCombinedModifierFlags(s) & ts.ModifierFlags.Default) !== 0;
  if (name === "default") {
    const d = sf.statements.find((s) => !ts.isVariableStatement(s) && isDefault(s));
    if (d) return { statement: d };
    const a = sf.statements.find((s) => ts.isExportAssignment(s) && !s.isExportEquals);
    if (a && ts.isIdentifier(a.expression)) { const s = local(a.expression.text); return s ? { statement: s } : null; }
  } else {
    const s = local(name);
    if (s) return { statement: s };
  }
  const stars = [];
  for (const s of sf.statements) {
    if (!ts.isExportDeclaration(s)) continue;
    const from = s.moduleSpecifier && ts.isStringLiteral(s.moduleSpecifier) ? s.moduleSpecifier.text : null;
    if (!s.exportClause) { if (from) stars.push(from); continue; }
    if (!ts.isNamedExports(s.exportClause)) continue;
    for (const e of s.exportClause.elements) {
      if (e.name.text !== name) continue;
      const inner = (e.propertyName ?? e.name).text;
      if (from) return { from, name: inner };
      const st = local(inner);
      return st ? { statement: st } : null;
    }
  }
  return stars.length ? { from: stars[0], name, stars } : null;
}

// ---------------- Resolving the repository's own modules ----------------

/** Strips comments and trailing commas from tsconfig-style JSON, outside strings. */
export function parseJsonc(text) {
  let out = "", i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1); i = j + 1;
    } else if (c === "/" && text[i + 1] === "/") { while (i < text.length && text[i] !== "\n") i++; }
    else if (c === "/" && text[i + 1] === "*") { const e = text.indexOf("*/", i + 2); i = e < 0 ? text.length : e + 2; }
    else { out += c; i++; }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

/** Path aliases from a root tsconfig's `paths` with one `*` each, for example "@/*": ["./src/*"]. */
export function aliasesFrom(tsconfigText) {
  try {
    const co = parseJsonc(tsconfigText.replace(/^﻿/, "")).compilerOptions ?? {};
    const base = co.baseUrl ?? ".";
    return Object.entries(co.paths ?? {}).flatMap(([k, targets]) => {
      if (!k.endsWith("*") || !Array.isArray(targets)) return [];
      return [{ prefix: k.slice(0, -1), targets: targets.filter((t) => t.endsWith("*")).map((t) => path.posix.normalize(path.posix.join(base, t.slice(0, -1))).replace(/^\.\//, "")) }];
    });
  } catch {
    return [];
  }
}

const TRY_EXT = ["", ".ts", ".tsx", ".d.ts", ".js", ".jsx", ".mjs", ".cjs", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"];

/**
 * The workspace packages of a repository: every package.json with a "name", as name -> { dir, entries }. The entries
 * are the file stems its "source", "types", "module" and "main" fields name, then src/index and index.
 */
export function workspacePackages(packageJsons) {
  const out = new Map();
  for (const { path: p, text } of packageJsons) {
    let pkg;
    try { pkg = JSON.parse(text.replace(/^﻿/, "")); } catch { continue; }
    if (typeof pkg?.name !== "string" || !pkg.name) continue;
    const dir = path.posix.dirname(p);
    const stem = (f) => path.posix.normalize(path.posix.join(dir, f)).replace(/\.(d\.ts|[cm]?[jt]sx?)$/, "");
    const fields = ["source", "types", "typings", "module", "main"].map((k) => pkg[k]).filter((v) => typeof v === "string");
    out.set(pkg.name, { dir, entries: [...fields.map(stem), stem("src/index"), stem("index")] });
  }
  return out;
}

/**
 * Resolves an import to a file of the repository: "own" with a path; "own-unresolved" for an import that names the
 * repository's own code (relative, an alias, baseUrl, or a workspace package) but matches no file; or "external"
 * for a third-party package. `ctx` is { aliases, baseUrl, workspaces }; an array stands for { aliases }.
 */
export function resolveImport(spec, fromFile, fileSet, ctx = {}) {
  const { aliases = [], baseUrl = null, workspaces = new Map() } = Array.isArray(ctx) ? { aliases: ctx } : ctx;
  const find = (bases) => {
    for (const b of bases) {
      const stems = [b, b.replace(/\.(m|c)?js$/, "")];
      for (const stem of stems) for (const e of TRY_EXT) if (fileSet.has(stem + e)) return stem + e;
    }
    return null;
  };
  const norm = (...p) => path.posix.normalize(path.posix.join(...p)).replace(/^\.\//, "");
  let bases = null;
  if (spec.startsWith(".")) bases = [norm(path.posix.dirname(fromFile), spec)];
  else for (const a of aliases) if (spec.startsWith(a.prefix)) { bases = a.targets.map((t) => norm(t, spec.slice(a.prefix.length))); break; }
  if (!bases) {
    const pkgName = [...workspaces.keys()].filter((n) => spec === n || spec.startsWith(n + "/")).sort((a, b) => b.length - a.length)[0];
    if (pkgName) {
      const { dir, entries } = workspaces.get(pkgName);
      const sub = spec.slice(pkgName.length + 1);
      bases = sub ? [norm(dir, "src", sub), norm(dir, sub)] : entries;
    }
  }
  if (!bases && baseUrl !== null) {
    const hit = find([norm(baseUrl, spec)]);
    return hit ? { kind: "own", path: hit } : { kind: "external" };
  }
  if (!bases) return { kind: "external" };
  const hit = find(bases);
  return hit ? { kind: "own", path: hit } : { kind: "own-unresolved" };
}

/** The root tsconfig's baseUrl, as a repository path, or null. */
export function baseUrlFrom(tsconfigText) {
  try {
    const b = parseJsonc(tsconfigText.replace(/^﻿/, "")).compilerOptions?.baseUrl;
    return typeof b === "string" ? path.posix.normalize(b).replace(/^\.\/?$/, ".") : null;
  } catch {
    return null;
  }
}

// ---------------- The code needed: HTML and CSS ----------------

/**
 * The compact view of the blocks (landmarks, top-level blocks, the head) that a change touches: for each changed
 * range, the smallest block that holds the whole range; if no block holds it all, every block it touches.
 */
export function htmlChangedCode(text, ranges) {
  const doc = parse5.parse(text, { sourceCodeLocationInfo: true });
  const ids = htmlIds(doc);
  const candidates = [];
  walk(doc, (n) => { if (n.sourceCodeLocation && (ids.has(n) || n.tagName === "head")) candidates.push(n); });
  const span = (n) => [n.sourceCodeLocation.startLine, n.sourceCodeLocation.endLine ?? n.sourceCodeLocation.startLine];
  const size = (n) => span(n)[1] - span(n)[0];
  const chosen = new Set();
  for (const r of ranges) {
    const holding = candidates.filter((n) => { const [a, b] = span(n); return a <= r.from && b >= r.to; });
    if (holding.length) { chosen.add(holding.reduce((best, n) => (size(n) < size(best) ? n : best))); continue; }
    for (const n of candidates) { const [a, b] = span(n); if (hits(a, b, [r])) chosen.add(n); }
  }
  const isInside = (n, outer) => { for (let p = n.parentNode; p; p = p.parentNode) if (p === outer) return true; return false; };
  const top = [...chosen].filter((n) => ![...chosen].some((o) => o !== n && isInside(n, o)));
  return top.map((n) => htmlRender(n, text, ids, { elide: false })).join("");
}

/**
 * The code of every rule group (rules with the same block key) that holds a changed line, in the compact view. Two
 * cases the compact view cannot show go in as written: a rule with nested rules (`.a { &:hover { ... } }`), and an
 * at-rule that holds declarations (`@font-face`, Tailwind's `@theme` and `@utility`).
 */
export function cssChangedCode(text, ranges) {
  const root = postcss.parse(text);
  const keys = new Set(), asWritten = new Set();
  const touched = (n) => n.source?.start && hits(n.source.start.line, n.source.end?.line ?? n.source.start.line, ranges);
  const hasDecls = (n) => (n.nodes ?? []).some((c) => c.type === "decl");
  root.walk((n) => {
    if (!touched(n)) return;
    if (n.type === "atrule" && hasDecls(n)) { asWritten.add(n); return; }
    if (n.type !== "rule") return;
    let owner = n;
    while (owner.parent?.type === "rule") owner = owner.parent;
    if (owner.parent?.type === "atrule" && hasDecls(owner.parent)) { asWritten.add(owner.parent); return; }
    if ((owner.nodes ?? []).some((c) => c.type === "rule" || c.type === "atrule")) asWritten.add(owner);
    else keys.add(blockKey(owner.selector));
  });
  const compact = keys.size ? cssCompact(root, { filter: (sel) => keys.has(blockKey(sel)), inlineIds: false }) : "";
  const written = [...asWritten].filter((n) => ![...asWritten].some((o) => o !== n && isWithin(n, o))).map((n) => n.toString().trim() + "\n").join("");
  return compact + written;
}
const isWithin = (n, outer) => { for (let p = n.parent; p; p = p.parent) if (p === outer) return true; return false; };

// ---------------- The map ----------------

/** The map of one file; a file the views cannot read gets one line that says so. */
export function fileMap(file, text) {
  try {
    if (/\.(tsx?|jsx?|mjs|cjs)$/i.test(file)) return tsMap(file, text);
    if (/\.html?$/i.test(file)) return htmlViews(file, text).map;
    if (/\.css$/i.test(file)) return cssMap(file, postcss.parse(text));
  } catch {
    return `${file} (not parsed)\n`;
  }
  return `${file} (not supported)\n`;
}

/** One line per folder for the whole repository: its path and its number of source files. */
export function folderOverview(paths, { sizing = false } = {}) {
  const counts = new Map();
  for (const p of paths) {
    if (!(SOURCE_EXT.test(p) || (sizing && SIZING_EXT.test(p)))) continue;
    if (/\.min\./.test(p) || p.split("/").slice(0, -1).some((s) => ["node_modules", "dist", "build", "vendor"].includes(s))) continue;
    const dir = path.posix.dirname(p);
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
  return [...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([d, n]) => `${d === "." ? "." : d}/ ${n}`).join("\n") + "\n";
}

// ---------------- The formula ----------------

/** saving = 1 - layer / baseline. A baseline of zero has no saving (null), never a division by zero. */
export const saving = (layer, baseline) => (baseline > 0 ? 1 - layer / baseline : null);

/** The q-quantile with linear interpolation between the two nearest values (the median is q = 0.5). */
export function quantile(values, q) {
  const v = values.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const at = (v.length - 1) * q, lo = Math.floor(at), hi = Math.ceil(at);
  return v[lo] + (v[hi] - v[lo]) * (at - lo);
}
export const median = (values) => quantile(values, 0.5);

/**
 * A stand-in for the signatures of names that could not be resolved: one typical map line per name (the line of
 * median length among the task's own map lines). A name the run cannot resolve still costs the layer tokens, so the
 * gate is not flattered by what the first pass misses.
 */
export function unresolvedCharge(mapText, count) {
  if (!count) return "";
  const lines = mapText.split("\n").filter((l) => /^ {2}@[a-z]\d+ /.test(l)).sort((a, b) => a.length - b.length);
  const typical = lines.length ? lines[Math.floor((lines.length - 1) / 2)] : "  @f0 fn unresolved(value: unknown): unknown  L1-1";
  return (typical + "\n").repeat(count);
}

/**
 * Gate C0's summary (docs/contract.md, "Gate C0 in detail"). The gate gives "pass" or "miss" only when exactly
 * `gateSize` gate repositories each have 3 tasks or more, and the gate's counter (Anthropic's) has counted them;
 * otherwise it gives "no result" with the reason. Repository medians are the median saving of their tasks.
 */
export function summarize(repos, { gateSize = 17, proxyOnly = false } = {}) {
  const gate = repos.filter((r) => r.role === "gate" && r.tasks.length >= 3);
  const vals = (rs, k) => rs.map((r) => r.median?.[k]).filter((v) => typeof v === "number");
  const stat = (rs, k) => ({ median: median(vals(rs, k)), q1: quantile(vals(rs, k), 0.25), q3: quantile(vals(rs, k), 0.75) });
  const groupBy = (key, k) => Object.fromEntries([...new Set(gate.map((r) => r[key]))].map((v) => [v, median(vals(gate.filter((r) => r[key] === v), k))]));
  const worst = (k) => {
    const rs = gate.filter((r) => typeof r.median?.[k] === "number").sort((a, b) => a.median[k] - b.median[k]);
    const ts = gate.flatMap((r) => r.tasks.map((t) => ({ repo: r.repo, commit: t.commit, saving: t.saving?.[k] }))).filter((t) => typeof t.saving === "number").sort((a, b) => a.saving - b.saving);
    return { repository: rs[0] ? { repo: rs[0].repo, median: rs[0].median[k] } : null, task: ts[0] ?? null };
  };
  const claude = proxyOnly ? null : stat(gate, "claude");
  let gateResult;
  if (proxyOnly) gateResult = { result: "no result: proxy only", threshold: 0.5 };
  else if (gate.length !== gateSize) gateResult = { result: `no result: ${gate.length} of ${gateSize} gate repositories have 3 tasks or more`, threshold: 0.5 };
  else gateResult = { result: claude.median >= 0.5 ? "pass" : "miss", median: claude.median, threshold: 0.5 };
  const perCounter = (k) => ({ spread: stat(gate, k), byCategory: groupBy("category", k), byBand: groupBy("band", k), worst: worst(k) });
  return {
    gateRepositories: gate.length,
    gate: gateResult,
    claude: proxyOnly ? null : perCounter("claude"),
    o200k: perCounter("o200k"),
    o200kWholeMap: stat(gate, "o200kWholeMap"),
    o200kCodeOnly: stat(gate, "o200kCodeOnly"),
    unresolvedNames: repos.reduce((n, r) => n + r.tasks.reduce((m, t) => m + (t.unresolvedNames ?? 0), 0), 0),
    sizing: repos.filter((r) => r.role === "sizing").map((r) => ({ repo: r.repo, tasks: r.tasks.length, median: r.median?.o200k ?? null, unsupportedFiles: r.tasks.reduce((n, t) => n + (t.unsupportedFiles?.length ?? 0), 0) })),
    needReserve: repos.filter((r) => r.tasks.length < 3).map((r) => r.repo),
  };
}
