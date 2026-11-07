# ai-ir-tokens

**Fewer tokens for AI coding agents that read and edit your codebase.**

ai-ir-tokens is a planned open-source tool for developers who use an AI coding agent (Claude Code, Cursor, VS Code
agents and others) on a TypeScript, JavaScript, HTML or CSS project. It sits between the agent and your files. The
agent asks it for the code a task needs, and sends it small, named edits. The tool applies those edits to your real
files, checks them, and rolls back any edit that breaks the build.

The goal is that an agent spends **at least 40% fewer tokens on a coding task, with a pass rate no more than 1 point
lower**. A saving that costs accuracy is not a saving.

> **Status: planning.** Nothing is built yet except a measurement script. No model has run a task with this tool, so
> every number below is a token count only. Accuracy is unmeasured.

## The problem

A coding agent spends tokens in two places:

1. **Reading.** To find the code it must change, an agent often opens whole files or dumps whole folders. Most of
   what it reads is not needed for the task.
2. **Writing.** To change three lines, an agent often repeats the code around them (search-and-replace blocks) or
   rewrites the whole file. Output tokens cost about five times as much as input tokens.

Every token fills the agent's context window, adds time and adds cost, even when it is cached.

## What ai-ir-tokens does

| Step | What the agent gets or sends |
|---|---|
| **Map** | One line per function, class, type, page section or group of CSS rules, with its signature and line range. The agent reads the map first, to find where to work. |
| **Views on request** | Only the code the task needs, in the cheapest form that is still real code: comments and indentation removed; for HTML, a compact view with inline SVG replaced by a short stub. |
| **Edits by name** | Small operations addressed by name, for example `users.ts:createUser insert-after stmt[1]: ...`, in place of repeated or rewritten code. |
| **Round trip** | The tool applies the edits to the original text, formats only the changed lines with your own formatter settings, runs the TypeScript check, and rolls back on failure. Code the agent did not edit stays byte for byte as it was. |

It is one npm package with a command-line tool and an MCP server, so any agent that speaks MCP can use it.

## What it is not

- **Not a new language.** The agent reads and writes ordinary TypeScript, JavaScript, HTML and CSS. Measurements showed
  that most of the saving comes from what is sent and from the edit format, not from a new syntax
  (`docs/decisions/0001-shape-of-the-layer.md`).
- **Not a runtime library.** Nothing from ai-ir-tokens runs inside your application or reaches your users. It does not
  generate user interfaces, and it does not ask a model to produce JSON for an app to render. It works on your source
  code, during development, between a coding agent and your repository.
- **Not a prompt compressor.** It does not shorten or paraphrase your code. It selects the code a task needs and
  shows it unchanged in meaning.

## First measurements (tokens only)

On 8 sample files written for the test (10,364 tokens), counted with OpenAI's `o200k_base` tokenizer as a stand-in
for Claude's:

| Comparison | Saving |
|---|---|
| A file's map against the whole file | 69-97% |
| Edit operations against search-and-replace blocks | 53-75% |
| Edit operations against rewriting the file | 92-99% |
| Plain TypeScript or CSS view against the raw file | 24% |
| Compact HTML view with inline SVG elided | 53% |

These files were written for the test, and no model ran a task. Phase 0 repeats the count on 20 public repositories,
and phase 5 measures pass rates. Method and limits: `docs/measurements/2026-11-06-sample-corpus.md`.

## Roadmap

Two phases decide whether the project continues:

- **Phase 0:** the savings must hold on real repositories before anything is built.
- **Phase 5:** an agent must pass benchmark tasks as often with the tool as without it.

The full plan, with each phase's gate: `docs/roadmap.md` and `docs/contract.md`.

## Safety

The tool will treat every file and every message from the model as untrusted. Paths stay inside the workspace, the
tool does not run project code (such as config files) without your consent, and secrets such as `.env` files are not
indexed. Dependencies are pinned, at least 60 days old, and checked for known vulnerabilities
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

Not chosen yet (Apache-2.0 or MIT).
