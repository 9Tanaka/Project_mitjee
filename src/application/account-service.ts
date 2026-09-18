import { randomBytes, randomUUID } from "node:crypto";
import { AccountError, type AccountRepository, type PasswordHasher } from "../accounts/contracts.js";
import { accountInput } from "../accounts/policy.js";

export class AccountService {
  private constructor(
    private readonly repository: AccountRepository,
    private readonly hasher: PasswordHasher,
    private readonly dummyHash: string,
  ) {}
  static async create(repository: AccountRepository, hasher: PasswordHasher): Promise<AccountService> {
    // One random dummy hash per service, same cost as real accounts; no custom delay.
    return new AccountService(repository, hasher, await hasher.hash(randomBytes(32).toString("hex")));
  }
  async register(input: unknown): Promise<{ id: string }> {
    const parsed = accountInput.safeParse(input);
    if (!parsed.success) throw new AccountError("INVALID_REQUEST");
    const record = await this.repository.create({
      id: randomUUID(), email: parsed.data.email,
      passwordHash: await this.hasher.hash(parsed.data.password),
    });
    return { id: record.id };
  }
  async verifyCredentials(input: unknown): Promise<{ id: string } | null> {
    const parsed = accountInput.safeParse(input);
    if (!parsed.success) return null;
    const record = await this.repository.findByNormalizedEmail(parsed.data.email);
    const valid = await this.hasher.verify(parsed.data.password, record?.passwordHash ?? this.dummyHash);
    return record && valid ? { id: record.id } : null;
  }
}
