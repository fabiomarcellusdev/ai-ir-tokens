# Prior art

What exists already, and how this project differs. **Check each row again before a design cites it.** The first three
rows were checked by web search on 2026-11-06, from abstracts and project pages. The others are from memory and are not
checked.

| Project | What it does | Reported result | Checked |
|---|---|---|---|
| [SimPy and DualCode](https://arxiv.org/abs/2404.16333v2) (ISSTA 2024) | An "AI-oriented grammar" for Python with the same syntax tree. DualCode converts it to normal code for people. | 8.6-34.7% fewer tokens by tokenizer; 10.4% for GPT-4. Needed fine-tuning to keep accuracy. | 2026-11-06 |
| [LongCodeZip](https://arxiv.org/html/2510.00446v1) (ASE 2025) | Keeps only the functions and blocks that matter for the task, ranked by the model's perplexity. | Up to 5.6x compression with no loss in quality. | 2026-11-06 |
| [FastEdit](https://pypi.org/project/fastedits/0.2.8/) | The model edits a function by name, found with tree-sitter, and does not repeat the old code. | 44-54% fewer output tokens on the project's own benchmark. | 2026-11-06 |
| Aider's repo map | Signature-only view of a repository, built with tree-sitter and ranked by references. | Not checked. | No |
| Repomix `--compress` | Packs a repository into one file; `--compress` keeps signatures. | Not checked. | No |
| Serena | An MCP server that reads and edits code by symbol, through language servers. | Not checked. Closest to this project; study it before phase 1's design. | No |
| LLMLingua | General prompt compression by a small model. | Not checked. | No |
| TOON | A compact notation for JSON data sent to models. | Not checked. | No |

## How this project differs

1. **One tool for reading and editing**, built on the TypeScript compiler, so it knows types and references, not only
   syntax.
2. **A round trip checked by `tsc`**, with a rollback on failure and byte-identical code outside the edits.
3. **HTML and CSS views that know about each other** (the selector filter uses the classes in the markup).
4. **A published benchmark with pass rates**, not token counts alone.

**Owed before phase 1's design:** a close study of Serena and Aider's repo map (what they do, their known complaints,
and what this project does better). The study reads their documents and public results.
