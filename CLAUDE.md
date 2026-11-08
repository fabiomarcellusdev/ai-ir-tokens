@AGENTS.md

# Claude Code

`AGENTS.md` above holds every rule. This part adds only what is specific to Claude Code (decision 0003, amendment
"AGENTS.md").

## Output

**Every reply is 80% of the way to ASD-STE100.** The project output style `ASD-STE100`
(`.claude/output-styles/asd-ste100.md`, selected by `outputStyle` in `.claude/settings.json`) applies the rules of
`AGENTS.md`, "Working agreements", to every reply. Output styles do not reach subagents, so each agent file repeats the
rules.

## The task pipeline

Run every change with the `task-pipeline` skill. It carries out the steps of `AGENTS.md`, "The task pipeline", with
the agents below.

## Agents (decision 0003)

You are the lead: you wear the hats, talk to the owner and make the edits. Specialists in `.claude/agents/` do work
where independence or a clean context pays:

| Agent | Model | Tools | Use it for |
|---|---|---|---|
| `scout` | Haiku | Read, Grep, Glob | "Where is X": `file:line` answers, so you do not load whole files |
| `researcher` | Sonnet | WebSearch, WebFetch (no file tools) | Sourced research: prior art, library internals, changelogs |
| `oracle-writer` | Opus | Read, Grep, Glob, Write, Edit | Tests and a second implementation from the spec alone |
| `adversarial-reviewer` | Opus | Read, Grep, Glob, Bash | A review of each change, not anchored on your reasoning |
| `security-reviewer` | Opus | Read, Grep, Glob, Bash | Hat 4's independent review |
| `bench-runner` | Sonnet | Read, Bash, Write | Measurements, one at a time, recorded in `docs/measurements/` |
| `analysis-checker` | Opus | Read, Bash | Recomputes the numbers that decide a gate |

## Skills

`.claude/skills/` holds fixed procedures: `task-pipeline`, `vet-package`, `monthly-update-review`,
`measurement-run`, `gate-check`, `decision-record`. Before you ask to add a package, use the `vet-package` skill. The
`monthly-update-review` skill is the monthly review of `AGENTS.md`, "Packages", 7.

## Guards

- `.claude/hooks/quiet-hours-guard.mjs` (every tool, also in subagents) asks the owner before each action inside the
  quiet hours of `.local/quiet-hours.json`.
- `.claude/hooks/package-guard.mjs` refuses npm installs, npx, Yarn and Bun, and holds every install for the owner.
- `.claude/hooks/security-guard.mjs` holds for the owner any command that names a private or secret file, reaches a
  host outside its allow list, publishes, writes into the guards, runs another program, creates a link, or cannot be
  read with confidence, and every MCP tool call. It asks before each push and each pull request. It refuses the
  owner's steps: a merge, an approval, a push to `main`, a force push, a branch deletion, `--no-verify`, and the
  overrides `ALLOW_MAIN_COMMIT`, `ALLOW_MAIN_PUSH` and `ALLOW_WORKFLOW_CHANGE`; it asks before
  `QUIET_HOURS_APPROVED`. It is an early warning, not the barrier (decision 0005).
- Every guard hook has `onFailure: "block"`: a crash, a timeout or a missing `node` blocks the call.
- `.claude/settings.json` refuses reads of `.env` files, keys and credential stores. It asks before reading private
  notes, before editing a `.git` file, and before editing any guard, agent, skill or check.
- Edit guard files with the Edit tool, never through the shell.

## Plugins

Install a plugin with `--scope local`, for this checkout only (`AGENTS.md`, "Agents and security", 8).

## Private notes

`CLAUDE.local.md` (git-ignored; Claude Code loads it after this file) holds the owner's machine and personal notes.
Private documents go in `private-docs/` (git-ignored).
