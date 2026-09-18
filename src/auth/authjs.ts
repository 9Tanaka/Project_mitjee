import type { NextAuthConfig, NextAuthResult } from "next-auth";
import { identityCallbacks } from "./session-policy.js";

// Proposal describes password/hash verification, but the account store/verifier is
// not approved for this phase. No provider, login route or environment bypass.
const config: NextAuthConfig = {
  providers: [],
  session: { strategy: "jwt" },
  callbacks: identityCallbacks,
  debug: false,
  // Auth errors may contain provider details. Do not log raw errors or debug data.
  logger: { error() {}, warn() {}, debug() {} },
};
let instance: NextAuthResult | undefined;

/** auth() reads verified cookies from Next's server request context, not caller JSON. */
export async function resolveAuthJsSession(): Promise<unknown> {
  if (config.providers.length === 0 || !process.env.AUTH_SECRET?.trim()) return null;
  const { default: NextAuth } = await import("next-auth");
  instance ??= NextAuth(config);
  return instance.auth();
}
