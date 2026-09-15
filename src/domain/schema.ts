import { z } from "zod";
import { CATEGORIES, CRITICAL_CODES, EVENT_CODES, STATES } from "./constants.js";

const id = z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/);
const event = z.enum(EVENT_CODES);
const points = z.number().finite().nonnegative();

const common = {
  id,
  state: z.enum(STATES),
  required: z.boolean(),
  // MVP: static, backend-owned content is offered on state entry; no AI exposure inference.
  activation: z.literal("STATE_ENTRY"),
};

export const opportunitySchema = z.discriminatedUnion("skill", [
  z.strictObject({
    ...common, skill: z.literal("D"), maxScore: z.literal(10),
    choices: z.array(z.strictObject({
      id, rating: z.enum(["safe", "partially_safe", "risky"]),
      score: z.union([z.literal(0), z.literal(5), z.literal(10)]),
      eventCodes: z.array(event),
    })).min(1),
  }),
  z.strictObject({
    ...common, skill: z.literal("W"),
    evidence: z.array(z.strictObject({
      id, text: z.string().min(1), warningSignId: id.nullable(),
    })).min(1),
  }),
  z.strictObject({
    ...common, skill: z.literal("S"), maxScore: points.positive(),
    actions: z.array(z.strictObject({
      id, score: points, eventCodes: z.array(event),
    })).min(1),
  }),
]);

export const scenarioTemplateSchema = z.strictObject({
  id, version: z.number().int().positive(),
  category: z.enum(CATEGORIES),
  variant: z.enum(["DEFAULT", "NORMAL_CALL", "SCAM_CALL"]),
  title: z.string().min(1), learningObjectives: z.array(z.string().min(1)).min(1),
  // Optional for existing Core-only versions. Dialogue-enabled versions must specify a role.
  characterRole: z.string().min(1).max(1000).optional(),
  fictionalOnly: z.literal(true), initialState: z.literal("contact"),
  states: z.array(z.strictObject({
    id: z.enum(STATES), objective: z.string().min(1),
    allowedBehaviors: z.array(z.string()), forbiddenBehaviors: z.array(z.string()),
    allowedEventCodes: z.array(event),
    fallbackMessage: z.string().min(1),
    transitions: z.array(z.strictObject({
      id, target: z.enum(STATES),
      requiresFinalized: z.array(id), requiresEvents: z.array(event),
      safeResolution: z.boolean(),
    })),
  })).min(2),
  opportunities: z.array(opportunitySchema).min(1),
  criticalFailureRules: z.array(z.strictObject({
    id, state: z.enum(STATES), opportunityId: id,
    eventCode: z.enum(CRITICAL_CODES), requiresExplicitAction: z.literal(true),
    requiresAbsentEvents: z.array(event),
  })),
  recommendations: z.strictObject({
    D: z.strictObject({ type: z.literal("DECISION_PRACTICE"), key: id, reason: z.string().min(1) }),
    W: z.strictObject({ type: z.enum(["WARNING_SIGN_LESSON", "WARNING_SIGN_QUIZ"]), key: id, reason: z.string().min(1) }),
    S: z.strictObject({ type: z.literal("SAFE_ACTION_CONTENT"), key: id, reason: z.string().min(1) }),
    critical: z.strictObject({ type: z.literal("CRITICAL_FAILURE_REVIEW"), key: id, reason: z.string().min(1) }),
  }),
});

export type ScenarioTemplate = z.infer<typeof scenarioTemplateSchema>;
export type OpportunityDefinition = z.infer<typeof opportunitySchema>;
export type CriticalFailureRule = ScenarioTemplate["criticalFailureRules"][number];
