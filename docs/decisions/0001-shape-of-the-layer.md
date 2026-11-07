# 0001. The shape of the layer: selection and edits, not a new language

**Status:** Accepted (owner, 2026-11-06, in the planning session). Items marked **Test** are open until phase 5 or 6.

## Context

An AI model working on code spends tokens in two places. It **reads** files to find and understand the code, and it
**writes** changes, often by repeating code it is not changing. Prompt caching makes repeated input cheap (a cached
read costs about 10% of the normal input price on Anthropic's API), but it does not make it small. Every token still
fills the context window and adds time. Output tokens cost about 5 times as much as input tokens and are never cached.

The first idea was an "IR for AI": a compact language that the model reads and writes, converted back to TypeScript,
HTML or CSS. A measurement on 8 sample files (`docs/measurements/2026-11-06-sample-corpus.md`) tested that idea against
the alternatives.

## What the measurement showed

- **Selection and the edit format carry most of the saving.** A file's map is 69-97% smaller than the file. An edit
  operation is 53-75% smaller than SEARCH/REPLACE blocks and 92-99% smaller than rewriting the file.
- **For TypeScript and CSS, real code is as good as a custom syntax.** Valid code without comments and indentation
  saves 24%. The custom syntax saves 21% (TypeScript) and 24% (CSS). In TypeScript, removing comments saves 16%,
  removing indentation 8 more points, and removing braces and semicolons only about 5.
- **For HTML and JSX, a compact view pays.** Pug-style markup saves 19-20% against 7-14% for plain markup. Eliding
  inline SVG takes HTML to 53%.
- **Why syntax saves so little:** tokenizers already treat keywords, runs of spaces and common punctuation as single
  tokens. Names, strings and class names are most of the code, and no view can remove them.

All of this is token counts only. Accuracy is unmeasured.

## Decisions

| Verdict | Decision | Reason |
|---|---|---|
| **In** | The map, views on request, edits by address, and the server-side round trip | They carry most of the saving |
| **In** | Real code as the reading view for TypeScript, JavaScript and CSS | Measured as good as or better than a custom syntax, at no learning cost to the model |
| **In** | Compact views for HTML, and elision of inline SVG and `data:` URIs | 12 points over plain HTML; elision 34 more |
| **In** | CSS selector filtering, cross-referenced with the classes in HTML and JSX | It sends only the rules that apply, as a browser's Styles panel does |
| **In** | Addresses by name (`users.ts:createUser`, `styles.css:.pricing-card--highlighted`); IDs in the map only | Inline IDs in reading views cost 1-9 points |
| **In** | A content hash on every read, carried by every edit; a stale edit is refused | It stops an edit from landing on code the model never saw |
| **Test** | Pug-style JSX (+6 points) | Kept only if its pass rate holds in phase 6 (gate C6) |
| **Test** | TypeScript without indentation (+8 points) | Kept only if its pass rate holds in phase 5 |
| **Out** | The repetition view (a template plus rows for repeated markup) | The owner's decision, 2026-11-06 |
| **Out** | Inline IDs in reading views | They cost 1-9 points |
| **Out** | Abbreviated keywords and property names (`fn`, `bg`) | Tokenizers already treat the full words as single tokens, and models know the full words better |
| **Out** | A new language for the model to write | SimPy needed fine-tuning to keep accuracy, and its saving (about 10-14%) is smaller than what selection and edits give here |

## The round trip

The model never converts code back to TypeScript, HTML or CSS. The server does:

1. **Index.** The server parses TypeScript and JavaScript with the TypeScript compiler API, HTML with parse5 and CSS with
   PostCSS. It updates the index when a file changes.
2. **Read.** The model calls `map`, then `read` for the addresses it needs.
3. **Edit.** The model sends edit operations with the hashes it read.
4. **Apply.** The server changes only the text spans the operations name.
5. **Format.** The server runs Prettier or Biome on the changed ranges only.
6. **Check.** The server runs `tsc` and ESLint for code, and parses HTML and CSS again. On failure it rolls back and
   returns the errors, mapped back to addresses.

**The operations:** `replace`, `insert-before`, `insert-after` and `delete` on a symbol, statement, element or rule;
`replace-in`, a text substitution limited to one symbol; `rename` through the TypeScript language service; `set` and
`unset` for CSS declarations and HTML attributes; `text`, `append` and `remove` for HTML content.

**Hazards to handle:** JSX, decorators and comments attached to nodes; semicolon insertion when code is regenerated;
whitespace inside inline HTML elements and `<pre>`; tags the HTML parser inserts (`<tbody>`); entities and boolean
attributes; CSS rule order, `!important`, custom properties and `@layer`. Vendor CSS, minified files and generated files
are left out of the index.

## What would reopen this

- Phase 5 shows that real code costs pass rate against a compact view (unlikely, but it would reopen the syntax
  question).
- Phase 0 shows that real repositories have far less comment and markup overhead than the samples, so the views save
  much less.
- A model family arrives whose tokenizer changes the balance (for example, one that tokenizes code very differently).

## Amendments

- **2026-11-07 (review before the first commit):** the HTML row said elision adds "about 30" points. The measurement
  gives 34 (compact without IDs 19%, with SVG elided 53%). The number is corrected. The decision does not change.
- **2026-11-07:** this record came before the template in `README.md`. It has "What the measurement showed" and a
  verdict table in place of "Options", "Decision" and "Rejected". The verdict table carries the same content.
