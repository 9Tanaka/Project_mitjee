import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { AccountError, type AccountRecord, type AccountRepository } from "../accounts/contracts.js";

export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly client: PrismaClient) {}
  findByNormalizedEmail(email: string): Promise<AccountRecord | null> {
    return this.client.userAccount.findUnique({ where: { email } });
  }
  async create(input: Pick<AccountRecord, "id" | "email" | "passwordHash">): Promise<AccountRecord> {
    if (!/^\$2[ab]\$12\$[./A-Za-z0-9]{53}$/.test(input.passwordHash)) throw new Error("INVALID_PASSWORD_HASH");
    try {
      return await this.client.userAccount.create({ data: input });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new AccountError("ACCOUNT_ALREADY_EXISTS");
      throw error;
    }
  }
}
