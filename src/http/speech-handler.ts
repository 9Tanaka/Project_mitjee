import { getRuntime } from "../server/runtime.js";
import { getVoiceApplication } from "../server/voice-runtime.js";
import { ApiError, publicError } from "./errors.js";
import { readJson } from "./body.js";
import { sessionParams } from "../public-api/contracts.js";
import { speechRequest, speechReply } from "../public-api/voice.js";
import { voiceRateLimiter } from "../server/voice-rate-limit.js";
import { identifyLatency, measureLatency, observeHttpLatency } from "../observability/latency.js";
export async function speechRoute(request: Request, context: { params: Promise<Record<string, string>> }) {
  return observeHttpLatency("speech", async () => {
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
    const input = speechRequest.safeParse(await readJson(request, 1024));
    if (!params.success || !input.success || url.search) throw new ApiError("INVALID_REQUEST");
    identifyLatency(params.data.sessionId, input.data.turnId);
    voiceRateLimiter.take(user.id);
    const reply = await getVoiceApplication(await runtime.application()).speak(params.data.sessionId, user, input.data.turnId, request.signal);
    return Response.json({ data: speechReply.parse({ audioBase64: reply.audio ? Buffer.from(reply.audio).toString("base64") : null,
      audioMime: "audio/wav", audioStatus: reply.audioStatus }) }, { headers });
  } catch (error) { const result = publicError(error); return Response.json(result.body, { status: result.status, headers }); }
  });
}
