import { getToken } from "next-auth/jwt";
import type { RequestAuthenticator } from "../http/auth.js";
import { isStableUserId } from "./identity.js";

/** Custom Node upgrade handlers have no Next request context. Use the same Auth.js encrypted JWT cookie. */
export class SocketCookieAuthenticator implements RequestAuthenticator {
  constructor(private readonly secret: string, private readonly origin: string) {}
  async authenticate(request: Request) {
    try {
      if (!this.secret.trim()) return null;
      const secureCookie = new URL(this.origin).protocol === "https:";
      const cookieName = secureCookie ? "__Secure-authjs.session-token" : "authjs.session-token";
      // Strip Authorization and every caller identity header. Only Auth.js cookies are accepted.
      const req = new Request(this.origin, { headers: { cookie: request.headers.get("cookie") ?? "" } });
      const token = await getToken({ req, secret: this.secret, cookieName, salt: cookieName, secureCookie });
      return token && isStableUserId(token.trainingUserId) && typeof token.exp === "number" && token.exp > Date.now() / 1000
        ? { id: token.trainingUserId } : null;
    } catch { return null; }
  }
}
