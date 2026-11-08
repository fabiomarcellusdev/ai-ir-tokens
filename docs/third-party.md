# Third-party register

Every dependency, tool, font and corpus repository: its version, licence, publish date, known vulnerabilities, and
whether it ships in the npm package. **This is not a legal review.**

The rules for adding and updating a package are in decision 0002: exact versions, 60 days old or more, no known
vulnerability above low, and the owner's yes for each install. "Known vulnerabilities" comes from
`node tools/osv-check.mjs` (osv.dev), with its date.

## Measurement script (`bench/token-count`, does not ship)

Licences read from each package's `package.json` on 2026-11-07. Vulnerabilities checked 2026-11-07: none known.

| Component | Version | Published | Licence | Ships | Notes |
|---|---|---|---|---|---|
| js-tiktoken | 1.0.21 | 2025-08-09 | MIT | No | OpenAI's tokenizers for JavaScript |
| typescript | 5.9.3 | 2025-09-30 | Apache-2.0 | No | Will ship as a dependency of the package (phase 2) |
| parse5 | 7.3.0 | 2025-04-22 | MIT | No | Will ship (phase 7) |
| postcss | 8.5.28 | 2026-09-03 | MIT | No | Will ship (phase 8). Was 8.5.32, then 8.5.29, both too young (decision 0002) |
| base64-js | 1.5.1 | 2020-11-11 | MIT | No | Through js-tiktoken |
| entities | 6.0.1 | 2025-06-08 | BSD-2-Clause | No | Through parse5 |
| nanoid | 3.3.18 | 2026-08-07 | MIT | No | Through postcss |
| picocolors | 1.1.1 | 2024-10-16 | ISC | No | Through postcss |
| source-map-js | 1.2.2 | 2026-09-30 | BSD-3-Clause | No | Through postcss. **Security exception until 2026-11-29:** 1.2.1 has GHSA-68fv-2mgg-jv7q (high); 1.2.2 is the fix (decision 0002) |

## Tools

| Component | Version | Published | Licence | Ships | Notes |
|---|---|---|---|---|---|
| pnpm | 12.3.4 | 2026-09-04 | MIT | No | The only package manager (decision 0002). Pinned by SHA-512 in `bench/token-count/package.json`; run through Corepack. No known vulnerabilities (2026-11-07). |
| @pnpm/exe.win32-x64 (and the other platforms) | 12.3.4 | 2026-09-04 | MIT | No | pnpm 12's native program. Pinned by hash in `pnpm-lock.yaml`; on 2026-11-07 that hash matched the registry and a separate download, and the program on disk matched the package. |

## Adapted text (`.claude/skills/`, does not ship)

| Component | Version | Licence | Notes |
|---|---|---|---|
| mattpocock/skills: `grilling`, `diagnosing-bugs`, `tdd` (with `tests.md`), `wait-what` | Commit `49dd158` (plugin 1.3.1) | MIT | Adapted to this project's rules, not installed as a plugin (decision 0003, amendment "mattpocock-skills"). The licence text is in `.claude/skills/LICENSE.mattpocock-skills.txt`. |

## CI (`.github/workflows/checks.yml`, does not ship)

| Component | Version | Published | Licence | Notes |
|---|---|---|---|---|
| actions/checkout | v7.0.1 (`3d3c42e5aac5ba805825da76410c181273ba90b1`) | 2026-07-20 | MIT | Pinned by commit hash; no known advisory (OSV, 2026-11-07) |
| actions/setup-node | v7.0.0 (`820762786026740c76f36085b0efc47a31fe5020`) | 2026-07-14 | MIT | Pinned by commit hash; no known advisory (OSV, 2026-11-07) |
| Node.js | 24.22.1 | 2026-10-20 | MIT | **Security exception:** 24.21.0 has high CVEs; 24.22.1 meets the 60-day rule from 2026-12-19 |

## Update candidates

None researched yet. Each row: the package, the candidate version and its publish date, the research date, the
findings, and the owner's answer (decision 0002, "Updating a package").

## The plan page (`docs/page`, does not ship)

| Component | Licence | Notes |
|---|---|---|
| Bricolage Grotesque, Source Sans 3, JetBrains Mono | SIL Open Font License 1.1 | Loaded from Google Fonts by the published page; not stored here |
| Mermaid (the page's flowchart) | MIT | The source has no script tag; the page's host draws the `pre.mermaid` block |

## Corpus repositories (phase 0)

None yet. Each repository gets a row: its URL, the pinned commit, its licence, and a note that it is fetched, never
copied into this repository.
