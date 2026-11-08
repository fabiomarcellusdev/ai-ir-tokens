# ai-ir-tokens

**A small, cheap map that tells an AI coding agent where to read.**

ai-ir-tokens is a planned open-source tool for developers who use an AI coding agent (Claude Code, Cursor, VS Code
agents and others) on a TypeScript, JavaScript, HTML or CSS project. It gives the agent a short, ranked map of the
repository: file names, function names and line ranges, cut to a token budget. The agent then reads only the lines it
needs with its own tools, and edits with its own tools.

The goal is that a completed coding task costs much less, with a pass rate no more than 1 point lower, counted with
prompt caching as agents use it. The working target is **at least 40% less**; the exact number is fixed before the
pilot runs. A saving that costs accuracy is not a saving.

> **Status: measuring, nothing built.** The first plan failed its test on real code, and the project has been
> rescoped (`docs/decisions/0007-rescope-after-c0.md`). The next step is a free measurement; if it misses its gate,
> the project stops. No model has run a task with this tool.

## What phase 0 found

The first plan was a full layer between the agent and the files: a map, compact views of the code, and edits by name.
It was tested on 85 real past changes in 17 public repositories, with each threshold fixed before the run
(`docs/contract.md`):

| Measurement | Result | Threshold | Verdict | Counted with |
|---|---|---|---|---|
| **C0:** map plus code needed, against the files a change touches | **-165.8%** (the layer sent more) | +50% | Missed | Anthropic's token counter |
| **W:** edits by name, against search and replace | 14.5% fewer tokens | 40% | Not reached | o200k_base (a proxy) |
| **V:** the smallest unit of code that holds a change, in a compact view, with no map | **78.8%** fewer tokens | 65% | Reached | o200k_base (a proxy) |

What it means:

- **The map was far too big.** One line per folder for a whole repository, plus every file of the folders a change
  touched, cost more than the files themselves.
- **Edits by name add little.** Agents already edit with search and replace. Writing is about a fifth of the reading
  tokens; in cost its share is larger, because output costs more than input, but even then the saving could not pass
  14.5%.
- **Reading less code can save a lot,** if the agent knows where to read. The smallest unit saved 78.8% (in a compact
  view this plan no longer builds); reading whole units in plain code through line ranges is not measured yet. Agents
  can already read line ranges; what they lack is a cheap way to know which lines.

Method, conditions and limits: `docs/measurements/2026-11-08-phase0-corpus.md` and
`docs/measurements/2026-11-08-phase0-followups.md`. Both sides were told which files each change touched, so these
numbers measure the cost of reading, not of finding.

## The plan now

1. **Step 1, free (gate R1):** given only a task's description, can a map within 25% of the files' tokens list every
   file the change touched, in at least 70% of the 85 tasks? It costs nothing: no model is called.
2. **Step 2, a small paid pilot:** real agent runs, with and without the map, measuring cost per completed task and
   pass rate. Only if step 1 passes.

Each step can end the project. The plan is in `docs/roadmap.md`; the gates are in `docs/contract.md`.

## What it is not

- **Not a new language, and not a compressor.** The agent reads your real code, unchanged.
- **Not a runtime library.** Nothing from ai-ir-tokens runs inside your application. It works on your source code,
  during development, between a coding agent and your repository.

## Safety

The tool will treat every file as untrusted input. Paths stay inside the workspace, the tool does not run project code
(such as config files) without your consent, and secrets such as `.env` files are not indexed. Dependencies are
pinned, at least 60 days old, and checked for known vulnerabilities
(`docs/decisions/0002-package-manager-and-supply-chain.md`). Every commit and push runs automated checks
(`docs/testing.md`).

## Measure your own code

Needs Node 20 or later and pnpm 12.3.4. The project uses pnpm only. Without pnpm on your path, use `corepack pnpm`
(Corepack comes with Node).

```
cd bench/token-count
pnpm install --frozen-lockfile --ignore-scripts
node count.mjs <folder>
```

It prints the token counts of each view of the files in `<folder>` and writes the views to `out/`.

## Licence

Apache License 2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
