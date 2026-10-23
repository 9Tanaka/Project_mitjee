-- PostgreSQL-only fresh baseline, never run against the retained MySQL database.
-- Source checkpoint: 91e707f376372aed5bdf415dd7bbb32d58583536.
-- Deterministic C comparisons preserve canonical training/account identities.
-- Quiz historical utf8mb4_unicode_ci compatibility is UNVERIFIED; existing-data
-- cutover requires the explicit case/accent/padding/order audit in the setup guide.
BEGIN;
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."Scenario" (
    "id" VARCHAR(120) COLLATE "C" NOT NULL,
    "category" VARCHAR(40) COLLATE "C" NOT NULL,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ScenarioTemplateVersion" (
    "templateId" VARCHAR(120) COLLATE "C" NOT NULL,
    "version" INTEGER NOT NULL,
    "variant" VARCHAR(40) COLLATE "C" NOT NULL,
    "configuration" JSONB NOT NULL,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScenarioTemplateVersion_pkey" PRIMARY KEY ("templateId","version","variant")
);

-- CreateTable
CREATE TABLE "public"."TrainingSession" (
    "id" VARCHAR(120) COLLATE "C" NOT NULL,
    "ownerId" VARCHAR(120) COLLATE "C" NOT NULL,
    "templateId" VARCHAR(120) COLLATE "C" NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "variant" VARCHAR(40) COLLATE "C" NOT NULL,
    "status" VARCHAR(30) COLLATE "C" NOT NULL,
    "state" VARCHAR(40) COLLATE "C" NOT NULL,
    "revision" INTEGER NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "lastActivityAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3),

    CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TrainingAction" (
    "sessionId" VARCHAR(120) COLLATE "C" NOT NULL,
    "id" VARCHAR(120) COLLATE "C" NOT NULL,
    "kind" VARCHAR(40) COLLATE "C" NOT NULL,
    "fingerprint" TEXT COLLATE "C" NOT NULL,
    "state" VARCHAR(40) COLLATE "C" NOT NULL,
    "revision" INTEGER NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "validationStatus" VARCHAR(40) COLLATE "C" NOT NULL,

    CONSTRAINT "TrainingAction_pkey" PRIMARY KEY ("sessionId","id")
);

-- CreateTable
CREATE TABLE "public"."SessionOpportunity" (
    "position" INTEGER NOT NULL,
    "sessionId" VARCHAR(120) COLLATE "C" NOT NULL,
    "definitionId" VARCHAR(120) COLLATE "C" NOT NULL,
    "skill" VARCHAR(1) COLLATE "C" NOT NULL,
    "state" VARCHAR(40) COLLATE "C" NOT NULL,
    "eligibleMaximum" DOUBLE PRECISION NOT NULL,
    "earned" DOUBLE PRECISION NOT NULL,
    "openedAt" TIMESTAMPTZ(3) NOT NULL,
    "finalizedAt" TIMESTAMPTZ(3),
    "finalizedByActionId" VARCHAR(120) COLLATE "C",
    "correctWarningSignIds" JSONB NOT NULL,
    "incorrectEvidenceIds" JSONB NOT NULL,
    "assessment" VARCHAR(20) COLLATE "C",

    CONSTRAINT "SessionOpportunity_pkey" PRIMARY KEY ("sessionId","definitionId")
);

-- CreateTable
CREATE TABLE "public"."TrainingEvent" (
    "position" INTEGER NOT NULL,
    "sessionId" VARCHAR(120) COLLATE "C" NOT NULL,
    "id" VARCHAR(255) COLLATE "C" NOT NULL,
    "actionId" VARCHAR(120) COLLATE "C" NOT NULL,
    "opportunityId" VARCHAR(120) COLLATE "C" NOT NULL,
    "code" VARCHAR(60) COLLATE "C" NOT NULL,
    "state" VARCHAR(40) COLLATE "C" NOT NULL,
    "ruleId" VARCHAR(255) COLLATE "C" NOT NULL,
    "authority" VARCHAR(30) COLLATE "C" NOT NULL,
    "critical" BOOLEAN NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TrainingEvent_pkey" PRIMARY KEY ("sessionId","id")
);

-- CreateTable
CREATE TABLE "public"."DialogueTurnReceipt" (
    "sessionId" VARCHAR(120) COLLATE "C" NOT NULL,
    "id" VARCHAR(100) COLLATE "C" NOT NULL,
    "actionId" VARCHAR(120) COLLATE "C" NOT NULL,
    "inputKey" TEXT COLLATE "C" NOT NULL,
    "state" VARCHAR(40) COLLATE "C" NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "snapshotRevision" INTEGER NOT NULL,
    "committedRevision" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "candidateStatus" VARCHAR(40) COLLATE "C" NOT NULL,
    "usedFallback" BOOLEAN NOT NULL,
    "failureReason" VARCHAR(30) COLLATE "C",
    "attempts" INTEGER NOT NULL,

    CONSTRAINT "DialogueTurnReceipt_pkey" PRIMARY KEY ("sessionId","id")
);

-- CreateTable
CREATE TABLE "public"."TrainingMessage" (
    "position" INTEGER NOT NULL,
    "sessionId" VARCHAR(120) COLLATE "C" NOT NULL,
    "id" VARCHAR(120) COLLATE "C" NOT NULL,
    "turnId" VARCHAR(100) COLLATE "C" NOT NULL,
    "role" VARCHAR(20) COLLATE "C" NOT NULL,
    "text" TEXT COLLATE "C" NOT NULL,
    "state" VARCHAR(40) COLLATE "C" NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TrainingMessage_pkey" PRIMARY KEY ("sessionId","id")
);

-- CreateTable
CREATE TABLE "public"."TrainingResult" (
    "sessionId" VARCHAR(120) COLLATE "C" NOT NULL,
    "templateId" VARCHAR(120) COLLATE "C" NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "scores" JSONB NOT NULL,
    "trainingScore" DOUBLE PRECISION,
    "outcome" VARCHAR(30) COLLATE "C" NOT NULL,
    "criticalEventIds" JSONB NOT NULL,
    "weakestSkills" JSONB NOT NULL,
    "recommendation" JSONB NOT NULL,
    "calculatedAt" TIMESTAMPTZ(3) NOT NULL,
    "evaluationMode" VARCHAR(30) COLLATE "C" NOT NULL DEFAULT 'LEGACY_WEIGHTED_V1',
    "decisionSummary" JSONB,

    CONSTRAINT "TrainingResult_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "public"."UserAccount" (
    "id" CHAR(36) COLLATE "C" NOT NULL,
    "email" VARCHAR(254) COLLATE "C" NOT NULL,
    "passwordHash" CHAR(60) COLLATE "C" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QuizAttempt" (
    "id" VARCHAR(100) COLLATE "C" NOT NULL,
    "ownerId" VARCHAR(120) COLLATE "C" NOT NULL,
    "mode" VARCHAR(20) COLLATE "C" NOT NULL,
    "bankVersion" VARCHAR(80) COLLATE "C" NOT NULL,
    "blueprint" VARCHAR(80) COLLATE "C" NOT NULL,
    "status" VARCHAR(20) COLLATE "C" NOT NULL,
    "revision" INTEGER NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "snapshot" JSONB NOT NULL,
    "answers" JSONB NOT NULL,
    "result" JSONB,

    CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QuizReceipt" (
    "attemptId" VARCHAR(100) COLLATE "C" NOT NULL,
    "requestId" CHAR(36) COLLATE "C" NOT NULL,
    "fingerprint" CHAR(64) COLLATE "C" NOT NULL,
    "revision" INTEGER NOT NULL,

    CONSTRAINT "QuizReceipt_pkey" PRIMARY KEY ("attemptId","requestId")
);

-- CreateIndex
CREATE INDEX "TrainingSession_ownerId_status_idx" ON "public"."TrainingSession"("ownerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingAction_sessionId_revision_key" ON "public"."TrainingAction"("sessionId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "DialogueTurnReceipt_sessionId_actionId_key" ON "public"."DialogueTurnReceipt"("sessionId", "actionId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingMessage_sessionId_turnId_role_key" ON "public"."TrainingMessage"("sessionId", "turnId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "UserAccount_email_key" ON "public"."UserAccount"("email");

-- CreateIndex
CREATE INDEX "QuizAttempt_ownerId_startedAt_id_idx" ON "public"."QuizAttempt"("ownerId", "startedAt", "id");

-- CreateIndex
CREATE INDEX "QuizAttempt_ownerId_mode_bankVersion_blueprint_completedAt_idx" ON "public"."QuizAttempt"("ownerId", "mode", "bankVersion", "blueprint", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuizReceipt_attemptId_revision_key" ON "public"."QuizReceipt"("attemptId", "revision");

-- AddForeignKey
ALTER TABLE "public"."ScenarioTemplateVersion" ADD CONSTRAINT "ScenarioTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."Scenario"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."TrainingSession" ADD CONSTRAINT "TrainingSession_templateId_templateVersion_variant_fkey" FOREIGN KEY ("templateId", "templateVersion", "variant") REFERENCES "public"."ScenarioTemplateVersion"("templateId", "version", "variant") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."TrainingAction" ADD CONSTRAINT "TrainingAction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SessionOpportunity" ADD CONSTRAINT "SessionOpportunity_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SessionOpportunity" ADD CONSTRAINT "SessionOpportunity_sessionId_finalizedByActionId_fkey" FOREIGN KEY ("sessionId", "finalizedByActionId") REFERENCES "public"."TrainingAction"("sessionId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."TrainingEvent" ADD CONSTRAINT "TrainingEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TrainingEvent" ADD CONSTRAINT "TrainingEvent_sessionId_actionId_fkey" FOREIGN KEY ("sessionId", "actionId") REFERENCES "public"."TrainingAction"("sessionId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."TrainingEvent" ADD CONSTRAINT "TrainingEvent_sessionId_opportunityId_fkey" FOREIGN KEY ("sessionId", "opportunityId") REFERENCES "public"."SessionOpportunity"("sessionId", "definitionId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."DialogueTurnReceipt" ADD CONSTRAINT "DialogueTurnReceipt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DialogueTurnReceipt" ADD CONSTRAINT "DialogueTurnReceipt_sessionId_actionId_fkey" FOREIGN KEY ("sessionId", "actionId") REFERENCES "public"."TrainingAction"("sessionId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."TrainingMessage" ADD CONSTRAINT "TrainingMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TrainingMessage" ADD CONSTRAINT "TrainingMessage_sessionId_turnId_fkey" FOREIGN KEY ("sessionId", "turnId") REFERENCES "public"."DialogueTurnReceipt"("sessionId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "public"."TrainingResult" ADD CONSTRAINT "TrainingResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QuizReceipt" ADD CONSTRAINT "QuizReceipt_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "public"."QuizAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Published configurations are immutable even for direct SQL/no-op updates.
CREATE FUNCTION "public"."enforce_published_template_immutable"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PUBLISHED_TEMPLATE_IMMUTABLE';
END;
$$;
REVOKE ALL ON FUNCTION "public"."enforce_published_template_immutable"() FROM PUBLIC;

CREATE TRIGGER "published_template_no_update"
BEFORE UPDATE ON "public"."ScenarioTemplateVersion"
FOR EACH ROW EXECUTE FUNCTION "public"."enforce_published_template_immutable"();
CREATE TRIGGER "published_template_no_delete"
BEFORE DELETE ON "public"."ScenarioTemplateVersion"
FOR EACH ROW EXECUTE FUNCTION "public"."enforce_published_template_immutable"();

CREATE FUNCTION "public"."enforce_account_id_immutable"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id" THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACCOUNT_ID_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION "public"."enforce_account_id_immutable"() FROM PUBLIC;

CREATE TRIGGER "UserAccount_id_immutable"
BEFORE UPDATE ON "public"."UserAccount"
FOR EACH ROW EXECUTE FUNCTION "public"."enforce_account_id_immutable"();

COMMIT;
