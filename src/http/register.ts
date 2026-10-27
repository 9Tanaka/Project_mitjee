import { z } from "zod";
import { accountInput } from "../accounts/policy.js";
import { getAccountService } from "../server/account-runtime.js";
import { logRegistrationFailure, type RegistrationStage } from "../server/registration-diagnostics.js";
import { readJson } from "./body.js";
import { ApiError, publicError } from "./errors.js";

export const MAX_REGISTRATION_BODY_BYTES = 2048;
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const response = z.strictObject({ data: z.strictObject({ user: z.strictObject({ id: z.uuid() }) }) });
export async function register(request: Request): Promise<Response> {
  const startedAt = Date.now();
  let stage: RegistrationStage = "input";
  try {
    const url = new URL(request.url);
    if ([...url.searchParams].length) throw new ApiError("INVALID_REQUEST");
    if (request.headers.has("origin") && request.headers.get("origin") !== url.origin) throw new ApiError("INVALID_ORIGIN");
    const parsed = accountInput.safeParse(await readJson(request, MAX_REGISTRATION_BODY_BYTES));
    if (!parsed.success) throw new ApiError("INVALID_REQUEST");
    stage = "runtime";
    const accounts = await getAccountService();
    stage = "account_write";
    const user = await accounts.register(parsed.data);
    stage = "response";
    return Response.json(response.parse({ data: { user: { id: user.id } } }), { status: 201, headers });
  } catch (error) {
    const mapped = publicError(error);
    if (mapped.status === 500) logRegistrationFailure(error, stage, startedAt);
    return Response.json(mapped.body, { status: mapped.status, headers });
  }
}
