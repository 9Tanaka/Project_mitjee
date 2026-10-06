import { z } from "zod";

// Browser-safe presentation contract. No hidden story identity or condition appears here.
export const phoneDto = z.strictObject({
  state: z.enum(["INCOMING_CALL", "CALL_CONNECTED", "IDENTITY_CLAIM", "CONTEXT_CLAIM", "PRESSURE", "MAIN_REQUEST", "PLAYER_DECISION", "INDEPENDENT_VERIFICATION", "CALL_ENDING", "END_SCENARIO"]),
  callStatus: z.enum(["RINGING", "CONNECTED", "ENDING", "ENDED", "DECLINED"]),
  callerLabel: z.literal("ผู้ติดต่อไม่รู้จัก"),
  openingStatus: z.enum(["NOT_STARTED", "PENDING", "READY"]),
  availableInternalApps: z.array(z.strictObject({ id: z.enum(["MESSAGES", "BANK", "PARCEL", "CALLER_INFO"]), label: z.string(), availability: z.literal("FOUNDATION") })),
});
export const openingRequest = z.strictObject({ expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) });
