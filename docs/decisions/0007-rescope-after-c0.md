# 0007. Rescope after gate C0: a budgeted map that points to line ranges

**Status:** Accepted (owner, 2026-11-08), after a grilling session with the lead.

## Context

Gate C0, the test of the whole plan on real code, missed (`docs/contract.md`, "The result of gate C0"). The measurements
behind this decision, all on the 85 tasks of 17 public repositories, pinned by commit:

- **C0: median saving -165.8%** (Anthropic's counter), against a threshold of +50%. The layer's map cost more than the
  files a task changes: on large repositories the one-line-per-folder overview took 65-84% of the layer's tokens; in
  crowded folders the folder maps took 78-96%. Both sides were told which files changed, so the map paid its cost but
  got no credit for helping an agent find the code.
- **W, the writing side: 14.5%** (o200k_base). Edit operations by address save 14.5% of the writing tokens against
  search and replace (threshold 40%). Writing is about 18% of the reading tokens, so the saving is about 3% of an
  agent's tokens. In cost the share is larger, because output tokens cost five times as much as input tokens; but even
  if writing were all of the cost, the saving could not pass 14.5%, far below the 40% goal.
- **V, finer code views: 78.8%** (o200k_base). Sending only the smallest unit that holds a change, in the compact view,
  saves 78.8% of the code reading (threshold 65%). The floor, the changed lines with 3 lines of context, saves 86.0%,
  but it needs to know the exact lines in advance. Reading whole units in the plain view, through line ranges, is not
  measured yet; the pilot measures what an agent really reads.
- **Caching:** a stable prefix that an agent re-sends costs 0.05x of the input price per cache read on Claude Opus 5.5,
  after one write at 1.25x (the prompt-caching documentation, 2026-11). A stable map is cheap in money over a session;
  it is not cheap in context.
- **Today's agents already read line ranges** (Claude Code's Read tool takes a start line and a count) and edit with
  search and replace. What they lack is a cheap way to know which lines to read.

## Options

| Option | What it gives | Cost |
|---|---|---|
| A. Stop | An honest end of phase 0; nothing more to spend | The narrow result in V is not followed up |
| B. Keep the full layer (map, compact views, edit operations, rollback) | The original plan | Months of work on parts the measurements do not support |
| C. Narrow to a budgeted map that points to line ranges, used with the agent's own tools, proven in two steps | Keeps the one part the evidence supports, at a fraction of the build | A free measurement, then a small paid pilot; either can end the project |
| D. Pivot to finding code in large repositories | Targets the map's real value | Needs paid agent runs from the start, with no evidence yet |

## Decision

Option C, with these choices (owner, 2026-11-08):

1. **Rescope** the project instead of stopping it.
2. **The measure of success is cost per completed task,** with prompt caching as agents use it, and a pass rate no
   more than 1 point lower. Token counts and context use are reported beside it. The exact target is fixed with the
   pilot's gate, before the pilot runs.
3. **The product is a small, budgeted, ranked map:** file names, declaration names and line ranges, plus a tool that
   returns one folder's map on demand. The agent reads lines with its own Read tool and edits with its own Edit tool.
   Dropped: the custom edit operations, the compact views and rollback.
4. **The map's life cycle:** it loads at session start, in a stable, cached part of the agent's context that survives
   compaction. A code change adds a short change note at the end; the map itself stays untouched, so the cache stays
   valid. The full map is rebuilt only at a new session or after a compaction. The developer compacts once the map has
   led the agent to the work.
5. **The proof path, each step with a stop rule fixed before it runs:**
   - **Step 1, free and deterministic (gate R1 in `docs/contract.md`):** given only a task's description, does a
     budgeted map list the files the change touched? A miss stops the project.
   - **Step 2, a paid pilot:** real agent runs, today's agent against the agent with the map, measuring cost per
     completed task and pass rate. Only if step 1 passes.
6. **The pilot's budget** is decided only after step 1 passes, within the owner's $100 of API credits, paid through an
   API key with a Console spending limit, never through the owner's Claude Pro plan.
7. **The roadmap** is replaced by these steps (`docs/roadmap.md`), and the mission is reworded to cost per completed
   task (`AGENTS.md`, `README.md`).

## Prior art

The narrowed product is close to **Aider's repo map** (`docs/prior-art.md`): a signature-only view of a repository,
ranked by references, fitted to a token budget. Serena, an MCP server that reads and edits code by symbol, is the
other close neighbour. What this design aims to do better:

- **Tool-neutral:** an MCP server any agent can use, not a feature inside one agent.
- **Cache-stable:** the map is placed and updated so that prompt caching keeps working, which Aider's per-turn map does
  not aim for.
- **Measured before it is built:** gate R1 and the pilot decide, with numbers fixed in advance.

**Proposed by the lead, approved by the owner's merge of this record:** if step 1 shows a ranking no better than a
simple reference ranking (`docs/contract.md`, "Gate R1 in detail": not at least 10 points more test tasks passed),
this project has little to add beyond packaging, and that is a reason to stop.

## Rejected

- **A. Stop:** V shows a narrow saving with a real chance, and the next step is free.
- **B. The full layer:** W shows the edit operations save 14.5% of the writing at most, about 3% of an agent's tokens.
  V shows that the plain changed lines (86.0%) cost less than the compact unit view (78.8%), so the compact view is
  not what makes reading cheap; knowing which lines to read is. Months of work on those parts are not justified.
- **D. A pivot to finding code:** the map in option C is a test of finding; a pivot that starts with paid runs spends
  money before the free test has run.

## What would reopen this

- Gate R1 misses: the project stops, unless a new, dated decision gives a reason to continue.
- The pilot misses its gate: the project stops.
- A ranking method the evidence shows to be clearly better than a reference-ranked map (it reopens option D or a wider
  scope).
- The owner's budget or the price of model calls changes enough to move the pilot's design.
