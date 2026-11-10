# Current work

Keep this file short. When a task closes, replace its notes with one line and a link.

## Now

**Gate R2, the final free gate** (decision 0008; branch `p0/bench-r2-select`). Its rules are in `docs/contract.md`,
"Gate R2 in detail", fixed before any repository is picked. A miss at R2 stops the project for good. Done before it:
the HTML and CSS line ranges (#22), the secret scan and the safer git calls (#23), and the selection of the 17
repositories on 2026-11-10 (`r2-repos.json`, awaiting the owner's approval).

## Next

1. The owner approves the list of 17 repositories (`bench/token-count/r2-repos.json`); then the pull request is merged.
2. Pick the tasks: commit the development list and the sealed test list's hash, before any ranking work.
3. Build the lessons, the issue texts and the folder's map; tune on the development tasks only; freeze; one test run.

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
