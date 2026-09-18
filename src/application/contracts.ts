import type { Outcome, Recommendation, SessionStatus, Skill } from "../domain/types.js";

/** Identity already verified by an outer adapter. Never a client-supplied owner ID. */
export interface AuthenticatedPrincipal { id: string }
export interface StartTrainingInput { startId: string; expectedRevision: 0 }
export interface SendMessageInput { turnId: string; expectedRevision: number; text: string }
export type PublicActionPayload = { choiceId: string } | { selectedEvidenceIds: string[] } | { confirmed: boolean } | Record<string, never>;
export interface SubmitActionInput {
  actionId: string;
  expectedRevision: number;
  actionDefinitionId: string;
  payload: PublicActionPayload;
}
export interface QuitTrainingInput { actionId: string; expectedRevision: number }

export interface PublicScenario {
  id: string; category: string; title: string; description: string;
  learningObjectives: string[]; communicationMode: "TEXT";
}
export interface PublicActionDefinition {
  id: string; label: string; input: "CHOICE" | "EVIDENCE" | "CONFIRM" | "NONE";
  options: { id: string; label: string }[];
}
export interface PublicTrainingSession {
  sessionId: string; scenario: PublicScenario; status: SessionStatus;
  currentStatePublicLabel: string; revision: number;
  messages: { turnId: string; role: "user" | "character"; text: string }[];
  availableActions: PublicActionDefinition[];
}
export interface PublicTrainingResult {
  sessionId: string; revision: number;
  D: number | null; W: number | null; S: number | null; trainingScore: number | null;
  outcome: Outcome; weakestSkills: Skill[]; recommendation: Recommendation;
}
export interface TrainingMutation { session: PublicTrainingSession; duplicate: boolean }
export interface TrainingMessageReply extends TrainingMutation {
  turn: { turnId: string; committedRevision: number; characterMessage: string };
}
