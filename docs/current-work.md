# Current work

Keep this file short. When a task closes, replace its notes with one line and a link.

## Now

**Gate R1: missed** (decision 0007; branch `p0/bench-r1-ranking`). The one test run passed 31 of 85 (36.5%) against
70% (`docs/contract.md`, "The result of gate R1"). The ranking was tuned on the development tasks only (34/85, 40.0%).
By decision 0007, a miss stops the project unless a new, dated decision gives a reason to continue.

## Next

1. The owner decides: stop, or continue with a new decision record and its reason.

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
- 2026-11-08: the tool-neutral rules in `AGENTS.md` (decision 0003, amendment "AGENTS.md"); four adapted skills instead of
  a plugin (decision 0003, amendment "mattpocock-skills").
- 2026-11-08: phase 0: gate C0 missed (median -165.8%); W not reached (14.5%), V reached (78.8%)
  (`docs/contract.md`; `docs/measurements/2026-11-08-phase0-*`).
