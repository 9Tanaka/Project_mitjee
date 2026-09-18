import type { StartTrainingInput, SendMessageInput, SubmitActionInput, QuitTrainingInput,
  PublicScenario, PublicTrainingSession, PublicTrainingResult, TrainingMutation, TrainingMessageReply } from "../application/contracts.js";
import * as dto from "./dto.js";

// Explicit transport-to-application copies; HTTP inferred types never own app contracts.
export const toStartInput = (v: dto.StartRequest): StartTrainingInput => ({ startId: v.startId, expectedRevision: v.expectedRevision });
export const toMessageInput = (v: dto.MessageRequest): SendMessageInput => ({ turnId: v.turnId, expectedRevision: v.expectedRevision, text: v.text });
export const toQuitInput = (v: dto.QuitRequest): QuitTrainingInput => ({ actionId: v.actionId, expectedRevision: v.expectedRevision });
export function toActionInput(v: dto.ActionRequest): SubmitActionInput {
  const p = v.payload;
  const payload = "choiceId" in p ? { choiceId: p.choiceId } : "selectedEvidenceIds" in p
    ? { selectedEvidenceIds: [...p.selectedEvidenceIds] } : "confirmed" in p ? { confirmed: p.confirmed } : {};
  return { actionId: v.actionId, expectedRevision: v.expectedRevision, actionDefinitionId: v.actionDefinitionId, payload };
}

// App already uses explicit public projections; strict response validation stays here.
export const toScenarioDto = (v: PublicScenario) => dto.scenarioDto.parse(v);
export const toSessionDto = (v: PublicTrainingSession) => dto.sessionDto.parse(v);
export const toResultDto = (v: PublicTrainingResult) => dto.resultDto.parse(v);
export const toMutationDto = (v: TrainingMutation) => dto.mutationDto.parse(v);
export const toMessageDto = (v: TrainingMessageReply) => dto.messageDto.parse(v);
