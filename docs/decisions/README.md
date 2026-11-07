# Decision records

One file per significant decision: `NNNN-short-name.md`. Amend a record with a dated note at its end. Never rewrite
what was decided.

| Id | Decision | Status |
|---|---|---|
| [0001](0001-shape-of-the-layer.md) | The shape of the layer: selection and edits, not a new language | Accepted 2026-11-06; two items open to phase 5 and 6. It came before the template below. |
| [0002](0002-package-manager-and-supply-chain.md) | pnpm only, pinned and vetted packages, and every install needs the owner's approval | Accepted 2026-11-07 |
| [0003](0003-agents-and-security.md) | The agent setup, and the defences against prompt injection | Accepted 2026-11-07 |
| [0004](0004-branch-strategy.md) | Branch strategy: a protected main, short task branches, tags for phases | Accepted 2026-11-07 |

## Template

```
# NNNN. Title

**Status:** Proposed | Accepted (who, date) | Superseded by NNNN

## Context
What forces the decision. The evidence, with its conditions.

## Options
Each option, with its cost and what it gives.

## Decision
The option chosen, and why.

## Rejected
Each rejected option, and why.

## What would reopen this
The evidence that would change the decision.
```
