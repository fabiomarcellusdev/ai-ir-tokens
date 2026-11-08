# Two follow-up measurements before the C0 decision (2026-11-08)

**W, the writing side:** not reached. Edit operations by address cost 14.5% fewer tokens than search and replace (median; threshold 40.0%).
**V, finer code views:** reached. The innermost unit saves 78.8% against the full files, with no map (median; threshold 65.0%).

**Conditions:** the 85 tasks of the 17 gate repositories in docs/measurements/2026-11-08-phase0-corpus.json; this repository's commit 665658701187ff5b84e4d33c0167b9fb7d70ef4a; tokenizer o200k_base (a proxy; the owner's choice); Node v24.22.1; git 2.56.0.windows.2; NOT timed.

**W beside the threshold:** spread 12.1% to 20.0%; edit operations against rewriting the files: median 88.6%. Search and replace costs 18.1% of the reading baseline (median), so a writing saving moves the total cost far less than a reading saving would.
**V beside the threshold:** spread 40.7% to 85.0%; V2, the floor (the changed lines with 3 lines of context): median 86.0%.

| Repository | Band | W: operations against search and replace | Operations against rewriting | Search and replace as a share of reading | V1 | V2 (floor) |
|---|---|---|---|---|---|---|
| dh1011/subscription-manager | small | 20.7% | 84.7% | 24.4% | 32.4% | 79.1% |
| excalidraw/excalidraw | medium | 14.3% | 91.1% | 12.6% | 84.7% | 91.3% |
| amicalhq/amical | medium | 11.1% | 88.0% | 15.6% | 85.0% | 91.3% |
| AmruthPillai/Reactive-Resume | large | 17.1% | 95.6% | 6.1% | 89.3% | 95.4% |
| homarr-labs/homarr | large | 13.1% | 92.7% | 9.0% | 27.6% | 92.6% |
| plasmicapp/plasmic | large | 20.4% | 97.0% | 4.0% | 97.3% | 98.6% |
| kyhsa93/nestjs-rest-cqrs-example | small | 9.3% | 55.3% | 71.7% | 51.9% | 66.9% |
| buqiyuan/nest-admin | medium | 14.5% | 71.2% | 36.7% | 79.1% | 81.2% |
| haiweilian/vivy-nest-admin | medium | 2.3% | 89.9% | 12.4% | 42.9% | 89.7% |
| TryGhost/Ghost | large | 20.0% | 84.7% | 19.8% | 86.7% | 85.1% |
| payloadcms/payload | large | 47.0% | 88.6% | 25.6% | 38.0% | 78.0% |
| GrapheneOS/grapheneos.org | small | 27.7% | 99.7% | 0.5% | 99.6% | 99.3% |
| 11ty/11ty-website | small | 13.2% | 88.6% | 22.2% | 78.8% | 86.0% |
| doka-guide/platform | medium | 17.9% | 91.0% | 18.1% | 84.3% | 83.7% |
| mdn/learning-area | medium | 3.8% | 90.5% | 11.3% | 36.3% | 86.4% |
| dlarroder/dalelarroder | small | 19.4% | 75.3% | 43.6% | 40.7% | 77.8% |
| nelsonlaidev/nelsonlai.dev | medium | 12.1% | 63.5% | 53.0% | 50.0% | 70.1% |

**First-pass limits, written down:** search and replace adds whole lines of context until the old text is unique, as an agent must; an agent may add more. An edit operation addresses the top-level declaration that holds its hunk (the file, for HTML, CSS and code between declarations). V1 uses the compact view (the whole file's compact edits inside the unit); a CSS rule with nested rules, and changed lines that no unit holds, go in as written. Neither measurement shows finding the code or accuracy.
