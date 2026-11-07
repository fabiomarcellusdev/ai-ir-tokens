# Follow-ups

Every known gap: what it is, who raised it, and what it blocks. Close a row by saying how and when; do not delete it.

| Gap | Raised | Blocks | Status |
|---|---|---|---|
| **Accuracy is unmeasured.** No model has run a task with these views. | Planning session, 2026-11-06 | The project's go or no-go (phase 5, gate C5) | Open |
| **Claude's tokenizer is not used.** Every count is from OpenAI's o200k_base and cl100k_base. Needs an Anthropic API key for the token-counting endpoint. | 2026-11-06 | Phase 0's report (gate C0 is judged by Anthropic's counter) | Open |
| **The corpus is 8 self-written files.** Real repositories may differ. | 2026-11-06 | Phase 0 | Open |
| **The edit operations and SEARCH/REPLACE blocks were written by hand.** A model may write longer ones or need retries. | 2026-11-06 | Read with phase 5's results | Open |
| **Map scale is untested.** The repo map covered 5 code files. | 2026-11-06 | Phase 2's design (hat 5) | Open |
| **The npm package name is not chosen.** Check that it is free on npm before phase 1. | 2026-11-07 | Phase 1 | Open |
| **The licence is not chosen** (Apache-2.0 or MIT). Apache-2.0 has a patent grant; MIT is shorter. A lawyer's view is optional for a standard licence. | 2026-11-06 | Phase 1 (no LICENSE file yet) | Open |
| **Fixed:** `bench/token-count/package.json` used `^` ranges, `"type": "commonjs"`, a `"license": "ISC"` that no one chose, and npm's placeholder fields. It now has exact versions, `"private": true`, `"type": "module"`, and no licence field. | 2026-11-07 | – | Closed 2026-11-07 (review before the first commit) |
| **pnpm was not installed, and the pins were in an npm lockfile.** pnpm 12.10.1 (through Corepack) installed the packages with scripts off; `pnpm-lock.yaml` replaced `package-lock.json`; the re-run gave identical numbers (`docs/measurements/2026-11-07-pnpm-rerun.md`). | Owner, 2026-11-07 | – | Closed 2026-11-07 |
| **`devEngines.packageManager` was not tested against npm.** npm 11.19.0 refuses to run in `bench/token-count` with `EBADDEVENGINES`, even for `npm view`. | 2026-11-07 | – | Closed 2026-11-07 |
| **The package guard hook reads command text only.** A command in a script file, an alias or an encoded string passes it. Claude Code's permission prompt, `devEngines` and pnpm's settings are the other layers. | 2026-11-07 | Nothing | Open |
| **`CLAUDE.md` was not ready to be public.** The owner's personal and machine-specific notes moved to a git-ignored `CLAUDE.local.md`. | Owner, 2026-11-07 | – | Closed 2026-11-07 |
| **pnpm prints an "Update available" notice** with a command that pipes a web script into PowerShell. Updates follow decision 0002; never run that command. Turning the notice off needs pnpm's global configuration, not the project's. | 2026-11-07 | Nothing | Open |
| **Security alerts on GitHub.** When the repository is on GitHub, turn on Dependabot security alerts as notifications only, with no automatic pull requests (decision 0002). | 2026-11-07 | The first push | Open |
| **CI did not exist, and the vulnerability check ran locally only.** `.github/workflows/checks.yml` runs `node tools/check.mjs full` on Windows, macOS and Linux for every pull request, every push to `main` and once a month. Actions are pinned by commit hash (checkout v7.0.1, setup-node v7.0.0, both over 60 days old, no known advisory); read-only token; no secrets. | 2026-11-07 | – | Closed 2026-11-07 |
| **Node 24.21.0 on the owner's PC has high-severity CVEs** (fixed in the security release 24.22.1 of 2026-10-20: TLS, DNS, brotli). CI uses 24.22.1 under the security exception. The owner updates the local Node to 24.22.1 (a system install, the owner's step). | 2026-11-07 | Nothing; a risk until updated | Open |
| **Branch protection.** Turn on the rules of decision 0004 for `main` (pull request required, `checks` required on all three systems, no force push, linear history). GitHub enforces them on a private repository only on a paid plan; otherwise turn them on when the repository becomes public. | 2026-11-07 | Making the repository public | Open |
| **Making the repository public.** Before it: choose the licence and add `LICENSE`; turn on the GitHub email-privacy settings; check CI is green; turn on branch protection, secret scanning with push protection, and Dependabot security alerts (notifications only). | Owner, 2026-11-07 | – | Open |
| **Security exception: source-map-js 1.2.2** is younger than 60 days (published 2026-09-30) and is kept because 1.2.1 has a high advisory. Remove it from `minimumReleaseAgeExclude` on or after 2026-11-29; `node tools/check.mjs fast` fails from that date until it is removed. | Owner, 2026-11-07 | Nothing until 2026-11-29 | Open |
| **Claude Code's command sandbox is not on.** It would add hard limits on network and file access for shell commands. Its effect on Corepack, pnpm and git on Windows is untested; try it in a branch, with the owner (decision 0003). | 2026-11-07 | Nothing | Open |
| **The git hooks need execute permission in the repository** for macOS and Linux clones. Stage them with `git update-index --chmod=+x .githooks/pre-commit .githooks/pre-push` in the first commit. | 2026-11-07 | The first commit | Open |
| **The private-notes lint runs only in the owner's checkout.** It reads `private-docs/privacy-terms.txt`, which is git-ignored, so CI skips it. A leak from another clone would not be caught. | 2026-11-07 | Nothing | Open |
| **Probe gaps in `count.mjs`.** `tsCompactSymbol` crashes when the name is not found. The plain TypeScript view trims lines inside multi-line template strings, so their text changes. Acceptable for a probe; the phase-0 harness and `docs/spec/` must handle both. | 2026-11-07 | Phase 0 harness; the spec of the plain view | Open |
| **The raw JSON of 2026-11-06 holds a local folder path** (`"root"`) and has no final newline. It stays as recorded. `count.mjs` now writes a relative `root` and a final newline (see the 2026-11-07 re-run). | 2026-11-07 | Nothing | Closed 2026-11-07 (script fixed; raw record unchanged) |
| **The measurement script has no tests.** It was a probe. Phase 0 grows it into the harness; give it golden outputs then. | 2026-11-07 | Phase 0 | Open |
| **Worktrees.** The rule is one checkout for now. Revisit at phase 1 if parallel agents on separate branches would help. | Owner, 2026-11-07 | Nothing | Open |
| **Prior art rows 4 to 8 are from memory** (Aider, Repomix, Serena, LLMLingua, TOON). Serena and Aider's repo map need a close study. | 2026-11-06 | Phase 1's design | Open |
| **The plan page shows the working name** ("Token-Lean Code Layer"), not `ai-ir-tokens`. Update it when the page is next published. | 2026-11-07 | Nothing | Open |
| **Fixed:** the script failed in a folder whose path has a space (`URL.pathname` keeps `%20`). It now uses `fileURLToPath`; the numbers are unchanged. | 2026-11-07 | – | Closed 2026-11-07 |
