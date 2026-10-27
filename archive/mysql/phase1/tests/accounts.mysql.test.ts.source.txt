import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../src/persistence/prisma-client.js";
import { PrismaAccountRepository } from "../src/persistence/prisma-account-repository.js";
import { AccountService } from "../src/application/account-service.js";
import { BcryptPasswordHasher } from "../src/security/bcrypt-password-hasher.js";
import { freshPassword } from "./accounts.helpers.js";

const url = process.env.MYSQL_TEST_DATABASE_URL;
if (url && !/^mitjee_test(?:_[a-z0-9_]+)?$/.test(new URL(url).pathname.slice(1)))
  throw new Error("Use a dedicated mitjee_test database");
const path = process.env.MYSQL_TEST_RSA_PUBLIC_KEY_PATH;
const options = path ? { loopbackRsaPublicKey: path } : {};
const client = url ? createPrismaClient(url, options) : null;
afterAll(async () => { await client?.$disconnect(); });

describe.skipIf(!client)("Real MySQL accounts", () => {
  let service: AccountService; const hasher = new BcryptPasswordHasher();
  beforeAll(async () => { service = await AccountService.create(new PrismaAccountRepository(client!), hasher); });
  it("persists bcrypt only and new client can resume credentials with the same UUID", async () => {
    const email = randomUUID() + "@example.test"; const password = freshPassword();
    const user = await service.register({ email: " " + email.toUpperCase() + " ", password });
    const fresh = createPrismaClient(url!, options);
    try {
      const repo = new PrismaAccountRepository(fresh); const row = await repo.findByNormalizedEmail(email);
      expect(row?.id).toBe(user.id); expect(row?.email === email).toBe(true);
      expect(row?.passwordHash === password).toBe(false);
      expect(/^\$2b\$12\$/.test(row!.passwordHash)).toBe(true);
      expect(await hasher.verify(password, row!.passwordHash)).toBe(true);
      expect(await hasher.verify(freshPassword(), row!.passwordHash)).toBe(false);
      const resumed = await AccountService.create(repo, hasher);
      expect(await resumed.verifyCredentials({ email, password })).toEqual(user);
      expect(await resumed.verifyCredentials({ email, password: freshPassword() })).toBeNull();
    } finally { await fresh.$disconnect(); }
  }, 15000); // Several real cost-12 hashes/compares plus a fresh DB pool; no cost reduction.
  it("database unique constraint decides concurrent normalized duplicate registration", async () => {
    const email = randomUUID() + "@example.test"; const password = freshPassword();
    const results = await Promise.allSettled([email, " " + email.toUpperCase() + " "].map(e => service.register({ email: e, password })));
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
    const failure = results.find(x => x.status === "rejected") as PromiseRejectedResult;
    expect(failure.reason.code).toBe("ACCOUNT_ALREADY_EXISTS");
    expect(await client!.userAccount.count({ where: { email } })).toBe(1);
  });
  it("UserAccount has exactly the approved columns and no plaintext column", async () => {
    const rows = await client!.$queryRaw<Array<{ COLUMN_NAME: string }>>`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'UserAccount'`;
    expect(rows.map(r => r.COLUMN_NAME).sort()).toEqual(["createdAt", "email", "id", "passwordHash", "updatedAt"]);
  });
  it("immutable account ID rejects direct database mutation", async () => {
    const user = await service.register({ email: randomUUID() + "@example.test", password: freshPassword() });
    await expect(client!.userAccount.update({ where: { id: user.id }, data: { id: randomUUID() } })).rejects.toThrow();
    expect(await client!.userAccount.count({ where: { id: user.id } })).toBe(1);
  });
});
