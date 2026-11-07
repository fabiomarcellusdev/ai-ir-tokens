# 2026-11-07: re-runs of the sample corpus after the move to pnpm

**Tokens only. No model ran a task, so accuracy is unmeasured.** NOT timed.

## Why

The packages were reinstalled with pnpm (decision 0002), and PostCSS changed version to meet the age rule. These runs
check that the numbers did not change.

## Conditions

Two runs on 2026-11-07, before the first commit of this repository:

| Run | Age rule | pnpm | PostCSS | nanoid | source-map-js |
|---|---|---|---|---|---|
| 1 | 30 days | 12.10.1 | 8.5.29 | 3.3.20 | 1.2.2 |
| 2 (final) | 60 days | 12.3.4 | 8.5.28 | 3.3.18 | 1.2.2 (security exception) |

- **Script:** `bench/token-count/count.mjs`. It now writes `root` as a relative path and ends the JSON with a new line.
- **Runtime:** Node 24.21.0 on Windows 11; packages installed by pnpm with scripts off.
- **Parsers:** TypeScript 5.9.3, parse5 7.3.0; PostCSS as in the table (8.5.32 on 2026-11-06).
- **Tokenizers:** OpenAI's `o200k_base` and `cl100k_base` through js-tiktoken 1.0.21, as a proxy for Claude's.
- **Corpus:** the same 8 sample files.
- **Raw numbers:** `2026-11-07-pnpm-rerun.json`, beside this file (run 2; run 1's file was byte-identical).

## Result

In both runs, every number is identical to `2026-11-06-sample-corpus.json`. A script compared the files with the
`root` field removed, and they matched. The `root` field differs: it is `samples` now, and an absolute local path on
2026-11-06. The views of run 2 are pinned as golden files in `bench/token-count/golden/`, so a later change fails
`node tools/check.mjs full`.

**What this shows:** the move to pnpm and the PostCSS versions 8.5.29 and 8.5.28 did not change any view or any count
on these 8 files. **What it does not show:** anything about real repositories or about accuracy
(`2026-11-06-sample-corpus.md`).
