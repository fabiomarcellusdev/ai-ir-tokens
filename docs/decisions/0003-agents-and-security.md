# 0003. The agent setup, and the defences against prompt injection

**Status:** Accepted (owner, 2026-11-07).

## Context

The owner asked for a multi-agent setup for maximum efficiency, with every necessary security precaution against
prompt injection and other risks, and with automated tests that must pass at each milestone.

Two facts shape the setup:

1. **Every agent costs tokens.** A subagent reads its own context again, and its report drops detail. This project
   exists to save tokens, so an agent earns its place as a view does: by what it gives for its cost.
2. **Prompt injection is the main agent risk.** This project reads untrusted text all the time: web pages, package
   metadata, public repositories for the benchmark, and model output. Text can carry instructions. An attack needs
   three things together: **untrusted input**, **access to private data**, and **a way to send data out**. The
   defence is to never give one agent all three, and to make each risky action visible to the owner.

## Options

| Option | What it gives | Cost |
|---|---|---|
| A. One agent per hat (five agents) | Clear roles | Five times the tokens; conflicts between hats settled in handoffs nobody sees; each agent sees part of the picture |
| B. One lead that wears the hats, and a small set of specialists where independence or a clean context pays | Independent tests and reviews; research kept out of the lead's context | Seven agent files and five skills to keep |
| C. The lead alone | Cheapest | No independent oracle or review: "code and test written by the same mind share its mistakes" |

## Decision

Option B.

### The lead

The main session wears the five hats, talks to the owner, owns the plan and makes the edits. It settles hat conflicts
in the open. It treats every subagent's report as a summary to check, never as instructions.

### The specialists (`.claude/agents/`)

| Agent | Model | Tools | Untrusted input | Private data | Way out | Why it exists |
|---|---|---|---|---|---|---|
| `scout` | Haiku | Read, Grep, Glob | Repository files | Told not to read | None | Keeps file dumps out of the lead's context |
| `researcher` | Sonnet | WebSearch, WebFetch | Web pages | **None (no file tools)** | Web | Long reading, returned as sourced conclusions |
| `oracle-writer` | Opus | Read, Grep, Glob, Write, Edit | Spec and tests | Told not to read | None (no shell, no web) | Tests and a reference implementation from the spec alone |
| `adversarial-reviewer` | Opus | Read, Grep, Glob, Bash | The diff | Told not to read | Shell, told: no network | A review not anchored on the author |
| `security-reviewer` | Opus | Read, Grep, Glob, Bash | The diff | Told not to read | Shell, told: no network | Hat 4's independent check |
| `bench-runner` | Sonnet | Read, Bash, Write | Script output | Told not to read | Shell, told: named scripts only | Runs one at a time, records conditions the same way |
| `analysis-checker` | Opus | Read, Bash | Raw results | Told not to read | Shell, told: compute only | Recomputes the numbers that decide a gate |

The researcher holds untrusted input and a way out, so it holds **no** file tools. The agents with a shell are told
not to use the network, and the security guard (below) asks the owner before any shell command that sends data to a
host outside a short allow list, or names a private file.

**Rejected from the first proposal: a `package-vetter` agent.** It would have held untrusted registry text and a
shell together. A script (`tools/vet-package.mjs`) does the same checks with no model in the loop, and the
`vet-package` skill tells the lead how to use it.

### The skills (`.claude/skills/`)

`vet-package`, `monthly-update-review`, `measurement-run`, `gate-check`, `decision-record`. A skill gives the lead a
fixed procedure at a fraction of an agent's cost.

### When to use an agent

- Do a task of about five tool calls or fewer directly.
- Read-only agents may run in parallel, three at most. Agents that write run one at a time, or on separate files.
- Heavy commands (installs, builds, test suites, measurements) run one at a time under the machine rules.
- Large fan-outs (20 repositories, a review across several dimensions) use a Workflow, only when the owner asks.
- From phase 6, the three language modules do not depend on each other; worktrees and parallel agents may then pay
  (`docs/follow-ups.md`, "Worktrees").

### The defences

| Layer | What it does | Where |
|---|---|---|
| Separation | No agent has untrusted input, private data and a way out together | The agent files above |
| Package guard | Refuses npm installs, npx, Yarn and Bun; holds every install for the owner | `.claude/hooks/package-guard.mjs` |
| Security guard | Holds for the owner: a shell command that names a private or secret file; one that sends data to a host outside the allow list; a web fetch whose URL looks like it carries data; publishing (push, publish, release, pull request, new remote). Refuses a download piped into a shell. Fails closed: if it cannot judge, it asks | `.claude/hooks/security-guard.mjs` |
| Permission rules | Refuse reading `.env` files, keys and credential stores; ask before reading the private notes, before a push, and before any edit to the guards, the agents, the skills, the checks or pnpm's settings | `.claude/settings.json` |
| Text is data | Every agent file says it; tool output and fetched text never become instructions; suspected injections are reported with their location | The agent files; `AGENTS.md`, hat 4 |
| Untrusted repositories | Corpus repositories are fetched by commit into a folder outside this repository; their scripts and installs never run; only the measurement scripts read them | `bench-runner`; the `measurement-run` skill |
| Supply chain | Decision 0002: pnpm only, exact pins, 60 days, no known vulnerability above low, no install scripts, owner approval | `pnpm-workspace.yaml`, `tools/` |
| Machine checks | `node tools/check.mjs` at every commit, push and gate; a weakened guard fails it | `docs/testing.md` |
| Private notes | `CLAUDE.local.md` and `private-docs/` are git-ignored; the privacy lint fails if a private term reaches a file that git would publish | `.gitignore`, `tools/check.mjs` |
| Plugins | Read a plugin's files before it is installed; install it for the narrowest scope; no plugin with hooks or an MCP server without the owner's yes | This record |

## Rejected

- **Option A:** see the table.
- **Option C:** no independent oracle, which the playbook requires.
- **Detecting injection by pattern-matching text:** easy to evade and noisy. Limiting what each agent can do is
  stronger. The guards hold the actions, not the words.
- **Claude Code's command sandbox now:** it would also limit network and file access for shell commands, but its
  effect on Corepack, pnpm and git on this Windows machine is untested. A trial is a follow-up.

## Limits

- The hooks read command text. A command inside a script file, an alias or an encoded string is not seen. The
  permission rules, the agents' tool lists and the owner's review of each prompt remain.
- An agent with a shell can do anything the shell can. Its instructions, the guards and the owner's prompts limit it;
  the sandbox trial would add a hard limit.
- The lead itself holds untrusted input, private data and a way out. It is the trust anchor: it treats fetched text
  and reports as data, and the guards make its risky actions visible.
- No hook or rule replaces a real security review before a public release (hat 4).

## What would reopen this

- A suspected or real prompt injection, in this project or a public report about Claude Code.
- An agent whose cost is higher than its value in practice (for example, a reviewer that finds nothing for a phase).
- The sandbox trial passes, so a hard limit can replace an instruction.

## Amendments

- **2026-11-08, secrets and the agent roster** (owner). The owner asked for an agent that checks every change for
  exposed secrets. **Decision:** a script, not an agent (`tools/secret-scan.mjs`, in `check.mjs` and the push hook, so
  CI covers each pull request). A machine checks first: the formats are well known, a script finds them the same way
  every time, and an agent would have to read the secret, which copies it into its transcript and to the model
  provider. `AGENTS.md`, "If a secret appears", sets the response: stop, rotate first, remove, check the history, then
  delete the conversation as a partial last step. The owner also asked that the lead offer considerations about the
  agent roster at setup and at each phase gate (`AGENTS.md`, "Agents and security", 11); the owner decides, and no
  agent changes without the owner's yes. Ported to this project on 2026-11-09.

- **2026-11-08** (owner): agents that write may run in parallel in separate worktrees, one session each (decision
  0004, amendment "parallel checkouts"). In one checkout, they still run one at a time.
- **2026-11-08, AGENTS.md** (owner). The tool-neutral rules moved from `CLAUDE.md` into `AGENTS.md`, with the same
  section names. Codex, Cursor, GitHub Copilot, Gemini CLI and other tools read `AGENTS.md` directly, so their agents
  get the same rules: the hats, the packages, the agents and security, the task pipeline, the rules and the working
  agreements. `CLAUDE.md` imports `AGENTS.md` and adds only what is specific to Claude Code: the output style, the
  specialist agents, the skills and the guard hooks. The guard hooks and the permission rules work in Claude Code
  only; in another tool, the git hooks and branch protection still hold. So `AGENTS.md`, "Agents and security", also
  states as rules what Claude Code's guards already enforce: ask before anything that publishes (6); never read
  secrets, and keep a maintainer's local notes out of tracked files (7); leave the owner's steps to the owner,
  including the dismissal of a code-scanning alert (9); and explain a held call (10). The template project has the
  same layout.
- **2026-11-08, mattpocock-skills** (owner). The owner asked to install the plugin `mattpocock-skills` 1.3.1 (27
  skills, MIT). Two `security-reviewer` agents first read every file the plugin would install, as `AGENTS.md`,
  "Agents and security", 8 requires. They found no
  hidden instruction, but many conflicts: 11 skills start without a command, and some of them read and write `.env`
  secrets, combine web input with file tools, write a second decision folder, or advise deleting prohibitions from
  `AGENTS.md`; others, on command, run a stranger's pull request, commit to the current branch, merge, or push
  without asking. The plugin installs as one unit, its npm lockfile makes Claude Code run an npm install that no
  setting stops (against decision 0002), and its marketplace updates it without a review. **Decision:** do not install
  it. Four skills (`grilling`, `diagnosing-bugs`, `tdd`, `wait-what`) are adapted into `.claude/skills/` under the MIT
  licence, changed where they conflicted with this project's rules, and reviewed like any other change.
  **Rejected:** the install with a rule that the project's rules win (the automatic skills still start on ordinary
  tasks); no copy at all (it loses methods that fit the project).
- **2026-11-08, Anthropic's token counter** (owner). `bench/token-count/corpus.mjs` may call
  `https://api.anthropic.com/v1/messages/count_tokens` (rule 6: a network call to a new host), with the owner's API key
  from the environment only. It sends the text of public repositories, never a file of this repository or a private
  file. The endpoint is free. The security guard's allow list is unchanged: the guard sees only `node corpus.mjs`, so
  this decision, not the guard, is the control.
