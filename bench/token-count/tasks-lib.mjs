// tasks-lib.mjs: C0's task rule as a library (docs/contract.md, "Gate C0 in detail", rules 1 to 3 and clarifications
// 1, 2 and 6), for gate R2's scripts. The same rule as r1-devtasks.mjs, without that script's side effects. Git runs
// through safe-git.mjs on a cached clone; nothing is checked out or run.

import { git, tree, fileAt, diffOf, isSha, MAX_FILE_BYTES } from "./safe-git.mjs";
import { parseNameStatusZ, qualifyingFiles, changedRanges, tsChangedStatements, htmlChangedCode, cssChangedCode } from "./corpus-lib.mjs";
import { norm } from "./followups-lib.mjs";
import { tok } from "./views.mjs";

export const WALK_LIMIT = 500;

/** Rule 3: a modified file has a declaration, landmark or CSS rule group that the change touches, at the parent. */
function touchesParsedUnit(dir, commit, parent, files) {
  for (const f of files) {
    const text = norm(fileAt(dir, parent, f));
    const ranges = changedRanges(norm(diffOf(dir, parent, commit, f)));
    try {
      if (/\.(tsx?|jsx?|mjs|cjs)$/i.test(f) && tsChangedStatements(f, text, ranges).length) return true;
      if (/\.html?$/i.test(f) && htmlChangedCode(text, ranges)) return true;
      if (/\.css$/i.test(f) && cssChangedCode(text, ranges)) return true;
    } catch { /* a file a parser cannot read does not count */ }
  }
  return false;
}

/**
 * Whether one commit passes the task rule. Returns { commit, parent, files } or null. `withBaseline` also counts the
 * o200k_base tokens of the files at the parent.
 */
export function taskOf(dir, commit, { withBaseline = false } = {}) {
  if (!isSha(commit)) throw new Error("a bad commit id");
  const [, ...parents] = git(dir, ["rev-list", "--parents", "-n", "1", "--end-of-options", commit]).trim().split(" ");
  if (parents.length !== 1) return null; // a merge, or a root commit
  const [authorName, authorEmail] = git(dir, ["log", "-1", "--no-show-signature", "--format=%an%x00%ae", "--end-of-options", commit]).split("\0");
  const entries = parseNameStatusZ(git(dir, ["diff-tree", "-r", "-z", "--no-commit-id", "--name-status", "-M", "--end-of-options", parents[0], commit]));
  const files = qualifyingFiles({ parents: 1, authorName, authorEmail, entries });
  if (!files) return null;
  const sizes = git(dir, ["ls-tree", "-l", "-z", "--end-of-options", parents[0], "--", ...files]).split("\0").filter(Boolean).map((e) => Number(/^\d+ blob [0-9a-f]+ +(\d+)\t/.exec(e)?.[1] ?? 0));
  if (sizes.some((s) => s > MAX_FILE_BYTES)) return null; // clarification 6
  if (!touchesParsedUnit(dir, commit, parents[0], files)) return null;
  const task = { commit, parent: parents[0], files };
  if (withBaseline) task.baseline = tok(files.map((f) => `// ${f}\n${norm(fileAt(dir, parents[0], f))}`).join("\n")).o200k_base;
  return task;
}

/**
 * The first `max` commits that pass the task rule, walking back from `pin` along the first parent, at most
 * `WALK_LIMIT` commits. `skip` first commits of the walk are passed over (used to start after the test tasks).
 */
export function walkTasks(dir, pin, { max, withBaseline = false } = {}) {
  if (!isSha(pin)) throw new Error("a bad pin");
  const commits = git(dir, ["rev-list", "--first-parent", `--max-count=${WALK_LIMIT}`, "--end-of-options", pin]).split("\n").filter(Boolean);
  const out = [];
  for (const c of commits) {
    if (out.length >= max) break;
    const t = taskOf(dir, c, { withBaseline });
    if (t) out.push(t);
  }
  return out;
}

/** Every file of a commit with its path: for counting source files. */
export const filesAt = (dir, commit) => tree(dir, commit).map((t) => t.path);
