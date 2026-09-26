# Decision evaluation by explicit template evaluationMode

STATUS: IMPLEMENTED FOR ALL NINE TEXT SCENARIOS; REAL MYSQL VERIFICATION PENDING

The user's later decision in the “Mitjee ปรับแก้” chat supersedes the weighted scenario scoring described in Proposal v6. The Proposal source file remains unchanged. Implemented Quiz Pre/Post rounds use their separate number-correct calculation. This categorical rule applies only to scenario simulation.

Evaluation semantics come from the pinned template's explicit evaluationMode, never a numeric
version comparison. SMS v3/v4 and the eight other scenarios at v1 use DECISION_RULES_V1.
Only historical SMS v1/v2 use the legacy weighted policy. The persistence adapter preserves
non-null stored assessments and categorical unanswered nulls across all version numbers;
see [round-trip recovery](persistence.md#assessment-round-trip-recovery--26-september-2026).

## Rule and scope

`A` is the set of checkpoints actually opened by entering a state on the played path. A checkpoint on a branch that was never entered is absent from `A`. An explicit early safe resolution can end the current state before its unanswered checkpoint is attempted; that checkpoint is exempt. Each other opened checkpoint has `r_i = SAFE`, `REVIEW`, or `UNASSESSED` (`∅`). Only a backend-validated explicit choice, warning selection, or simulated action can finalize a checkpoint. Free text and AI candidates do not assign `r_i`, record authoritative events, or create Critical Failure.

`C` is 1 when at least one backend-validated critical event exists. `U` counts `REVIEW`; `N` counts `UNASSESSED`; `T` is 1 only after a safe resolution transition has completed. Evaluation order:

1. `C=1` → `CRITICAL_FAILURE` immediately.
2. `C=0` and (`T=0` or `N>0`) → `UNASSESSED`.
3. `C=0`, `T=1`, `N=0`, `U>0` → `NEEDS_PRACTICE`.
4. `C=0`, `T=1`, `N=0`, `U=0` → `PASSED`.

`PASSED` means the learner passed the path encountered in that session. It does not certify mastery of the scam category or the other paths. An explicit safe stop at initial contact may pass with zero finalized checkpoints. Conversely, a checkpoint opened later and left unanswered prevents a passing result. Ambiguous free text remains nonauthoritative; the user must choose an explicit action for a decision or event to be recorded.

Version 3 templates contain explicit `assessment` metadata for each decision and safe-action choice, plus an explicit rule for warning evidence. The SMS fixture maps partially safe and risky decisions to `REVIEW`; its safe-action options are mapped by stable option ID. Warning evidence is `SAFE` only when all warning signs and no unrelated evidence are selected. The result never derives an assessment from old point values or the absence of an event. The version 3 template has no numeric rubric fields, and version 3 opportunities store zero in legacy numeric columns solely for database compatibility.

Version 4 adds explicitly public checkpoint labels and explanations to a new immutable template. Its terminal result stores feedback for each encountered checkpoint: the selected backend rule ID (or an unanswered marker), assessment, public label, and explanation. A validated critical action gets its own `CRITICAL` entry outside the SAFE/REVIEW/UNASSESSED counts, with a separate `critical` count. The public API omits internal checkpoint and rule IDs, using a stable opaque `ruleRef` instead. It shows only the path encountered, never the answer map for unchosen options. Version 3 keeps its count-only result; its stored rows are not rewritten.

## Result and history compatibility

Published SMS template versions 1 and 2 remain immutable and use their original 50/30/20 weighted result, 70-point threshold, and weakest-skill recommendation. Versions 3 and 4 use the categorical rule; new sessions start version 4. All versions remain available at runtime so existing sessions can resume. The additive migration adds nullable checkpoint `assessment` and result `decisionSummary`, plus `evaluationMode` defaulted to `LEGACY_WEIGHTED_V1` for existing rows. It does not update or recalculate old result rows. Rule results use `DECISION_RULES_V1`, a categorical `outcome`, `decisionSummary`, and `trainingScore=null`; public `D/W/S` values are null. The UI displays old numeric results only for legacy records.

`ACTIVE`, `ABANDONED`, and `EXPIRED` sessions have `T=0`. They have no official `TrainingResult`; the result endpoint remains 404, and the session UI explains that assessment is incomplete. `FAILED` from a validated critical action receives an immediate official result. A completed path with any opened unanswered checkpoint receives an official `UNASSESSED` result so the reason is preserved in history.

## Verification and limits

Regression covers early safe stop, complete safe path, reviewed choices, an unanswered optional checkpoint, critical override, AI/free-text authority across all nine templates, legacy version availability, API projection, and UI wording. Decoder tests separately cover version independence. Database migration validation and generated Prisma types pass. Real MySQL integration tests require a dedicated `MYSQL_TEST_DATABASE_URL`; they are skipped when it is absent. The current UI presents encountered checkpoint explanations but has no cross-scenario dashboard yet. Current results are in [recovery verification](recovery-verification.md).
