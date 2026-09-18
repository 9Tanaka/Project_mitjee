import type { AuthenticatedPrincipal } from "../application/contracts.js";
import type { RequestAuthenticator } from "../http/auth.js";
import { isStableUserId } from "./identity.js";

/** Trusted server-only seam. Production supplies resolveAuthJsSession, never request data. */
export type AuthJsSessionResolver = () => Promise<unknown>;
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export class AuthJsRequestAuthenticator implements RequestAuthenticator {
  constructor(private readonly resolveSession: AuthJsSessionResolver, private readonly now = Date.now) {}

  async authenticate(_request: Request): Promise<AuthenticatedPrincipal | null> {
    try {
      const session = await this.resolveSession();
      if (!record(session) || !record(session.user) || !isStableUserId(session.user.id)) return null;
      if (typeof session.expires !== "string" || !Number.isFinite(Date.parse(session.expires)) || Date.parse(session.expires) <= this.now()) return null;
      // Detached minimal principal; extra verified session fields cannot enter Application/Core.
      return { id: session.user.id };
    } catch {
      // No raw exception, provider response or cookie data escapes this boundary.
      return null;
    }
  }
}
