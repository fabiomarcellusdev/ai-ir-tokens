# 0002. pnpm only, pinned and vetted packages, and every install needs the owner's approval

**Status:** Accepted (owner, 2026-11-07). In force: pnpm 12.3.4 installed the measurement script's packages on
2026-11-07 under the 60-day rule.

## Context

The owner set these rules (2026-11-07):

1. Use only pnpm to install packages.
2. Use only fixed, pinned versions with no known vulnerabilities, or low ones only.
3. Freeze every package at a version that has been public for at least two months (60 days). Research an update only
   when it is that old, and update only with the owner's manual approval.
4. No package installs without the owner's explicit approval.

An npm package can run code on the machine when it installs (install scripts). A new release of a popular package can
be malicious for a few days before it is found and removed. The quality playbook (section 12) already asks for exact
versions, a committed lockfile, installs with `--ignore-scripts`, a vulnerability scan, and npm provenance.

**No check makes a package safe.** The rules below lower the risk and make each install a visible decision.

## Options

| Option | What it gives | Cost |
|---|---|---|
| A. A rule in `CLAUDE.md` only | Simple | Nothing checks it. An agent can forget it. |
| B. A rule, pnpm's safety settings, a vulnerability check, and a hook in Claude Code | The package manager refuses young and risky packages; a script finds known vulnerabilities; the hook stops other package managers and holds every install for approval | Two small scripts and their tests to keep |
| C. B plus a private registry proxy that scans packages | Strongest | A service to run; too much for one developer now |

## Decision

Option B.

### pnpm only

- `package.json` names pnpm 12.3.4 with its SHA-512 hash in `packageManager`, and in `devEngines.packageManager` with
  `onFail: error`. The lockfile is `pnpm-lock.yaml`. It also pins pnpm itself and its native program.
- **npm refuses to run in the project folder** (tested 2026-11-07, npm 11.19.0: `EBADDEVENGINES`). npx, Yarn and Bun
  are refused by the hook.
- pnpm runs through Corepack (it comes with Node 24) where pnpm is not on the path: `corepack pnpm <command>`. Corepack
  checks pnpm's hash before it runs pnpm.

### pnpm's settings

In `bench/token-count/pnpm-workspace.yaml`; phase 1 moves them to the repository root.

| Setting | Value | Why |
|---|---|---|
| `minimumReleaseAge` | 86400 (60 days) | A version is not installed until it is 60 days old. Most malicious releases are removed within days. It applies to transitive packages too, and pnpm also checks an existing lockfile against it. |
| `minimumReleaseAgeExclude` | security exceptions only | A fix younger than 60 days for a known vulnerability, with the owner's yes. Each entry has a removal date in a comment; `tools/check.mjs` fails after that date. |
| `minimumReleaseAgeStrict` | true | Fail instead of falling back to a younger release. |
| `trustPolicy` | `no-downgrade` | Fail if a release is published with less trust than earlier ones (for example, without provenance). |
| `blockExoticSubdeps` | true | Only direct dependencies may come from git or a tarball URL. |
| `strictDepBuilds`, `allowBuilds: {}`, `ignoreScripts` | true, none, true | No dependency runs an install script. |
| `verifyDepsBeforeRun` | `error` | pnpm's default (`install`) installs packages on its own before `pnpm run`. |
| `autoInstallPeers` | false | pnpm's default installs missing peer dependencies on its own. |
| `pmOnFail` | `error` | pnpm's default (`download`) downloads another pnpm version on its own. |
| `saveExact`, `engineStrict`, `strictPeerDependencies` | true | Exact versions; refuse packages that do not fit. |

### The vulnerability limit

- **No known vulnerability above low.** A version with a known moderate, high, critical or unrated vulnerability is not
  installed. A low one needs the owner's yes and a note in `docs/third-party.md`.
- `tools/osv-check.mjs` checks every package in a lockfile against the OSV database (osv.dev), which collects the
  GitHub advisories and others. It exits 1 above low. A negative control (pnpm 10.0.0, which has known advisories)
  shows that it fails. `pnpm audit` is a second source.
- Run the check before every install or update, and at least once a month. When an advisory appears for a pinned
  version, report it to the owner the same day.

### The hook

`.claude/hooks/package-guard.mjs` runs before every Bash and PowerShell command (`.claude/settings.json`). It refuses
npm installs, npx, Yarn and Bun. It asks the owner before any pnpm, Corepack, winget, pip or PowerShell module
install, also inside `bash -c`, `cmd /c` and a ` -- ` wrapper. Its tests run with
`node --test ".claude/hooks/*.test.mjs"` and need no install. Permission rules in the same file are a second layer for
the Bash tool.

### Adding a package: the vetting checklist

An agent completes this and shows it to the owner before it asks to add a package:

1. Why the package is needed, and why the standard library or code already here cannot do it.
2. The exact version, and its publish date (60 days old or more).
3. Its licence (MIT, Apache-2.0, BSD or ISC; anything else goes to the owner first).
4. Its maintainers, weekly downloads, the date of its last release, and any recent change of maintainer.
5. The new packages it brings in, with their ages and licences (`npm view <pkg> dependencies`, run outside a project
   folder).
6. Whether it has an install script, and whether it is published with npm provenance.
7. Known vulnerabilities of it and of every package it brings in (OSV; `tools/osv-check.mjs` after a lockfile-only
   resolution).
8. Its row for `docs/third-party.md`.

### Updating a package: the procedure

Nothing updates by itself. There is no automatic update tool and no update pull request. pnpm's "Update available"
notice is ignored.

1. **When:** once a month, or the same day an advisory names a pinned version.
2. **Candidates:** versions 60 days old or more (`pnpm outdated` lists newer versions; read-only).
3. **Research each candidate:** the changelog between the two versions, known vulnerabilities (OSV), maintainer
   changes, new or changed dependencies, new install scripts, provenance, and the size of the change.
4. **Report** to the owner: the candidate, what it fixes or adds, the risks, and a recommendation. Record the
   candidate and its research date in `docs/third-party.md`.
5. **Wait for the owner's yes** for each package. Then pin the exact version, install under the machine rules, run
   the tests and `tools/osv-check.mjs`, and re-run any measurement whose parser changed.

**The security exception:** if a pinned version gets an advisory above low and the fixed version is younger than 30
days, the owner decides. A yes adds the package to `minimumReleaseAgeExclude` with a dated note here, and the
exclusion is removed when the version turns 60 days old. `tools/check.mjs` reads the removal date and fails after it.

**Why both rules, and why they can clash:** an old version has had time to be checked by others, but it has also had
time for vulnerabilities to be found in it. The 60-day rule guards against a new malicious release; the
vulnerability rule guards against known flaws in old ones. When the only clean version is younger than 60 days, the
security exception decides. Expect this case a few times a year.

## Rejected

- **Option A:** a rule nothing checks is a wish (playbook: "it works" is a set of checks that can fail).
- **Option C:** a registry proxy is a service to run. Revisit if the project gets outside contributors.
- **`npx only-allow pnpm` as a `preinstall` script:** it downloads a package to stop downloads, and installs run with
  `--ignore-scripts`, so it would not run.
- **An automatic update tool that opens pull requests** (Renovate, Dependabot version updates): the owner approves
  each update by hand. Security alerts that only notify are allowed once the repository is on GitHub.

## Limits

- The hook reads the command text. A command inside a script file, an alias or an encoded string is not seen. Claude
  Code's permission prompt, `devEngines` and pnpm's settings remain as further layers.
- OSV knows only reported vulnerabilities. A new malicious release is not in it; the 30-day age is the guard for that.
- pnpm 12 is a launcher that downloads a native program (`@pnpm/exe.<platform>`). The lockfile pins its hash. On
  2026-11-07 the hash in the lockfile, the registry's hash and a separate download agreed, and the program on disk
  matched the program in the package.
- The 30-day age delays security fixes. The security exception above handles that.

## What would reopen this

- pnpm changes the meaning or the default of a setting above (check at each pnpm update).
- A malicious package passes these checks.
- Outside contributors join (option C, and the release hat in `docs/future-hats.md`).

## Amendments

- **2026-11-07 (owner):** the minimum age went from 14 days to 30 days, and the vulnerability limit and the update
  procedure were added. pnpm went from 12.15.0 (17 days old) to 12.10.1 (32 days old, no known vulnerabilities).
  postcss went from 8.5.32 (12 days old) to 8.5.29 (33 days old, no known vulnerabilities). The sample measurement
  gave the same numbers with 8.5.29 (`docs/measurements/2026-11-07-pnpm-rerun.md`).
- **2026-11-07 (owner), later the same day:** the minimum age went from 30 days to **60 days**. pnpm went to 12.3.4
  (64 days old), postcss to 8.5.28 (65 days old) and nanoid to 3.3.18 (92 days old); none has a known vulnerability.
  **The first security exception:** the only source-map-js version 60 days old or more, 1.2.1, has GHSA-68fv-2mgg-jv7q
  (high; a denial of service through indexed source maps). The fix, 1.2.2, was 38 days old. The owner accepted the
  recommendation to keep 1.2.2 under `minimumReleaseAgeExclude` until 2026-11-29. pnpm refused the old lockfile under
  the new rule (`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` for postcss 8.5.29 and nanoid 3.3.20), which showed that the
  rule also checks existing lockfiles; the lockfile was rebuilt. The sample measurement gave the same numbers again.
- **2026-11-07:** the vetting checklist's machine part is `tools/vet-package.mjs`, and the procedures are the
  `vet-package` and `monthly-update-review` skills (decision 0003).
- **2026-11-07:** the rules also cover CI. GitHub Actions are pinned by full commit hash and vetted like packages.
  **The second security exception:** CI uses Node 24.22.1 (18 days old), because 24.21.0 has high-severity CVEs in
  TLS, DNS and brotli. It meets the 60-day rule from 2026-12-19.
