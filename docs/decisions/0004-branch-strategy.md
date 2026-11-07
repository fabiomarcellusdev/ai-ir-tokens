# 0004. Branch strategy: a protected main, short task branches, tags for phases

**Status:** Accepted (owner, 2026-11-07). It replaces the earlier rule "a branch per phase".

## Context

One owner works here with AI agents. Phases last two to three weeks. The rules already ask for `main` to be always
green, small commits with one concern each, and CI on three systems. A long-lived phase branch collects weeks of
changes, so its pull request is too large to review, and problems surface late.

## Options

| Option | What it gives | Cost |
|---|---|---|
| A. A branch per phase (the earlier rule) | One branch to think about | Pull requests of weeks of work; late conflicts; review is shallow |
| B. Trunk-based: short task branches into a protected `main`, phases marked by tags | Small pull requests that CI and reviewers can check; `main` always releasable | One pull request per task |
| C. Git flow (develop, release, hotfix branches) | Separate release preparation | Built for teams with parallel releases; too heavy for one owner |

## Decision

Option B.

1. **`main` is protected.** Changes arrive only by pull request. The `checks` workflow must pass on Windows, macOS and
   Linux. No force push, no deletion. History is linear: pull requests are squash-merged, so each task is one commit
   on `main` with a message that says why.
2. **One short branch per task,** cut from `main` and merged within days:
   `p<phase>/<type>-<short-name>`, for example `p0/feat-corpus-list` or `p1/test-span-patcher`. Types: `feat`, `fix`,
   `test`, `docs`, `bench`, `sec`, `chore`. Delete the branch after the merge.
3. **Other branch kinds:**
   - `deps/<package>-<version>`: one approved dependency update (decision 0002).
   - `exp/<short-name>`: an experiment, such as an A/B of a view. It is not merged; its result goes in
     `docs/measurements/`, and a clean branch carries any change that the result justifies.
   - `fix/<short-name>`: an urgent fix to `main`.
4. **Phases are tags,** not branches: `phase-0-done` after the `gate-check` skill passes, and release tags
   `v0.1.0`. A missed gate gets no tag.
5. **Agents never merge, push to `main`, or delete branches.** They work on the task branch the lead names. The owner
   merges.
6. **One checkout, no worktrees,** until a phase gains from parallel agents on separate branches (from phase 6;
   `docs/follow-ups.md`). Check `git status` before switching branches; stash or commit first.

## Rejected

- **Option A:** pull requests too large to review well, against "small commits, one concern each".
- **Option C:** release branches serve teams that maintain several releases at once. Revisit after 1.0 if old
  releases need fixes.

## Limits

- GitHub enforces branch protection on a private repository only on a paid plan. Until the repository is public or
  the plan allows it, the rules hold by agreement, and the git hooks still run the checks locally.

## What would reopen this

- More than one person works here (review rules change).
- Releases must be maintained in parallel (option C).
