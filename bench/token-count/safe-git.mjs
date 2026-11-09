// safe-git.mjs: git calls on untrusted clones for gate R1's scripts (r1.mjs, r1-devtasks.mjs). The rules, from hat 4:
// - git starts in this repository, never in a clone (a git.exe in a clone folder could run on Windows), and reaches the
//   clone with -C;
// - no GIT_* variable and no API key reach git; git never asks for a password; paths are literal;
// - a repository name and every revision are checked before use, and revisions follow --end-of-options;
// - a clone must sit inside the marked cache folder and point to its own GitHub URL;
// - a blob over 1 MB is not read; blobs are read in batches of at most 128 MB.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const MAX_FILE_BYTES = 1024 * 1024;
const BATCH_BYTES = 128 * 1024 * 1024;
const TRUSTED_CWD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MARKER_NAME = ".ai-ir-tokens-corpus-cache";

/**
 * The environment for git on an untrusted clone: no GIT_* variable and no API key from the caller, no prompt for a
 * password, and no global or system configuration (no filter, textconv or fsmonitor setting of the user's).
 * "/dev/null" is the path on every system: git for Windows reads it as the null device, while `os.devNull` there
 * (`\\.\nul`) is a path git cannot open. No file or folder is made, so there is nothing to plant or to clean up.
 */
export function isolatedGitEnv() {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k) && k !== "ANTHROPIC_API_KEY")),
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
  };
}
const gitEnv = isolatedGitEnv();

export const isRepoName = (s) => typeof s === "string" && /^[\w.-]+\/[\w.-]+$/.test(s) && !s.split("/").some((p) => p === "." || p === "..");
export const isSha = (s) => typeof s === "string" && /^[0-9a-f]{40}$/.test(s);

/** Runs git on `dir` (absolute) from this repository's folder. Throws on a non-zero exit unless `ok`. */
export function git(dir, args, { input, buffer = false, ok = false } = {}) {
  const r = spawnSync("git", ["-C", dir, "--literal-pathspecs", "-c", "core.quotePath=false", "-c", "log.showSignature=false", ...args],
    { cwd: TRUSTED_CWD, env: gitEnv, input, maxBuffer: BATCH_BYTES * 2, ...(buffer ? {} : { encoding: "utf8" }) });
  if (ok) return r;
  if (r.status !== 0) throw new Error(`git ${args[0]} failed in ${path.basename(dir)}: ${String(r.stderr).trim().slice(0, 300)}`);
  return r.stdout;
}

/** The clone folder of a repository, inside the cache. Refuses a bad name and a folder that resolves outside it. */
export function cloneDir(cache, repo) {
  if (!isRepoName(repo)) throw new Error(`a bad repository name: ${JSON.stringify(repo).slice(0, 80)}`);
  const dir = path.resolve(cache, repo.replace("/", "__"));
  if (path.dirname(dir) !== path.resolve(cache)) throw new Error(`the clone folder of ${repo} is outside the cache`);
  return dir;
}

/** Checks the cache folder: a real folder, this project's marker, owned by this user where the system says so. */
export function checkCache(cache, { create = false } = {}) {
  if (!fs.existsSync(cache)) {
    if (!create) throw new Error("no clone cache; run corpus.mjs first");
    fs.mkdirSync(cache, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(cache, MARKER_NAME), "phase 0 corpus clones; bench/token-count/corpus.mjs --clean removes this folder's clones\n");
  }
  const st = fs.lstatSync(cache);
  if (st.isSymbolicLink() || !st.isDirectory()) throw new Error("the cache folder is a link or not a folder");
  if (typeof process.getuid === "function" && st.uid !== process.getuid()) throw new Error("the cache folder belongs to another user");
  if (!fs.existsSync(path.join(cache, MARKER_NAME))) throw new Error("the cache folder is not this project's (no marker)");
}

/** Checks an existing clone: a real folder with .git that points to the repository's GitHub URL. */
export function checkClone(dir, repo) {
  const st = fs.existsSync(dir) ? fs.lstatSync(dir) : null;
  if (!st || st.isSymbolicLink() || !st.isDirectory() || !fs.existsSync(path.join(dir, ".git"))) throw new Error(`no cached clone of ${repo}; run corpus.mjs first`);
  const origin = git(dir, ["config", "--get", "remote.origin.url"], { ok: true }).stdout?.trim();
  if (origin !== `https://github.com/${repo}.git`) throw new Error(`the cached clone of ${repo} points elsewhere`);
}

/** Every file of a commit, as [{ id, size, path }]. */
export function tree(dir, commit) {
  if (!isSha(commit)) throw new Error("a bad commit id");
  return git(dir, ["ls-tree", "-r", "-l", "-z", "--end-of-options", commit]).split("\0").filter(Boolean).flatMap((e) => {
    const m = /^\d+ blob ([0-9a-f]+) +(\d+)\t([\s\S]+)$/.exec(e);
    return m ? [{ id: m[1], size: Number(m[2]), path: m[3] }] : [];
  });
}

/**
 * Reads blobs through `git cat-file --batch`: Map(id -> raw text). A blob over MAX_FILE_BYTES is not read. `items`
 * need `id` and `size`.
 */
export function readBlobs(dir, items) {
  const out = new Map();
  const wanted = items.filter((i) => i.size <= MAX_FILE_BYTES);
  for (let start = 0; start < wanted.length; ) {
    let bytes = 0, end = start;
    while (end < wanted.length && (end === start || bytes + wanted[end].size <= BATCH_BYTES)) bytes += wanted[end++].size;
    const batch = wanted.slice(start, end);
    const buf = git(dir, ["cat-file", "--batch"], { input: batch.map((i) => i.id).join("\n") + "\n", buffer: true });
    let at = 0;
    for (const item of batch) {
      const nl = buf.indexOf(10, at);
      if (nl < 0) break;
      const m = /^([0-9a-f]+) (\w+) (\d+)$/.exec(buf.subarray(at, nl).toString("utf8"));
      if (!m) { at = nl + 1; continue; } // "<id> missing"
      const size = Number(m[3]);
      if (m[1] === item.id && m[2] === "blob") out.set(item.id, buf.subarray(nl + 1, nl + 1 + size).toString("utf8"));
      at = nl + 1 + size + 1;
    }
    start = end;
  }
  return out;
}

/** The full message of a commit. */
export function commitMessage(dir, commit) {
  if (!isSha(commit)) throw new Error("a bad commit id");
  return git(dir, ["log", "-1", "--format=%B", "--end-of-options", commit]);
}

/** One file at a commit, as text. */
export function fileAt(dir, commit, file) {
  if (!isSha(commit)) throw new Error("a bad commit id");
  return git(dir, ["cat-file", "blob", `${commit}:${file}`]);
}

/** The -U0 diff of one file between two commits, with no external diff and no textconv. */
export function diffOf(dir, parent, commit, file) {
  if (!isSha(parent) || !isSha(commit)) throw new Error("a bad commit id");
  return git(dir, ["diff", "-U0", "--no-color", "--no-ext-diff", "--no-textconv", "--end-of-options", parent, commit, "--", file]);
}
