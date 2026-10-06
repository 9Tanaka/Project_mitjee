import { z } from "zod";

export const PHONE_APPS = ["CALL", "MESSAGES", "BANK", "PARCEL", "CALLER_INFO"] as const;
export const CALL_BEHAVIORS = [
  "CALL_ANSWERED", "CALL_DECLINED", "ASKED_CALLER_IDENTITY", "ASKED_FOR_REFERENCE", "REQUESTED_CLARIFICATION",
  "OPENED_MESSAGES", "OPENED_BANK_APP", "OPENED_PARCEL_APP", "OPENED_CALLER_INFO", "CHECKED_EXISTING_ORDER",
  "CHECKED_TRANSACTION", "USED_INDEPENDENT_CHANNEL", "RETURNED_TO_CALL", "HUNG_UP", "REFUSED_OTP",
  "SHARED_SIMULATED_OTP", "REFUSED_TRANSFER", "CONFIRMED_SIMULATED_TRANSFER", "CALLED_OFFICIAL_CHANNEL",
  "VIEWED_SIMULATED_OTP", "VIEWED_TRANSFER_DETAILS", "PREPARED_OTP_SHARE", "PREPARED_TRANSFER",
  "CONTINUED_CALL", "ACKNOWLEDGED_NOTIFICATION", "CONFIRMED_DELIVERY", "RESCHEDULED_DELIVERY", "LIMITED_INFORMATION",
] as const;
export type PhoneAppId = typeof PHONE_APPS[number];
export type CallBehavior = typeof CALL_BEHAVIORS[number];
export const callInteractionSchema = z.strictObject({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), label: z.string().min(1), app: z.enum(PHONE_APPS),
  behavior: z.enum(CALL_BEHAVIORS), navigationTarget: z.enum(PHONE_APPS).optional(),
  requiresBehaviors: z.array(z.enum(CALL_BEHAVIORS)).optional(),
  // Authored explicit exit can finalize the current checkpoint with its end/callback choice.
  resolutionChoiceId: z.string().optional(), transitionId: z.string().optional(),
});
export const phoneContentSchema = z.strictObject({
  caller: z.strictObject({ organisation: z.string(), phoneLabel: z.string(), claimedRole: z.string(), knownChannel: z.string() }),
  parcel: z.strictObject({ reference: z.string(), item: z.string(), deliveryWindow: z.string(), status: z.string() }).optional(),
  transaction: z.strictObject({ reference: z.string(), amount: z.number().positive(), time: z.string(), item: z.string(), status: z.string() }).optional(),
  transfer: z.strictObject({ recipient: z.string(), accountReference: z.string(), amount: z.number().positive(), purpose: z.string() }).optional(),
  reflectionNote: z.string(),
});
