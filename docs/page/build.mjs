// Builds the page: embeds the script's source and the real token splits into the template.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const [templatePath, scriptDir, outPath] = process.argv.slice(2);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const tokens = JSON.parse(execFileSync("node", [path.join(scriptDir, "token_demo.mjs")], { cwd: scriptDir, encoding: "utf8" }));
const show = (t) => esc(t).replace(/\n/g, "↵").replace(/ /g, "·");
const chips = (key) => tokens[key].map((t) => `<span${/^\s+$/.test(t) ? ' class="ws"' : ""}>${show(t)}</span>`).join("");
const row = (label, key) =>
  `          <div class="tokrow"><div class="label">${label} · <b>${tokens[key].length} tokens</b></div><div class="chips">${chips(key)}</div></div>`;

const demo = [
  row("TypeScript, raw", "tsRaw"),
  row("TypeScript, without braces and semicolons", "tsCompact"),
  row("HTML, raw", "htmlRaw"),
  row("HTML, compact", "htmlCompact"),
  row("CSS, raw", "cssRaw"),
  row("CSS, plain (valid CSS)", "cssPlain"),
  `          <p class="caption">· is a space and ↵ a line break. Removing <code>( ) { } ;</code> saves 4 of 12 tokens here, but whole functions are mostly names and calls, so the file-level saving is about 5 points.</p>`,
].join("\n");

let html = fs.readFileSync(templatePath, "utf8");
html = html.replace("<!--TOKEN_DEMO-->", demo);
html = html.replace("<!--SCRIPT_SOURCE-->", esc(fs.readFileSync(path.join(scriptDir, "count.mjs"), "utf8")));
fs.writeFileSync(outPath, html);
console.log(`wrote ${outPath} (${(html.length / 1024).toFixed(1)} KiB)`);
