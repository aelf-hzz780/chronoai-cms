BlogSystem starts from an empty application baseline and implements the Gist v0.7 bilingual personal/organization publishing workflow: a CMS and shared NyxID service API, private Markdown and media revisions, four independent official Ghost sites, distribution lifecycle tracking, metrics, audit, and encrypted recovery.

The integrated implementation retires stale queued/running media commands before explicit read-only reconciliation. A currently authorized actor can recognize the existing remote publication without reusing the old actor's write authority; further image publication requires a fresh command and current source/organization permission at the execution and final write boundaries.

Validation and evidence:

- Integrated source: `386b9652dc431bb83e4864d5b046b378110ee88d`, including recovery fix `83b4b8e`; TypeScript and all 303 tests pass.
- W1 records real local NyxID authorization, revocation, CMS/service parity and four-Ghost lifecycle evidence at its pinned version. Its DeliveryWorker destination is `local_test`.
- W2 records real encrypted four-Ghost restore, all 36 SQLite tables and 404 MySQL table schemas, and affected recovery regressions at its pinned version. Its identity/delivery counterparts are explicitly controlled.
- The final handoff records the targeted combined-version native checks, independent review, final OpenAPI registration/discovery, runtime readback, preserved failures, cleanup and portable SHA-256 manifest. Historical runs are not described as a full rerun at the integrated commit.
- See `docs/handoff-20261102.md` and `docs/evidence/followup-20261102/manifest.json` for the exact evidence, reproduction prerequisites and public/private boundaries.

This is a **draft** delivery PR. Overall D1–D9 acceptance remains **NOT_ACCEPTED**. The local Nyx backend `049ee1c` and portal `c65dc4be` are explicit local patch dependencies, with the original upstream checkout retained and no upstream push or merge. Real external accounts, precise content/action authorization, provider lifecycle/recovery, production domains/operations/privacy/backup decisions and agreed RPO/RTO remain separate required inputs. No real external articles or production rollout are claimed.

The feature branch preserves commit history and targets `main`; no force push or self-merge is requested. Local runtime deployment and Git delivery are recorded separately in the handoff. The BlogSystem heartbeat remains paused.
