import { getRuntime } from "../server/runtime.js";
import { getVoiceApplication } from "../server/voice-runtime.js";
import { readJson } from "./body.js";
import { ApiError, publicError } from "./errors.js";
import { MAX_VOICE_JSON_BYTES, voiceRequest, voiceReply } from "../public-api/voice.js";
import { sessionParams } from "../public-api/contracts.js";
import type { VoiceReply } from "../application/voice-service.js";
import { voiceRateLimiter } from "../server/voice-rate-limit.js";
import { identifyLatency, measureLatency, observeHttpLatency } from "../observability/latency.js";

export const voiceProjection = (reply: VoiceReply) => voiceReply.parse({ dialogue: reply.dialogue,
  audioBase64: reply.audio ? Buffer.from(reply.audio).toString("base64") : null, audioMime: "audio/wav", audioStatus: reply.audioStatus });
export async function voiceRoute(request: Request, context: { params: Promise<Record<string, string>> }) {
  return observeHttpLatency("voice", async () => {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Cookie" };
  try {
    const runtime = getRuntime(), user = await measureLatency("auth", async () => {
      const authenticated = await runtime.authenticator.authenticate(request);
      if (!authenticated) throw new ApiError("UNAUTHENTICATED");
      return authenticated;
    });
    const url = new URL(request.url);
    if (request.headers.get("origin") !== url.origin) throw new ApiError("INVALID_ORIGIN");
    const params = sessionParams.safeParse(await context.params);
    if (!params.success || url.search) throw new ApiError("INVALID_REQUEST");
    voiceRateLimiter.take(user.id);
    const voice = getVoiceApplication(await runtime.application());
    const input = voiceRequest.safeParse(await readJson(request, MAX_VOICE_JSON_BYTES, 10_000));
    if (!input.success) throw new ApiError("INVALID_REQUEST");
    identifyLatency(params.data.sessionId, input.data.turnId);
    const reply = await voice.send(params.data.sessionId, user, { ...input.data, audio: Buffer.from(input.data.audioBase64, "base64") }, request.signal);
    return Response.json({ data: voiceProjection(reply) }, { headers });
  } catch (error) {
    const result = publicError(error);
    return Response.json(result.body, { status: result.status, headers });
  }
  });
}
