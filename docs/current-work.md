# Current work

Keep this file short. When a task closes, replace its notes with one line and a link.

## Now

**Branch `p0/docs-agents-md`:** the tool-neutral rules move from `CLAUDE.md` into `AGENTS.md`, so that agents other
than Claude Code read them too (decision 0003, amendment "AGENTS.md"). Waiting for the owner's merge.

## Next: phase 0, measure before building

Decide with the owner, before any run:

1. The 20 public repositories and their commits (React apps, Node services, static sites, a Tailwind site).
2. The task scenarios for them, so "map plus code needed" uses real tasks.
3. Whether an Anthropic API key is available for the token-counting endpoint (gate C0 is judged by it).
4. Gate C0's final number and how the median is taken (`docs/contract.md`).

## Closed

- 2026-11-06: the plan, the measurement and the plan page (planning session).
- 2026-11-07: the review before the first commit; pnpm only, pinned and vetted packages (decision 0002); the agent
  setup and the security defences (decision 0003); the milestone checks (`docs/testing.md`); the sample re-runs
  (`docs/measurements/2026-11-07-pnpm-rerun.md`); CI and the branch strategy (decision 0004).
- 2026-11-07: the task pipeline, the owner's approval, local checks first, quiet hours, UTC commit dates and the
  ASD-STE100 output style (decision 0005).
- 2026-11-07: the repository is public under Apache-2.0 (decision 0006), with branch protection, secret scanning,
  push protection and CodeQL; the two CodeQL alerts are fixed.
- 2026-11-08: parallel checkouts with `tools/worktree.mjs`, and two security reviews of the worktree lookup
  (decision 0004, amendment "parallel checkouts").
