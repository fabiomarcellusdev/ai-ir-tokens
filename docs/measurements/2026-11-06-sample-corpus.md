# 2026-11-06: token counts on the sample corpus

**Tokens only. No model ran a task, so accuracy is unmeasured.**

## Conditions

- **Script:** `bench/token-count/count.mjs`. It was run first in the planning session's scratch folder on 2026-11-06.
  It was re-run in this repository on 2026-11-07, after one fix (the script's folder path is now decoded, so a path with
  a space works). The numbers were identical; only the `root` path in the JSON differs.
- **Parsers:** TypeScript 5.9.3, parse5 7.3.0, PostCSS 8.5.32.
- **Tokenizers:** OpenAI's `o200k_base` and `cl100k_base` through js-tiktoken 1.0.21. They stand in for Claude's
  tokenizer, because no Anthropic API key was available. The two agree within 1 point in every cell.
- **Corpus:** 8 sample files written for this test, 10,364 tokens in all: three TypeScript modules, two React
  components (one with Tailwind), two HTML pages (one with Tailwind) and one stylesheet.
- **Edit operations and SEARCH/REPLACE blocks** for the five tasks were written by hand.
- **Raw numbers:** `2026-11-06-sample-corpus.json`, beside this file.

## Views: saving against the raw files (o200k_base)

| Kind | Files | Raw tokens | Comments removed | Plain (valid code) | Compact, inline IDs | Compact, no IDs | Compact + SVG elided | Map |
|---|---|---|---|---|---|---|---|---|
| TypeScript | 3 | 2,172 | 16% | **24%** | 18% | 21% | – | 72% |
| JSX / TSX | 2 | 1,154 | 3% | 14% | 18% | **20%** | – | 89% |
| HTML | 2 | 5,130 | – | 7% | 18% | 19% | **53%** | 95% |
| CSS | 1 | 1,908 | 3% | **24%** | 15% | **24%** | – | 87% |

Bold marks the best reading view for each kind. The map is an index, not a reading view. The plain HTML page with SVG
icons reaches 60% when elided; the Tailwind page reaches 46%, because its class lists stay.

## Context: what the model reads for one task

| Task | Whole repo dump | Repo map + code needed | vs dump | Whole file | File map + code needed | vs file |
|---|---|---|---|---|---|---|
| TS: `createUser` stores the email in lower case | 3,353 | 914 | 73% | 850 | 440 | 48% |
| JSX: `PricingCard` shows a yearly saving | 3,353 | 1,007 | 70% | 469 | 356 | 24% |
| HTML: the Business plan costs $39 and gains a feature | 5,142 | 514 | 90% | 2,691 | 436 | 84% |
| HTML, Tailwind: reword the Retention feature | 5,142 | 708 | 86% | 2,439 | 535 | 78% |
| CSS: the highlighted card gets a 2px border | 1,913 | 771 | 60% | 1,908 | 771 | 60% |

"Whole repo dump" is every file of that kind, as a packing tool sends it. "Whole file" assumes the model already knows
which file to open. **In the JSX row, the repo map (1,007) costs more than the file itself (469).** The map pays when
the model must find the code. When the model already knows the file, the file's own map is enough.

## Output: what the model writes for the same tasks

| Task | Rewrite whole file | SEARCH/REPLACE | Edit operations | vs rewrite | vs SEARCH/REPLACE |
|---|---|---|---|---|---|
| TS: `createUser` | 850 | 162 | 40 | 95% | 75% |
| JSX: `PricingCard` | 469 | 109 | 38 | 92% | 65% |
| HTML: Business plan | 2,691 | 143 | 40 | 99% | 72% |
| HTML, Tailwind: Retention | 2,439 | 83 | 29 | 99% | 65% |
| CSS: highlighted card | 1,908 | 107 | 50 | 97% | 53% |

The rewrite is counted as the file's size.

## What these numbers do not show

- **Accuracy.** A smaller view that the model misreads is not a saving. Phase 5 measures pass rates.
- **Claude's tokenizer.** The two OpenAI tokenizers agree within 1 point. That suggests, but does not prove, that
  Claude's counts are close.
- **Real repositories.** The 8 files were written for this test. Real code may have more or fewer comments, Tailwind
  classes and inline icons. Phase 0 repeats this on 20 public repositories.
- **Scale.** The repo map here covers 5 code files. In a 500-file repository the map is larger, so the model reads a
  map of a folder, not of the whole repository.
- **Hand-written edits.** A model may write longer operations, or need retries.
