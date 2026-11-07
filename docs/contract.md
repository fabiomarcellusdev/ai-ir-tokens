# Contract: the pass/fail gates

Each gate is a number fixed before the run it judges. A gate is moved only by a dated amendment with its reason, never
after the results are in. A missed gate is recorded as missed, with its numbers.

**Status (2026-11-07):** every gate is **tentative** (from the planning session, 2026-11-06). Before a gate's run, the
owner confirms or changes it, and this file records that with the date.

| Id | Phase | Gate | Judged on | Status |
|---|---|---|---|---|
| C0 | 0 | Map plus code needed is at least 50% smaller than the files an agent opens for the same task | The median of 20 public repositories, pinned by commit; Anthropic's token counter and o200k_base | Tentative |
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
