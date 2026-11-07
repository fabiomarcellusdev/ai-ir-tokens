# Roadmap

One repository, one npm package with a CLI and an MCP server. The estimates are for one developer working full time,
about 27 weeks in all. **They are estimates, not measurements** (planning session, 2026-11-06).

Two phases are decision points: **phase 0** checks that the savings hold on real code before anything is built, and
**phase 5** checks that a model passes tasks as often with the layer as without it. The project continues only if
each gate holds. The gates' exact numbers are in `docs/contract.md`.

| Phase | Name | Weeks | Decision point |
|---|---|---|---|
| 0 | Measure before building | 2 | Yes |
| 1 | Skeleton and core | 2 | |
| 2 | TypeScript and JavaScript: reading | 3 | |
| 3 | TypeScript and JavaScript: editing | 3 | |
| 4 | MCP server and CLI (0.1 preview) | 2 | |
| 5 | Benchmark: tokens and accuracy | 3 | **Yes: go or no-go** |
| 6 | JSX and TSX | 2 | |
| 7 | HTML | 3 | |
| 8 | CSS | 2 | |
| 9 | Hardening | 3 | |
| 10 | Release 1.0 | 2 | |

## Planned repository layout

```
src/
  core/        addresses, edit-operation grammar, span patcher, hashes, index store
  lang/ts/     TypeScript compiler API: map, views, operations, rename, tsc check
  lang/html/   parse5: map, compact view, elision, operations
  lang/css/    PostCSS: map, plain view, selector filter, operations
  format/      Prettier or Biome on changed ranges only
  server/      MCP server (tools: map, read, search, edit, check, undo)
  cli/         the same tools from the shell, plus `bench`
bench/
  corpus/      pinned list of public repositories (by commit; fetched, never copied in)
  tasks/       task sets (the TypeScript subset of SWE-PolyBench, own HTML and CSS tasks)
  token-count/ the measurement script, grown into the token harness
tests/         unit tests, round-trip property tests (fast-check), fuzz targets
docs/spec/     the views and the edit grammar
```

---

## Phase 0. Measure before building (2 weeks)

Repeat the sample measurement on real code before writing the product.

**Work**
- Run `bench/token-count/count.mjs` on 20 public repositories pinned by commit: React apps, Node services, static
  sites and a Tailwind site.
- Count with Anthropic's token-counting endpoint as well as tiktoken.
- Add the cases the sample lacked: decorators, enums, overloads, and Vue and Svelte templates (to size later work).
- Write task scenarios for the real repositories, so the "map plus code needed" column has real tasks.

**Deliverable:** a results file in `docs/measurements/` and a short report.

**Gate (C0):** map plus code needed is at least 50% smaller than the files an agent opens for the same task, on the
median repository. If not, stop or rescope.

## Phase 1. Skeleton and core (2 weeks)

The parts every language shares.

**Work**
- The package: TypeScript build, Vitest, ESLint, a formatter, the module-boundary check, CI on Windows, macOS and
  Linux, and the licence field in `package.json` (Apache-2.0, decision 0006).
- The address scheme and the edit-operation grammar, written as a spec in `docs/spec/` first.
- The span patcher: it applies edits to the original text, refuses overlaps, and keeps everything else byte for byte.
- Content hashes and the refusal of a stale edit.

**Gate (C1):** property tests apply random edits to random files, and every untouched byte stays identical, every time.

## Phase 2. TypeScript and JavaScript: reading (3 weeks)

**Work**
- An index built with the TypeScript compiler API, updated when a file changes. It respects `tsconfig`, `.gitignore`
  and generated files.
- The map per file and per folder, with signatures, exports and line ranges.
- The plain view, and a read by address (function, class, method, type).
- `search`: find symbols and references through the language service.

**Gate (C2):** the index of a 5,000-file repository builds in under 30 seconds and updates in under 200 ms after a
save. These are targets; measure them and name the machine.

## Phase 3. TypeScript and JavaScript: editing (3 weeks)

**Work**
- The operations: `replace`, `insert-before`, `insert-after`, `delete`, `replace-in`, and `rename` through the language
  service.
- Formatting of changed ranges only, with the project's own Prettier or Biome settings.
- The check: `tsc --noEmit` on the affected project, ESLint if configured and allowed (hat 4), and a rollback on
  failure, with errors mapped to addresses.
- Undo of the last edit batch.

**Gate (C3):** on 200 scripted edits across the phase-0 repositories, every applied edit type-checks or is rolled back,
and no untouched byte changes.

## Phase 4. MCP server and CLI (2 weeks)

**Work**
- An MCP server over stdio with six tools: `map`, `read`, `search`, `edit`, `check`, `undo`. Short tool descriptions,
  since they are sent with every request.
- The same tools as CLI commands.
- Set-up guides for Claude Code, Cursor and VS Code.
- Safety: paths confined to the workspace, no project scripts run, file sizes limited.

**Deliverable:** a first preview release (0.1) for TypeScript and JavaScript only.

## Phase 5. Benchmark: tokens and accuracy (3 weeks)

The phase that decides whether the project continues.

**Work**
- Run the TypeScript tasks of SWE-PolyBench with one agent twice: once with its normal file tools, once with this
  server. Use the same model and the same prompts.
- Record input tokens, output tokens, cost (with caching), time and pass rate.
- A/B the open choices: TypeScript with and without indentation, comments kept or removed.

**Gate (C5):** total tokens at least 40% lower, with a pass rate no more than 1 point lower. These thresholds are
tentative; fix them, the number of runs and the analysis before the run. If tokens fall but the pass rate falls more,
simplify the views and run again.

## Phase 6. JSX and TSX (2 weeks)

**Work**
- The Pug-style view for JSX, and element paths inside components as addresses.
- Operations on JSX elements and attributes.
- An A/B against plain JSX on the benchmark's React tasks.

**Gate (C6):** the compact view stays only if its pass rate is within 1 point of plain JSX.

## Phase 7. HTML (3 weeks)

**Work**
- A parse5 index, a map of landmarks and headings, and the compact view.
- Elision of inline SVG and `data:` URIs, readable on request.
- Operations: `text`, attributes (`set`, `unset`), `append`, insert, `remove`, by CSS-like path.
- Whitespace-safe patching (inline elements, `<pre>`, entities).
- A task set of 50 HTML edits, since no public benchmark covers HTML.

**Gate (C7):** every edit re-parses to the intended tree, and the page's other bytes are unchanged.

## Phase 8. CSS (2 weeks)

**Work**
- A PostCSS index, a map by block (BEM roots, at-rules, custom properties), and the plain view.
- Selector filtering: the rules that apply to an element in HTML or JSX, plus the custom properties they use.
- Operations: `set` and `unset` declarations, add and remove rules, in source order.

**Gate (C8):** for each filtered element, a headless browser's computed style is the same with and without the rules
the filter left out.

## Phase 9. Hardening (3 weeks)

**Work**
- Watch mode, large repositories and monorepos, memory limits.
- Fuzzing of the parsers' inputs and the edit grammar; hostile file sizes and paths.
- Windows paths and line endings (CRLF kept as found).
- Telemetry off by default; no code leaves the machine.

## Phase 10. Release 1.0 (2 weeks)

**Work**
- Publish on npm, with the spec of the views and the edit grammar.
- Publish the benchmark report with its method, so others can reproduce it.
- A contribution guide, issue templates and a public roadmap.

**After 1.0**
- Vue, Svelte and Astro templates; SCSS and Less; Tailwind-aware class views.
- Python, the language agents are most often asked for next.
- A study of fine-tuning on a compact syntax (the SimPy route), only if the benchmark shows a gap worth it.
