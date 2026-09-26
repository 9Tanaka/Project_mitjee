import { z } from "zod";
import { emptyQuery, errorEnvelope, successEnvelope } from "../public-api/contracts.js";
import * as dto from "../public-api/quiz.js";
import { getRuntime } from "../server/runtime.js";
import { getQuizService } from "../server/quiz-runtime.js";
import { readJson } from "./body.js";
import { ApiError, publicError } from "./errors.js";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Authorization, Cookie" };
function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value); if (!parsed.success) throw new ApiError("INVALID_REQUEST"); return parsed.data;
}
export function quizRoute(endpoint: "overview" | "start" | "resume" | "save" | "submit") {
  return async (request: Request, context: { params: Promise<Record<string,string>> }) => {
    try {
      const user = await getRuntime().authenticator.authenticate(request);
      if (!user || !z.string().min(1).max(120).safeParse(user.id).success) throw new ApiError("UNAUTHENTICATED");
      const url = new URL(request.url); parse(emptyQuery, Object.fromEntries(url.searchParams));
      const mutation = ["start", "save", "submit"].includes(endpoint);
      if (mutation && request.headers.has("origin") && request.headers.get("origin") !== url.origin) throw new ApiError("INVALID_ORIGIN");
      const params = await context.params;
      const attemptId = ["resume", "save", "submit"].includes(endpoint) ? parse(dto.quizParams, params).attemptId : "";
      const body = mutation ? await readJson(request, 64 * 1024) : undefined;
      const start = endpoint === "start" ? parse(dto.quizStartRequest, body) : undefined;
      const write = ["save", "submit"].includes(endpoint) ? parse(dto.quizWriteRequest, body) : undefined;
      const service = getQuizService();
      let data: unknown; let schema: z.ZodType; let status = 200;
      if (endpoint === "overview") { data = await service.overview(user.id); schema = dto.quizOverview; }
      else if (endpoint === "resume") { data = await service.resume(attemptId, user.id); schema = dto.quizAttempt; }
      else if (endpoint === "start") { const reply = await service.start(user.id, start!); data = reply; schema = dto.quizMutation; status = reply.duplicate ? 200 : 201; }
      else { data = await service.write(attemptId, user.id, endpoint === "save" ? "SAVE" : "SUBMIT", write!); schema = dto.quizMutation; }
      return Response.json(successEnvelope(schema).parse({ data }), { status, headers });
    } catch (error) { const mapped = publicError(error); return Response.json(errorEnvelope.parse(mapped.body), { status: mapped.status, headers }); }
  };
}
