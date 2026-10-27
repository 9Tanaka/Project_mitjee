-- Additive: existing Training data and migration history are untouched.
-- No FK to TrainingSession.ownerId: historic opaque owner IDs remain valid.
CREATE TABLE `UserAccount` (
  `id` CHAR(36) NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  `passwordHash` CHAR(60) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `UserAccount_email_key`(`email`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

CREATE TRIGGER `UserAccount_id_immutable`
BEFORE UPDATE ON `UserAccount` FOR EACH ROW
BEGIN
  IF NOT (NEW.id <=> OLD.id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ACCOUNT_ID_IMMUTABLE';
  END IF;
END;
