import { createHash } from "node:crypto";
import type { ScenarioTemplate } from "../domain/schema.js";
import type { DecisionFeedback, TrainingAction, TrainingResult, TrainingSession } from "../domain/types.js";
import { parseAction } from "../domain/training-action.js";
import { interactionFor } from "../domain/call-behavior.js";
import { callCenterContinuousTemplates } from "../fixtures/call-center-continuous-stories.js";
import { callCenterLearningContent } from "../fixtures/call-center-learning-content.js";
import type { CallCenterLearningContent, RecoveryContent } from "../fixtures/call-center-learning-content.js";
import type { PublicPostDecisionGuidance } from "./contracts.js";

const key = (binding: CallCenterLearningContent["binding"]) => JSON.stringify([binding.templateId, binding.templateVersion, binding.variant]);
const templateKey = (t: ScenarioTemplate) => key({ templateId: t.id, templateVersion: t.version, variant: t.variant as "SCAM_CALL" | "NORMAL_CALL" });
const pairs = {
  CONFIRM_SIMULATED_TRANSFER: { code: "CONFIRM_UNVERIFIED_TRANSFER", type: "MONEY_TRANSFERRED" },
  SHARE_SIMULATED_OTP: { code: "DISCLOSE_OTP", type: "OTP_OR_CREDENTIAL_DISCLOSED" },
} as const;
const teachingSignals = ["VERIFY_CONTEXT", "URGENCY_PRESSURE", "SECRECY_PRESSURE", "TRANSFER_REQUEST", "OTP_REQUEST", "DELIVERY_CONFIRMATION", "TRANSACTION_NOTIFICATION"];
const officialHosts = new Set(["www.bot.or.th", "mdes.go.th", "www.thaipoliceonline.go.th"]);
function officialUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" && officialHosts.has(url.hostname) && !url.username && !url.password && !url.port; }
  catch { return false; }
}
const texts = (values: string[]) => values.length > 0 && values.every(value => typeof value === "string" && value.trim().length > 0);
const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
function invalid(): never { throw new Error("INVALID_CALL_LEARNING_CONTENT"); }

/** Static authored-content integrity, never an evaluator or a persisted-state validator. */
export function validateCallLearningContent(content: CallCenterLearningContent, templates: readonly ScenarioTemplate[] = callCenterContinuousTemplates): void {
  const t = templates.find(candidate => templateKey(candidate) === key(content.binding));
  if (!t || t.category !== "CALL_CENTER" || t.version !== 6 || !t.callCenter?.continuousConversation ||
    t.evaluationMode !== "DECISION_RULES_V1" || !/^L-[a-f0-9-]{36}$/.test(content.contentId) ||
    !Number.isSafeInteger(content.contentVersion) || content.contentVersion < 1 || !date(content.reviewedAt)) invalid();
  if (content.checkpoints.length !== t.opportunities.length || new Set(content.checkpoints.map(c => c.checkpointId)).size !== content.checkpoints.length) invalid();
  for (const definition of t.opportunities) {
    const guidance = content.checkpoints.find(c => c.checkpointId === definition.id);
    if (definition.skill !== "D" || !guidance || !texts([guidance.unansweredAlternative]) ||
      Object.keys(guidance.choices).length !== definition.choices.length ||
      definition.choices.some(choice => !texts([guidance.choices[choice.id] ?? ""]))) invalid();
  }
  if (!content.tutorials.length || new Set(content.tutorials.map(b => b.id)).size !== content.tutorials.length) invalid();
  for (const block of content.tutorials) {
    const state = t.states.find(s => s.id === block.state);
    if (!state?.conversation?.allowedSignals.includes(block.signal) || !teachingSignals.includes(block.signal) ||
      !texts([block.id, block.title, block.explanation]) || !texts(block.independentVerification) || !texts(block.commonMistakes) || !texts(block.nextTimePrevention)) invalid();
  }
  if (content.recovery.length !== t.criticalFailureRules.length || new Set(content.recovery.map(r => r.ruleId)).size !== content.recovery.length) invalid();
  for (const recovery of content.recovery) {
    const rule = t.criticalFailureRules.find(r => r.id === recovery.ruleId);
    const pair = pairs[recovery.ruleId as keyof typeof pairs];
    if (t.variant !== "SCAM_CALL" || !rule || !pair || rule.eventCode !== recovery.eventCode || pair.code !== recovery.eventCode ||
      pair.type !== recovery.incidentType || !rule.requiresExplicitAction || !rule.publicLabel ||
      !texts(recovery.immediateActions) || !texts(recovery.evidenceToPreserve) || !texts(recovery.accountRecoverySteps) ||
      !texts(recovery.nextTimePrevention) || !texts([recovery.retryRecommendation]) ||
      !recovery.officialHelp.length || recovery.officialHelp.some(h => !["BANK", "AOC", "POLICE"].includes(h.category) || !h.label.trim() || !officialUrl(h.url))) invalid();
  }
  for (const sources of [content.sources, ...content.recovery.map(r => r.sources)]) {
    if (!sources.length || sources.some(s => !s.title.trim() || !officialUrl(s.url) || !date(s.reviewedAt))) invalid();
  }
}
for (const content of callCenterLearningContent) validateCallLearningContent(content);
if (new Set(callCenterLearningContent.map(c => key(c.binding))).size !== callCenterLearningContent.length ||
  new Set(callCenterLearningContent.map(c => c.contentId)).size !== callCenterLearningContent.length) invalid();

/** Keep the existing opaque reference contract identical for both result views. */
export function decisionRuleRef(result: TrainingResult, ruleId: string) {
  return `R-${createHash("sha256").update(`${result.templateId}@${result.templateVersion}:${ruleId}`).digest("hex").slice(0, 16)}`;
}
function parsed(action: TrainingAction | undefined) {
  if (!action) return null;
  try { return parseAction(JSON.parse(action.fingerprint)); } catch { return null; }
}
function confirmedAction(s: TrainingSession, t: ScenarioTemplate, definition: RecoveryContent): TrainingAction | undefined {
  const rule = t.criticalFailureRules.find(r => r.id === definition.ruleId && r.eventCode === definition.eventCode);
  if (t.variant !== "SCAM_CALL" || !rule) return;
  for (const event of s.events) {
    if (event.sessionId !== s.id || !event.critical || event.authority !== "BACKEND_VALIDATED" || event.ruleId !== rule.id ||
      event.code !== rule.eventCode || event.state !== rule.state || event.opportunityId !== rule.opportunityId || !s.result?.criticalEventIds.includes(event.id)) continue;
    const action = s.actions.find(a => a.id === event.actionId && a.sessionId === s.id && a.state === rule.state &&
      a.kind === "SIMULATED_ACTION" && a.validationStatus === "ACCEPTED" && a.revision < s.revision);
    const input = parsed(action);
    if (input?.kind === "SIMULATED_ACTION" && input.confirmed && input.ruleId === rule.id) return action;
  }
}
function selectedAction(s: TrainingSession, t: ScenarioTemplate, feedback: DecisionFeedback, content: CallCenterLearningContent) {
  const checkpoint = content.checkpoints.find(c => c.checkpointId === feedback.checkpointId);
  const definition = t.opportunities.find(o => o.id === feedback.checkpointId);
  if (!checkpoint || definition?.skill !== "D") return { label: null, alternative: "" };
  if (feedback.assessment === "CRITICAL") {
    const recovery = content.recovery.find(r => r.ruleId === feedback.ruleId);
    const rule = t.criticalFailureRules.find(r => r.id === feedback.ruleId);
    return { label: recovery && confirmedAction(s, t, recovery) ? rule?.publicLabel ?? null : null,
      alternative: checkpoint.choices.refuse ?? checkpoint.unansweredAlternative };
  }
  const opportunity = s.opportunities.find(o => o.definitionId === definition.id && o.finalizedAt !== null);
  const action = s.actions.find(a => a.id === opportunity?.finalizedByActionId && a.sessionId === s.id && a.state === definition.state &&
    a.validationStatus === "ACCEPTED" && a.revision < s.revision);
  const input = parsed(action);
  const choiceId = input?.kind === "DECISION" && input.opportunityId === definition.id ? input.choiceId
    : input?.kind === "CALL_INTERACTION" && action ? interactionFor(t, action.state, input.interactionId)?.resolutionChoiceId : undefined;
  const choice = definition.choices.find(c => c.id === choiceId);
  return { label: choice && feedback.ruleId === `${definition.id}:${choice.id}` ? choice.publicLabel ?? null : null,
    alternative: choice ? checkpoint.choices[choice.id]! : checkpoint.unansweredAlternative };
}

/** Read-only result enrichment. Ownership remains enforced by the existing application boundary. */
export function projectPostDecisionGuidance(s: TrainingSession, t: ScenarioTemplate): PublicPostDecisionGuidance | undefined {
  const result = s.result;
  if (!result || !["COMPLETED", "FAILED"].includes(s.status) || t.category !== "CALL_CENTER" ||
    result.evaluationMode !== "DECISION_RULES_V1" || s.templateId !== t.id || s.templateVersion !== t.version || s.variant !== t.variant ||
    result.templateId !== s.templateId || result.templateVersion !== s.templateVersion || result.sessionId !== s.id) return;
  const content = callCenterLearningContent.find(c => key(c.binding) === templateKey(t));
  if (!content) return;
  const tutorial = content.tutorials.flatMap((block, index) => {
    const allowed = t.states.find(state => state.id === block.state)?.conversation?.allowedSignals;
    const committed = s.dialogueTurns.some(turn => turn.state === block.state && turn.templateVersion === t.version &&
      turn.committedRevision > 0 && turn.committedRevision <= s.revision && turn.response.interaction_signal === block.signal &&
      allowed?.includes(block.signal) && s.messages.some(message => message.turnId === turn.id && message.role === "character" && message.state === block.state));
    return committed ? [{ ref: `T-${index + 1}`, title: block.title, explanation: block.explanation,
      independentVerification: [...block.independentVerification], commonMistakes: [...block.commonMistakes], nextTimePrevention: [...block.nextTimePrevention] }] : [];
  });
  const recovery = content.recovery.flatMap(definition => {
    if (!confirmedAction(s, t, definition)) return [];
    return [{ incidentType: definition.incidentType, confirmedAction: t.criticalFailureRules.find(r => r.id === definition.ruleId)!.publicLabel!,
      immediateActions: [...definition.immediateActions], evidenceToPreserve: [...definition.evidenceToPreserve],
      officialHelp: definition.officialHelp.map(h => ({ ...h })), accountRecoverySteps: [...definition.accountRecoverySteps],
      nextTimePrevention: [...definition.nextTimePrevention], retryRecommendation: definition.retryRecommendation,
      sources: definition.sources.map(source => ({ ...source })) }];
  });
  return { contentRef: content.contentId, contentVersion: content.contentVersion, reviewedAt: content.reviewedAt,
    checkpoints: (result.decisionSummary?.checkpoints ?? []).map(feedback => {
      const selected = selectedAction(s, t, feedback, content);
      return { ruleRef: decisionRuleRef(result, feedback.ruleId), label: feedback.label, assessment: feedback.assessment,
        explanation: feedback.explanation, selectedAction: selected.label, saferAlternative: selected.alternative };
    }), tutorial, recovery,
    nextTimePrevention: [...new Set([...tutorial.flatMap(block => block.nextTimePrevention), ...recovery.flatMap(guide => guide.nextTimePrevention)])]
      .concat(tutorial.length || recovery.length ? [] : ["หากยังมีข้อสงสัย ให้ตรวจสอบผ่านช่องทางที่คุณมีอยู่เองก่อนทำตามคำขอ"]),
  };
}
