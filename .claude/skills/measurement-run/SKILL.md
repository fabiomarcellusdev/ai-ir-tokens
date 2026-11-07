---
name: measurement-run
description: Plan, run and record a token measurement or benchmark so its numbers can be trusted and reproduced. Use for any run whose numbers go into docs/measurements/ or decide a gate.
---

# Measurement run

1. **Before the run, write down** the question, the gate it serves (`docs/contract.md`), the analysis, the corpus and
   commit, the tokenizer or model and version, and the number of runs. A threshold chosen after the results is a
   description, not a gate.
2. **Say what kind of run it is:** **TIMED, leave the PC alone**; **NOT timed**; or **PAID**, with the estimated cost.
   A paid run waits for the owner's yes.
3. **Run it** with the `bench-runner` agent or directly, one run at a time, under the machine rules. Corpus
   repositories are fetched by commit, never copied into this repository, and their code never runs.
4. **Record it** in `docs/measurements/YYYY-MM-DD-<name>.md` with the raw results beside it: conditions, numbers,
   spread, and what the numbers do not show. "Tokens only, accuracy unmeasured" until a model ran the tasks.
5. **Check it independently** with the `analysis-checker` agent when the result decides a gate.
6. **Report failures as failures.** A missed gate is recorded as missed, with its numbers.
