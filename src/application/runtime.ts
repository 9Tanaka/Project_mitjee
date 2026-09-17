import { readFileSync } from "node:fs";
import { createPrismaClient } from "../persistence/prisma-client.js";
import { PrismaTrainingRepository } from "../persistence/prisma-repository.js";
import { UnconfiguredAuthenticator } from "../http/auth.js";
import type { RequestAuthenticator } from "../http/auth.js";
import type { TrainingApplicationService } from "./training-service.js";
import { createApplication } from "./composition.js";

export interface ApplicationRuntime {
  authenticator: RequestAuthenticator;
  application(): Promise<TrainingApplicationService>;
  close(): Promise<void>;
}
function createRuntime(): ApplicationRuntime {
  let pending: Promise<TrainingApplicationService> | undefined;
  let client: ReturnType<typeof createPrismaClient> | undefined;
  return {
    authenticator: new UnconfiguredAuthenticator(),
    application() {
      // One pool/application per worker; rejected initialization is disposed and can retry.
      pending ??= (async () => {
        const url = process.env.DATABASE_URL;
        if (!url) throw new Error("Database configuration is required");
        const caPath = process.env.DATABASE_TLS_CA_PATH;
        const rsaPath = process.env.DATABASE_LOOPBACK_RSA_PUBLIC_KEY_PATH;
        client = createPrismaClient(url, {
          ...(caPath ? { tlsCa: readFileSync(caPath, "utf8") } : {}),
          ...(rsaPath ? { loopbackRsaPublicKey: rsaPath } : {}),
        });
        return createApplication(new PrismaTrainingRepository(client));
      })().catch(async error => {
        await client?.$disconnect(); client = undefined; pending = undefined;
        throw error;
      });
      return pending;
    },
    async close() {
      try { await pending; } catch { /* Initialization already disposed its client. */ }
      await client?.$disconnect(); client = undefined; pending = undefined;
    },
  };
}
// Survives development module reloads. No session aggregate or identity is cached here.
const host = globalThis as typeof globalThis & { mitjeeHttpRuntime?: ApplicationRuntime };
export function getRuntime(): ApplicationRuntime { return host.mitjeeHttpRuntime ??= createRuntime(); }
