// Tests for safe-git.mjs: the checks that keep names and revisions from tracked task lists from becoming paths outside
// the cache or git options. Standard library only.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { git, isRepoName, isSha, cloneDir, checkCache, commitMessage, tree } from "./safe-git.mjs";

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

test("git reads no global or system configuration, and starts from this repository, not from the clone", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safe-git-cfg-"));
  try {
    spawnSync("git", ["init", "-q", dir]);
    const origins = git(dir, ["config", "--list", "--show-origin"]).split("\n").filter(Boolean).map((l) => l.split("\t")[0]);
    assert.ok(origins.length > 0, "the clone's own configuration is read");
    // Only the clone's own file and the -c options of the call; never the user's or the system's file.
    assert.ok(origins.every((o) => /^file:(.*[\\/])?\.git[\\/]config$/.test(o) || o === "command line:"), `unexpected configuration: ${[...new Set(origins)].join(", ")}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a setting in the user's global configuration does not reach git (with a control that shows it would)", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "safe-git-home-"));
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "safe-git-repo-"));
  try {
    fs.writeFileSync(path.join(home, ".gitconfig"), "[ai-ir-tokens-test]\n\tmarker = seen\n");
    const env = { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: path.join(home, ".config") };
    delete env.GIT_CONFIG_GLOBAL;
    spawnSync("git", ["init", "-q", repo], { env });
    // The control: with this home folder and no isolation, git reads the marker.
    const plain = spawnSync("git", ["-C", repo, "config", "--get", "ai-ir-tokens-test.marker"], { env, encoding: "utf8" });
    assert.equal(plain.stdout.trim(), "seen", "the control: the marker is visible without the isolation");
    // The module in a child process with the same home folder: the marker must not show.
    // A fixed script; the module's address and the repository's path arrive as arguments, never inside the code.
    const code = 'const m = await import(process.argv[1]); process.stdout.write(m.git(process.argv[2], ["config", "--get", "ai-ir-tokens-test.marker"], { ok: true }).stdout ?? "");';
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", code, new URL("./safe-git.mjs", import.meta.url).href, repo], { env, encoding: "utf8" });
    assert.equal(child.stdout.trim(), "", `the marker reached git: ${child.stderr}`);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  }
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
