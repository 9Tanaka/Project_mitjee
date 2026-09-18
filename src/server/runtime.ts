import { getDatabase, closeDatabase } from "./database.js";
import { PrismaTrainingRepository } from "../persistence/prisma-repository.js";
import { AuthJsRequestAuthenticator } from "../auth/request-authenticator.js";
import { resolveAuthJsSession } from "../auth/authjs.js";
import type { RequestAuthenticator } from "../http/auth.js";
import type { TrainingApplicationService } from "../application/training-service.js";
import { createApplication } from "../application/composition.js";

export interface ApplicationRuntime {
  authenticator: RequestAuthenticator;
  application(): Promise<TrainingApplicationService>;
  close(): Promise<void>;
}
function createRuntime(): ApplicationRuntime {
  let pending: Promise<TrainingApplicationService> | undefined;
  let client: ReturnType<typeof getDatabase> | undefined;
  return {
    authenticator: new AuthJsRequestAuthenticator(resolveAuthJsSession),
    application() {
      // One pool/application per worker; rejected initialization is disposed and can retry.
      pending ??= (async () => {
        client = getDatabase();
        return createApplication(new PrismaTrainingRepository(client));
      })().catch(async error => {
        await closeDatabase(client); client = undefined; pending = undefined;
        throw error;
      });
      return pending;
    },
    async close() {
      try { await pending; } catch { /* Initialization already disposed its client. */ }
      await closeDatabase(client); client = undefined; pending = undefined;
    },
  };
}
// Survives development module reloads. No session aggregate or identity is cached here.
const host = globalThis as typeof globalThis & { mitjeeHttpRuntime?: ApplicationRuntime };
export function getRuntime(): ApplicationRuntime { return host.mitjeeHttpRuntime ??= createRuntime(); }
