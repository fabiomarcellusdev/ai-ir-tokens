# Contract: the pass/fail gates

Each gate is a number fixed before the run it judges. A gate is moved only by a dated amendment with its reason, never
after the results are in. A missed gate is recorded as missed, with its numbers.

**Status (2026-11-08):** the owner confirmed C0 on 2026-11-08 ("Gate C0 in detail" below), and **C0 was missed** the same
day ("The result of gate C0" below). Decision 0007 rescoped the project: gate R1 ("Gate R1 in detail" below) is the
next gate, and gates C1 to C8 belonged to the old roadmap, so they are superseded. Before a gate's run, the owner
confirms or changes it, and this file records that with the date.

| Id | Phase | Gate | Judged on | Status |
|---|---|---|---|---|
| C0 | 0 | Map plus code needed is at least 50% smaller than the files an agent opens for the same task | The median of 17 public repositories, pinned by commit; Anthropic's token counter, o200k_base as a proxy ("Gate C0 in detail") | **Missed** 2026-11-08: median -165.8% |
| C1 | 1 | Every byte outside the edits stays identical | Property tests: random edits on random files, including CRLF, BOM, non-ASCII, empty files | Superseded (decision 0007) |
| C2a | 2 | The index of a 5,000-file repository builds in under 30 s | A named repository, on a named machine; a timed run | Superseded (decision 0007) |
| C2b | 2 | The index updates in under 200 ms after a save | As C2a, p50 and p99 over 100 saves | Superseded (decision 0007) |
| C3 | 3 | Every applied edit type-checks or is rolled back, and no untouched byte changes | 200 scripted edits across the phase-0 repositories | Superseded (decision 0007) |
| C4 | 4 | The six tool descriptions together cost at most N tokens | Anthropic's token counter; N to be set at phase 4's design | Superseded (decision 0007) |
| R1 | Rescope step 1 | Given only a task's description, a map within 25% of the files' tokens lists every file the change touched, in at least 70% of the test tasks | The 85 test tasks of C0, run once after the ranking is frozen; o200k_base ("Gate R1 in detail") | **Missed** 2026-11-09: 31 of 85 (36.5%) |
| R2 | Final free gate (decision 0008) | As R1, with lessons from earlier history, the linked issue's text and one folder's map together (arm E) | The test tasks of 17 fresh repositories, run once after the method is frozen; o200k_base ("Gate R2 in detail") | Confirmed 2026-11-09 |
| C5 | 5 | Total tokens at least 40% lower, pass rate no more than 1 point lower | The TypeScript tasks of SWE-PolyBench; one agent, one model, the same prompts; run count and analysis fixed before the run | Superseded (decision 0007) |
| C6 | 6 | The Pug-style JSX view's pass rate is within 1 point of plain JSX | The benchmark's React tasks | Superseded (decision 0007) |
| C7 | 7 | Every HTML edit re-parses to the intended tree, and the page's other bytes are unchanged | The 50 HTML tasks of phase 7 | Superseded (decision 0007) |
| C8 | 8 | A filtered element's computed style is the same with and without the rules the filter left out | A headless browser, on the task pages | Superseded (decision 0007) |

## Rules for every gate

1. A token number names its tokenizer. Anthropic's counter is the judge; o200k_base and cl100k_base are proxies.
2. A pass rate names the model and its version, the task set, the number of tasks and runs, and the spread.
3. A timing number names the machine, the repository and its size in files, and gives p50 and p99.
4. A difference smaller than the noise between repeated runs is reported as no difference.
5. A result from the 8 sample files never reads as if it held on real repositories.

## Gate C0 in detail (owner, 2026-11-08)

Fixed before any phase 0 run. A change needs a dated amendment with its reason.

**The repositories.** 20 public repositories, each pinned to one commit, with a permissive licence: 6 React
applications, 5 Node.js services (2 or more with decorators), 4 static sites, 2 Tailwind sites, and 3 apps with Vue or
Svelte templates. The gate is judged on the 17 that are not Vue or Svelte apps, because the layer supports Vue and
Svelte templates only after 1.0 (`docs/roadmap.md`). The 3 Vue and Svelte apps are measured to size that later work,
and reported apart. The owner approves the list before the run; a repository is replaced only for a reason written
in the results file.

**The tasks: real past commits, chosen by a fixed rule.** For each repository, walk back from the pinned commit along
the first parent, and take the first 5 commits that:

1. are not merges, and whose author is not a bot (a name with `[bot]`, Dependabot or Renovate);
2. modify 1 to 5 source files (`.ts` `.tsx` `.js` `.jsx` `.mjs` `.cjs` `.html` `.css`, plus `.vue` and `.svelte` in
   the 3 sizing repositories). Added, deleted and renamed files do not count. Tests (`test`, `spec` or `__tests__` in
   the path), generated or minified files (`dist/`, `build/`, `vendor/`, `.min.`) and lockfiles do not count;
3. change at least one declaration, landmark or CSS rule that the script can parse at the parent commit.

The walk stops after 500 commits. A repository with 3 or 4 such commits uses them, and the results say so. A
repository with fewer than 3 is replaced by a reserve.

**The two sides of each task**, both read at the commit's parent (the code before the change):

- **Baseline:** the full text of every modified source file. Real agents open more files than a commit changes, so
  this baseline is small, and the gate is harder to pass.
- **Layer:** the map, plus the code needed.
  - **The map:** one line per folder for the whole repository (its path and its number of source files), plus the map
    of every file in each folder that holds a modified file (`docs/algorithm-targets.md`, "Map granularity").
  - **The code needed:** the compact view of every declaration, landmark or CSS rule group that the commit changes,
    plus the map lines of the repository's own types and functions that those declarations name.

Both sides know which files the commit changed. So the gate compares the cost of **reading**, not the cost of
**finding** the code. Phase 5's model runs measure finding.

**The formula.**

1. Per task: saving = 1 − (layer tokens ÷ baseline tokens).
2. Per repository: the median saving of its tasks.
3. **The gate:** the median over the 17 repositories is 0.50 or more, counted with Anthropic's token-counting
   endpoint for the newest Claude model at the time of the run (its name and the date go in the results file).

**Reported beside the gate, never instead of it:** the same numbers with o200k_base; the spread (the lower and upper
quartile, the worst repository and the worst task); the medians per category and per size band; the 3 Vue and Svelte
apps; and the saving with the whole-repository map instead of the folder map.

**Pass, miss, or no result.** If the median is 0.50 or more, the gate passes. If it is lower, the gate is missed, and
the project stops or rescopes (`docs/roadmap.md`, phase 0). If the endpoint is not available, the run reports
o200k_base only, as "proxy only", and the gate has no result until the endpoint has counted it.

**Clarifications before the run (2026-11-08).** The two code reviews of `bench/token-count/corpus.mjs` found points
the rules above left open. These clarifications were written after 3 dry runs (o200k_base only, not results), so this
note says so. None of them makes the layer side cheaper.

1. **Tests (rule 2)** are a path segment named `test`, `tests`, `spec`, `specs`, `__tests__` or `__mocks__`, or a file
   name with `.test.` or `.spec.` (or `_test`, `-spec`) in it. A substring is not enough: `latest.ts` is not a test.
2. **A pure insertion (rule 3)** counts as a change to the declarations on both sides of it, so their code goes on the
   layer side.
3. **A reserve** takes the role and the category of the repository it replaces, and the results name the reason.
4. **The gate gives "pass" or "miss" only** when exactly 17 gate repositories have 3 tasks or more; otherwise it gives
   "no result" with the reason.
5. **A name the run cannot resolve** to the repository's own declaration costs one typical map line on the layer side,
   never zero.
6. **A task is skipped, and the walk goes on,** when a modified file is over 1 MB or a parser fails on it. The results
   list each skipped commit with its reason.

## The result of gate C0 (2026-11-08)

**Missed.** The median saving over the 17 gate repositories is **-165.8%** with Anthropic's token counter
(claude-opus-5-5), against a threshold of +50%. The run is `docs/measurements/2026-11-08-phase0-corpus.md`, at this
repository's commit `8b249b0`, with two replacements written in the results.

- **Spread:** lower quartile -279.4%, upper quartile -63.7%. 16 of the 17 repositories have a negative saving. o200k_base
  gives the same picture (median -187.3%).
- **The one positive repository,** GrapheneOS/grapheneos.org (+59.0%), is not representative: 53 of its 61 commits
  changed a page over 1 MB and were skipped (clarification 6), so 4 of its 5 tasks change the same page.
- **Beside the gate:** the code needed and its signatures alone, without any map, save 28.6% (median, o200k). With the
  whole-repository map instead of the folder map, the median is -2994.4%.
- **What it measures:** the cost of reading, with both sides told which files changed. It does not measure finding the
  code, or the edits an agent writes, or accuracy.

As the roadmap's phase 0 says, the project stops or rescopes. The owner decides which, with a decision record.

## Two follow-up measurements before the decision (owner, 2026-11-08)

Gate C0 measured the reading side only. Before the owner decides to rescope or stop, two more measurements run on the
same tasks (the 85 tasks of the 17 gate repositories in `docs/measurements/2026-11-08-phase0-corpus.json`). Their
thresholds are fixed here, before any of their numbers exist (the owner approved them on 2026-11-08). Neither is a new
gate for the project; each answers one question for the decision. Both report the median over the 17 repositories of
each repository's median task, with the spread. **The counter is o200k_base, a proxy** (the owner's choice): on C0's
corpus it tracked Anthropic's counter closely (median -187.3% against -165.8%). If a result lands within 5 points of
its threshold, Anthropic's counter decides it, in a run by the owner.

### W: the writing side

**The question:** does writing a change as edit operations by address cost far fewer tokens than the way an agent
writes it today?

For each task, the same change (the commit's diff) is written three ways, each as the text of tool calls:

1. **Rewrite:** the new full text of each modified file (a file-write call per file).
2. **Search and replace (the baseline):** one call per diff hunk, as Claude Code's Edit tool takes it: the file path,
   the old text and the new text. The old text grows by whole lines of context, on both sides, until it is unique in
   the file; a pure insertion takes at least one line of context.
3. **Edit operations by address:** one operation per diff hunk: the address of the declaration that holds it
   (`file:name`, as in the map), an 8-character content hash of that declaration (so a stale edit is refused), the
   changed lines' range inside the declaration, and the new lines. The old text is not repeated.

**The threshold:** edit operations cost at least **40% fewer** tokens than search and replace (median). **Reported
beside it:** the saving against rewriting, and the writing tokens as a share of the reading baseline, because an
agent reads far more than it writes, so a writing saving moves the total less.

### V: finer code views

**The question:** if the layer sent less than a whole declaration, could the code needed reach a saving that leaves
room for a map?

For each task, the code needed is measured at two finer levels, in the compact view, against the same baseline as C0
(the full text of the modified files), without any map:

1. **V1, the innermost unit:** the smallest of a top-level declaration, a class member, or a function (also an arrow
   function or a method) that holds each changed range; plus the signature lines of the declarations around it, so
   the unit keeps its place.
2. **V2, the floor:** the changed lines of the old file with 3 lines of context on each side (a diff's hunk). No view
   can send less and still show the change in place.

**The threshold:** V1 saves at least **65%** (median). That leaves 15 points of the baseline for a map and the
signatures if the reading side is to reach C0's 50%. **Reported beside it:** V2, as the ceiling of any view.

**What neither shows:** finding the code, and accuracy. A pass on W or V is a reason to consider a rescope, not a
result for the product.

### The results of W and V (2026-11-08)

The run is `docs/measurements/2026-11-08-phase0-followups.md`, at this repository's commit `6656587`, on the 85 tasks of
C0's official results (o200k_base). Neither result is within 5 points of its threshold, so o200k_base decides both.

- **W, the writing side: not reached.** Edit operations by address cost **14.5%** fewer tokens than search and replace
  (median; spread 12.1% to 20.0%; threshold 40%). Against rewriting the files they save 88.6%, but agents already write
  with search and replace. Search and replace costs 18.1% of the reading baseline, so W's saving moves an agent's total
  by about 3%.
- **V, finer code views: reached.** The smallest unit that holds each change saves **78.8%** against the full files,
  with no map (median; spread 40.7% to 85.0%; threshold 65%). The floor (V2: the changed lines with 3 lines of context)
  saves 86.0%. Seven repositories stay under 51%, where the changed unit is still most of its file.
- **What follows from V:** for the reading side to reach C0's 50%, the map and the signatures together may cost at most
  about 29% of the baseline (median). C0's folder map cost far more. Neither result measures finding the code or
  accuracy.

## Gate R1 in detail (owner, 2026-11-08; decision 0007)

Step 1 of the rescope: can a small map point an agent to the right files, given only what the task says? Fixed
before the ranking is built and before any of its numbers exist. It costs nothing: no model is called.

**Who decided what.** The owner decided the gate's question, its 25% budget, its 70% threshold, and that a miss stops
the project (decision 0007). The lead proposed four further rules, marked "(proposed by the lead)" below; the owner
approves them by merging the pull request that adds this section. Until then they are proposals.

### The tasks

1. **The test tasks** are the 85 tasks of the 17 gate repositories in `docs/measurements/2026-11-08-phase0-corpus.json`.
2. **The development tasks (proposed by the lead):** for each of the 17 repositories, walk further back from its oldest
   test task, along the first parent, and take the next 5 commits that pass C0's task rule (rules 1 to 3, the same
   walk limit of 500 commits counted from the pin). A repository with fewer than 5 uses what it has, and the results
   say so. **The list of development tasks is committed before any work on the ranking starts.** The ranking is built
   and tuned on these tasks only. The reason: the lead has seen the C0 results, including which files the test tasks
   changed, so tuning on them would flatter the result.
3. **The test run (proposed by the lead)** happens once, from a commit that freezes the ranking method; the results
   name that commit. A rerun is allowed only after a crash, and every run is listed in the results.

### Each task

1. **The description** is the full commit message (subject, body and trailers), as git stores it. Nothing from the
   diff, the changed files or later commits. The results report how many descriptions name a changed file (its path or
   its file name), because such a task is easy.
2. **The repository the ranking may read** is the files and their paths at the commit's parent. Not git history, not
   other branches, not the network.
3. **An entry** is one file's map, exactly as `fileMap` in `bench/token-count/corpus-lib.mjs` produces it at this
   repository's commit `6656587`: the file's path, then one line per declaration, landmark or CSS rule group with its
   line range. Entries are whole: an entry is never cut or shortened.
4. **The map** is the ranked list of entries, joined in order. The ranking may use the description and the repository
   (item 2) only. **It never reads the budget, the baseline or the changed files.**
5. **The budget** is 25% of the task's baseline (C0's `o200k.baseline` for that task), rounded down to a whole token.
   The map takes entries in rank order and **stops at the first entry that does not fit**; it never skips one to fit a
   later one. Tokens are counted with o200k_base over the joined text.
6. **The task passes** when every modified task file of the commit (C0's `files` for that task) has its entry in the
   cut map.

### The gate

- **At least 70%** of the 85 test tasks pass: 60 of 85 or more.
- **The counter is o200k_base,** an exception to rule 1 of this file (owner, 2026-11-08), because the budget is a share
  of the same count on both sides and no model is called. If the pass rate is within 5 points of 70%, ends included
  (65.0% to 75.0%), Anthropic's token counter (`count_tokens`, model `claude-opus-5-5`) decides it, in a run by the
  owner. Until that run, the result is "no result".
- **A miss stops the project** (decision 0007), unless a new, dated decision gives a reason to continue.

### Reported beside the gate, never instead of it

1. The pass rate per repository.
2. The share of changed declarations whose lines appear in the cut map.
3. The pass rate at fixed budgets of 1,000 and 2,000 tokens, and at 10%, 50% and 100% of the baseline.
4. **A reference ranking (proposed by the lead),** under the same rules: entries ranked by how many words of the
   description occur in the entry's text. The words are the description split at every character other than a letter
   or digit and at lowercase-to-uppercase changes, lowercased, 3 characters or more, each word counted once; an entry
   counts the words it contains. Ties go to the shorter entry, then to the path in code-point order. This keyword
   ranking reads the description, as a simple tool would, so it is a fair opponent.
5. **The comparison (proposed by the lead):** if the project's ranking does not pass at least **10 points more** test
   tasks than the reference ranking, the results say so, and decision 0007 counts it as a reason to stop. A simple
   keyword match that does as well would leave the project nothing to add.

### What it does not show

Whether an agent uses the map well, what a completed task costs, or accuracy. Step 2, the pilot, measures those.

## The result of gate R1 (2026-11-09)

**Missed.** The frozen ranking lists every changed file within the budget in **31 of the 85 test tasks (36.5%)**,
against a threshold of 70% (60 of 85). The counter is o200k_base; the result is outside the band of 65.0% to 75.0%, so
Anthropic's counter cannot change it. The run is `docs/measurements/2026-11-09-r1-test.md`, the only test run
(`r1-test-runs.json`), from commit `ab2073b`, which froze the method after tuning on the development tasks only
(`docs/measurements/2026-11-09-r1-dev-tuning.md`: 34 of 85, 40.0%).

- **The recount:** the `analysis-checker` agent recomputed every number from the raw tasks and found no difference. It
  also found that the tasks, file lists and budgets match C0 exactly. The run is deterministic, so the only noise is
  the choice of tasks: the exact 95% interval is 26.3% to 47.6%.
- **The changed statements in the cut map** (61.1%) are pooled over all tasks; the mean of the per-task shares is
  41.5%. The contract did not say which; both are given here.

- **The reference ranking** (keywords) passes 17 of 85 (20.0%). The project's ranking beats it by 16.5 points, so the
  comparison does not add a reason to stop. The ranking finds files better than a keyword match; it does not find
  enough of them.
- **A perfect ranking** would pass 81.2% at this budget. With a budget of 100% of the baseline, the frozen ranking
  passes 60.0%: even a map as large as the changed files misses a file in 2 tasks of 5.
- **The descriptions say little about place:** 6 of the 85 name a changed file by its path or its file name.
- **Spread:** 0 of 5 in 5 repositories, 5 of 5 in GrapheneOS/grapheneos.org (one large page, as in C0).
- **What it does not show:** an agent that searches, reads and asks for one folder's map on demand, or tasks with a
  longer description than a commit message (an issue, a user's request). The gate tested one map, cut once, from the
  commit message alone, as the contract fixed before the run.

Decision 0007: a miss stops the project, unless a new, dated decision gives a reason to continue. The owner decides.

## Gate R2 in detail (owner, 2026-11-09; decision 0008)

The final free gate: can a map that learns from earlier history, reads the task's issue and may add one folder's map
hold every file a change needs? Fixed before any repository of R2 is picked and before any of its numbers exist. No
model is called. **A miss stops the project for good** (decision 0008). Every outcome below is fixed before the run, so
no result can be set aside after it exists.

**Who decided what.** The owner decided the frame (decision 0008; `docs/proposals/learning-map.md`, "The owner's
answers"): one final gate, fresh repositories, R1's bar, arm E deciding, the linked issue's text, lessons from earlier
history, and one folder per task. The rules marked "(proposed by the lead)" fill in the details; the owner approves
them by merging the pull request that adds this section. An independent review of these rules (2026-11-09) found 11
gaps before the merge; this text closes them.

### The repositories

1. **17 repositories, in C0's gate mix:** 6 React applications, 5 Node.js services (3 with decorators), 4 static sites
   and 2 Tailwind sites. The 4 fresh reserves of `bench/token-count/corpus.json` come first: umami-software/umami and
   CookSleep/gpt_image_playground (React), neovim/neovim.github.io (static), ncdai/chanhdai.com (Tailwind). The other 13
   are new: 4 React, 3 Node.js with decorators, 2 Node.js, 3 static and 1 Tailwind.
2. **The selection day.** All 17 are pinned on one day, the selection day, to the head of their default branch. The
   reserves get new pins too; their pins of 2026-11-08 are not used. What the lead saw of the reserves before: their
   source-file counts and the number of qualifying commits near their old pins, written in `corpus.json`; no task's
   files, no ranking and no result.
3. **The rule that picks the new ones (proposed by the lead).** On the selection day, a script asks GitHub's search API,
   in this order of categories: React `topic:react language:TypeScript`; Node.js with decorators `topic:nestjs
   language:TypeScript`; Node.js `topic:express language:TypeScript`; static `topic:website language:HTML`; Tailwind
   `topic:tailwindcss topic:portfolio`. Each search uses `sort=stars`, descending. For each category the script walks
   the results in order and takes the **first N** repositories (4, 3, 2, 3 and 1) that pass every test below. A
   repository taken in one category is skipped in the later ones. The tests are mechanical; the lead judges none of
   them:
   1. public, not a fork, not archived, `is_template` false, and an MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause or ISC
      licence;
   2. a push in the 90 days before the selection day, and 20 or more source files, counted as `corpus.json` counts
      them; no upper limit (C0's gate mix had repositories of 3,000 files and more);
   3. `.vue`, `.svelte` and `.astro` files together are at most 10% of its source files, because the map cannot read
      them;
   4. not in `corpus.json`; no topic among `awesome-list`, `awesome`, `boilerplate`, `starter`, `starter-kit`,
      `template`, `library`, `framework`, `component-library` and `ui-library`; and not a published package: a root
      `package.json` that is not `"private": true` and has a `main`, `module`, `exports` or `bin` field means a library;
   5. at least 10 commits that pass the task rule ("The tasks", item 1) within 500 commits of its pin.

   The reserves pass tests 1 to 3 and 5 too, or a reserve is replaced by the next repository of its category in the
   search order. The script commits the raw search responses of the selection day and every skip with the test it
   failed, so anyone can repeat the walk. Test 5 reports only a count, never a commit.
4. **The owner approves the list of 17 before any task is picked.** After that, a repository is replaced only before
   the test run, only for a reason that uses no ranking data (a clone fails, the history is too short), and always by
   the next repository of its category in the search order. The results name each replacement and its reason.

### The tasks

1. **The task rule** is C0's: rules 1 to 3 with clarifications 1, 2 and 6 of "Gate C0 in detail". **The task's files**
   are the modified files that count under rule 2 and clarification 1 (C0's `files`).
2. **The test tasks:** for each repository, the first 5 commits that pass the task rule, walking back from the pin
   along the first parent. **The development tasks:** the next 5, as in R1. The method is built and tuned on these
   only.
3. **The boundary and the sealed list (proposed by the lead).** The script that picks the tasks writes the test list to
   a git-ignored file: one line per task, `<repository> <commit>`, in pin order, LF line ends, UTF-8. It commits only
   that file's SHA-256, the development list, and each repository's **boundary**: the first-parent parent of its oldest
   test task. Before the test run, every script reads only the boundary and its first-parent ancestors; a unit test
   shows that a development run never reads a commit outside that set. The issue texts of the test tasks are fetched
   inside the test run, not before it. The test run checks the hash first.
4. **One test run,** from a commit that freezes the method; every run is listed; a rerun only after a crash, with the
   same method (as R1). An independent recount checks the result before it is reported.

### Each task, in every arm

1. **The baseline** is the o200k_base tokens of the task's files at the parent commit, counted as C0 counts them. The
   **budget** is 25% of the baseline, rounded down.
2. **The candidates and the entries** are R1's: every source and sizing file at the parent commit, tests included
   (`CANDIDATE_RULE` in `bench/token-count/r1-lib.mjs`); an entry is `fileMap`'s output at this repository's commit
   `f7bf602` (with the HTML and CSS line ranges), whole, never cut.
3. **The ranking reads** the arm's description, the repository at the parent commit, and in arms B and E the lessons.
   **It never reads the budget, the baseline or the task's files.**
4. **The cut** is R1's: entries in rank order, joined, until the first entry that does not fit; never a skip.
5. **A task passes** when every one of the task's files has its entry in what the arm gives the agent.

### The arms

- **A, the control:** R1's setting. The description is the full commit message; one map, cut at the budget.
- **B, lessons from history:** A, plus lessons. A lesson is the commit message and the files (as "The tasks", item 1)
  of a commit that passes the task rule and is **an ancestor of the task's parent along the first parent**, never the
  task itself and never a commit that is not such an ancestor. No date decides it. The lessons come from every such
  commit in the clone, which holds 3,000 first-parent commits from the pin (the number 3,000 is proposed by the lead;
  the results give the number of lessons per task). A unit test shows that a later commit with an older author date
  (a rebased one) is not a lesson.
- **C, the linked issue's text (rule proposed by the lead):**
  1. **The pull requests:** those that GitHub's API associates with the commit and that were merged into the default
     branch. **The cut-off** is the earliest creation time among them; with no such pull request, the commit's author
     date.
  2. **The linked issues:** issues, not pull requests, of the same repository that a pull request of item 1 closes, or
     that the commit message or a pull request's body names as `#N` or by URL, and that were opened before the cut-off.
  3. **The text** is each issue's title and body **as they were at the cut-off**, rebuilt from GitHub's edit history
     (renamed titles, body edits), in issue-number order. If the text at the cut-off cannot be rebuilt with certainty,
     that issue is left out. Without a linked issue, the description is the commit message.
  4. A failed fetch is retried until it succeeds or GitHub gives a final answer (not found, gone). A task whose issue
     cannot be served uses the commit message, and **the result stands.** The results report how many tasks have an
     issue, how many issues were edited after the cut-off, and how many were left out.
  5. The texts are fetched with `gh`, read-only, and kept in the temporary cache, never in this repository; only the
     ranking reads them, as data.
- **D, one folder's map (details proposed by the lead):**
  1. **One constant reserve share R** (from 0 to 0.9), the same for every task, chosen on the development tasks and
     written in the commit that freezes the method. Arm D and arm E each have their own R.
  2. The map is cut at floor(budget × (1 − R)).
  3. **The folder** is the parent folder of the highest-ranked candidate that is not in the cut map; the repository's
     root counts as a folder. If every candidate is in the map already, no folder is added.
  4. **The folder's map** is the entries of the candidates directly in that folder (not in its subfolders) and not yet
     in the map, in path order by code point, added by the same stop rule until the map and the folder's map
     together, joined and counted as one text, reach the budget.
  5. At R = 0, arm D fills the space left after the first stop from one folder. That relaxes R1's rule against a skip;
     it follows the owner's answer 6, and the results say so.
- **E, all three:** B's lessons, C's description and D's folder, with E's own R. **Arm E decides the gate.**

### The gate

Every outcome is fixed here, before the run.

1. **Pass:** arm E passes at least 70% of the test tasks (60 of 85 when there are 85), **and** it passes at least 10
   percentage points of the test tasks more than the reference ranking (R1's keyword rule, with arm C's description,
   one map, no lessons, no folder). The second condition is proposed by the lead; it is stricter than R1, where it was
   only a reason to stop.
2. **Miss:** either condition fails.
3. **The band:** if arm E's pass rate is from 65.0% to 75.0%, ends included, Anthropic's token counter
   (`count_tokens`, model `claude-opus-5-5`) decides it, in a run by the owner. Until that run, the result is "pending";
   it is then a pass or a miss by the same rules.
4. **Fewer than 17 repositories with 3 test tasks or more** after the test run counts as a **miss**, with the reason.
   (Before the run, item 4 of "The repositories" replaces a repository; after it, nothing does.)
5. **A miss stops the project for good** (decision 0008).

### Reported beside the gate, never instead of it

1. Arms A, B, C and D: the pass rate each, overall and per repository, so each idea's share is visible.
2. Arm E with the pull request's text (title and body) as the description, where the commit has such a pull request:
   a best case, because that text is written after the change.
3. How many tasks have a linked issue; for each kind of description, how many name one of the task's files (its path
   or file name).
4. For arm E: a perfect ranking's pass rate (the ceiling); the pass rate at 1,000 and 2,000 tokens and at 10%, 50% and
   100% of the baseline; the median number of lessons per task.

### What it does not show

- **Lessons from all earlier history are a best case for learning.** The real tool learns from verified tasks, which
  is slower unless it starts from git history, as decision 0008's design does.
- **The folder is chosen by a rule,** not by an agent. How a real agent chooses is measured only in the pilot.
- **An issue is written by a project's maintainers;** a user's request to an agent may say more or less.
- Whether an agent uses the map well, what a completed task costs, and accuracy. Step 2, the pilot, measures those.

### Amendments

- **2026-11-10, how the search evidence is kept (lead; the owner approves by merging the pull request that adds it).**
  "The repositories", item 3, says the script commits the raw search responses. The privacy lint rightly refuses
  them: third-party descriptions in the responses hold two of the owner's private terms, and public repository names
  can too. The lint is not weakened. The raw responses (`bench/token-count/r2-search/<day>/`, 54 files, 31 MB) stay on
  the machine that ran `r2-select.mjs`, git-ignored, with a data warning. `bench/token-count/r2-search-digest.json` is
  committed instead: for each result the walk read (each category up to its last pick), the fields the tests read and
  no free text, and for every file its SHA-256, so anyone who runs the same searches can compare, and a test repeats
  the walk's cheap tests from the digest. This changes where the evidence lives, not any rule that decides an outcome.
