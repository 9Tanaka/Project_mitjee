# MySQL verification recovery and documentation cleanup

Date: 26 September 2026. Repository: `9Tanaka/Project_mitjee`.
This report records current recovery work, not historical phase results.

## Delivery and scope (items 1–14)

| Requested item | Current evidence / status |
|---|---|
| 1. Branch | `feat/rule-based-evaluation`; no merge into main |
| 2. Start commit | `b8741c49a4c2ac099169896d7352f89f1fcb2f17` |
| 3. End commit | Exact final remote commit is in the task handoff; the report cannot embed its own immutable commit SHA |
| 4. Commits created | Assessment recovery; coherent Quiz reads and regression coverage; current-status documentation. Official pushed SHAs in task handoff |
| 5. Bugs fixed | Prisma decoder discarded version-1 categorical assessments; Quiz reads could combine attempt revision and receipts from different concurrent commits |
| 6. Rule-based | Implemented DECISION_RULES_V1. Backend explicit actions only; C→CRITICAL_FAILURE; !T or N>0→UNASSESSED; U>0→NEEDS_PRACTICE; otherwise PASSED. No numeric training score. Legacy SMS v1/v2 keeps 50/30/20 and threshold 70 without historical rewrite |
| 7. Nine scenarios | SMS v4 plus eight v1 templates implemented. Existing safe/review/critical/early-exit/projection tests and nine added multi-turn AI-authority tests pass. Native reload coverage for all eight plus SMS v3/v4 is prepared, not executed |
| 8. Quiz | Implemented 210 authored questions / 7 groups / 20 per attempt. Save/resume, CAS/idempotency/ownership, selected-20-only review, frozen Pre/Post comparison; no pass/fail threshold. Snapshot hardening added; six native tests pending |
| 9. Call Center variants | SCAM_CALL text implemented. NORMAL_CALL and backend-only random 50/50 selection NOT IMPLEMENTED; normal assessment semantics need user decision |
| 10. Voice | NOT IMPLEMENTED. Must follow approved text variants: Azure AI Speech STT/TTS, user-initiated mic, no raw audio retention, text fallback; no GPT audio substitution |
| 11. GPT-5.6 Luna | Approved/configurable server model. Historical Proposal remains gpt-5.4-mini. Official capabilities confirmed, real verification pending credits; no silent model substitution |
| 12. Profile | Planned / NOT IMPLEMENTED; no new unapproved phone/address/avatar/birthday fields |
| 13. Dashboard | Planned / NOT IMPLEMENTED; legacy numeric/categorical/Quiz semantics must remain separate, no invented unified average |
| 14. Prisma migrations | No schema or migration changes in recovery; no db push/reset/drop/backfill. Existing additive decision/Quiz migrations not deployed this round |

## Verification (items 15–24)

Commands below ran in the isolated branch checkout. Subsets overlap and must not be added
to the full-suite total. Fake adapter tests do not establish native database/network success.

| Requested item / command | Actual result |
|---|---|
| Preparation: npm ci | PASS; dependency versions unchanged |
| Preparation: npm run prisma:generate | PASS |
| Preparation: npm run prisma:validate | PASS |
| Preparation: npm run typecheck | PASS |
| 15. Unit/integration: npm test | **475 passed, 48 skipped, 523 total**; 25 passing and 3 skipped test files |
| 16. npm run test:http | **149 passed, 1 skipped** (native MySQL dependency) |
| 17. npm run test:auth | **81 passed**; live Auth.js smoke NOT RUN without test DB |
| 18. npm run test:frontend | **59 passed** |
| 19. npm run test:quiz | **46 passed, 6 skipped** (all six native MySQL cases) |
| Additional: npm run test:ai | **68 passed**, fake clients/transports, no paid network |
| 20. Real MySQL / db:deploy / test:mysql | **NOT RUN — MYSQL_TEST_DATABASE_URL unavailable**. Full-suite database-dependent tests are SKIPPED, not PASS |
| 21. Browser + MySQL E2E | **NOT RUN — MYSQL_TEST_DATABASE_URL unavailable**. Five real-backend Playwright tests discovered, no route/DB mocks; discovery is not browser execution |
| 22. Live OpenAI | **NOT RUN in recovery**: restored credits not confirmed. Last actual run 25 September **FAIL — HTTP 429 credit_balance_exhausted**, Luna, two attempts. No successful schema/nonempty/no-fallback claim |
| 23. npm run build | **PASS** |
| 24. npm run audit:client | **PASS — 51 JavaScript artifacts**; source transitive import boundary checks also pass |

No production database was connected, no database was provisioned as a substitute, and
no secrets/private URL/raw provider payload were printed or committed. Test database
naming guards still require `mitjee_test` or `mitjee_test_<suffix>`.

## Regression coverage and self-review (item 25)

- Decoder tests cover categorical versions 1/2/3/4/30 with SAFE, REVIEW, UNASSESSED
  and unanswered null; preserve non-null persisted assessments irrespective of version.
  Legacy null fields retain their original aggregate shape. Reads use pinned immutable
  template configuration, never `templateVersion >= 3` as an evaluation-mode proxy.
- Ten conditional native safe-path cases recreate the Prisma client after every action,
  compare full aggregates and require COMPLETED / PASSED / DECISION_RULES_V1 /
  trainingScore=null / review=0 / unassessed=0. Two legacy cases preserve score 100.
- Quiz get/recent/latestPreTest read attempt rows and included receipts inside one
  repeatable-read transaction. Three fake-client contract tests verify all read paths;
  two added native cases exercise concurrent snapshot consistency and frozen baseline
  persistence with a fresh client. Existing rollback/concurrent-submit tests remain.
- Nine scenario tests reject high-confidence critical hints after multiple free-text
  turns with unchanged State, Events, Opportunities and Result. Dialogue revisions
  and messages still commit normally. Core/Event/Scoring/HTTP authority is unchanged.
- Investment E2E adds explicit safe choices and checkpoint reloads with a PASSED result,
  four SAFE assessments, no unassessed checkpoints and no hidden-rule fields.
- Diff reviewed for transaction/CAS/idempotency/ownership, legacy compatibility, client
  answer-key/provider/Prisma imports and secrets. No new public fields, auth bypass,
  model default, scoring formula, dependency or migration was introduced.
- These controls are not a production security certification. Existing limitations
  remain: local sanitizer is incomplete; no production rate limits, full moderation,
  email verification/reset/MFA, immediate JWT revocation or retention cleanup job.

## Known blockers (item 26)

1. **NORMAL_CALL assessment policy is undefined.** A normal call must not invent scam
   warning signs/critical actions. Need approval of checkpoints, which explicit actions
   mean SAFE/REVIEW, and whether it produces an official result. Existing categorical
   early-exit behavior must not be assumed to authorize a new normal-call evaluation.
2. **Dedicated database configuration is absent.** Configure a private
   MYSQL_TEST_DATABASE_URL passing the existing naming guard (plus trusted loopback
   RSA key path if needed), then deploy existing additive migrations and run native
   persistence, auth-live and production-browser verification. Do not use production.
3. **Live provider credits not confirmed.** Once confirmed, run the approved opt-in
   Luna test. Fallback or credit errors are not PASS; no model substitution.

## Remaining scope and execution order (item 27)

After the normal-call policy decision, implement and test text variants/backend selector
before voice. Verify database/browser/live provider when private external configuration
is ready. Profile only approved fields; dashboard only after persistence slices are verified
with distinct result semantics. Game/Knowledge/Review remain outside latest scope.
Do not add WebSocket merely to satisfy a roadmap item. Do not merge main automatically.

The original dirty mirror and read-only Proposal/source material were not modified.
Current branch delivery remains reviewable and forward-only; no force push or history rewrite.
