CREATE TABLE `QuizAttempt` (
  `id` VARCHAR(100) NOT NULL,
  `ownerId` VARCHAR(120) NOT NULL,
  `mode` VARCHAR(20) NOT NULL,
  `bankVersion` VARCHAR(80) NOT NULL,
  `blueprint` VARCHAR(80) NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `revision` INTEGER NOT NULL,
  `startedAt` DATETIME(3) NOT NULL,
  `completedAt` DATETIME(3) NULL,
  `snapshot` JSON NOT NULL,
  `answers` JSON NOT NULL,
  `result` JSON NULL,
  INDEX `QuizAttempt_ownerId_startedAt_id_idx` (`ownerId`, `startedAt`, `id`),
  INDEX `QuizAttempt_ownerId_mode_bankVersion_blueprint_completedAt_idx` (`ownerId`, `mode`, `bankVersion`, `blueprint`, `completedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `QuizReceipt` (
  `attemptId` VARCHAR(100) NOT NULL,
  `requestId` CHAR(36) NOT NULL,
  `fingerprint` CHAR(64) NOT NULL,
  `revision` INTEGER NOT NULL,
  UNIQUE INDEX `QuizReceipt_attemptId_revision_key` (`attemptId`, `revision`),
  PRIMARY KEY (`attemptId`, `requestId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `QuizReceipt` ADD CONSTRAINT `QuizReceipt_attemptId_fkey` FOREIGN KEY (`attemptId`) REFERENCES `QuizAttempt` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
