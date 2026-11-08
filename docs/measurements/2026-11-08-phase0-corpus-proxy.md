# Phase 0 corpus run (2026-11-08)

**Gate C0:** no result: proxy only.

**Proxy only:** --proxy-only. The numbers below are o200k_base, a proxy; the gate has no result until Anthropic's counter has counted them.

**Conditions:** 15 of 17 gate repositories with 3 tasks or more; this repository's commit 05b9ccee5e0d90ca098208bdce1a1976f9509e24; tokenizers: o200k_base; Node v24.22.1; git 2.56.0.windows.2; NOT timed.

Both sides know which files each commit changed, so this measures the cost of reading, not of finding (docs/contract.md). Anthropic's count includes a small fixed overhead per message on both sides, which makes the saving slightly smaller, not larger.

| Repository | Role | Band | Tasks | Median saving (Claude) | Median saving (o200k) | With the whole map (o200k) | Note |
|---|---|---|---|---|---|---|---|
| dh1011/subscription-manager | gate | small | 5 | – | -53.8% | -75.9% |  |
| excalidraw/excalidraw | gate | medium | 5 | – | -530.3% | -2994.4% |  |
| amicalhq/amical | gate | medium | 5 | – | -119.2% | -1635.4% |  |
| AmruthPillai/Reactive-Resume | gate | large | 5 | – | -18.3% | -5885.6% |  |
| homarr-labs/homarr | gate | large | 5 | – | -167.9% | -2803.3% | the history ends after 361 commits (the repository is younger, or the clone is too shallow) |
| plasmicapp/plasmic | gate | large | 5 | – | -205.8% | -18140.1% |  |
| kyhsa93/nestjs-rest-cqrs-example | gate | small | 5 | – | -187.3% | -3268.5% |  |
| buqiyuan/nest-admin | gate | medium | 5 | – | -110.3% | -2733.3% |  |
| raouf-b-dev/ecommerce-store-api | gate | medium | 2 | – | -986.4% | -15763.0% | fewer than 3 qualifying commits in 160 walked: replace with a reserve |
| TryGhost/Ghost | gate | large | 5 | – | -419.0% | -29749.2% |  |
| payloadcms/payload | gate | large | 5 | – | -1039.9% | -28319.8% |  |
| alphagov/govuk-design-system | gate | small | 0 | – | – | – | fewer than 3 qualifying commits in 500 walked: replace with a reserve |
| 11ty/11ty-website | gate | small | 5 | – | -229.7% | -636.0% |  |
| doka-guide/platform | gate | medium | 5 | – | -12.9% | -514.4% |  |
| mdn/learning-area | gate | medium | 5 | – | -225.7% | -6985.2% |  |
| dlarroder/dalelarroder | gate | small | 5 | – | -57.0% | -601.4% |  |
| nelsonlaidev/nelsonlai.dev | gate | medium | 5 | – | -318.5% | -9078.0% |  |
| Smaug6739/Alexandrie | sizing | medium | 5 | – | -53.7% | -515.8% |  |
| talen8/FlecBlog | sizing | medium | 5 | – | -28.5% | -326.6% |  |
| syntaxfm/website | sizing | medium | 5 | – | -133.9% | -1561.6% |  |

**Spread over the gate repositories (o200k_base):** lower quartile -274.1%, median -187.3%, upper quartile -83.7%.
**With the whole-repository map instead of the folder map (o200k):** median -2994.4%.
**The code needed and its signatures alone, without any map (o200k; beside the gate, never in its place):** median 28.6%.

**Where the layer's tokens go** (the median share of each part, per repository, o200k):

| Repository | Folder overview | Folder maps | Code needed | Signatures | Unresolved charge |
|---|---|---|---|---|---|
| dh1011/subscription-manager | 1.4% | 48.9% | 47.1% | 4.5% | 0.1% |
| excalidraw/excalidraw | 2.4% | 93.4% | 2.9% | 1.3% | 0.0% |
| amicalhq/amical | 15.1% | 49.5% | 20.3% | 1.6% | 0.0% |
| AmruthPillai/Reactive-Resume | 27.7% | 42.9% | 20.4% | 1.3% | 0.0% |
| homarr-labs/homarr | 79.3% | 8.2% | 10.3% | 4.1% | 0.0% |
| plasmicapp/plasmic | 70.8% | 28.2% | 1.0% | 0.0% | 0.0% |
| kyhsa93/nestjs-rest-cqrs-example | 30.0% | 38.4% | 13.1% | 20.0% | 0.0% |
| buqiyuan/nest-admin | 25.5% | 27.5% | 32.2% | 14.7% | 0.0% |
| raouf-b-dev/ecommerce-store-api | 61.1% | 11.9% | 4.5% | 22.5% | 0.0% |
| TryGhost/Ghost | 64.8% | 13.5% | 11.2% | 2.1% | 0.0% |
| payloadcms/payload | 84.0% | 5.4% | 7.5% | 1.1% | 0.0% |
| alphagov/govuk-design-system | – | – | – | – | – |
| 11ty/11ty-website | 1.3% | 78.1% | 20.4% | 0.2% | 0.0% |
| doka-guide/platform | 4.0% | 42.3% | 45.8% | 8.5% | 0.4% |
| mdn/learning-area | 65.8% | 16.6% | 17.1% | 0.0% | 0.0% |
| dlarroder/dalelarroder | 8.4% | 41.7% | 32.0% | 4.1% | 0.0% |
| nelsonlaidev/nelsonlai.dev | 38.6% | 54.8% | 11.7% | 1.6% | 0.0% |
| Smaug6739/Alexandrie | 15.4% | 17.4% | 65.0% | 0.6% | 0.0% |
| talen8/FlecBlog | 10.6% | 14.9% | 71.1% | 0.2% | 0.0% |
| syntaxfm/website | 44.3% | 21.0% | 36.9% | 2.0% | 0.0% |

**Worst repository:** payloadcms/payload (-1039.9%). **Worst task:** payloadcms/payload e71e91c66f (-5355.1%).

**By category (o200k_base):** react-app -143.6%, node-service-decorators -148.8%, node-service -729.5%, static-site -225.7%, tailwind-site -187.7%.
**By size band (o200k_base):** small -122.1%, medium -172.4%, large -205.8%.
**Names not resolved** (each charged one typical map line on the layer side): 29.

**Vue and Svelte apps (sizing, not in the gate):** Smaug6739/Alexandrie 5 tasks, median -53.7% (o200k), 8 .vue or .svelte files read whole; talen8/FlecBlog 5 tasks, median -28.5% (o200k), 9 .vue or .svelte files read whole; syntaxfm/website 5 tasks, median -133.9% (o200k), 2 .vue or .svelte files read whole.

**Need a reserve (fewer than 3 tasks):** raouf-b-dev/ecommerce-store-api, alphagov/govuk-design-system.

**First-pass limits, written down:** the signatures come from names, through relative imports, the root tsconfig's `paths` and `baseUrl`, workspace packages and up to 3 re-exports; a name that cannot be resolved is charged one typical map line. A changed class or component counts in full. The whole-repository map is o200k only, the sum of the per-file maps. Files over 1 MB are not read.
