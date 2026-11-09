// r1-lib.mjs: the pure parts of gate R1 (docs/contract.md, "Gate R1 in detail"): the candidate files, the budget and
// its cut, the pass rule, the description's words, the reference ranking, and the project's ranking. No git, no
// network: r1.mjs feeds it text, so every rule here has a test (r1-lib.test.mjs).

import path from "node:path";
import { SOURCE_EXT, SIZING_EXT } from "./corpus-lib.mjs";

// ---------------- The map's raw material ----------------

/**
 * The files that may have an entry in the map: every source file of the repository at the parent commit, tests
 * included (the task rule never counts a test as changed, so leaving tests out would exploit how the gate is built).
 * Only third-party, generated and minified files are left out, as in C0's folder overview.
 */
export function isCandidate(p) {
  if (!(SOURCE_EXT.test(p) || SIZING_EXT.test(p))) return false;
  if (/\.min\./i.test(path.posix.basename(p))) return false;
  return !p.split("/").slice(0, -1).some((s) => ["node_modules", "dist", "build", "vendor"].includes(s.toLowerCase()));
}

/** The candidate rule in words, for the results (the contract leaves it to the method). */
export const CANDIDATE_RULE = "every file with a source or sizing extension at the parent commit, tests included; left out: a file name with \".min.\", and any file under a folder named node_modules, dist, build or vendor (case ignored)";

/** Compares two strings by code point, as the contract's tie rule says (JavaScript's < compares UTF-16 units). */
export function byCodePoint(a, b) {
  const x = [...a], y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0) - y[i].codePointAt(0);
    if (d) return d;
  }
  return x.length - y.length;
}

/** True when a TypeScript or JavaScript map entry has a line range (`L<from>-<to>`) that holds the line. */
export function entryHoldsLine(entry, line) {
  // The range is its own field: after two spaces, before two spaces or the line's end, so a name such as `.L1-99` or
  // a title "See L1-99" is not read as a range.
  for (const m of entry.matchAll(/(?<=^|  )L(\d+)-(\d+)(?=  |$)/gm)) if (Number(m[1]) <= line && line <= Number(m[2])) return true;
  return false;
}

/**
 * The "once" rule of the test run (docs/contract.md, "The tasks", item 3), as a pure check. `prior` is the run list;
 * `dirty` lists the changed paths other than the run list; `lib` is the blob ID of r1-lib.mjs at HEAD. Returns the
 * reason to refuse, or null.
 */
export function refuseTestRun({ prior, dirty, rerunReason, lib, weights }) {
  if (dirty.length) return `the test run needs a clean commit that freezes the method; changed: ${dirty.slice(0, 5).join(", ")}`;
  if (prior.some((r) => r.status === "finished")) return "a test run already finished; no rerun is allowed";
  if (!prior.length) return rerunReason ? "there is no earlier run to repeat; leave out --rerun-after-crash" : null;
  if (!rerunReason) return "a test run already started; a rerun is allowed only after a crash, with --rerun-after-crash \"<why>\"";
  const first = prior[0];
  if (first.lib !== lib) return "a rerun must use the same r1-lib.mjs as the first run";
  if (JSON.stringify(first.weights) !== JSON.stringify(weights)) return "a rerun must use the same weights as the first run";
  return null;
}

/** The budget: 25% of the task's baseline, rounded down to a whole token. */
export const budgetFor = (baseline, share = 0.25) => Math.floor(baseline * share);

/**
 * The cut map: entries in rank order, joined, up to the budget. It stops at the first entry that does not fit and
 * never skips one to fit a later one. `count` counts the tokens of the joined text. Returns the paths that made it.
 */
export function cutMap(ranked, budget, count) {
  const kept = [];
  let text = "";
  for (const e of ranked) {
    const next = text + e.entry;
    if (count(next) > budget) break;
    text = next;
    kept.push(e.path);
  }
  return { paths: kept, text };
}

/** The task passes when every modified task file has its entry in the cut map. */
export const passes = (keptPaths, files) => { const kept = new Set(keptPaths); return files.every((f) => kept.has(f)); };

/**
 * The gate's verdict (docs/contract.md, "The gate"): 70% or more passes, but a pass rate from 65.0% to 75.0%, ends
 * included, is "no result" until Anthropic's counter decides it. The comparison: the project's ranking must pass at
 * least 10 points more tasks than the reference ranking. Counts, not rounded rates, decide both.
 */
export function r1Verdict(passed, total, referencePassed) {
  const rate = passed / total;
  // 100 x passed / total against 65 and 75, in whole numbers, so no rounding decides a boundary.
  const inBand = 100 * passed >= 65 * total && 100 * passed <= 75 * total;
  const gate = inBand ? "no result" : 100 * passed >= 70 * total ? "reached" : "missed";
  const marginOk = 100 * (passed - referencePassed) >= 10 * total;
  return { passRate: rate, gate, inBand, beatsReferenceBy10Points: marginOk };
}

// ---------------- Words ----------------

/**
 * The words of a text, as the contract defines them for the description: split at every character other than a letter
 * or digit and at lowercase-to-uppercase changes, lowercased, 3 characters or more, each word once.
 */
export function words(text) {
  return new Set(wordList(text));
}

/** The same split, keeping repeats: for term frequencies. "Length" counts characters (code points). */
export function wordList(text) {
  return text.replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2").split(/[^\p{L}\p{N}]+/u).map((w) => w.toLowerCase()).filter((w) => [...w].length >= 3);
}

/**
 * True when the description names the file: its path, or its file name, as a whole word. With `stem`, the file name
 * without its extension also counts (the ranking uses that; the reported count follows the contract, without it).
 */
export function namesFile(description, file, { stem = true } = {}) {
  const d = description.toLowerCase(), base = path.posix.basename(file).toLowerCase();
  const s = base.replace(/\.[^.]+$/, "");
  const wordHit = (w) => {
    let at = d.indexOf(w);
    while (at >= 0) {
      const before = d[at - 1], after = d[at + w.length];
      if (!(before && /[\p{L}\p{N}]/u.test(before)) && !(after && /[\p{L}\p{N}]/u.test(after))) return true;
      at = d.indexOf(w, at + 1);
    }
    return false;
  };
  return d.includes(file.toLowerCase()) || wordHit(base) || (stem && s.length >= 3 && wordHit(s));
}

// ---------------- The project's ranking ----------------

/** Words a commit message often holds that say nothing about where the change is. */
export const STOP_WORDS = new Set(("the and for with from into when that this then than are was were has have had not but use used using also only "
  + "fix fixes fixed add adds added update updates updated remove removes removed change changes changed make makes made "
  + "feat chore refactor docs test tests style perf build merge pull request bump version release wip minor small issue "
  + "should can could will would more less new old all any some its it's our your their").split(" "));

/** Term frequencies of a word list. */
export function frequencies(list) {
  const tf = new Map();
  for (const w of list) tf.set(w, (tf.get(w) ?? 0) + 1);
  return tf;
}

/**
 * Prepares one candidate for ranking: its words by field. `content` is the file's text; only its first 20,000 words
 * count, so one huge file cannot dominate the statistics.
 */
export function prepare(e, content) {
  const lines = e.entry.split("\n");
  return {
    ...e,
    fields: {
      path: frequencies(wordList(e.path)),
      names: frequencies(wordList(lines.slice(1).join("\n"))),
      text: frequencies(wordList(content ?? "").slice(0, 20000)),
    },
    // The code names in the entry, found once: a name matches when it stands between characters that are not [\w$].
    idents: new Set(e.entry.match(/[\w$]+/g) ?? []),
  };
}

/**
 * The frozen weights of the project's ranking, tuned on the development tasks only (2026-11-09; the record is
 * docs/measurements/2026-11-09-r1-dev-tuning.md): the best of 720 combinations of the base weights (32/85), then of
 * 96 combinations with the structural signals on top (34/85, 40.0%).
 */
export const DEFAULT_WEIGHTS = { path: 3, names: 1, text: 1, namesFile: 15, size: 1, k1: 1.2, b: 0.75, folder: 0, imports: 0.3, ident: 15 };

/**
 * The code names in a description: words that look like identifiers (a lowercase-to-uppercase change, an underscore,
 * or a dot between words), 4 characters or more, as written.
 */
export function identifiers(description) {
  const out = new Set();
  for (const m of description.matchAll(/[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/g)) {
    for (const part of m[0].split(".")) if (part.length >= 4 && (/[a-z][A-Z]/.test(part) || /_/.test(part.replace(/^_+|_+$/g, "")))) out.add(part);
  }
  return out;
}

/**
 * The project's ranking: a BM25 score of the description's words (stop words left out) over three fields of each
 * candidate (its path, its map entry's names, its text), plus a boost when the description names the file. The score
 * is divided by a size factor, 1 + size x ln(entry tokens), because the map stops at the first entry that does not fit,
 * so a large entry near the top blocks every entry after it. Ties go to the shorter entry, then to the path.
 */
export function projectRank(prepared, description, weights = DEFAULT_WEIGHTS, { neighbors = null } = {}) {
  const query = [...words(description)].filter((w) => !STOP_WORDS.has(w));
  const querySet = new Set(query);
  const n = prepared.length || 1;
  const fieldNames = ["path", "names", "text"];
  const df = Object.fromEntries(fieldNames.map((f) => [f, new Map()]));
  const avgLen = {};
  for (const f of fieldNames) {
    let total = 0;
    for (const p of prepared) {
      let len = 0;
      for (const [w, c] of p.fields[f]) { len += c; if (querySet.has(w)) df[f].set(w, (df[f].get(w) ?? 0) + 1); }
      total += len;
    }
    avgLen[f] = total / n || 1;
  }
  const lenOf = (tf) => { let l = 0; for (const c of tf.values()) l += c; return l; };
  const idents = weights.ident ? [...identifiers(description)] : [];
  // 1. The base score of each candidate: BM25 over its fields, the file-name boost, and exact code names.
  const base = prepared.map((p) => {
    let score = 0;
    for (const f of fieldNames) {
      const tf = p.fields[f], len = lenOf(tf);
      for (const w of query) {
        const c = tf.get(w);
        if (!c) continue;
        const idf = Math.log(1 + (n - (df[f].get(w) ?? 0) + 0.5) / ((df[f].get(w) ?? 0) + 0.5));
        score += weights[f] * idf * (c * (weights.k1 + 1)) / (c + weights.k1 * (1 - weights.b + weights.b * len / avgLen[f]));
      }
    }
    if (namesFile(description, p.path)) score += weights.namesFile;
    for (const id of idents) if (p.idents.has(id)) score += weights.ident;
    return score;
  });
  // 2. Neighbours share their strength: the strongest other file in the same folder, and the strongest file this one
  // imports or is imported by.
  const byPath = new Map(prepared.map((p, i) => [p.path, i]));
  const folderBest = new Map();
  if (weights.folder) {
    prepared.forEach((p, i) => {
      const dir = path.posix.dirname(p.path), cur = folderBest.get(dir) ?? [];
      cur.push(base[i]);
      cur.sort((a, b) => b - a);
      folderBest.set(dir, cur.slice(0, 2));
    });
  }
  const scored = prepared.map((p, i) => {
    let score = base[i];
    if (weights.folder) {
      const [first = 0, second = 0] = folderBest.get(path.posix.dirname(p.path)) ?? [];
      score += weights.folder * (first === base[i] ? second : first);
    }
    if (weights.imports && neighbors) {
      let best = 0;
      for (const q of neighbors.get(p.path) ?? []) { const j = byPath.get(q); if (j !== undefined && j !== i) best = Math.max(best, base[j]); }
      score += weights.imports * best;
    }
    const size = 1 + weights.size * Math.log(Math.max(1, p.entryTokens ?? p.entry.length / 4));
    return { ...p, score: score / size };
  });
  return scored.sort((a, b) => b.score - a.score || a.entry.length - b.entry.length || byCodePoint(a.path, b.path));
}

// ---------------- The reference ranking ----------------

/**
 * The contract's reference ranking: entries ranked by how many words of the description occur among the entry's words
 * (each description word counted once); ties go to the shorter entry (in UTF-16 code units, as JavaScript counts
 * length), then to the path in code-point order.
 */
export function referenceRank(entries, description) {
  const want = words(description);
  const scored = entries.map((e) => {
    const have = words(e.entry);
    let score = 0;
    for (const w of want) if (have.has(w)) score++;
    return { ...e, score };
  });
  return scored.sort((a, b) => b.score - a.score || a.entry.length - b.entry.length || byCodePoint(a.path, b.path));
}
