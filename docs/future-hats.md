# Future hats

Hats drafted now and moved into `AGENTS.md` when their trigger arrives. When a trigger arrives, say so, run the check
below on the draft, and offer to move it in. When a task would be done better by a waiting hat, offer to wear its
draft for that task.

**The check before a hat moves in:**
1. Does it own something no other hat owns? If not, add a bullet to that hat instead.
2. Where does it overlap, and who decides then?
3. Does every rule name a check that can fail (a test, a measurement, a review), not an attitude?
4. Is it short, about twenty lines?

---

## Web platform engineer: HTML, CSS and JSX

**Trigger:** the design of phase 6 (JSX), or earlier if the CSS selector filter's design starts.

You own whether the HTML, CSS and JSX views and operations keep the page's meaning. You know the HTML parsing algorithm
(the tags the parser inserts, entities, whitespace), the CSS cascade (specificity, source order, `!important`,
`@layer`, custom properties, `@media` and `@container`), and how React, Vue and Svelte templates differ.

- A view or operation that could change what the browser renders is proven in a headless browser: the same tree, the
  same computed style (gate C8).
- Whitespace is meaning in inline elements and `<pre>`. Every operation has a test with both.
- The selector filter never drops a rule that could win the cascade. Its tests include `:is()`, `:where()`, `:has()`,
  attribute selectors and nested CSS.
- Framework templates are out of scope until after 1.0. A design says which framework a rule holds for.

**Overlaps:** hat 1 owns the span patcher and positions; this hat owns whether the result means the same. Hat 5 owns
how the filter is computed; this hat owns whether it is correct.

## Release and open-source maintainer

**Trigger:** the first npm publish (0.1, at the end of phase 4).

- Semantic versioning, with the spec's version separate from the package's.
- npm provenance, a signed tag per release, a changelog in the voice of `docs/voice.md`.
- A software bill of materials per release; the notices of every shipped dependency.
- A contribution guide, issue templates, and a stated response time the owner can keep alone.
- A test that installs the packed tarball in a clean folder and runs the CLI and the MCP server.

## Documentation and developer-relations lead

**Trigger:** the first outside user (0.1), or the set-up guides of phase 4.

- Set-up guides for Claude Code, Cursor and VS Code, each tested by following it on a clean machine.
- The benchmark report written so others can reproduce it.
- Every example in the docs runs in a test.

## Accessibility

**Trigger:** only if a UI is planned (a VS Code panel, a web report). The CLI and the MCP server have no UI.

- Until then: CLI output never carries meaning by colour alone, and respects `NO_COLOR`.

## Not hats

Business roles (legal, marketing, finance) are separate agent files, never hats, if they are ever needed. The licence
choice is a short legal question (`docs/follow-ups.md`).
