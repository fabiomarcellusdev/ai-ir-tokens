# Gate R1: tuning on the development tasks (2026-11-08 and 09)

**Tokens only, accuracy unmeasured.** No model was called. NOT timed. Counter: o200k_base. Tasks: the 85 development
tasks of `bench/token-count/r1-devtasks.json` (5 in each of the 17 gate repositories), committed before any ranking
work (pull request #18). **No test task was used.** The test run is a separate file, from the commit that freezes the
method.

## The rule fixed before the last attempt (owner, 2026-11-08)

After the first sweep plateaued, the owner chose a bounded last attempt with three new signals. The lead fixed the bar
before any new number existed: **under 55% on the development tasks, freeze the best version and run the test once.**
The best result is 40.0%, so the method is frozen.

## The steps

| Step | Code | Combinations | Best | Median | Worst |
|---|---|---|---|---|---|
| First version, default weights | before the reviews | 1 | 29/85 (34.1%) | – | – |
| Sweep 1: base weights | before the reviews | 720 | 32/85 | not recorded | not recorded |
| Sweep 2: structural signals on sweep 1's best | before the reviews | 96 | 33/85 | not recorded | not recorded |
| Sweep 1 again: base weights | after the reviews | 720 | 32/85 | 26/85 | 21/85 |
| Sweep 2 again: structural signals on sweep 1's best | after the reviews | 96 | **34/85 (40.0%)** | 29/85 | 21/85 |

The two reviews (correctness and security) changed the ranking's inputs, so both sweeps ran again:

- the word rule now splits only at a lowercase-to-uppercase change, and keeps every letter and digit (also non-ASCII);
- a file over 1 MB gets the one-line entry `<path> (not read: over 1048576 bytes)`, as in C0.

Reproduce with `node r1.mjs --dev --sweep base`, then `node r1.mjs --dev --sweep signals` (from
`bench/token-count`; each writes `r1-sweep-<step>.json` in the system's temporary folder, under `ai-ir-tokens-r1`).

**The grids.** Sweep 1: `path` 2, 3, 5, 8; `names` 1, 2, 4; `text` 0.25, 0.5, 1, 2; `size` 0, 0.15, 0.3, 0.6, 1;
`namesFile` 5, 15, 40. Sweep 2: sweep 1's first row, with `folder` 0, 0.15, 0.3, 0.6; `imports` 0, 0.15, 0.3, 0.6;
`ident` 0, 5, 15; `size` 0.3, 1.

## The frozen method

`DEFAULT_WEIGHTS` in `bench/token-count/r1-lib.mjs`: `path` 3, `names` 1, `text` 1, `namesFile` 15, `size` 1, `k1` 1.2,
`b` 0.75, `folder` 0, `imports` 0.3, `ident` 15. A BM25 score of the description's words over each file's path, map
names and text; a boost when the description names the file or one of its code names; part of the score of the
strongest file it imports or is imported by; divided by a factor that grows with the entry's size.

## The frozen method on the development tasks

| Measure | Result |
|---|---|
| Pass rate at 25% of the baseline (the gate's budget) | **34/85 (40.0%)** |
| Reference ranking (keywords) | 13/85 (15.3%) |
| A perfect ranking (the changed files first) | 67/85 (78.8%) |
| Descriptions that name a changed file (path or file name) | 8/85 |
| 1,000 tokens / 2,000 tokens | 45.9% / 57.6% |
| 10% / 50% / 100% of the baseline | 12.9% / 51.8% / 64.7% |

By repository: 0 of 5 in homarr, plasmic, nestjs-rest-cqrs-example and vivy-nest-admin; 5 of 5 in grapheneos.org.

## What it means

- The structural signals added 2 tasks over the base weights (32 to 34). The folder signal added nothing.
- The weights matter little: the median of 720 combinations is 26/85 and the best is 32/85.
- The ceiling is 78.8%, so 70% would need the right files at the top in almost every task where they fit at all.
- **What it does not show:** the test result. These tasks shaped the weights, so 40.0% is an optimistic estimate of
  the test pass rate, not a prediction of it.
