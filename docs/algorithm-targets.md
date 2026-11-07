# Algorithm targets

Hat 5's register: each method the product leans on, in plain words, the method used now, the better methods known, and
the trigger that brings each up. A target is looked at when its trigger fires, never on a whim, and never skipped when
it does. A new method keeps the old one as its test oracle.

| Target | In plain words | Now | Better methods known | Trigger |
|---|---|---|---|---|
| **Map granularity** | How much of the repository one map shows | One line per declaration; a map per file and one for all files | A map per folder with a token budget; collapse a folder to one line when it is far from the task | Phase 2's design, or a phase 0 repository whose map exceeds the files the task needs |
| **Ranking** | Which parts of the map come first, or stay when the budget is short | None (source order) | References graph with PageRank (Aider's repo map, from memory); the task's words; files changed recently | Phase 2's design |
| **Context slicing** | Which other code to send with the code being edited | None (the model asks) | The types and functions it uses, from the TypeScript language service; perplexity ranking (LongCodeZip) | Phase 5 counts tasks that failed for missing context |
| **CSS selector filter** | Which CSS rules can apply to an element | Classes in the element's JSX or HTML, plus `:root` (the script) | Real selector matching against the parsed tree; the browser's own matching as the oracle | Phase 8's design |
| **Edit application** | Applying several edits to one text | Sort, refuse overlaps, apply (the script's `applyEdits`) | Kept; it is simple and exact. Revisit only if edits must compose across files | A failure in C1's property tests |
| **Incremental index** | Updating the index after a save | None yet | The TypeScript language service's incremental program; per-file hashes | Phase 2's gate C2b |
