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

Fetched by `bench/token-count/corpus.mjs` at the pinned commit, never copied into this repository. The full pins are in
`bench/token-count/corpus.json`. Approved by the owner on 2026-11-08; the pins, licences and file counts were read from
GitHub's API that day. "Files" are source files the script can read.

| Repository | Category | Role | Pin | Licence | Files (band) | Note |
|---|---|---|---|---|---|---|
| [dh1011/subscription-manager](https://github.com/dh1011/subscription-manager) | react-app | gate | `6b07d95b174b` | MIT | 50 (small) | |
| [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw) | react-app | gate | `701b901a0f1b` | MIT | 723 (medium) | |
| [amicalhq/amical](https://github.com/amicalhq/amical) | react-app | gate | `029290c0424e` | MIT | 790 (medium) | |
| [AmruthPillai/Reactive-Resume](https://github.com/AmruthPillai/Reactive-Resume) | react-app | gate | `09553e35b093` | MIT | 2103 (large) | |
| [homarr-labs/homarr](https://github.com/homarr-labs/homarr) | react-app | gate | `38cfcb3fa1a3` | Apache-2.0 | 3064 (large) | |
| [plasmicapp/plasmic](https://github.com/plasmicapp/plasmic) | react-app | gate | `9ad5048494af` | MIT | 6152 (large) | |
| [kyhsa93/nestjs-rest-cqrs-example](https://github.com/kyhsa93/nestjs-rest-cqrs-example) | node-service-decorators | gate | `da66be5d5868` | MIT | 132 (small) | An example project; the only small NestJS service with recent work (owner's yes, 2026-11-08). |
| [buqiyuan/nest-admin](https://github.com/buqiyuan/nest-admin) | node-service-decorators | gate | `5b549e540d52` | MIT | 242 (medium) | |
| [raouf-b-dev/ecommerce-store-api](https://github.com/raouf-b-dev/ecommerce-store-api) | node-service-decorators | gate | `0470229729f7` | MIT | 1220 (medium) | |
| [TryGhost/Ghost](https://github.com/TryGhost/Ghost) | node-service | gate | `940de5ca5140` | MIT | 7441 (large) | |
| [payloadcms/payload](https://github.com/payloadcms/payload) | node-service | gate | `25dfb248a869` | MIT | 8484 (large) | |
| [alphagov/govuk-design-system](https://github.com/alphagov/govuk-design-system) | static-site | gate | `6c7e2b5730bf` | MIT | 93 (small) | |
| [11ty/11ty-website](https://github.com/11ty/11ty-website) | static-site | gate | `e8acd582f1d9` | MIT | 158 (small) | |
| [doka-guide/platform](https://github.com/doka-guide/platform) | static-site | gate | `2b7f01274a0f` | MIT | 228 (medium) | |
| [mdn/learning-area](https://github.com/mdn/learning-area) | static-site | gate | `21973263ba85` | CC0-1.0 | 254 (medium) | CC0, outside the agreed licence list, and teaching material; plain HTML and CSS (owner's yes, 2026-11-08). |
| [dlarroder/dalelarroder](https://github.com/dlarroder/dalelarroder) | tailwind-site | gate | `f8a46cb618d1` | MIT | 103 (small) | |
| [nelsonlaidev/nelsonlai.dev](https://github.com/nelsonlaidev/nelsonlai.dev) | tailwind-site | gate | `c0d625e37123` | MIT | 354 (medium) | |
| [Smaug6739/Alexandrie](https://github.com/Smaug6739/Alexandrie) | vue-app | sizing | `33e4bb2dcbe4` | MIT | 482 (medium) | |
| [talen8/FlecBlog](https://github.com/talen8/FlecBlog) | vue-app | sizing | `fab601f0d223` | MIT | 375 (medium) | |
| [syntaxfm/website](https://github.com/syntaxfm/website) | svelte-app | sizing | `e9bc82e73721` | MIT | 280 (medium) | |
| [haiweilian/vivy-nest-admin](https://github.com/haiweilian/vivy-nest-admin) | node-service-decorators | reserve | `ab6a057eed3a` | MIT | 413 (medium) | |
| [umami-software/umami](https://github.com/umami-software/umami) | react-app | reserve | `559e3c607c23` | MIT | 1405 (medium) | |
| [CookSleep/gpt_image_playground](https://github.com/CookSleep/gpt_image_playground) | react-app | reserve | `6f8f44dadf77` | MIT | 261 (medium) | |
| [ncdai/chanhdai.com](https://github.com/ncdai/chanhdai.com) | tailwind-site | reserve | `fa14d28a2606` | MIT | 658 (medium) | |
| [hoppscotch/hoppscotch](https://github.com/hoppscotch/hoppscotch) | vue-app | reserve | `55908a76a1d0` | MIT | 1593 (medium) | |
