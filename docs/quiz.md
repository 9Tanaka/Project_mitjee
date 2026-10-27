# Quiz Pre-test and Post-test

User scope on 26 September 2026 limits other learning modes to Quiz Pre-test/Post-test. This phase implements these two forms; the original Proposal's Review form, sixteen lessons and Investigation Game are outside this phase.

## Content and selection

Publication `thai-scam-awareness-v1`, blueprint `seven-groups-20-v1` contains **210 multiple-choice questions**: 70 original fictional cases, ten in each of seven groups, with three different questions per case. These cover response, evidence assessment and independent verification. Each question has four options, one correct answer, a reason and a primary-source link. Cases are authored for Thai learners, rather than copied or translated from a source question bank.

| Group | Bank questions | Questions per round |
|---|---:|---:|
| Finance and payments | 30 | 3 |
| Impersonation of people and organizations | 30 | 3 |
| Accounts, data and devices | 30 | 3 |
| Shopping, jobs and earnings | 30 | 3 |
| Relationships and social contact | 30 | 3 |
| Education, travel and property | 30 | 3 |
| Prizes, donations, threats and recovery | 30 | 2 |
| Total | 210 | 20 |

The backend uses Fisher–Yates with Node's cryptographic `randomInt`. Each round selects 20 distinct cases (one question from each), balances the three question types at 7 response / 7 evidence / 6 verification, and shuffles question and option order. All 210 questions are eligible. Pre/Post use the same proportions; independent rounds may contain overlapping questions. This instructional bank has not undergone psychometric validation and its percentages describe the sampled questions.

The server freezes the full selected question content, category labels, correct options, reasons, sources and shuffled order when starting a round. Browser options are remapped to `c1`–`c4`. Active API responses contain prompts, options and the learner's saved selections, with no answer keys, reasons, source links, internal case IDs or owner identity. The private bank is excluded from browser imports and the production artifact audit.

## Answers, results and comparison

- Choosing an option changes a local draft. “บันทึกและไปข้อต่อไป” and “บันทึกไว้ทำต่อ” persist selections; the page indicates unsaved changes. Reload resumes the saved choices.
- Answers can change while ACTIVE. All submitted IDs must belong to the pinned round, with no duplicate questions or unknown options.
- Submission requires all 20 answers, combining saved selections with the request. The backend computes `correct / 20 * 100` and per-group correct counts. It commits answers, COMPLETED status, timestamp, result and request receipt atomically. A completed round cannot be edited.
- Quiz percentages are independent of Scenario's categorical decisions. Quiz introduces no Scenario weights, threshold or pass/fail label.
- A Post-test pins the latest completed, owned Pre-test with the same bank version and blueprint **at Post-test start**. A later Pre-test never replaces that baseline. If no such Pre-test exists, the result has no comparison. Difference is Post minus Pre in **percentage points**; UI explains that randomized questions may contribute to the difference.
- Completed rounds reveal only their own 20 answer keys/reasons/source links and list groups with incorrect responses. `/quiz` displays the most recent 50 owned rounds. Older rounds remain persisted and can be opened at their original URL.
- A new content publication must receive a new bank version/blueprint as appropriate. No migration recomputes historical scores or snapshots.

## HTTP and storage

All endpoints use verified Auth.js identity, strict DTOs, no query parameters, no-store/nosniff headers, a 64 KiB mutation-body limit and same-origin checks when an Origin header is present. Missing and foreign attempt IDs return the same 404. Client-supplied scores, correctness or owner IDs are rejected.

| Method | Endpoint | Request |
|---|---|---|
| GET | `/api/quiz` | Own recent history and current publication metadata |
| POST | `/api/quiz/attempts` | `{ requestId: UUID, mode: PRE_TEST or POST_TEST }` |
| GET | `/api/quiz/attempts/:attemptId` | Resume or completed result/review |
| POST | `/api/quiz/attempts/:attemptId/save` | `{ requestId: UUID, expectedRevision, answers: [{ questionId, optionId }] }` |
| POST | `/api/quiz/attempts/:attemptId/submit` | Same shape; requires all answers after merging saved choices |

Start IDs are deterministic hashes of verified owner plus request ID. Reusing that ID with a different mode conflicts. Save/submit receipts fingerprint operation, expected revision and sorted answers. Exact retries reconcile to the current snapshot; changed inputs under an existing ID return 409. Compare-and-swap prevents two windows from silently overwriting each other. UI locks new edits during an uncertain request, retries its exact payload and refetches on revision conflict.

Additive migration `202609260001_quiz` creates `QuizAttempt` and `QuizReceipt`. Training tables and old migrations are untouched. The immutable question/baseline snapshot is written only at start; subsequent Prisma commits update mutable answers/result/status/revision and append a receipt in a transaction. The account and Quiz ownership boundary follows existing opaque owner UUIDs, without a new account foreign key. Quiz uses the shared database pool and does not initialize the dialogue/AI provider.

Apply committed migrations with `npm run db:deploy` against the intended database before opening Quiz. This phase did **not** deploy a migration to an existing or production database.

Persistence hardening on 26 September: get/history/baseline reads now use repeatable-read
transactions, matching the Training adapter's snapshot guarantee. Attempt fields and included
receipts cannot come from different concurrent commits. Three adapter contract tests cover all
read paths; conditional real-MySQL tests additionally check concurrent snapshot coherence and
frozen Pre/Post baseline persistence through a fresh client. External verification remains
NOT RUN — MYSQL_TEST_DATABASE_URL unavailable.

## Primary sources checked on 26 September 2026

These support the prevention principles; institutions have not reviewed or endorsed these authored questions. Local scenarios avoid transplanting foreign legal deadlines, reporting numbers or statutory rights.

- [Bank of Thailand — online banking fraud](https://www.bot.or.th/th/satang-story/fraud/online-fraud.html)
- [FTC — avoiding scams](https://consumer.ftc.gov/articles/how-avoid-scam)
- [Scamwatch — investment scams](https://www.scamwatch.gov.au/types-of-scams/investment-scams)
- [FTC — phishing](https://consumer.ftc.gov/articles/how-recognize-avoid-phishing-scams)
- [FTC — tech support scams](https://consumer.ftc.gov/articles/how-spot-avoid-and-report-tech-support-scams)
- [FTC — online shopping](https://consumer.ftc.gov/articles/online-shopping)
- [FTC — job scams](https://consumer.ftc.gov/articles/job-scams)
- [FTC — romance scams](https://consumer.ftc.gov/articles/what-know-about-romance-scams)
- [FTC — rental listing scams](https://consumer.ftc.gov/articles/rental-listing-scams)
- [FTC — scholarship scams](https://consumer.ftc.gov/articles/how-avoid-scholarship-and-financial-aid-scams)
- [FTC — fake prizes](https://consumer.ftc.gov/articles/fake-prize-sweepstakes-and-lottery-scams)
- [FTC — safe donations](https://consumer.ftc.gov/features/donating-safely-and-avoiding-scams)
- [FTC — refund and recovery scams](https://consumer.ftc.gov/articles/refund-and-recovery-scams)
- [South Carolina Consumer Affairs — AI scams](https://consumer.sc.gov/artificial-intelligence-scams)
- [FTC — travel scams](https://consumer.ftc.gov/articles/avoid-scams-when-you-travel)

## Verification

Initial Quiz delivery on 26 September 2026: **454 passed, 34 skipped**, 488 total;
these are historical counts, not the recovery result. Recovery: **475 passed, 48 skipped**,
523 total; Quiz subset **46 passed, 6 skipped**. Prisma generate/validate, strict typecheck,
production build and client artifact audit pass. Browser E2E discovery includes the
authenticated Pre/Post flow; actual browser+MySQL execution was NOT RUN —
MYSQL_TEST_DATABASE_URL unavailable. No live OpenAI request was made in recovery.
See [Current verification](recovery-verification.md); skips are not passes.

New deterministic tests cover bank integrity, selection/option permutation, server scoring at 0/7/20 correct, immutable resume, partial saves/corrections, invalid answers with no partial writes, exact concurrent retry and stale-write conflicts, ownership, frozen Pre/Post baseline and start-time cutoff, active-answer-key omission, input/origin/body validation, full 20-question UI completion, uncertain save retry and multi-window reconciliation. The UI reads saved answers directly until a local edit; delayed initialization cannot overwrite the first selection. Conditional MySQL tests exercise restart, native transactions/rollback and concurrent submissions without a mocked database.
