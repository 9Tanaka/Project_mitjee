import type { ScenarioTemplate } from "../domain/schema.js";
import type { TrainingSession } from "../domain/types.js";
import { activePhoneApp, freshConfirmation, hasBehavior } from "../domain/call-behavior.js";
import { hasSimulatedOtpContext, simulatedOtp } from "../dialogue/simulated-otp.js";
import { actionBindings, availableActions } from "./catalog.js";
import type { PublicTrainingSession } from "./contracts.js";

/** Public input routing only. Every step still passes the existing action validator/CAS. */
export function projectOtpMessage(s: TrainingSession, t: ScenarioTemplate): NonNullable<PublicTrainingSession["phone"]>["otpMessage"] {
  if (!hasSimulatedOtpContext(s, t)) return;
  const rule = t.criticalFailureRules.find(r => r.id === "SHARE_SIMULATED_OTP")!;
  const bindings = actionBindings(t).filter(b => b.state === s.state);
  const available = availableActions(s, t);
  const app = activePhoneApp(s, t);
  const behavior = !hasBehavior(s, t, "VIEWED_SIMULATED_OTP") ? "VIEWED_SIMULATED_OTP" : "PREPARED_OTP_SHARE";
  const target = app === "MESSAGES" ? null : app === "CALL" ? "MESSAGES" : "CALL";
  const next = target ? bindings.find(b => b.public.navigationTarget === target)
    : freshConfirmation(s, t, rule) ? bindings.find(b => b.public.input === "CONFIRM")
    : bindings.find(b => {
      if (b.public.input !== "NONE") return false;
      const input = b.toDomain({});
      return input.kind === "CALL_INTERACTION" && t.states.find(st => st.id === s.state)?.interactions?.some(i => i.id === input.interactionId && i.behavior === behavior);
    });
  if (!next || !available.some(a => a.id === next.public.id)) return;
  const managedActionIds = bindings.filter(b => b.public.app === "MESSAGES" && !b.public.navigationTarget).map(b => b.public.id);
  return { simulatedCode: simulatedOtp(s.id), unread: !hasBehavior(s, t, "OPENED_MESSAGES"),
    nextAction: { id: next.public.id, confirmed: next.public.input === "CONFIRM" }, managedActionIds };
}
