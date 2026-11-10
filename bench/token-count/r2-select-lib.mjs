// r2-select-lib.mjs: the mechanical tests that pick gate R2's repositories (docs/contract.md, "Gate R2 in detail",
// "The repositories"). Pure functions: r2-select.mjs feeds them GitHub's answers and the clone's file list. The lead
// judges none of these tests; each takes data in and gives a pass or a reason out.

const isRepoName = (s) => typeof s === "string" && /^[\w.-]+\/[\w.-]+$/.test(s) && !s.split("/").some((p) => p === "." || p === "..");
export const LICENCES = new Set(["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC"]);
export const EXCLUDED_TOPICS = new Set(["awesome-list", "awesome", "boilerplate", "starter", "starter-kit", "template", "library", "framework", "component-library", "ui-library"]);
const DAY_MS = 24 * 60 * 60 * 1000;

/** The categories, in the contract's order, with the search query and how many new repositories each needs. */
export const CATEGORIES = [
  { name: "react-app", query: "topic:react language:TypeScript", take: 4 },
  { name: "node-service-decorators", query: "topic:nestjs language:TypeScript", take: 3 },
  { name: "node-service", query: "topic:express language:TypeScript", take: 2 },
  { name: "static-site", query: "topic:website language:HTML", take: 3 },
  { name: "tailwind-site", query: "topic:tailwindcss topic:portfolio", take: 1 },
];

/** The 4 fresh reserves of corpus.json, in their categories (the first tests apply to them too, except test 4). */
export const FRESH_RESERVES = [
  { repo: "umami-software/umami", category: "react-app" },
  { repo: "CookSleep/gpt_image_playground", category: "react-app" },
  { repo: "neovim/neovim.github.io", category: "static-site" },
  { repo: "ncdai/chanhdai.com", category: "tailwind-site" },
];

/** Source files as corpus.json counts them: these extensions, outside node_modules, dist, build and vendor. */
export function isCountedSource(p) {
  if (!/\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|html|css)$/i.test(p)) return false;
  return !p.split("/").slice(0, -1).some((s) => ["node_modules", "dist", "build", "vendor"].includes(s.toLowerCase()));
}

/** { source, markup } where source is the corpus.json count and markup counts .vue, .svelte and .astro files. */
export function countFiles(paths) {
  let source = 0, markup = 0, astro = 0;
  for (const p of paths) {
    if (isCountedSource(p)) { source++; if (/\.(vue|svelte)$/i.test(p)) markup++; }
    else if (/\.astro$/i.test(p) && !p.split("/").slice(0, -1).some((s) => ["node_modules", "dist", "build", "vendor"].includes(s.toLowerCase()))) astro++;
  }
  return { source, markup: markup + astro, share: source === 0 ? (astro ? 1 : 0) : (markup + astro) / source };
}

/** A licence name for a reason: a short SPDX-like id, or a constant (GitHub's text is data, never copied in). */
export const safeLicence = (s) => (typeof s === "string" && /^[A-Za-z0-9.+-]{1,40}$/.test(s) ? s : "other or none");

/** Test 1 and the cheap part of test 4, from GitHub's repository record. Returns a reason, or null when it passes. */
export function recordProblem(r, today, { reserve = false } = {}) {
  // A missing field fails: only an explicit false passes.
  if (r.private !== false) return "test 1: not public, or the field is missing";
  if (r.fork !== false) return "test 1: a fork, or the field is missing";
  if (r.archived !== false) return "test 1: archived, or the field is missing";
  if (r.is_template !== false) return "test 1: is_template, or the field is missing";
  if (!LICENCES.has(r.license?.spdx_id)) return `test 1: licence ${safeLicence(r.license?.spdx_id)}`;
  if (!Array.isArray(r.topics)) return "test 4: the topics are missing";
  const pushed = Date.parse(r.pushed_at);
  if (!(pushed >= Date.parse(today) - 90 * DAY_MS)) return "test 2: no push in the 90 days before the selection day";
  if (!reserve) {
    const bad = r.topics.find((t) => EXCLUDED_TOPICS.has(t));
    if (bad) return `test 4: topic ${bad}`;
  }
  return null;
}

/** Test 4's package.json part: a root package.json that is not private and has main, module, exports or bin. */
export const parsePackage = (text) => { try { return JSON.parse(String(text).replace(/^\uFEFF/, "")); } catch { return null; } };
export function publishedPackage(pkg) {
  if (!pkg || typeof pkg !== "object") return false;
  if (pkg.private === true) return false;
  return ["main", "module", "exports", "bin"].some((k) => k in pkg);
}

/** Tests 2 and 3 from the file list at the pin. Returns a reason, or null. */
export function filesProblem(paths) {
  const c = countFiles(paths);
  if (c.source < 20) return `test 2: ${c.source} source files, under 20`;
  if (c.share > 0.1) return `test 3: .vue, .svelte and .astro files are ${(c.share * 100).toFixed(1)}% of the source files`;
  return null;
}

/** Test 5: at least 10 commits pass the task rule. Only a count is reported, never a commit. */
export const taskCountProblem = (count) => (count >= 10 ? null : `test 5: ${count} qualifying commits within 500, under 10`);

/**
 * The walk of one category: results in search order; the first `take` that pass every test, skipping repositories
 * already taken or listed in corpus.json. `check(record)` returns a reason or null (it runs the tests that need the
 * network or a clone, and only for a record that passed the cheap ones). Returns { taken, skips }.
 */
export function walkCategory(results, { take, taken, corpus, check }) {
  const picked = [], skips = [];
  for (const r of results) {
    if (picked.length >= take) break;
    const name = r.full_name;
    if (!isRepoName(name)) { skips.push({ repo: "(a bad name)", reason: "a repository name that is not owner/name" }); continue; }
    if (taken.has(name)) { skips.push({ repo: name, reason: "taken in an earlier category" }); continue; }
    if ([...corpus].some((c) => c.toLowerCase() === name.toLowerCase())) { skips.push({ repo: name, reason: "test 4: in corpus.json" }); continue; }
    const reason = check(r);
    if (reason) { skips.push({ repo: name, reason }); continue; }
    picked.push(r);
    taken.add(name);
  }
  return { picked, skips };
}
