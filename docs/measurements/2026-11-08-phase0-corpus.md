# Phase 0 corpus run (2026-11-08)

**Gate C0:** miss (median saving -165.8%, threshold 50%).

**Conditions:** 17 of 17 gate repositories with 3 tasks or more; this repository's commit 8b249b0276e5c14912bfd0a0d23744df8390a287; tokenizers: o200k_base; Anthropic count_tokens (claude-opus-5-5, anthropic-version 2023-06-01); Node v24.22.1; git 2.56.0.windows.2; NOT timed.

Both sides know which files each commit changed, so this measures the cost of reading, not of finding (docs/contract.md). Anthropic's count includes a small fixed overhead per message on both sides, which makes the saving slightly smaller, not larger.

**Replacements:** raouf-b-dev/ecommerce-store-api by haiweilian/vivy-nest-admin (only 2 qualifying commits in its whole history); alphagov/govuk-design-system by GrapheneOS/grapheneos.org (0 qualifying commits in 500; its commits change templates and content).

| Repository | Role | Band | Tasks | Median saving (Claude) | Median saving (o200k) | With the whole map (o200k) | Note |
|---|---|---|---|---|---|---|---|
| dh1011/subscription-manager | gate | small | 5 | -47.5% | -53.8% | -75.9% |  |
| excalidraw/excalidraw | gate | medium | 5 | -514.9% | -530.3% | -2994.4% |  |
| amicalhq/amical | gate | medium | 5 | -129.1% | -119.2% | -1635.4% |  |
| AmruthPillai/Reactive-Resume | gate | large | 5 | -41.6% | -18.3% | -5885.6% |  |
| homarr-labs/homarr | gate | large | 5 | -165.8% | -167.9% | -2803.3% | the history ends after 361 commits (the repository is younger, or the clone is too shallow) |
| plasmicapp/plasmic | gate | large | 5 | -202.6% | -205.8% | -18140.1% |  |
| kyhsa93/nestjs-rest-cqrs-example | gate | small | 5 | -156.0% | -187.3% | -3268.5% |  |
| buqiyuan/nest-admin | gate | medium | 5 | -101.6% | -110.3% | -2733.3% |  |
| haiweilian/vivy-nest-admin | gate | medium | 5 | -397.1% | -393.6% | -5389.0% |  |
| TryGhost/Ghost | gate | large | 5 | -436.1% | -419.0% | -29749.2% |  |
| payloadcms/payload | gate | large | 5 | -1053.4% | -1039.9% | -28319.8% |  |
| GrapheneOS/grapheneos.org | gate | small | 5 | 59.0% | 55.6% | -2.2% | 53 commits skipped (see "skipped") |
| 11ty/11ty-website | gate | small | 5 | -230.5% | -229.7% | -636.0% |  |
| doka-guide/platform | gate | medium | 5 | -7.0% | -12.9% | -514.4% |  |
| mdn/learning-area | gate | medium | 5 | -246.8% | -225.7% | -6985.2% |  |
| dlarroder/dalelarroder | gate | small | 5 | -63.7% | -57.0% | -601.4% |  |
| nelsonlaidev/nelsonlai.dev | gate | medium | 5 | -279.4% | -318.5% | -9078.0% |  |
| Smaug6739/Alexandrie | sizing | medium | 5 | -68.7% | -53.7% | -515.8% |  |
| talen8/FlecBlog | sizing | medium | 5 | -29.0% | -28.5% | -326.6% |  |
| syntaxfm/website | sizing | medium | 5 | -139.7% | -133.9% | -1561.6% |  |

**Spread over the gate repositories (Claude (claude-opus-5-5)):** lower quartile -279.4%, median -165.8%, upper quartile -63.7%.
**The same with o200k_base:** lower quartile -318.5%, median -187.3%, upper quartile -57.0%.
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
| haiweilian/vivy-nest-admin | 76.5% | 9.4% | 8.7% | 4.6% | 0.0% |
| TryGhost/Ghost | 64.8% | 13.5% | 11.2% | 2.1% | 0.0% |
| payloadcms/payload | 84.0% | 5.4% | 7.5% | 1.1% | 0.0% |
| GrapheneOS/grapheneos.org | 0.5% | 96.4% | 3.1% | 0.0% | 0.0% |
| 11ty/11ty-website | 1.3% | 78.1% | 20.4% | 0.2% | 0.0% |
| doka-guide/platform | 4.0% | 42.3% | 45.8% | 8.5% | 0.4% |
| mdn/learning-area | 65.8% | 16.6% | 17.1% | 0.0% | 0.0% |
| dlarroder/dalelarroder | 8.4% | 41.7% | 32.0% | 4.1% | 0.0% |
| nelsonlaidev/nelsonlai.dev | 38.6% | 54.8% | 11.7% | 1.6% | 0.0% |
| Smaug6739/Alexandrie | 15.4% | 17.4% | 65.0% | 0.6% | 0.0% |
| talen8/FlecBlog | 10.6% | 14.9% | 71.1% | 0.2% | 0.0% |
| syntaxfm/website | 44.3% | 21.0% | 36.9% | 2.0% | 0.0% |

**Worst repository:** payloadcms/payload (-1053.4%). **Worst task:** payloadcms/payload e71e91c66f (-7718.3%).

**By category (Claude (claude-opus-5-5)):** react-app -147.5%, node-service-decorators -156.0%, node-service -744.7%, static-site -118.8%, tailwind-site -171.5%.
**By size band (Claude (claude-opus-5-5)):** small -63.7%, medium -246.8%, large -202.6%.
**Names not resolved** (each charged one typical map line on the layer side): 29.

**Vue and Svelte apps (sizing, not in the gate):** Smaug6739/Alexandrie 5 tasks, median -53.7% (o200k), 8 .vue or .svelte files read whole; talen8/FlecBlog 5 tasks, median -28.5% (o200k), 9 .vue or .svelte files read whole; syntaxfm/website 5 tasks, median -133.9% (o200k), 2 .vue or .svelte files read whole.

**First-pass limits, written down:** the signatures come from names, through relative imports, the root tsconfig's `paths` and `baseUrl`, workspace packages and up to 3 re-exports; a name that cannot be resolved is charged one typical map line. A changed class or component counts in full. The whole-repository map is o200k only, the sum of the per-file maps. Files over 1 MB are not read.
