import Credentials, { type CredentialsConfig } from "next-auth/providers/credentials";
import type { AccountService } from "../application/account-service.js";
import { accountInput } from "../accounts/policy.js";

export function credentialsProvider(accounts: () => Promise<AccountService>) {
  const config: Partial<CredentialsConfig> & Pick<CredentialsConfig, "authorize"> = {
    credentials: { email: { type: "email" }, password: { type: "password" } },
    async authorize(input) {
      // Auth.js adds CSRF/callback fields: only these two fields enter the service.
      const parsed = accountInput.safeParse({ email: input.email, password: input.password });
      if (!parsed.success) return null;
      try { return await (await accounts()).verifyCredentials(parsed.data); }
      catch { return null; } // Auth.js generic CredentialsSignin, never raw provider/DB errors.
    },
  };
  return { ...Credentials(config), authorize: config.authorize };
}
