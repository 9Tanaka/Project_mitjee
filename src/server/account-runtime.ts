import { AccountService } from "../application/account-service.js";
import { PrismaAccountRepository } from "../persistence/prisma-account-repository.js";
import { BcryptPasswordHasher } from "../security/bcrypt-password-hasher.js";
import { getDatabase } from "./database.js";

type AccountRuntime = { client: ReturnType<typeof getDatabase>; service: Promise<AccountService> };
const host = globalThis as typeof globalThis & { mitjeeAccountRuntime?: AccountRuntime };
export function getAccountService(): Promise<AccountService> {
  const client = getDatabase();
  if (host.mitjeeAccountRuntime?.client === client) return host.mitjeeAccountRuntime.service;
  const runtime: AccountRuntime = {
    client,
    service: AccountService.create(new PrismaAccountRepository(client), new BcryptPasswordHasher()),
  };
  host.mitjeeAccountRuntime = runtime;
  runtime.service.catch(() => {
    if (host.mitjeeAccountRuntime === runtime) delete host.mitjeeAccountRuntime;
  });
  return runtime.service;
}
