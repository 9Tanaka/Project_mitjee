import type { CATEGORIES, EVENT_CODES, STATES } from "./constants.js";
import type { DialogueTurn, TrainingMessage } from "../dialogue/contracts.js";

export type ScenarioState = typeof STATES[number];
export type ScenarioCategory = typeof CATEGORIES[number];
export type EventCode = typeof EVENT_CODES[number];
export type Skill = "D" | "W" | "S";
export type SessionStatus = "ACTIVE" | "COMPLETED" | "FAILED" | "ABANDONED" | "EXPIRED";
export type Outcome = "PASSED" | "NOT_PASSED" | "CRITICAL_FAILURE" | "NEEDS_PRACTICE" | "UNASSESSED";
export type DecisionAssessment = "SAFE" | "REVIEW" | "UNASSESSED";
export type EvaluationMode = "LEGACY_WEIGHTED_V1" | "DECISION_RULES_V1";
export interface DecisionFeedback {
  checkpointId: string;
  ruleId: string;
  label: string;
  assessment: DecisionAssessment | "CRITICAL";
  explanation: string;
}
export type ValidationStatus = "ACCEPTED" | "NO_EVENT" | "CLARIFICATION_REQUIRED" | "REJECTED";

// AI interpretation has no authority. No score or state-change command belongs here.
export interface AICandidateEvent {
  eventCode: EventCode | null;
  opportunityId: string | null;
  sourceMessageId: string;
  confidence: number | null;
}

// What the user did. Raw free text and real credentials are not retained by this core.
export interface TrainingAction {
  id: string;
  sessionId: string;
  kind: string;
  fingerprint: string;
  state: ScenarioState;
  revision: number;
  at: number;
  validationStatus: ValidationStatus;
}

export interface SessionOpportunity {
  definitionId: string;
  skill: Skill;
  state: ScenarioState;
  eligibleMaximum: number;
  earned: number;
  openedAt: number;
  finalizedAt: number | null;
  finalizedByActionId: string | null;
  correctWarningSignIds: string[];
  incorrectEvidenceIds: string[];
  assessment?: DecisionAssessment | null;
}

// Only created from a backend-validated plan; never imported from an AI DTO.
export interface TrainingEvent {
  id: string;
  sessionId: string;
  actionId: string;
  opportunityId: string;
  code: EventCode;
  state: ScenarioState;
  ruleId: string;
  authority: "BACKEND_VALIDATED";
  critical: boolean;
  at: number;
}

export interface SkillScore {
  earned: number;
  eligibleMaximum: number;
  normalized: number | null;
}

export interface Recommendation {
  recommendationType: "DECISION_PRACTICE" | "WARNING_SIGN_LESSON" | "WARNING_SIGN_QUIZ" | "SAFE_ACTION_CONTENT" | "CRITICAL_FAILURE_REVIEW" | "PATH_REFLECTION";
  recommendationKey: string;
  reason: string;
}

// The Scoring Engine computes this, not the client, model, or Event Registry.
export interface TrainingResult {
  sessionId: string;
  templateId: string;
  templateVersion: number;
  scores: Record<Skill, SkillScore>;
  trainingScore: number | null;
  outcome: Outcome;
  criticalEventIds: string[];
  weakestSkills: Skill[];
  recommendation: Recommendation;
  calculatedAt: number;
  evaluationMode?: EvaluationMode;
  decisionSummary?: { encountered: number; safe: number; review: number; unassessed: number; critical?: number; checkpoints?: DecisionFeedback[] } | null;
}

export interface TrainingSession {
  id: string;
  ownerId: string;
  templateId: string;
  templateVersion: number;
  variant: "DEFAULT" | "NORMAL_CALL" | "SCAM_CALL";
  status: SessionStatus;
  state: ScenarioState;
  revision: number;
  startedAt: number;
  lastActivityAt: number;
  endedAt: number | null;
  opportunities: SessionOpportunity[];
  actions: TrainingAction[];
  events: TrainingEvent[];
  result: TrainingResult | null;
  messages: TrainingMessage[];
  dialogueTurns: DialogueTurn[];
}

export class DomainError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message === code ? code : `${code}: ${message}`);
    this.name = "DomainError";
  }
}
