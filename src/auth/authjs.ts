import type { NextAuthConfig, NextAuthResult } from "next-auth";
import type { NextRequest } from "next/server.js";
import { identityCallbacks } from "./session-policy.js";
import { credentialsProvider } from "./credentials.js";
import { getAccountService } from "../server/account-runtime.js";

const config: NextAuthConfig = {
  providers: [credentialsProvider(getAccountService)],
  session: { strategy: "jwt" },
  callbacks: identityCallbacks,
  debug: false,
  // Never log provider/SQL errors, credentials, cookies or secret material.
  logger: { error() {}, warn() {}, debug() {} },
};
let instance: NextAuthResult | undefined;
async function configuredAuth(): Promise<NextAuthResult | null> {
  if (!process.env.AUTH_SECRET?.trim()) return null;
  const { default: NextAuth } = await import("next-auth");
  return instance ??= NextAuth(config);
}
/** auth() reads verified cookies from Next's server request context, not caller JSON. */
export async function resolveAuthJsSession(): Promise<unknown> {
  return (await configuredAuth())?.auth() ?? null;
}
async function handle(method: "GET" | "POST", request: NextRequest): Promise<Response> {
  const auth = await configuredAuth();
  if (!auth) return Response.json({ error: { code: "UNAUTHENTICATED", message: "Authentication required." } },
    { status: 401, headers: { "Cache-Control": "no-store" } });
  return auth.handlers[method](request);
}
export const authHandlers = {
  GET: (request: NextRequest) => handle("GET", request),
  POST: (request: NextRequest) => handle("POST", request),
};
