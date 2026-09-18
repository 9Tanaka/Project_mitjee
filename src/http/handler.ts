import { readJson } from "./body.js";
import { z } from "zod";
import { getRuntime } from "../server/runtime.js";
import { ApiError, publicError } from "./errors.js";
import * as dto from "./dto.js";
import * as mapping from "./mapping.js";

export const MAX_BODY_BYTES = 64 * 1024; // Includes JSON escapes for an 8,000-code-unit message.
export type Endpoint = "scenarios" | "scenario" | "start" | "resume" | "message" | "action" | "quit" | "result";
function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError("INVALID_REQUEST");
  return result.data;
}
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Authorization, Cookie" };
function success(schema: z.ZodType, data: unknown, status = 200) {
  return Response.json(dto.successEnvelope(schema).parse({ data }), { status, headers });
}
export function route(endpoint: Endpoint) {
  return async (request: Request, context: { params: Promise<Record<string, string>> }): Promise<Response> => {
    try {
      const runtime = getRuntime();
      const user = await runtime.authenticator.authenticate(request);
      if (!user || !z.string().min(1).max(120).safeParse(user.id).success) throw new ApiError("UNAUTHENTICATED");
      const url = new URL(request.url);
      parse(dto.emptyQuery, Object.fromEntries(url.searchParams));
      if (request.method === "POST" && request.headers.has("origin") && request.headers.get("origin") !== url.origin) throw new ApiError("INVALID_ORIGIN");
      const params = await context.params;
      const scenarioId = ["scenario", "start"].includes(endpoint) ? parse(dto.scenarioParams, params).scenarioId : "";
      const sessionId = ["resume", "message", "action", "quit", "result"].includes(endpoint) ? parse(dto.sessionParams, params).sessionId : "";
      // Validate before constructing database dependencies. No raw body/error logging.
      const input = ["start", "message", "action", "quit"].includes(endpoint) ? await readJson(request, MAX_BODY_BYTES) : undefined;
      const start = endpoint === "start" ? parse(dto.startRequest, input) : undefined;
      const message = endpoint === "message" ? parse(dto.messageRequest, input) : undefined;
      const action = endpoint === "action" ? parse(dto.actionRequest, input) : undefined;
      const quit = endpoint === "quit" ? parse(dto.quitRequest, input) : undefined;
      const app = await runtime.application();
      switch (endpoint) {
        case "scenarios": return success(z.array(dto.scenarioDto), app.listScenarios().map(mapping.toScenarioDto));
        case "scenario": return success(dto.scenarioDto, mapping.toScenarioDto(app.scenario(scenarioId)));
        case "start": {
          const reply = await app.start(scenarioId, user, mapping.toStartInput(start!));
          return success(dto.mutationDto, mapping.toMutationDto(reply), reply.duplicate ? 200 : 201);
        }
        case "resume": return success(dto.sessionDto, mapping.toSessionDto(await app.resume(sessionId, user)));
        case "message": return success(dto.messageDto, mapping.toMessageDto(await app.message(sessionId, user, mapping.toMessageInput(message!))));
        case "action": return success(dto.mutationDto, mapping.toMutationDto(await app.action(sessionId, user, mapping.toActionInput(action!))));
        case "quit": return success(dto.mutationDto, mapping.toMutationDto(await app.quit(sessionId, user, mapping.toQuitInput(quit!))));
        case "result": return success(dto.resultDto, mapping.toResultDto(await app.result(sessionId, user)));
      }
    } catch (error) {
      const mapped = publicError(error);
      return Response.json(dto.errorEnvelope.parse(mapped.body), { status: mapped.status, headers });
    }
  };
}
