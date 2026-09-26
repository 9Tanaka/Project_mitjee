import { z } from "zod";

export const publicId = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const emptyQuery = z.strictObject({});
export const scenarioParams = z.strictObject({ scenarioId: publicId });
export const sessionParams = z.strictObject({ sessionId: publicId });
export const startRequest = z.strictObject({ startId: z.uuid(), expectedRevision: z.literal(0) });
export const messageRequest = z.strictObject({ turnId: publicId, expectedRevision: revision, text: z.string().trim().min(1).max(8000) });
export const actionRequest = z.strictObject({
  actionId: publicId, expectedRevision: revision, actionDefinitionId: publicId,
  payload: z.union([
    z.strictObject({ choiceId: publicId }),
    z.strictObject({ selectedEvidenceIds: z.array(publicId).max(100) }),
    z.strictObject({ confirmed: z.boolean() }), z.strictObject({}),
  ]),
});
export const quitRequest = z.strictObject({ actionId: publicId, expectedRevision: revision });
export type ActionRequest = z.infer<typeof actionRequest>;
export type MessageRequest = z.infer<typeof messageRequest>;
export type StartRequest = z.infer<typeof startRequest>;
export type QuitRequest = z.infer<typeof quitRequest>;

export const scenarioDto = z.strictObject({
  id: publicId, category: z.string(), title: z.string(), description: z.string(),
  learningObjectives: z.array(z.string()), communicationMode: z.literal("TEXT"),
});
const optionDto = z.strictObject({ id: publicId, label: z.string() });
export const publicActionDto = z.strictObject({
  id: publicId, label: z.string(), input: z.enum(["CHOICE", "EVIDENCE", "CONFIRM", "NONE"]),
  options: z.array(optionDto),
});
export const sessionDto = z.strictObject({
  sessionId: publicId, scenario: scenarioDto,
  status: z.enum(["ACTIVE", "COMPLETED", "FAILED", "ABANDONED", "EXPIRED"]),
  currentStatePublicLabel: z.string(), revision,
  messages: z.array(z.strictObject({ turnId: publicId, role: z.enum(["user", "character"]), text: z.string().max(8000) })),
  availableActions: z.array(publicActionDto),
});
export const mutationDto = z.strictObject({ session: sessionDto, duplicate: z.boolean() });
export const messageDto = z.strictObject({
  session: sessionDto, duplicate: z.boolean(),
  turn: z.strictObject({ turnId: publicId, committedRevision: revision, characterMessage: z.string().max(8000) }),
});
const score = z.number().finite().min(0).max(100).nullable();
export const resultDto = z.strictObject({
  sessionId: publicId, revision, D: score, W: score, S: score, trainingScore: score,
  outcome: z.enum(["PASSED", "NOT_PASSED", "CRITICAL_FAILURE", "NEEDS_PRACTICE", "UNASSESSED"]),
  weakestSkills: z.array(z.enum(["D", "W", "S"])),
  evaluationMode: z.enum(["LEGACY_WEIGHTED_V1", "DECISION_RULES_V1"]).optional(),
  decisionSummary: z.strictObject({ encountered: z.number().int().nonnegative(), safe: z.number().int().nonnegative(), review: z.number().int().nonnegative(), unassessed: z.number().int().nonnegative() }).nullable().optional(),
  recommendation: z.strictObject({
    recommendationType: z.enum(["DECISION_PRACTICE", "WARNING_SIGN_LESSON", "WARNING_SIGN_QUIZ", "SAFE_ACTION_CONTENT", "CRITICAL_FAILURE_REVIEW", "PATH_REFLECTION"]),
    recommendationKey: z.string(), reason: z.string(),
  }),
});
export const errorEnvelope = z.strictObject({ error: z.strictObject({ code: z.string(), message: z.string() }) });
export const successEnvelope = <T extends z.ZodType>(schema: T) => z.strictObject({ data: schema });
