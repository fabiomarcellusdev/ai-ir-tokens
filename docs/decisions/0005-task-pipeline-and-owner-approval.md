# 0005. The task pipeline, the owner's approval, local checks first, and quiet hours

**Status:** Accepted (owner, 2026-11-07).

## Context

The owner set these rules (2026-11-07):

1. Automate the work as much as possible with the agents.
2. A pull request is merged only with the owner's explicit approval, after every pipeline and CI passed.
3. Every check runs locally before a branch is pushed for CI.
4. No work during the owner's quiet hours, unless the owner approves each instance.
5. Every output is 80% of the way to ASD-STE100.

The working hours and time zone are personal details, and the repository will be public.

## Options

| Option | What it gives | Cost |
|---|---|---|
| A. Rules in `CLAUDE.md` only | Simple | Nothing enforces them; other AI tools do not read Claude Code's settings |
| B. A pipeline skill, guards in Claude Code, and the same rules in git hooks | Automation up to the pull request; the owner's steps refused to agents in Claude Code, and the branch and time rules enforced by git for every tool | Two small scripts, a hook and their tests |
| C. B plus a bot account that opens pull requests | GitHub could then require the owner's formal review, because an author cannot approve a pull request they opened | A second account and its token to keep safe |

## Decision

Option B. Option C stays open (`docs/follow-ups.md`).

1. **The pipeline** is the `task-pipeline` skill: quiet-hours check, task branch, build with the agents, every check
   locally (`check.mjs full`, or `gate`), the `adversarial-reviewer` (and the `security-reviewer` where it applies),
   commit, push, pull request, CI on three systems, then a report to the owner. It stops there.
2. **The owner's approval is the merge.** Pull requests come from the owner's own account, so GitHub cannot record a
   formal review from the same account. The owner reviews the pull request and merges it. Agents never merge,
   approve, turn on auto-merge, push to `main`, or rewrite or delete a pushed branch:
   - the security guard refuses these commands, and `.claude/settings.json` denies `gh pr merge` and force pushes;
   - the repository allows squash merges only, deletes merged branches, and has auto-merge turned off;
   - once branch protection is on (the repository public, or a paid plan), `main` takes changes only through a pull
     request whose CI passed on all three systems.
3. **Local checks first:** the push hook runs `tools/git-guard.mjs pre-push`, then `check.mjs full`, before CI sees the
   branch. The pipeline reports a pull request only when CI passed too.
4. **One approval to publish:** the pipeline runs the push of the task branch and `gh pr create` as one command, and
   the owner approves it with one prompt. That prompt is the checkpoint before anything leaves the machine. Every
   other publishing command asks too. (The first draft let these two steps run without a prompt; see the
   amendment.)
5. **Quiet hours** live in `.local/quiet-hours.json` (git-ignored), so the public files hold no personal hours.
   `tools/quiet-hours.mjs` reads them with an IANA time zone, so daylight-saving changes are handled. Inside the
   hours:
   - the `quiet-hours-guard` hook (matcher `*`, in the main session and in subagents) asks the owner before **each**
     tool call;
   - the git hooks refuse commits and pushes unless `QUIET_HOURS_APPROVED=1` is set for that one command.
   An invalid file counts as quiet (fail closed). Without the file, nothing is quiet.
6. **Writing:** the project output style `ASD-STE100` (`.claude/output-styles/asd-ste100.md`) applies the rules to
   every reply. Output styles do not reach subagents, so each agent file repeats them.
7. **Other AI tools:** the git hooks enforce the branch rules, the quiet hours and the checks for every tool and every
   person. The Claude Code hooks are an extra layer.

## Rejected

- **Option A:** a rule nothing enforces is a wish.
- **Requiring an approving review in the ruleset now:** the owner could not approve their own pull requests, so
  nothing could merge without bypassing the rule.
- **The owner's hours in a tracked file:** they would become public.

## Limits

- The hooks read command text; a command hidden in a script file passes them. The git hooks run on the owner's
  machine only; CI and branch protection are the server-side layer.
- The override variables guard against mistakes, not a hostile process: any process can set them. In Claude Code the
  security guard refuses them to agents; another tool's agent is limited only by the server side.
- The privacy check of pushed commits finds the listed terms only. Encoded text (for example base64) passes it; the
  owner's publish prompt is the remaining check.
- `main` can still change locally (`git merge`, `git reset`); the push hook refuses to send it.
- An output style is an instruction, not a guarantee. The voice lint checks banned words in the docs; it does not
  measure sentence length.
- Branch protection waits for the repository to be public or the plan to allow it.

## What would reopen this

- The owner wants GitHub to record formal approvals (option C).
- A tool that the owner uses does not run git hooks.

## Amendments

- **2026-11-07, after the pipeline's own review** (the `adversarial-reviewer` and `security-reviewer` agents, on this
  change before its first commit). They confirmed by running that the first draft:
  1. missed the owner-only commands in other spellings: options before `push` (`git -C . push`), a path, `.exe` or
     quotes on the program, `env` or `command` in front, `bash -c` and `cmd /c` around, `gh pr -R o/r merge`, gh
     aliases, `gh api` writes with `-f` or `--method=`, `/merges` and `/git/refs` calls;
  2. only asked for `--no-verify`, `-fu`, `--del`, `--mirr` and quoted `'main'`;
  3. let `gh pr create --body-file .env` publish a secret with no prompt (a regression);
  4. let an agent set the owner's overrides, `GIT_*` variables, `core.hooksPath` or a push URL;
  5. never emitted the "allow" that point 4 claimed, so the claim was not measured;
  6. had a daylight-saving test that a broken version passed, a substring check for the hooks, no night windows, a
     silent fallback to the machine's time zone, and a hook that failed open when its module did not load;
  7. printed the time zone in messages that an agent could copy into a public pull request; and the commits recorded
     the owner's UTC offset.

  **Changes:** the security guard now parses git and gh like the tools do and looks inside `bash -c` and
  `cmd /c`; the owner's steps are refused in every tested spelling; publishing always asks (point 4, rewritten); the
  push hook checks every pushed commit for private files, private terms, `.github/` changes, UTC dates, a
  fast-forward and the pinned URL; commits must use UTC dates; every guard hook blocks on failure; the hooks check
  is structural; quiet hours support windows past midnight and `24:00`, need a real zone name, accept a BOM, and
  never print the zone or hours. Each finding is now a test (278 in all at the time of writing). The commits
  already pushed still carried the offset; see the amendment "the history stays as it is" below.
- **2026-11-07, after a second security review of the rewritten guards.** It confirmed about 30 more bypasses:
  quotes or escapes inside a word (`git pu""sh`, `g""h pr merge`, `ALLOW_MAIN_""PUSH=1`), shell grammar (`! git`,
  `if ... then git`, `<(...)`, `| bash`), programs that run programs (`xargs`, `timeout`, `find -exec`,
  `Start-Process`), inline `node -e` code, new gh spellings (`gh pr new`, `gh repo new`, `gh ssh-key add`), a gh deny
  list instead of an allow list, four ways past the scan of pushed commits (a faked remote-tracking ref, a merge
  commit, a non-ASCII file name, a `-diff` attribute), shell writes into the guards, a missing config that opened
  the URL pin, and false denies for commands that only named an override.
  **Conclusion:** a guard that reads command text cannot model every shell spelling. **The guards are an early
  warning, not the barrier.** The barriers are, in order: branch protection on GitHub (it needs the repository
  public or a paid plan), Claude Code's command sandbox, and the owner's permission mode (the guard's silence leaves
  the decision to it).
  **Changes:** the guard reads words the way a shell does; asks when a program or subcommand word cannot be read with
  confidence; asks for runners, inline code that can reach the system, every gh command outside a read-only list,
  every git config write, ref plumbing, and any host outside the allow list anywhere in a command; asks for every MCP
  tool call; refuses an override only when it is set; and, as a last check, asks when `git ... push` or a gh change
  appears but no clean git or gh command was read. The push hook reads the remote's real branches, merge commits,
  raw file names and history without attributes, and refuses every push when its config is missing. Each confirmed
  bypass is a test (361 in all at the time of writing).
- **2026-11-07, the history stays as it is** (owner). Before the repository became public, a scan of every commit
  found two minor details: a local folder path in a measurement record, and the owner's UTC offset in the first
  commit's dates. The path is now relative in the files, and the privacy lint's exception for that record is
  removed. The first commit keeps both. A force push cannot remove them, because GitHub keeps the commits of every
  pull request, and a new repository was judged not worth its cost. GitHub's own squash merges (from the web page
  and from `gh pr merge`) record the owner's local offset too, so the offset is not a privacy control: it shows a
  time zone that many millions of people share. Agents' commits stay UTC, because the rule costs nothing.
