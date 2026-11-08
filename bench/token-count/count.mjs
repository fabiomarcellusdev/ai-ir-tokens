// count.mjs: count tokens for each view of the AI code layer (raw, plain, compact, elided, map),
// for the context of a task (whole file, whole corpus, map + the code the task needs) and for
// the output of an edit (whole-file rewrite, SEARCH/REPLACE blocks, edit operations by ID).
//
//   node count.mjs            runs on ./samples and its five task scenarios
//   node count.mjs <dir>      runs the per-file views on any folder (no scenarios)
//
// Views are written to ./out so that they can be read. Tokenizers: OpenAI's o200k_base and
// cl100k_base through js-tiktoken. Claude's tokenizer is different; these are a proxy.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import * as parse5 from "parse5";
import postcss from "postcss";
import { getEncoding } from "js-tiktoken";
import { commentRanges, removeRanges } from "./html-text.mjs";

const ENCODINGS = ["o200k_base", "cl100k_base"];
const enc = Object.fromEntries(ENCODINGS.map((n) => [n, getEncoding(n)]));
const tok = (s) => Object.fromEntries(ENCODINGS.map((n) => [n, enc[n].encode(s).length]));

// ------------------------------------------------------------------------------------------
// Shared helpers
// ------------------------------------------------------------------------------------------

/** Applies non-overlapping text edits {start, end, text}; an edit inside an earlier, larger one is dropped. */
function applyEdits(text, edits) {
  edits.sort((a, b) => a.start - b.start || b.end - a.end);
  let out = "", at = 0, lastEnd = -1;
  for (const e of edits) {
    if (e.start < lastEnd) continue; // contained in (or overlapping) an accepted edit
    out += text.slice(at, e.start) + e.text;
    at = e.end;
    lastEnd = Math.max(lastEnd, e.end);
  }
  return out + text.slice(at);
}

const dropBlankLines = (s) =>
  s.split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim() !== "").join("\n") + "\n";

// ------------------------------------------------------------------------------------------
// TypeScript, JavaScript and JSX
// ------------------------------------------------------------------------------------------

const isJsDoc = (n) => n.kind >= ts.SyntaxKind.FirstJSDocNode && n.kind <= ts.SyntaxKind.LastJSDocNode;

function leaves(node, sf, out = []) {
  if (isJsDoc(node)) return out;
  const kids = node.getChildren(sf);
  if (kids.length === 0) out.push(node);
  else for (const k of kids) leaves(k, sf, out);
  return out;
}

function commentEdits(sf, text) {
  const seen = new Map();
  for (const leaf of leaves(sf, sf)) {
    if (leaf.kind === ts.SyntaxKind.JsxText) continue;
    for (const r of [
      ...(ts.getLeadingCommentRanges(text, leaf.pos) ?? []),
      ...(ts.getTrailingCommentRanges(text, leaf.end) ?? []),
    ]) seen.set(r.pos, { start: r.pos, end: r.end, text: "" });
  }
  return [...seen.values()];
}

const scriptKind = (file) =>
  file.endsWith(".tsx") ? ts.ScriptKind.TSX : file.endsWith(".jsx") ? ts.ScriptKind.JSX
    : /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;

const parseTs = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));

const KIND_LETTER = (s) =>
  ts.isFunctionDeclaration(s) ? "f" : ts.isClassDeclaration(s) ? "c" : ts.isInterfaceDeclaration(s) ? "i"
    : ts.isTypeAliasDeclaration(s) ? "t" : ts.isEnumDeclaration(s) ? "e" : ts.isVariableStatement(s) ? "v" : "s";

/** IDs for top-level declarations (imports have none), in source order: @f8 is the 8th, a function. */
function topLevelIds(sf) {
  const ids = new Map();
  let n = 0;
  for (const s of sf.statements) {
    if (ts.isImportDeclaration(s)) continue;
    ids.set(s, `${KIND_LETTER(s)}${++n}`);
  }
  return ids;
}

/** Comments removed only: indentation and line breaks kept. */
function tsNoComments(file, text) {
  const sf = parseTs(file, text);
  return dropBlankLines(applyEdits(text, commentEdits(sf, text)));
}

/** Plain view: still valid code. Comments removed, indentation and blank lines removed. */
function tsPlain(file, text) {
  const sf = parseTs(file, text);
  const noComments = applyEdits(text, commentEdits(sf, text));
  return noComments.split("\n").map((l) => l.trim()).filter(Boolean).join("\n") + "\n";
}

/**
 * Compact view (the proposed L1): same syntax tree, but block braces, statement-ending semicolons
 * and if/while parentheses go, indentation carries the structure, JSX is written Pug-style
 * (no < > or closing tags, className="a b" becomes .a.b, text lines start with "| "), and each
 * top-level declaration carries its ID.
 */
function tsCompact(file, text, { inlineIds = true } = {}) {
  const sf = parseTs(file, text);
  const ids = topLevelIds(sf);
  const edits = commentEdits(sf, text);
  const del = (node, withSpace) => {
    let start = node.getStart(sf), end = node.end;
    if (withSpace === "before" && text[start - 1] === " ") start--;
    if (withSpace === "after" && text[end] === " ") end++;
    edits.push({ start, end, text: "" });
  };
  const childTokens = (node, kind) => node.getChildren(sf).filter((c) => c.kind === kind);

  if (inlineIds) for (const [s, id] of ids) edits.push({ start: s.getStart(sf), end: s.getStart(sf), text: `@${id} ` });

  function jsxHead(node) {
    // <Tag a="1" className="x y" b={c}>  ->  Tag.x.y a="1" b={c}
    let head = node.tagName.getText(sf);
    const rest = [];
    for (const a of node.attributes.properties) {
      if (ts.isJsxAttribute(a) && a.name.getText(sf) === "className" && a.initializer && ts.isStringLiteral(a.initializer)) {
        head += a.initializer.text.split(/\s+/).filter(Boolean).map((c) => "." + c).join("");
      } else rest.push(a.getText(sf).replace(/\n\s*/g, " "));
    }
    return rest.length ? `${head} ${rest.join(" ")}` : head;
  }

  function visit(node) {
    if (isJsDoc(node)) return;
    switch (node.kind) {
      case ts.SyntaxKind.Block:
      case ts.SyntaxKind.ModuleBlock:
      case ts.SyntaxKind.CaseBlock:
      case ts.SyntaxKind.ClassDeclaration:
      case ts.SyntaxKind.ClassExpression:
      case ts.SyntaxKind.InterfaceDeclaration:
      case ts.SyntaxKind.EnumDeclaration:
        for (const t of childTokens(node, ts.SyntaxKind.OpenBraceToken)) del(t, "before");
        for (const t of childTokens(node, ts.SyntaxKind.CloseBraceToken)) del(t, "after");
        break;
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.WhileStatement: {
        const body = ts.isIfStatement(node) ? node.thenStatement : node.statement;
        if (ts.isBlock(body)) {
          for (const t of childTokens(node, ts.SyntaxKind.OpenParenToken)) edits.push({ start: t.getStart(sf), end: t.end, text: " " === text[t.getStart(sf) - 1] ? "" : " " });
          for (const t of childTokens(node, ts.SyntaxKind.CloseParenToken)) del(t);
        }
        break;
      }
      case ts.SyntaxKind.SemicolonToken: {
        const after = text.slice(node.end).match(/^[ \t]*(\r?\n|$)/);
        if (after && node.parent.kind !== ts.SyntaxKind.ForStatement) del(node);
        break;
      }
      case ts.SyntaxKind.JsxOpeningElement:
        edits.push({ start: node.getStart(sf), end: node.end, text: jsxHead(node) + (/^\S/.test(text.slice(node.end)) && text[node.end] !== "<" ? " " : "") });
        return; // attributes are rewritten whole
      case ts.SyntaxKind.JsxSelfClosingElement:
        edits.push({ start: node.getStart(sf), end: node.end, text: jsxHead(node) });
        return;
      case ts.SyntaxKind.JsxClosingElement:
      case ts.SyntaxKind.JsxClosingFragment:
        del(node);
        return;
      case ts.SyntaxKind.JsxText:
        if (node.text.includes("\n") && node.text.trim()) {
          edits.push({ start: node.pos, end: node.end, text: node.text.replace(/^([ \t]*)(\S.*)$/gm, "$1| $2") });
        }
        return;
    }
    for (const c of node.getChildren(sf)) visit(c);
  }
  visit(sf);
  return dropBlankLines(applyEdits(text, edits));
}

/** Map view (L0): one line per declaration, with its ID, signature and lines; class members indented. */
function tsMap(file, text) {
  const sf = parseTs(file, text);
  const ids = topLevelIds(sf);
  const line = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const range = (n) => `L${line(n.getStart(sf))}-${line(n.end)}`;
  const flat = (s) => s.replace(/\s+/g, " ").trim();
  const exp = (s) => (ts.getCombinedModifierFlags(s) & ts.ModifierFlags.Export ? "export " : "");
  const sig = (fn) => {
    const params = fn.parameters.map((p) => flat(p.getText(sf))).join(", ");
    return `(${params})${fn.type ? ": " + flat(fn.type.getText(sf)) : ""}`;
  };
  const out = [`${file}`];
  const imports = sf.statements.filter(ts.isImportDeclaration).map((s) => s.moduleSpecifier.text);
  if (imports.length) out.push(`  imports ${imports.join(", ")}`);
  for (const [s, id] of ids) {
    if (ts.isFunctionDeclaration(s)) out.push(`  @${id} ${exp(s)}${s.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ? "async " : ""}fn ${s.name?.text}${sig(s)}  ${range(s)}`);
    else if (ts.isClassDeclaration(s)) {
      out.push(`  @${id} ${exp(s)}class ${s.name?.text}  ${range(s)}`);
      for (const m of s.members) {
        const priv = m.modifiers?.some((x) => x.kind === ts.SyntaxKind.PrivateKeyword) ? "private " : "";
        if (ts.isMethodDeclaration(m)) out.push(`    ${priv}${m.name.getText(sf)}${sig(m)}`);
        else if (ts.isConstructorDeclaration(m)) out.push(`    constructor${sig(m)}`);
        else if (ts.isPropertyDeclaration(m)) out.push(`    ${priv}${m.name.getText(sf)}`);
      }
    } else if (ts.isInterfaceDeclaration(s)) {
      out.push(`  @${id} ${exp(s)}interface ${s.name.text} { ${s.members.map((m) => m.name?.getText(sf)).join(", ")} }`);
    } else if (ts.isTypeAliasDeclaration(s)) {
      const t = flat(s.type.getText(sf));
      out.push(`  @${id} ${exp(s)}type ${s.name.text} = ${t.length <= 60 ? t : t.slice(0, 57) + "…"}`);
    } else if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) {
        const init = d.initializer;
        const desc = init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) ? `fn${sig(init)}`
          : init ? (flat(init.getText(sf)).length <= 40 ? `= ${flat(init.getText(sf))}` : `= ${ts.SyntaxKind[init.kind]}…`) : "";
        out.push(`  @${id} ${exp(s)}const ${d.name.getText(sf)} ${desc}  ${range(s)}`);
      }
    } else out.push(`  @${id} ${ts.SyntaxKind[s.kind]}  ${range(s)}`);
  }
  return out.join("\n") + "\n";
}

/** The compact text of one top-level declaration, by name (what "read the body on request" returns). */
function tsCompactSymbol(file, text, name) {
  const sf = parseTs(file, text);
  const ids = topLevelIds(sf);
  const target = sf.statements.find((s) => s.name?.text === name);
  const id = ids.get(target);
  const chunks = tsCompact(file, text).split(/\n(?=@[a-z]\d+ )/);
  const chunk = chunks.find((c) => c.startsWith(`@${id} `));
  return chunk.slice(`@${id} `.length).replace(/\n+$/, "") + "\n";
}

// ------------------------------------------------------------------------------------------
// HTML
// ------------------------------------------------------------------------------------------

const LANDMARKS = new Set(["header", "nav", "main", "section", "aside", "footer", "form"]);
const BOOLEAN_ATTRS = new Set(["required", "disabled", "checked", "hidden", "autofocus", "multiple", "readonly", "selected", "open", "defer", "async", "novalidate"]);
const attr = (n, name) => n.attrs?.find((a) => a.name === name)?.value;
const norm = (s) => s.replace(/\s+/g, " ").trim();
const elementKids = (n) => (n.childNodes ?? []).filter((c) => c.tagName || (c.nodeName === "#text" && norm(c.value)));

function walk(n, fn) { fn(n); for (const c of n.childNodes ?? []) walk(c, fn); if (n.content) walk(n.content, fn); }

/** IDs for landmarks and for the body's direct children, in document order. */
function htmlIds(doc) {
  const ids = new Map();
  let k = 0;
  walk(doc, (n) => {
    if (!n.tagName) return;
    if (LANDMARKS.has(n.tagName) || n.parentNode?.tagName === "body") ids.set(n, `n${++k}`);
  });
  return ids;
}

function htmlHead(n, ids, { shortAttrs = false } = {}) {
  const id = attr(n, "id");
  const cls = (attr(n, "class") ?? "").split(/\s+/).filter(Boolean);
  let h = n.tagName === "div" && (id || cls.length) ? "" : n.tagName;
  if (id) h += "#" + id;
  for (const c of cls) h += "." + c;
  if (!shortAttrs) {
    const rest = n.attrs.filter((a) => a.name !== "id" && a.name !== "class").map((a) =>
      a.value === "" && BOOLEAN_ATTRS.has(a.name) ? a.name
        : /[\s\]"]/.test(a.value) || a.value === "" ? `${a.name}="${a.value.replace(/"/g, "&quot;")}"` : `${a.name}=${a.value}`);
    if (rest.length) h += "[" + rest.join(" ") + "]";
  }
  const nodeId = ids.get(n);
  return nodeId ? `@${nodeId} ${h}` : h;
}

/** Compact view: indentation, no closing tags, #id and .class, "| " for text; optionally SVG elided. */
function htmlRender(root, src, idsIn, { elide, inlineIds = true }) {
  const ids = inlineIds ? idsIn : new Map();
  const out = [];
  let svgCount = 0;
  function render(n, depth) {
    const pad = "  ".repeat(depth);
    if (n.nodeName === "#document" || n.nodeName === "#document-fragment") { for (const c of n.childNodes) render(c, depth); return; }
    if (n.nodeName === "#documentType") { out.push(pad + "doctype " + n.name); return; }
    if (n.nodeName === "#comment") return;
    if (n.nodeName === "#text") { const t = norm(n.value); if (t) out.push(pad + "| " + t); return; }
    if (elide && n.tagName === "svg") {
      const loc = n.sourceCodeLocation;
      const chars = loc ? loc.endOffset - loc.startOffset : 0;
      const size = attr(n, "width") && attr(n, "height") ? `${attr(n, "width")}x${attr(n, "height")}, ` : "";
      const paths = []; walk(n, (c) => c.tagName === "path" && paths.push(c));
      out.push(`${pad}${inlineIds ? `@s${++svgCount} ` : ""}${htmlHead(n, ids, { shortAttrs: true })} (${size}${paths.length} path, ${chars} chars elided)`);
      return;
    }
    if (n.tagName === "script" || n.tagName === "style") {
      out.push(pad + htmlHead(n, ids));
      const body = n.childNodes.map((c) => c.value ?? "").join("");
      for (const l of body.split("\n")) if (l.trim()) out.push(pad + "  " + l.trim());
      return;
    }
    const kids = elementKids(n.content ?? n);
    const head = pad + htmlHead(n, ids);
    if (kids.length === 1 && kids[0].nodeName === "#text") { out.push(head + " " + norm(kids[0].value)); return; }
    if (kids.length === 1 && kids[0].tagName && !(elide && kids[0].tagName === "svg")) {
      const start = out.length;
      render(kids[0], depth);
      out[start] = head + " > " + out[start].trimStart();
      return;
    }
    out.push(head);
    for (const k of kids) render(k, depth + 1);
  }
  render(root, 0);
  return out.join("\n") + "\n";
}

/** Map view: the title, then each landmark or top-level block with its first heading and what it holds. */
function htmlMap(file, doc, ids) {
  const out = [file];
  walk(doc, (n) => { if (n.tagName === "title") out.push(`  title ${norm(n.childNodes.map((c) => c.value).join(""))}`); });
  function summary(n) {
    let heading = null; const counts = { link: 0, field: 0, svg: 0, img: 0, article: 0, card: 0 };
    (function inner(c, top) {
      if (!top && ids.has(c)) return; // nested entry has its own line
      if (c.tagName) {
        if (!heading && /^h[1-3]$/.test(c.tagName)) { let t = ""; walk(c, (x) => { if (x.nodeName === "#text") t += x.value; }); heading = `${c.tagName} "${norm(t)}"`; }
        if (c.tagName === "a") counts.link++;
        if (["input", "select", "textarea"].includes(c.tagName)) counts.field++;
        if (c.tagName === "svg") counts.svg++;
        if (c.tagName === "img") counts.img++;
        if (c.tagName === "article") counts.article++;
        if (/(^|\s)[\w-]*card(\s|$)/.test(attr(c, "class") ?? "")) counts.card++;
        if (c.tagName === "svg") return;
      }
      for (const k of c.childNodes ?? []) inner(k, false);
    })(n, true);
    const parts = Object.entries(counts).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`);
    return [heading, parts.length ? parts.join(", ") : null].filter(Boolean).join("  ");
  }
  function list(n, depth) {
    if (ids.has(n)) {
      const id = attr(n, "id"), cls = (attr(n, "class") ?? "").split(/\s+/).filter(Boolean)[0];
      const name = (n.tagName === "div" && (id || cls) ? "" : n.tagName) + (id ? "#" + id : "") + (cls ? "." + cls : "");
      out.push(`${"  ".repeat(depth)}@${ids.get(n)} ${name}  ${summary(n)}`);
      depth++;
    }
    for (const c of n.childNodes ?? []) list(c, depth);
  }
  list(doc, 1);
  return out.join("\n") + "\n";
}

/** Plain view: still valid HTML. Comments and indentation removed, whitespace between tags collapsed. */
function htmlPlain(text, doc) {
  return removeRanges(text, commentRanges(doc)).split("\n").map((l) => l.trim()).filter(Boolean).join("\n") + "\n";
}

function htmlViews(file, text) {
  const doc = parse5.parse(text, { sourceCodeLocationInfo: true });
  const ids = htmlIds(doc);
  return {
    doc, ids,
    plain: htmlPlain(text, doc),
    compact: htmlRender(doc, text, ids, { elide: false }),
    compactNoIds: htmlRender(doc, text, ids, { elide: false, inlineIds: false }),
    elided: htmlRender(doc, text, ids, { elide: true, inlineIds: false }),
    map: htmlMap(file, doc, ids),
  };
}

function findById(doc, id) { let hit = null; walk(doc, (n) => { if (!hit && attr(n, "id") === id) hit = n; }); return hit; }

// ------------------------------------------------------------------------------------------
// CSS
// ------------------------------------------------------------------------------------------

const declText = (d, sep) => `${d.prop}${sep}${d.value}${d.important ? " !important" : ""}`;

/** Comments removed only: the stylesheet otherwise as written. */
function cssNoComments(root) {
  const r = root.clone();
  r.walkComments((c) => c.remove());
  return dropBlankLines(r.toString());
}

/** Plain view: still valid CSS. One rule a line, no comments, no spaces that carry nothing. */
function cssPlain(root) {
  const out = [];
  (function w(c) {
    for (const n of c.nodes ?? []) {
      if (n.type === "rule") out.push(`${n.selector.replace(/\s*,\s*/g, ",")}{${n.nodes.filter((d) => d.type === "decl").map((d) => declText(d, ":")).join(";")}}`);
      else if (n.type === "atrule") { if (n.nodes) { out.push(`@${n.name} ${n.params}{`); w(n); out.push("}"); } else out.push(`@${n.name} ${n.params};`); }
    }
  })(root);
  return out.join("\n") + "\n";
}

const isSimpleClass = (sel) => /^\.[\w-]+$/.test(sel);

/** Compact view: one line a rule with its ID, "prop value" pairs, BEM suffixes nested with &. Source order kept. */
function cssCompact(root, { filter = null, inlineIds = true } = {}) {
  const out = [];
  let rid = 0;
  (function w(c, depth) {
    let base = null;
    for (const n of c.nodes ?? []) {
      const pad = "  ".repeat(depth);
      if (n.type === "atrule") {
        if (!n.nodes) { out.push(`${pad}@${n.name} ${n.params}`); continue; }
        const mark = out.length;
        out.push(`${pad}@${n.name} ${n.params}`);
        w(n, depth + 1);
        if (filter && out.length === mark + 1) out.length = mark;
        base = null;
        continue;
      }
      if (n.type !== "rule") continue;
      const id = `r${++rid}`;
      if (filter && !filter(n.selector)) continue;
      const sel = n.selector.replace(/\s*,\s*/g, ", ");
      let shown = sel, d = depth;
      if (base && isSimpleClass(sel.split(":")[0]) && sel.startsWith(base) && /^(__|--|:)/.test(sel.slice(base.length))) {
        shown = "&" + sel.slice(base.length); d = depth + 1;
      } else base = isSimpleClass(sel) ? sel : null;
      const decls = n.nodes.filter((x) => x.type === "decl").map((x) => declText(x, " ")).join("; ");
      out.push(`${"  ".repeat(d)}${inlineIds ? `@${id} ` : ""}${shown}  ${decls}`);
    }
  })(root, 0);
  return out.join("\n") + "\n";
}

const blockKey = (sel) => {
  const m = sel.match(/\.([\w-]+)/);
  return m ? "." + m[1].split(/__|--/)[0] : sel.replace(/\s+/g, " ");
};

/** Map view: rules grouped by block (.pricing-card*), with ID ranges, at-rules and custom properties. */
function cssMap(file, root) {
  const out = [file];
  let rid = 0;
  (function w(c, depth) {
    let group = null;
    const flush = () => { if (group) out.push(`${"  ".repeat(depth)}@r${group.from}${group.to > group.from ? "-r" + group.to : ""} ${group.key}${group.to > group.from ? "* (" + (group.to - group.from + 1) + " rules)" : ""}${group.vars ? " (" + group.vars + " custom properties)" : ""}`); group = null; };
    for (const n of c.nodes ?? []) {
      if (n.type === "atrule" && n.nodes) { flush(); out.push(`${"  ".repeat(depth)}@${n.name} ${n.params}`); w(n, depth + 1); continue; }
      if (n.type !== "rule") continue;
      const id = ++rid, key = blockKey(n.selector);
      const vars = n.nodes.filter((d) => d.type === "decl" && d.prop.startsWith("--")).length;
      if (group && group.key === key) group.to = id;
      else { flush(); group = { key, from: id, to: id, vars }; }
    }
    flush();
  })(root, 1);
  return out.join("\n") + "\n";
}

// ------------------------------------------------------------------------------------------
// Running it
// ------------------------------------------------------------------------------------------

// fileURLToPath decodes %20 and other escapes. URL.pathname does not, so a folder with a space failed.
const here = path.dirname(fileURLToPath(import.meta.url));
const argDir = process.argv[2];
const root = path.resolve(argDir ?? path.join(here, "samples"));
const outDir = path.join(here, "out");
fs.mkdirSync(outDir, { recursive: true });

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name.startsWith(".") ? [] : files(p);
    return /\.(tsx?|jsx?|mjs|cjs|html?|css)$/.test(e.name) && !/\.d\.ts$|\.min\./.test(e.name) ? [p] : [];
  });
}

const kindOf = (f) => (/\.(tsx|jsx)$/.test(f) ? "jsx" : /\.(ts|js|mjs|cjs)$/.test(f) ? "ts" : /\.html?$/.test(f) ? "html" : "css");
const rows = [];
const views = {};
for (const abs of files(root)) {
  const rel = path.relative(root, abs).replace(/\\/g, "/");
  const text = fs.readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
  const kind = kindOf(rel);
  let v;
  if (kind === "ts" || kind === "jsx") v = { raw: text, noComments: tsNoComments(rel, text), plain: tsPlain(rel, text), compact: tsCompact(rel, text), compactNoIds: tsCompact(rel, text, { inlineIds: false }), map: tsMap(rel, text) };
  else if (kind === "html") { const h = htmlViews(rel, text); v = { raw: text, plain: h.plain, compact: h.compact, compactNoIds: h.compactNoIds, elided: h.elided, map: h.map, _h: h }; }
  else { const r = postcss.parse(text); v = { raw: text, noComments: cssNoComments(r), plain: cssPlain(r), compact: cssCompact(r), compactNoIds: cssCompact(r, { inlineIds: false }), map: cssMap(rel, r), _css: r }; }
  views[rel] = v;
  const counts = Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith("_")).map(([k, s]) => [k, tok(s)]));
  rows.push({ file: rel, kind, counts });
  for (const [k, s] of Object.entries(v)) if (!k.startsWith("_") && k !== "raw") fs.writeFileSync(path.join(outDir, rel.replace(/\//g, "__") + "." + k + ".txt"), s);
}

const pct = (a, b) => (b ? `${Math.round((1 - a / b) * 100)}%` : "–");
const E = "o200k_base", E2 = "cl100k_base";

console.log(`\nPer-file views (tokens, ${E} | ${E2}); saving is against the raw file\n`);
console.log("| File | Raw | Comments removed | Plain | Compact, inline IDs | Compact, no inline IDs | Compact + SVG elided | Map |");
console.log("|---|---|---|---|---|---|---|---|");
for (const r of rows) {
  const c = r.counts, cell = (k) => (c[k] ? `${c[k][E]} \\| ${c[k][E2]} (${pct(c[k][E], c.raw[E])})` : "–");
  console.log(`| ${r.file} | ${c.raw[E]} \\| ${c.raw[E2]} | ${cell("noComments")} | ${cell("plain")} | ${cell("compact")} | ${cell("compactNoIds")} | ${cell("elided")} | ${cell("map")} |`);
}

const totals = {};
for (const r of rows) {
  const t = (totals[r.kind] ??= { files: 0 });
  t.files++;
  for (const [k, c] of Object.entries(r.counts)) { t[k] ??= { [E]: 0, [E2]: 0 }; t[k][E] += c[E]; t[k][E2] += c[E2]; }
}
console.log(`\nTotals by kind (saving against raw; ${E} first, ${E2} in brackets)\n`);
console.log("| Kind | Files | Raw tokens | Comments removed | Plain | Compact, inline IDs | Compact, no inline IDs | Compact + SVG elided | Map |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const [k, t] of Object.entries(totals)) {
  const cell = (v) => (t[v] ? `${pct(t[v][E], t.raw[E])} [${pct(t[v][E2], t.raw[E2])}]` : "–");
  console.log(`| ${k} | ${t.files} | ${t.raw[E]} | ${cell("noComments")} | ${cell("plain")} | ${cell("compact")} | ${cell("compactNoIds")} | ${cell("elided")} | ${cell("map")} |`);
}

// The root is written relative to this script, so a results file does not carry the local folder path.
const result = { tokenizers: ENCODINGS, root: path.relative(here, root).replace(/\\/g, "/") || ".", rows, totals };

if (!argDir) {
  // ---------------- Task scenarios (samples only) ----------------
  const V = views;
  const corpus = (kinds) => Object.entries(V).filter(([f]) => kinds.includes(kindOf(f))).map(([f, v]) => `// ${f}\n${v.raw}`).join("\n");
  const maps = (kinds) => Object.entries(V).filter(([f]) => kinds.includes(kindOf(f))).map(([, v]) => v.map).join("");

  const pricingClasses = new Set([...V["components/PricingCard.tsx"].raw.matchAll(/"([^"]*pricing-card[^"]*|[^"]*badge[^"]*|[^"]*button[^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)));
  const pricingFilter = (sel) => sel === ":root" || [...sel.matchAll(/\.([\w-]+)/g)].some((m) => pricingClasses.has(m[1]));

  const idx = V["site/index.html"]._h, tw = V["site/landing-tailwind.html"]._h;
  const twDl = (() => { let hit = null; walk(tw.doc, (n) => { if (!hit && n.tagName === "dl") hit = n; }); return hit; })();

  const scenarios = [
    {
      name: "TS: createUser stores the email in lower case",
      file: "api/users.ts",
      layered: maps(["ts", "jsx"]) + tsCompactSymbol("api/users.ts", V["api/users.ts"].raw, "createUser"),
      corpus: corpus(["ts", "jsx"]),
      searchReplace: `api/users.ts
<<<<<<< SEARCH
  const existing = await db.query<UserRow>("SELECT id FROM users WHERE email = $1", [
    parsed.data.email,
  ]);
=======
  const email = parsed.data.email.toLowerCase();
  const existing = await db.query<UserRow>("SELECT id FROM users WHERE email = $1", [email]);
>>>>>>> REPLACE
api/users.ts
<<<<<<< SEARCH
    throw new ValidationError(\`Email \${parsed.data.email} is already registered\`);
=======
    throw new ValidationError(\`Email \${email} is already registered\`);
>>>>>>> REPLACE
api/users.ts
<<<<<<< SEARCH
    [parsed.data.email, parsed.data.displayName, parsed.data.roles.join(",")],
=======
    [email, parsed.data.displayName, parsed.data.roles.join(",")],
>>>>>>> REPLACE
`,
      ops: `users.ts:createUser insert-after stmt[1]: const email = parsed.data.email.toLowerCase()
users.ts:createUser replace-in stmt[3..] "parsed.data.email" -> "email"
`,
    },
    {
      name: "JSX: PricingCard shows a yearly saving",
      file: "components/PricingCard.tsx",
      layered: maps(["ts", "jsx"]) + tsCompactSymbol("components/PricingCard.tsx", V["components/PricingCard.tsx"].raw, "PricingCard"),
      corpus: corpus(["ts", "jsx"]),
      searchReplace: `components/PricingCard.tsx
<<<<<<< SEARCH
        <span className="pricing-card__period">/{billing === "monthly" ? "month" : "year"}</span>
      </p>
=======
        <span className="pricing-card__period">/{billing === "monthly" ? "month" : "year"}</span>
      </p>
      {billing === "yearly" && <p className="pricing-card__saving">Save 20% with yearly billing</p>}
>>>>>>> REPLACE
`,
      ops: `PricingCard.tsx:PricingCard insert-after p.pricing-card__price: {billing === "yearly" && p.pricing-card__saving Save 20% with yearly billing}
`,
    },
    {
      name: "HTML: Business plan costs $39 and gains a feature",
      file: "site/index.html",
      layered: maps(["html"]) + htmlRender(findById(idx.doc, "pricing"), V["site/index.html"].raw, idx.ids, { elide: true, inlineIds: false }),
      corpus: corpus(["html"]),
      searchReplace: `site/index.html
<<<<<<< SEARCH
            <p class="pricing-card__price"><span class="pricing-card__amount">$29</span><span class="pricing-card__period">/month</span></p>
=======
            <p class="pricing-card__price"><span class="pricing-card__amount">$39</span><span class="pricing-card__period">/month</span></p>
>>>>>>> REPLACE
site/index.html
<<<<<<< SEARCH
              <li class="pricing-card__feature">Five users</li>
=======
              <li class="pricing-card__feature">Five users</li>
              <li class="pricing-card__feature">Priority support</li>
>>>>>>> REPLACE
`,
      ops: `index.html:#pricing .pricing-card[2] .pricing-card__amount text $39
index.html:#pricing .pricing-card[2] ul append li.pricing-card__feature Priority support
`,
    },
    {
      name: "HTML (Tailwind): reword the Retention feature",
      file: "site/landing-tailwind.html",
      layered: maps(["html"]) + htmlRender(twDl, V["site/landing-tailwind.html"].raw, tw.ids, { elide: true, inlineIds: false }),
      corpus: corpus(["html"]),
      searchReplace: `site/landing-tailwind.html
<<<<<<< SEARCH
              <dd class="mt-2 text-base leading-7 text-slate-600">Find out which features bring users back, week after week.</dd>
=======
              <dd class="mt-2 text-base leading-7 text-slate-600">See which features bring users back, and which ones they never find.</dd>
>>>>>>> REPLACE
`,
      ops: `landing-tailwind.html:@n2 dl > div[2] dd text See which features bring users back, and which ones they never find.
`,
    },
    {
      name: "CSS: the highlighted pricing card gets a 2px border",
      file: "site/styles.css",
      layered: maps(["css"]) + cssCompact(V["site/styles.css"]._css, { filter: pricingFilter, inlineIds: false }),
      corpus: corpus(["css"]),
      searchReplace: `site/styles.css
<<<<<<< SEARCH
.pricing-card--highlighted {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
}
=======
.pricing-card--highlighted {
  border: 2px solid var(--color-accent);
  box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.2);
}
>>>>>>> REPLACE
`,
      ops: `styles.css:.pricing-card--highlighted set border 2px solid var(--color-accent); box-shadow 0 0 0 4px rgba(79, 70, 229, 0.2); unset border-color
`,
    },
  ];

  console.log(`\nTask context: what the model reads (${E} tokens)\n`);
  console.log("| Task | Whole repo dump | Repo map + code needed | Repo map vs dump | Whole file (file known) | Plain whole file | File map + code needed | File map vs whole file |");
  console.log("|---|---|---|---|---|---|---|---|");
  const group = (f) => (kindOf(f) === "css" ? ["css"] : kindOf(f) === "html" ? ["html"] : ["ts", "jsx"]);
  for (const s of scenarios) {
    const codeNeeded = s.layered.slice(maps(group(s.file)).length);
    const fileLayered = V[s.file].map + codeNeeded;
    const d = tok(s.corpus)[E], l = tok(s.layered)[E], f = tok(V[s.file].raw)[E], p = tok(V[s.file].plain)[E], fl = tok(fileLayered)[E];
    s.context = { dump: d, repoLayered: l, file: f, plainFile: p, fileLayered: fl };
    fs.writeFileSync(path.join(outDir, "scenario-" + s.file.replace(/\//g, "__") + ".file-layered.txt"), fileLayered);
    fs.writeFileSync(path.join(outDir, "scenario-" + s.file.replace(/\//g, "__") + ".layered.txt"), s.layered);
    console.log(`| ${s.name} | ${d} | ${l} | ${pct(l, d)} | ${f} | ${p} | ${fl} | ${pct(fl, f)} |`);
  }

  console.log(`\nTask output: what the model writes (${E} tokens)\n`);
  console.log("| Task | Rewrite whole file | SEARCH/REPLACE blocks | Edit operations by ID | Ops vs rewrite | Ops vs SEARCH/REPLACE |");
  console.log("|---|---|---|---|---|---|");
  for (const s of scenarios) {
    const rw = tok(V[s.file].raw)[E], sr = tok(s.searchReplace)[E], op = tok(s.ops)[E];
    s.output = { rewrite: rw, searchReplace: sr, ops: op };
    console.log(`| ${s.name} | ${rw} | ${sr} | ${op} | ${pct(op, rw)} | ${pct(op, sr)} |`);
  }
  result.scenarios = scenarios.map(({ name, file, context, output }) => ({ name, file, context, output }));
}

fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify(result, null, 2) + "\n");
console.log(`\nViews written to ${outDir}`);
