-- CreateTable
CREATE TABLE `Scenario` (
    `id` VARCHAR(120) NOT NULL,
    `category` VARCHAR(40) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `ScenarioTemplateVersion` (
    `templateId` VARCHAR(120) NOT NULL,
    `version` INTEGER NOT NULL,
    `variant` VARCHAR(40) NOT NULL,
    `configuration` JSON NOT NULL,
    `publishedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`templateId`, `version`, `variant`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `TrainingSession` (
    `id` VARCHAR(120) NOT NULL,
    `ownerId` VARCHAR(120) NOT NULL,
    `templateId` VARCHAR(120) NOT NULL,
    `templateVersion` INTEGER NOT NULL,
    `variant` VARCHAR(40) NOT NULL,
    `status` VARCHAR(30) NOT NULL,
    `state` VARCHAR(40) NOT NULL,
    `revision` INTEGER NOT NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `lastActivityAt` DATETIME(3) NOT NULL,
    `endedAt` DATETIME(3) NULL,

    INDEX `TrainingSession_ownerId_status_idx`(`ownerId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `TrainingAction` (
    `sessionId` VARCHAR(120) NOT NULL,
    `id` VARCHAR(120) NOT NULL,
    `kind` VARCHAR(40) NOT NULL,
    `fingerprint` TEXT NOT NULL,
    `state` VARCHAR(40) NOT NULL,
    `revision` INTEGER NOT NULL,
    `at` DATETIME(3) NOT NULL,
    `validationStatus` VARCHAR(40) NOT NULL,

    UNIQUE INDEX `TrainingAction_sessionId_revision_key`(`sessionId`, `revision`),
    PRIMARY KEY (`sessionId`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `SessionOpportunity` (
    `position` INTEGER NOT NULL,
    `sessionId` VARCHAR(120) NOT NULL,
    `definitionId` VARCHAR(120) NOT NULL,
    `skill` VARCHAR(1) NOT NULL,
    `state` VARCHAR(40) NOT NULL,
    `eligibleMaximum` DOUBLE NOT NULL,
    `earned` DOUBLE NOT NULL,
    `openedAt` DATETIME(3) NOT NULL,
    `finalizedAt` DATETIME(3) NULL,
    `finalizedByActionId` VARCHAR(120) NULL,
    `correctWarningSignIds` JSON NOT NULL,
    `incorrectEvidenceIds` JSON NOT NULL,

    PRIMARY KEY (`sessionId`, `definitionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `TrainingEvent` (
    `position` INTEGER NOT NULL,
    `sessionId` VARCHAR(120) NOT NULL,
    `id` VARCHAR(255) NOT NULL,
    `actionId` VARCHAR(120) NOT NULL,
    `opportunityId` VARCHAR(120) NOT NULL,
    `code` VARCHAR(60) NOT NULL,
    `state` VARCHAR(40) NOT NULL,
    `ruleId` VARCHAR(255) NOT NULL,
    `authority` VARCHAR(30) NOT NULL,
    `critical` BOOLEAN NOT NULL,
    `at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`sessionId`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `DialogueTurnReceipt` (
    `sessionId` VARCHAR(120) NOT NULL,
    `id` VARCHAR(100) NOT NULL,
    `actionId` VARCHAR(120) NOT NULL,
    `inputKey` TEXT NOT NULL,
    `state` VARCHAR(40) NOT NULL,
    `templateVersion` INTEGER NOT NULL,
    `snapshotRevision` INTEGER NOT NULL,
    `committedRevision` INTEGER NOT NULL,
    `response` JSON NOT NULL,
    `candidateStatus` VARCHAR(40) NOT NULL,
    `usedFallback` BOOLEAN NOT NULL,
    `failureReason` VARCHAR(30) NULL,
    `attempts` INTEGER NOT NULL,

    UNIQUE INDEX `DialogueTurnReceipt_sessionId_actionId_key`(`sessionId`, `actionId`),
    PRIMARY KEY (`sessionId`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `TrainingMessage` (
    `position` INTEGER NOT NULL,
    `sessionId` VARCHAR(120) NOT NULL,
    `id` VARCHAR(120) NOT NULL,
    `turnId` VARCHAR(100) NOT NULL,
    `role` VARCHAR(20) NOT NULL,
    `text` TEXT NOT NULL,
    `state` VARCHAR(40) NOT NULL,
    `at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TrainingMessage_sessionId_turnId_role_key`(`sessionId`, `turnId`, `role`),
    PRIMARY KEY (`sessionId`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `TrainingResult` (
    `sessionId` VARCHAR(120) NOT NULL,
    `templateId` VARCHAR(120) NOT NULL,
    `templateVersion` INTEGER NOT NULL,
    `scores` JSON NOT NULL,
    `trainingScore` DOUBLE NULL,
    `outcome` VARCHAR(30) NOT NULL,
    `criticalEventIds` JSON NOT NULL,
    `weakestSkills` JSON NOT NULL,
    `recommendation` JSON NOT NULL,
    `calculatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`sessionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- AddForeignKey
ALTER TABLE `ScenarioTemplateVersion` ADD CONSTRAINT `ScenarioTemplateVersion_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `Scenario`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `TrainingSession` ADD CONSTRAINT `TrainingSession_templateId_templateVersion_variant_fkey` FOREIGN KEY (`templateId`, `templateVersion`, `variant`) REFERENCES `ScenarioTemplateVersion`(`templateId`, `version`, `variant`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `TrainingAction` ADD CONSTRAINT `TrainingAction_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `TrainingSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SessionOpportunity` ADD CONSTRAINT `SessionOpportunity_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `TrainingSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SessionOpportunity` ADD CONSTRAINT `SessionOpportunity_sessionId_finalizedByActionId_fkey` FOREIGN KEY (`sessionId`, `finalizedByActionId`) REFERENCES `TrainingAction`(`sessionId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `TrainingEvent` ADD CONSTRAINT `TrainingEvent_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `TrainingSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TrainingEvent` ADD CONSTRAINT `TrainingEvent_sessionId_actionId_fkey` FOREIGN KEY (`sessionId`, `actionId`) REFERENCES `TrainingAction`(`sessionId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `TrainingEvent` ADD CONSTRAINT `TrainingEvent_sessionId_opportunityId_fkey` FOREIGN KEY (`sessionId`, `opportunityId`) REFERENCES `SessionOpportunity`(`sessionId`, `definitionId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DialogueTurnReceipt` ADD CONSTRAINT `DialogueTurnReceipt_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `TrainingSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DialogueTurnReceipt` ADD CONSTRAINT `DialogueTurnReceipt_sessionId_actionId_fkey` FOREIGN KEY (`sessionId`, `actionId`) REFERENCES `TrainingAction`(`sessionId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `TrainingMessage` ADD CONSTRAINT `TrainingMessage_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `TrainingSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TrainingMessage` ADD CONSTRAINT `TrainingMessage_sessionId_turnId_fkey` FOREIGN KEY (`sessionId`, `turnId`) REFERENCES `DialogueTurnReceipt`(`sessionId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `TrainingResult` ADD CONSTRAINT `TrainingResult_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `TrainingSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Every registered version is published. No configuration mutation, even through a direct client.
CREATE TRIGGER `published_template_no_update` BEFORE UPDATE ON `ScenarioTemplateVersion`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'PUBLISHED_TEMPLATE_IMMUTABLE';

CREATE TRIGGER `published_template_no_delete` BEFORE DELETE ON `ScenarioTemplateVersion`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'PUBLISHED_TEMPLATE_IMMUTABLE';
