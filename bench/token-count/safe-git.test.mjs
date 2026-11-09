// Tests for safe-git.mjs: the checks that keep names and revisions from tracked task lists from becoming paths outside
// the cache or git options. Standard library only.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isRepoName, isSha, cloneDir, checkCache, commitMessage, tree } from "./safe-git.mjs";

test("a repository name is owner/name, with no path step", () => {
  assert.equal(isRepoName("excalidraw/excalidraw"), true);
  assert.equal(isRepoName("11ty/11ty-website"), true);
  assert.equal(isRepoName("a/../../x"), false);
  assert.equal(isRepoName("a/.."), false);
  assert.equal(isRepoName("a/b/c"), false);
  assert.equal(isRepoName("a\\b"), false);
  assert.equal(isRepoName(""), false);
});

test("a revision is 40 lowercase hex characters", () => {
  assert.equal(isSha("0123456789abcdef0123456789abcdef01234567"), true);
  assert.equal(isSha("--output=x"), false);
  assert.equal(isSha("HEAD"), false);
  assert.equal(isSha("0123456789ABCDEF0123456789ABCDEF01234567"), false);
});

test("a clone folder stays inside the cache", () => {
  const cache = path.join(os.tmpdir(), "cache-x");
  assert.equal(cloneDir(cache, "a/b"), path.resolve(cache, "a__b"));
  assert.throws(() => cloneDir(cache, "a/../../x"), /bad repository name/);
});

test("a revision that looks like an option never reaches git", () => {
  assert.throws(() => commitMessage(os.tmpdir(), "--output=x"), /bad commit id/);
  assert.throws(() => tree(os.tmpdir(), "--output=x"), /bad commit id/);
});

test("the cache must carry this project's marker, and is created with it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safe-git-test-"));
  try {
    const cache = path.join(dir, "cache");
    assert.throws(() => checkCache(cache), /no clone cache/);
    checkCache(cache, { create: true });
    checkCache(cache);
    const foreign = path.join(dir, "foreign");
    fs.mkdirSync(foreign);
    assert.throws(() => checkCache(foreign), /not this project's/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
