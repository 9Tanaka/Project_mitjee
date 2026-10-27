import { callCenterBehaviorTemplates } from "./call-center-behavior-stories.js";
import type { ScenarioTemplate } from "../domain/schema.js";

// New immutable publication; v1-v5 are not edited. All targets remain authored here.
export const callCenterContinuousTemplates: ScenarioTemplate[] = callCenterBehaviorTemplates.map(source => {
  const t = structuredClone(source); t.version = 6; t.callCenter!.continuousConversation = true;
  const scam = t.variant === "SCAM_CALL", parcel = t.callCenter!.topic === "PARCEL";
  for (const o of t.opportunities) {
    o.activation = "CALLER_SIGNAL";
    o.publicCheckpointLabel = o.state === "PRESSURE" ? "มีส่วนใดที่ต้องการพิจารณาก่อนดำเนินการต่อ?" : "คุณต้องการทำอะไรต่อ?";
  }
  for (const s of t.states) {
    if (s.id === "INCOMING_CALL" || s.id === "END_SCENARIO") continue;
    const signal = s.id === "CALL_CONNECTED" || s.id === "IDENTITY_CLAIM" ? "IDENTITY_INFORMATION"
      : s.id === "CONTEXT_CLAIM" ? "VERIFY_CONTEXT"
        : s.id === "PRESSURE" ? (parcel ? "SECRECY_PRESSURE" : "URGENCY_PRESSURE")
          : s.id === "MAIN_REQUEST" ? (scam ? (parcel ? "TRANSFER_REQUEST" : "OTP_REQUEST") : (parcel ? "DELIVERY_CONFIRMATION" : "TRANSACTION_NOTIFICATION")) : "NONE";
    const decisions = t.opportunities.some(o => o.state === s.id);
    const signals: NonNullable<ScenarioTemplate["states"][number]["conversation"]>["allowedSignals"] = s.id === "CALL_CONNECTED" ? ["NONE", "IDENTITY_INFORMATION"]
      : s.id === "CONTEXT_CLAIM" ? ["CONTEXT_INFORMATION", "VERIFY_CONTEXT"]
        : s.id === "PRESSURE" ? ["URGENCY_PRESSURE", "SECRECY_PRESSURE"] : [signal];
    // Observation/questions happen through dialogue; navigation is separate from decisions.
    s.interactions = s.interactions!.filter(i => !["ASKED_CALLER_IDENTITY", "ASKED_FOR_REFERENCE", "REQUESTED_CLARIFICATION"].includes(i.behavior));
    for (const i of s.interactions) if (["HUNG_UP", "CALLED_OFFICIAL_CHANNEL"].includes(i.behavior)) {
      i.transitionId = `${s.id}-hangup`;
    }
    s.transitions = s.transitions.filter(e => e.id !== `${s.id}-end`);
    for (const e of s.transitions) e.internalOnly = true;
    s.transitions.push({ id: `${s.id}-hangup`, target: "END_SCENARIO", publicLabel: "วางสาย", requiresFinalized: [], requiresEvents: [], safeResolution: true, earlySafeResolution: true, internalOnly: true });
    s.conversation = { allowedSignals: signals, decisionSignals: decisions ? (s.id === "CONTEXT_CLAIM" ? ["VERIFY_CONTEXT"] : signals) : [],
      fallbackSignal: signal, fallbackStatus: s.id === "IDENTITY_CLAIM" ? "CONTINUE_STATE" : "STATE_COMPLETE",
      autoTransitionIds: s.transitions.filter(e => e.id !== `${s.id}-hangup`).map(e => e.id), maxConversationalTurns: 3 };
    if (s.id === "MAIN_REQUEST" && scam) s.appSignalGates = [{ app: parcel ? "BANK" : "MESSAGES", signals: [signal] }];
  }
  return t;
});
