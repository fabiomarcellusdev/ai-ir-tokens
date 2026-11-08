# Voice and terms

How the project's text sounds: the README, the docs, the CLI's and the server's messages, tool descriptions,
errors and commit messages.

## Rules

1. Write 80% of the way to ASD-STE100 (the rules are in `AGENTS.md`, "Working agreements").
2. Say what happened and what to do next. An error names the address and the next action.
3. Never claim more than was measured. A saving names its tokenizer and corpus, and says whether accuracy was
   measured.
4. Tool descriptions are short, because they cost tokens on every request (gate C4).
5. No marketing words: "blazing", "revolutionary", "seamless".

## Terms

Use these words and only these. One word, one meaning.

| Term | Meaning | Do not use |
|---|---|---|
| **map** | The L0 index of a file or folder: one line per declaration, landmark or rule group | outline, skeleton, summary |
| **view** | An L1 form of some code that the model reads (plain, compact) | rendering, projection |
| **address** | The name of a thing the model can read or edit (`users.ts:createUser`) | path (except for files), locator, ref |
| **edit operation** (short: **operation**) | One typed change sent by the model (`replace`, `set`) | command, patch, action |
| **edit batch** | The operations sent in one `edit` call | changeset |
| **round trip** | Apply, format, check, and roll back on failure | sync, conversion |
| **check** | `tsc`, ESLint and re-parsing after an edit | validation, verify |
| **hash** | The content hash a read returns and an edit carries | version, etag |
| **stale edit** | An edit whose hash no longer matches the code | conflict |
| **elision** | Replacing inline SVG or a `data:` URI with a stub that names its size | stripping, folding |
| **selector filter** | Sending only the CSS rules that can apply to an element | pruning |
| **pass rate** | The share of benchmark tasks an agent completes | accuracy (except in plain-language summaries), success rate |
| **IR** | Used only in the project's name. The product is a layer of views and operations, not a new language | |
