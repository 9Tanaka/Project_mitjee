import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { AccountService } from "../src/application/account-service.js";
import { accountInput } from "../src/accounts/policy.js";
import { BcryptPasswordHasher, BCRYPT_COST } from "../src/security/bcrypt-password-hasher.js";
import { credentialsProvider } from "../src/auth/credentials.js";
import { freshPassword, MemoryAccounts, TestHasher } from "./accounts.helpers.js";

async function setup() {
  const repo = new MemoryAccounts(); const hasher = new TestHasher();
  return { repo, hasher, service: await AccountService.create(repo, hasher) };
}
it("registration normalizes email and returns only a server-generated stable UUID", async () => {
  const { repo, service } = await setup(); const password = freshPassword();
  const user = await service.register({ email: "  User@Example.test  ", password });
  expect(user).toEqual({ id: expect.stringMatching(/^[0-9a-f-]{36}$/) });
  const stored = await repo.findByNormalizedEmail("user@example.test");
  expect(stored?.id).toBe(user.id); expect(stored?.passwordHash === password).toBe(false);
  for (let i = 0; i < 3; i++) expect(await service.verifyCredentials({ email: "USER@example.test", password })).toEqual(user);
});
it("wrong and unknown accounts both return null and perform verification work", async () => {
  const { service, hasher } = await setup(); const password = freshPassword();
  await service.register({ email: "user@example.test", password });
  expect(await service.verifyCredentials({ email: "user@example.test", password: freshPassword() })).toBeNull();
  expect(await service.verifyCredentials({ email: "missing@example.test", password })).toBeNull();
  expect(hasher.checks).toBe(2);
});
it("concurrent normalized registration has one winner", async () => {
  const { repo, service } = await setup(); const password = freshPassword();
  const results = await Promise.allSettled(["User@example.test", " user@EXAMPLE.test "].map(email => service.register({ email, password })));
  expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
  expect(repo.records.size).toBe(1);
});
it.each([
  { email: "invalid", password: freshPassword() },
  { email: "user@example.test", password: "" },
  { email: "user@example.test", password: "a".repeat(11) },
  { email: "user@example.test", password: "a".repeat(73) },
  { email: "user@example.test", password: "ก".repeat(25) },
  { email: "a".repeat(255) + "@example.test", password: freshPassword() },
  { email: "user@example.test", password: freshPassword(), ownerId: randomUUID() },
  null, { email: [] }, {},
])("invalid account input %# cannot register or verify", async input => {
  const { service, repo } = await setup();
  await expect(service.register(input)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  expect(await service.verifyCredentials(input)).toBeNull(); expect(repo.records.size).toBe(0);
});
it("UTF-8 byte boundary, Unicode code points and exact password whitespace are enforced", async () => {
  expect(accountInput.safeParse({ email: "u@example.test", password: "ก".repeat(24) }).success).toBe(true);
  expect(accountInput.safeParse({ email: "u@example.test", password: "a".repeat(72) }).success).toBe(true);
  const { service } = await setup(); const password = " " + freshPassword() + " ";
  const user = await service.register({ email: "u@example.test", password });
  expect(await service.verifyCredentials({ email: "u@example.test", password })).toEqual(user);
  expect(await service.verifyCredentials({ email: "u@example.test", password: password.trim() })).toBeNull();
});
it("native bcrypt on the actual runtime uses cost 12, salts, verifies, and never truncates inputs", async () => {
  const hasher = new BcryptPasswordHasher(); const password = freshPassword();
  const hash = await hasher.hash(password);
  expect(BCRYPT_COST).toBe(12); expect(/^\$2b\$12\$/.test(hash)).toBe(true);
  expect(hash === password).toBe(false); expect((await hasher.hash(password)) === hash).toBe(false);
  expect(await hasher.verify(password, hash)).toBe(true);
  expect(await hasher.verify(freshPassword(), hash)).toBe(false);
  await expect(hasher.hash("a".repeat(73))).rejects.toThrow("INVALID_PASSWORD_LENGTH");
  expect(await hasher.verify("a".repeat(73), hash)).toBe(false);
}, 15000); // Real cost-12 operations; retain security cost under shared-runner load.
it("Credentials authorize validates and returns only verified identity, never client identity", async () => {
  const { service } = await setup(); const password = freshPassword();
  const user = await service.register({ email: "u@example.test", password });
  const provider = credentialsProvider(async () => service);
  const authorize = provider.authorize;
  const request = new Request("http://localhost/api/auth/callback/credentials");
  expect(await authorize({ email: " U@EXAMPLE.test ", password, id: randomUUID(), csrfToken: randomUUID() }, request)).toEqual(user);
  expect(await authorize({ email: "u@example.test", password: freshPassword() }, request)).toBeNull();
  expect(await authorize({ email: "missing@example.test", password }, request)).toBeNull();
  expect(await authorize({ email: 123, password }, request)).toBeNull();
});
it("Credentials service failures are generic and do not disclose internal error details", async () => {
  const provider = credentialsProvider(async () => { throw new Error("private internal failure"); });
  expect(await provider.authorize({ email: "u@example.test", password: freshPassword() }, new Request("http://localhost"))).toBeNull();
});
