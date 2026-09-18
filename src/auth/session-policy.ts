import type { NextAuthConfig } from "next-auth";
import { isStableUserId } from "./identity.js";

/** Minimal JWT identity from the server-verified Credentials account ID. */
export const identityCallbacks = {
  jwt({ token, user }) {
    // user comes only from successful server-side provider verification at sign-in.
    // Never read client-supplied `session` / update data, profile email or token.sub.
    const id: unknown = user ? user.id : token.trainingUserId;
    if (!isStableUserId(id)) return null;
    // Deliberately omit name/email/image and provider access/refresh tokens.
    return { trainingUserId: id };
  },
  session({ session, token }) {
    const id: unknown = token?.trainingUserId;
    return { expires: session.expires, user: isStableUserId(id) ? { id } : {} };
  },
} satisfies NonNullable<NextAuthConfig["callbacks"]>;
