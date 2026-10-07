import { z } from "zod";

// Semantic descriptions, never assessment/event codes or arbitrary transition names.
export const CALL_SIGNALS = ["NONE", "IDENTITY_INFORMATION", "CONTEXT_INFORMATION", "VERIFY_CONTEXT",
  "URGENCY_PRESSURE", "SECRECY_PRESSURE", "TRANSFER_REQUEST", "OTP_REQUEST",
  "DELIVERY_CONFIRMATION", "TRANSACTION_NOTIFICATION"] as const;
export const callSignalSchema = z.enum(CALL_SIGNALS);
export const conversationStatusSchema = z.enum(["CONTINUE_STATE", "STATE_COMPLETE"]);
export const callConversationPolicySchema = z.strictObject({
  allowedSignals: z.array(callSignalSchema).min(1),
  decisionSignals: z.array(callSignalSchema),
  fallbackSignal: callSignalSchema,
  fallbackStatus: conversationStatusSchema,
  autoTransitionIds: z.array(z.string().min(1)),
  maxConversationalTurns: z.number().int().min(1).max(5),
});
