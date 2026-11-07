# 0006. Licence: Apache-2.0

**Status:** Accepted (owner, 2026-11-07).

## Context

The repository becomes public. Without a licence, people can read the code but may not use, copy or change it, and
nobody can contribute safely. The layer runs inside other people's codebases, so companies must be able to adopt it.
The dependencies are TypeScript (Apache-2.0), and parse5, PostCSS and js-tiktoken (MIT). Both candidates below are
compatible with them.

## Options

| Option | What it gives | Cost |
|---|---|---|
| A. Apache-2.0 | Free use, change and sale. An explicit patent licence from each contributor, which ends for anyone who sues over a patent in the project. Legal teams at companies know it well. | About 10 pages. Redistributors must keep `LICENSE` and `NOTICE` and mark the files they changed. Not compatible with GPLv2-only code. |
| B. MIT | Free use, change and sale. One paragraph. The most common licence on npm. | No patent terms. |

## Decision

Option A, Apache-2.0. The patent terms remove a question that a company's lawyers would ask before they adopt a tool
that edits their code. `LICENSE` is the official text from apache.org (SHA-256
`cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`). `NOTICE` names the copyright holder.

A standard licence needs no drafting. A lawyer's review is optional; get one before a contributor agreement or a
trademark question.

## Rejected

- **B. MIT:** shorter, but it gives no patent licence.
- **No licence:** the code would be visible but not usable, which contradicts an open-source project.

## What would reopen this

A dependency or a partner that needs another licence, or a lawyer's advice.
