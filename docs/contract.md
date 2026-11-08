# Contract: the pass/fail gates

Each gate is a number fixed before the run it judges. A gate is moved only by a dated amendment with its reason, never
after the results are in. A missed gate is recorded as missed, with its numbers.

**Status (2026-11-08):** the owner confirmed C0 on 2026-11-08 ("Gate C0 in detail" below). Every other gate is
**tentative** (from the planning session, 2026-11-06). Before a gate's run, the owner confirms or changes it, and this
file records that with the date.

| Id | Phase | Gate | Judged on | Status |
|---|---|---|---|---|
| C0 | 0 | Map plus code needed is at least 50% smaller than the files an agent opens for the same task | The median of 17 public repositories, pinned by commit; Anthropic's token counter, o200k_base as a proxy ("Gate C0 in detail") | Confirmed 2026-11-08 |
| C1 | 1 | Every byte outside the edits stays identical | Property tests: random edits on random files, including CRLF, BOM, non-ASCII, empty files | Tentative |
| C2a | 2 | The index of a 5,000-file repository builds in under 30 s | A named repository, on a named machine; a timed run | Tentative |
| C2b | 2 | The index updates in under 200 ms after a save | As C2a, p50 and p99 over 100 saves | Tentative |
| C3 | 3 | Every applied edit type-checks or is rolled back, and no untouched byte changes | 200 scripted edits across the phase-0 repositories | Tentative |
| C4 | 4 | The six tool descriptions together cost at most N tokens | Anthropic's token counter; N to be set at phase 4's design | Not set |
| C5 | 5 | Total tokens at least 40% lower, pass rate no more than 1 point lower | The TypeScript tasks of SWE-PolyBench; one agent, one model, the same prompts; run count and analysis fixed before the run | Tentative |
| C6 | 6 | The Pug-style JSX view's pass rate is within 1 point of plain JSX | The benchmark's React tasks | Tentative |
| C7 | 7 | Every HTML edit re-parses to the intended tree, and the page's other bytes are unchanged | The 50 HTML tasks of phase 7 | Tentative |
| C8 | 8 | A filtered element's computed style is the same with and without the rules the filter left out | A headless browser, on the task pages | Tentative |

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
