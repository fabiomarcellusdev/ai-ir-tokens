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
import postcss from "postcss";
import {
  ENCODINGS, tok, tsNoComments, tsPlain, tsCompact, tsMap, tsCompactSymbol, walk, htmlRender, htmlViews, findById, cssNoComments, cssPlain, cssCompact, cssMap,
} from "./views.mjs";

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
