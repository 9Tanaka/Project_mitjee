/** Private persistence record. Never a public DTO, JWT or session. */
export interface AccountRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface AccountRepository {
  findByNormalizedEmail(email: string): Promise<AccountRecord | null>;
  create(input: Pick<AccountRecord, "id" | "email" | "passwordHash">): Promise<AccountRecord>;
}
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}
export class AccountError extends Error {
  constructor(readonly code: "INVALID_REQUEST" | "ACCOUNT_ALREADY_EXISTS") { super(code); }
}
