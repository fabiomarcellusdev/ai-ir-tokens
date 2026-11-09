# 0008. Continue after gate R1 with a map that learns, tested by one final gate (R2)

**Status:** Accepted (owner, 2026-11-09). The owner settled the frame in one round of questions
(`docs/proposals/learning-map.md`, "The owner's answers"). The rules marked "(proposed by the lead)" in
`docs/contract.md`, "Gate R2 in detail", are approved by the owner's merge of the pull request that adds them.

## Context

- **Gate R1 missed** on 2026-11-09: the frozen ranking listed every changed file within 25% of the baseline in 31 of
  85 test tasks (36.5%), against 70% (`docs/contract.md`, "The result of gate R1"). By decision 0007, a miss stops the
  project unless a new, dated decision gives a reason to continue.
- **What R1 showed:** the ranking beat a keyword ranking by 16.5 points, so it finds files better than a simple match;
  it does not find enough of them. A perfect ranking could pass 81.2% at the same budget, so the budget alone does not
  explain the miss. The descriptions were the weak part: 6 of 85 commit messages name a changed file.
- **The owner's reason to continue** (owner, 2026-11-09): a map that learns from finished tasks. When the map is not
  enough, the agent searches as it does today; when the task is verified, the tool records what it needed, so a later
  map, also in a fresh chat, is more often enough. The lead added that git history gives the same lessons on day one.
- **What R1 did not test:** a task description longer than a commit message (an issue), and an agent that asks for
  one folder's map on demand. The proposal adds both as arms of the same test.
- **The map changed since R1:** HTML and CSS entries now carry line ranges (pull request #22). They make those entries
  15 to 50% larger in the sample files; R2 counts the maps with ranges.

## Options

1. **Stop.** Costs nothing more. Gives up an idea that a free test can check.
2. **Continue with one final, free gate (R2)** on fresh repositories: the learning map, the issue text and one
   folder's map, each as its own arm, with R1's bar. Costs some days of work and read-only calls to GitHub's API. A miss
   ends the project for good.
3. **Go to the paid pilot now.** Costs money from the owner's $100 of API credits on a map that has not passed a free
   test.
4. **Change R1's rules and run again on R1's tasks.** Costs nothing, but the lead has seen R1's results per task; a
   second try on the same tasks, with rules changed after the results, would measure the lead's knowledge, not the map.

## Decision

Option 2, with the owner's six answers (`docs/proposals/learning-map.md`):

1. **Continue with one final gate, R2.** A miss at R2 stops the project for good, with no further rescope.
2. **Fresh repositories,** picked before any measurement. Of the 7 reserves in `bench/token-count/corpus.json`, 4 are
   fresh (umami-software/umami, CookSleep/gpt_image_playground, ncdai/chanhdai.com, neovim/neovim.github.io). Two served
   in C0 and R1 (haiweilian/vivy-nest-admin, GrapheneOS/grapheneos.org), so the lead has seen their tasks, and one is a
   Vue app (hoppscotch/hoppscotch), which the map cannot read. So 13 repositories are new, picked by a fixed rule, and
   the owner approves the list before any run, as for C0.
3. **R1's bar:** at least 70% of the test tasks with every changed file in the map, at 25% of the baseline. Arm E (all
   three ideas together) decides the gate; arms A to D are reported beside it. A folder's map counts against the same
   budget.
4. **The longer description (arm C)** is the text of the issues that the task's pull request or commit links, as the
   text was before the change; elsewhere, the commit message. The pull request's own text is a best case, reported
   beside the gate.
5. **The lessons (arm B)** come from earlier commits of the same repository's history that pass the task rule: the
   task's first-parent ancestors, never the task itself or anything after it.
6. **Arm D's folder** is the folder of the top-ranked file that is not in the cut map; one folder per task.

R2 keeps R1's safeguards: development tasks committed before any ranking work, the method frozen in a commit before
the one test run, every run listed, and an independent recount of the result. It adds three (proposed by the lead,
approved by the owner's merge):

- **A sealed test list:** only its hash is committed, and before the test run the scripts read only the history
  before the oldest test task.
- **A binding comparison:** arm E must also pass at least 10 percentage points of the test tasks more than R1's
  keyword ranking, or the gate is missed. In R1 this was only a reason to stop.
- **Every outcome fixed before the run:** a failed issue fetch, a missing repository and the result band each have a
  fixed consequence in `docs/contract.md`, "Gate R2 in detail", so no result is set aside after it exists.

## Prior art

These rows are from memory and not verified yet (`docs/follow-ups.md`):

- **Co-change mining** (Zimmermann et al., "Mining Version Histories to Guide Software Changes", ICSE 2004, the ROSE
  tool): files that changed together in the past suggest each other. Arm B uses the same signal, inside a fixed budget.
- **Aider's repo map:** ranks files with a graph of references, weighted toward the files in the chat. R2's ranking also
  uses the import graph (R1's method), and adds lessons from history.
- **Agent memory files** (Claude Code's `CLAUDE.md` and its memory, Cursor's rules): free text that the agent reads each
  session. The lessons here differ: paths and words that change a ranking under a fixed budget, never free text, and a
  gate measures them.

What R2 aims to show that these do not: whether lessons from history, a real request's text and one folder's map make
a fixed-size map hold every file a change needs, measured per idea on repositories nobody has looked at.

## Rejected

- **Stop (option 1):** the owner sees a reason to continue, and the test that checks it is free.
- **The pilot now (option 3):** it would spend money on a map that has not passed a free test.
- **R1's tasks again (option 4):** the lead has seen them; a fair test needs tasks nobody has looked at.
- **The 2 reserves that served in C0 and R1:** their tasks are seen. **The Vue reserve:** the map cannot read `.vue`.
- **The pull request's text as the gate's description:** it is written after the change, often describes the solution
  and sometimes names the files. It is reported as a best case only.
- **An issue's current text:** maintainers often edit an issue after the fix (the cause, the file). The gate rebuilds
  the text as it was before the change, or leaves the issue out.
- **An upper size limit for new repositories:** C0's gate mix had repositories of 3,000 files and more; a limit would
  have left out the kind that did worst in R1. **A judgment of "library or app" by the lead:** replaced by mechanical
  tests, so the lead picks nothing by hand.

## What would reopen this

- R2 missing its gate ends the project; nothing reopens it.
- If R2 passes, its result opens step 2, the paid pilot (decision 0007), whose budget the owner sets then.
- Nothing after the test run changes its result: a task whose issue GitHub cannot serve uses the commit message, and
  the result stands (`docs/contract.md`, "Gate R2 in detail").
