import { z } from "zod";
import { messageDto, messageRequest, publicId, revision, sessionDto } from "./contracts.js";

export const MAX_VOICE_JSON_BYTES = 1_300_000;
export const speechRequest = z.strictObject({ turnId: publicId });
export const speechReply = z.strictObject({ audioBase64: z.string().max(5_592_408).nullable(),
  audioMime: z.literal("audio/wav"), audioStatus: z.enum(["READY", "UNAVAILABLE"]) });
export const voiceRequest = z.strictObject({ turnId: publicId, expectedRevision: revision, mime: z.literal("audio/wav"),
  audioBase64: z.string().min(60).max(1_280_060).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/) });
export const voiceReply = z.strictObject({ dialogue: messageDto, audioBase64: z.string().max(5_592_408).nullable(),
  audioMime: z.literal("audio/wav"), audioStatus: z.enum(["READY", "UNAVAILABLE", "REPLAY"]) });
export const callClientMessage = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("resume") }),
  z.strictObject({ type: z.literal("text"), input: messageRequest }),
  z.strictObject({ type: z.literal("voice"), input: voiceRequest }),
]);
export const callServerMessage = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("ready"), session: sessionDto }),
  z.strictObject({ type: z.literal("processing"), turnId: publicId }),
  z.strictObject({ type: z.literal("committed"), dialogue: messageDto }),
  z.strictObject({ type: z.literal("voice"), reply: voiceReply }),
  z.strictObject({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);
