import { createHash, randomBytes } from "node:crypto";
import { AccountError, type AccountRecord, type AccountRepository, type PasswordHasher } from "../src/accounts/contracts.js";

// Test-only doubles. Not reachable from production source or environment flags.
export class MemoryAccounts implements AccountRepository {
  records = new Map<string, AccountRecord>();
  async findByNormalizedEmail(email: string) { return structuredClone(this.records.get(email) ?? null); }
  async create(input: Pick<AccountRecord, "id" | "email" | "passwordHash">) {
    if (this.records.has(input.email)) throw new AccountError("ACCOUNT_ALREADY_EXISTS");
    const row = { ...input, createdAt: new Date(), updatedAt: new Date() };
    this.records.set(input.email, row); return structuredClone(row);
  }
}
export class TestHasher implements PasswordHasher {
  checks = 0;
  async hash(password: string) { return createHash("sha256").update(password).digest("hex"); }
  async verify(password: string, hash: string) { this.checks++; return await this.hash(password) === hash; }
}
export const freshPassword = () => randomBytes(24).toString("base64url");
