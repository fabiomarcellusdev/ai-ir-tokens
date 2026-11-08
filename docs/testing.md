# Testing: the checks that must pass at each milestone

A milestone is not reached until every check for it passes. A failing check is fixed or, if it is flaky, quarantined
with a row in `docs/follow-ups.md`. It is never re-run until it passes, and never skipped (`--no-verify`) without the
owner's yes.

One command runs each level: `node tools/check.mjs <fast|full|gate>`. It uses Node's standard library only.

## The milestones

| Milestone | Level | Runs where | What it adds |
|---|---|---|---|
| Every commit | `fast` | `.githooks/pre-commit`, after `git-guard` (no commit on `main`, none in the quiet hours) | Unit tests; voice lint; package guards intact; expired security exceptions; privacy lint |
| Every push and pull request | `full` | `.githooks/pre-push`, after `git-guard` (no push to `main`, no deletion, none in the quiet hours); then CI (`.github/workflows/checks.yml`) on Windows, macOS and Linux, and once a month | `fast` + golden sample views + known vulnerabilities (osv.dev) |
| Every pull request and push to `main` | Code scanning | GitHub's CodeQL (default setup, turned on by the owner on 2026-11-07); the `task-pipeline` skill reads the pull request's open alerts before it hands over | Static analysis of the JavaScript and the workflows for known unsafe patterns (injection, incomplete escaping, unsafe paths) |
| Every merge | The owner's review | GitHub | The owner merges only after the local checks and CI passed (decision 0005) |
| Every phase gate | `gate` | The `gate-check` skill | `full` + the gate tests in `tests/gates/` + the gate's measurement + independent reviews |
| Every release (from 0.1) | `gate` + release checks | The release hat's checklist (`docs/future-hats.md`) | Install the packed tarball in a clean folder and run the CLI and the MCP server; the notices of every shipped dependency |

Turn the git hooks on once per clone: `git config core.hooksPath .githooks`.

## What each check proves, and its negative control

Every check must be able to fail. The negative control is the broken input that shows it does.

| Check | Proves | Negative control |
|---|---|---|
| Unit tests: `package-guard` | npm installs, npx, Yarn and Bun are refused; installs wait for the owner | Deny and ask cases (wrappers, `bash -c`, `$(...)`, quotes), and allow cases that must not be blocked |
| Unit tests: `security-guard` | Sensitive files, data sent out, piped installers and publishing wait for the owner | Deny and ask cases (`curl ... \| sh`, `cat .env`, `git push`), and allow cases |
| Unit tests: `osv-check` | The lockfile reader finds every package | A lockfile with no packages; a CRLF lockfile; an unrated advisory counts as a failure |
| Unit tests: `vet-package` | Each vetting rule fails when it should | A young version, an install script, an unknown licence, a high advisory, a deprecated version, a publisher change |
| Unit tests: `check` | A weakened guard or an expired exception fails `fast` | Ten weakenings (a caret range, a 30-day age, scripts allowed, a removed hook, ...) |
| Unit tests: `quiet-hours` and `git-guard` | The quiet hours by time zone and weekday (also past midnight), fail-closed on a bad config; no commit on `main`; in every pushed commit no private file, private term, `.github/` change or non-UTC date; no push to `main`, deletion, rewrite or foreign URL | The edge minutes; daylight-saving cases that a fixed-offset version fails; a bad zone, a BOM; end-to-end runs of `git-guard pre-push` in throwaway repositories with a secret file, a workflow change, a `-0600` date, an unrelated history and a foreign URL |
| Structure checks | Each guard runs as a PreToolUse hook on its tools, as `node <guard>`, blocking on failure; each git hook runs `git-guard` before the checks | A matcher that matches nothing, a hook moved to PostToolUse, a command that only echoes, `onFailure: continue`, a git hook without `git-guard` |
| Voice lint | No banned term from `docs/voice.md` in the docs | A test line with a banned word; a sync test that every banned word is in `docs/voice.md` |
| Package guards intact | Exact pins, pnpm by hash, 60-day age, no scripts, no automatic installs, both hooks on | The ten weakenings above |
| Privacy lint | No private term in a file that git would publish | Runs only where `private-docs/privacy-terms.txt` exists (the owner's checkout); CI skips it |
| Golden sample views | The views and counts of the 8 sample files are unchanged | Any change to `count.mjs` output; an intended change re-pins with `update-golden` in the same commit |
| Known vulnerabilities | No locked package has a known vulnerability above low | `pnpm@10.0.0` (known advisories) fails the scanner |
| Unit tests: `code-scanning` | The two CodeQL findings of 2026-11-07 stay fixed: no package name changes a URL's host or path; `--min-age-days` is read only when present; HTML comments are found by the parser, so `<!--` in a script, an attribute or a textarea stays, and `<!-->` is an empty comment | `a/b/c`, `../../-/user` and `@scope/..` as names; a package named `5`; `<!<!---->--x`, `<!-->`, `<script>"<!--"</script>` and an unclosed comment, each of which a regex version got wrong (the parser cases skip where `bench/token-count` has no packages installed) |
| Code scanning (CodeQL) | No known unsafe pattern in the code that CodeQL can find | The two alerts of 2026-11-07, found in code that the unit tests and the reviews had passed |

## Added by later phases

Each phase adds its tests and, where it has a gate, a file in `tests/gates/`. The plan, from `CLAUDE.md` and
`docs/roadmap.md`:

| Phase | Tests added | Gate test |
|---|---|---|
| 1 | Vitest unit tests; fast-check property tests of the span patcher (CRLF, BOM, tabs, non-BMP, empty files); the module-boundary check; lint and format; CI on Windows, macOS and Linux | C1: every untouched byte identical over random edits |
| 2 | Index and map tests; golden maps of the sample corpus; hostile input (syntax errors, deep nesting, minified code, JSX in `.js`) | C2: index time and update time, as a timed run outside the test suite |
| 3 | A test per operation; a stale-edit refusal test per operation; rollback tests; formatter-range tests | C3: 200 scripted edits type-check or roll back |
| 4 | Path-confinement tests (`..`, absolute, UNC, `CON`, alternate data streams); a hostile-config test with a negative control; a fake-secret test; error-text tests; the tool-description token budget | C4: tool descriptions within N tokens |
| 5 | The benchmark harness's own tests | C5: tokens and pass rate (a measurement, checked by `analysis-checker`) |
| 6-8 | HTML re-parse tests; whitespace tests with inline elements and `<pre>`; selector-filter tests with `:is()`, `:where()`, `:has()` and nesting; browser computed-style comparisons | C6, C7, C8 |
| 9 | Fuzz targets for each parser input and the edit grammar; every crash becomes a regression test | – |
| 10 | The packed-tarball install test; provenance | – |
