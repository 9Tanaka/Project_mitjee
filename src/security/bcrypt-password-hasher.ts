import bcrypt from "bcrypt";
import type { PasswordHasher } from "../accounts/contracts.js";
import { MAX_PASSWORD_BYTES } from "../accounts/policy.js";

export const BCRYPT_COST = 12;
export class BcryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) throw new Error("INVALID_PASSWORD_LENGTH");
    return bcrypt.hash(password, BCRYPT_COST);
  }
  async verify(password: string, hash: string): Promise<boolean> {
    if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) return false;
    return bcrypt.compare(password, hash);
  }
}
