# Decision evaluation for scenario version 3

STATUS: IMPLEMENTED FOR THE PLAYABLE SMS / PHISHING SCENARIO

The user's later decision in the “Mitjee ปรับแก้” chat supersedes the weighted scenario scoring described in Proposal v6. The Proposal source file remains unchanged. Quiz answers can still be scored by number correct when Quiz is implemented. The rule here applies only to scenario simulation.

## Rule and scope

`A` is the set of checkpoints actually opened by entering a state on the played path. A checkpoint on a branch that was never entered is absent from `A`. An explicit early safe resolution can end the current state before its unanswered checkpoint is attempted; that checkpoint is exempt. Each other opened checkpoint has `r_i = SAFE`, `REVIEW`, or `UNASSESSED` (`∅`). Only a backend-validated explicit choice, warning selection, or simulated action can finalize a checkpoint. Free text and AI candidates do not assign `r_i`, record authoritative events, or create Critical Failure.

`C` is 1 when at least one backend-validated critical event exists. `U` counts `REVIEW`; `N` counts `UNASSESSED`; `T` is 1 only after a safe resolution transition has completed. Evaluation order:

1. `C=1` → `CRITICAL_FAILURE` immediately.
2. `C=0` and (`T=0` or `N>0`) → `UNASSESSED`.
3. `C=0`, `T=1`, `N=0`, `U>0` → `NEEDS_PRACTICE`.
4. `C=0`, `T=1`, `N=0`, `U=0` → `PASSED`.

`PASSED` means the learner passed the path encountered in that session. It does not certify mastery of the scam category or the other paths. An explicit safe stop at initial contact may pass with zero finalized checkpoints. Conversely, a checkpoint opened later and left unanswered prevents a passing result. Ambiguous free text remains nonauthoritative; the user must choose an explicit action for a decision or event to be recorded.

Version 3 templates contain explicit `assessment` metadata for each decision and safe-action choice, plus an explicit rule for warning evidence. The SMS fixture maps partially safe and risky decisions to `REVIEW`; its safe-action options are mapped by stable option ID. Warning evidence is `SAFE` only when all warning signs and no unrelated evidence are selected. The result never derives an assessment from old point values or the absence of an event. The version 3 template has no numeric rubric fields, and version 3 opportunities store zero in legacy numeric columns solely for database compatibility.

## Result and history compatibility

Published SMS template versions 1 and 2 remain immutable and use their original 50/30/20 weighted result, 70-point threshold, and weakest-skill recommendation. They remain available at runtime so existing sessions can resume. New sessions use published version 3. The new migration adds nullable checkpoint `assessment` and result `decisionSummary`, plus `evaluationMode` defaulted to `LEGACY_WEIGHTED_V1` for existing rows. It does not update or recalculate old result rows. Version 3 results use `DECISION_RULES_V1`, a categorical `outcome`, `decisionSummary`, and `trainingScore=null`; public `D/W/S` values are null. The UI displays old numeric results only for legacy records.

`ACTIVE`, `ABANDONED`, and `EXPIRED` sessions have `T=0`. They have no official `TrainingResult`; the result endpoint remains 404, and the session UI explains that assessment is incomplete. `FAILED` from a validated critical action receives an immediate official result. A completed path with any opened unanswered checkpoint receives an official `UNASSESSED` result so the reason is preserved in history.

## Verification and limits

Regression covers early safe stop, complete safe path, reviewed choices, an unanswered optional checkpoint, critical override, AI/free-text authority, legacy version availability, API projection, and UI wording. Database migration validation and generated Prisma types pass. Real MySQL integration tests require a dedicated `MYSQL_TEST_DATABASE_URL`; they are skipped when it is absent. The current UI presents a limited checkpoint summary, not a full per-decision explanation or cross-scenario dashboard.
