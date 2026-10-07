import { readFileSync } from "node:fs";
import { createPrismaClient } from "../persistence/prisma-client.js";

type Client = ReturnType<typeof createPrismaClient>;
const host = globalThis as typeof globalThis & { mitjeeDatabase?: Client };
export function getDatabase(): Client {
  if (host.mitjeeDatabase) return host.mitjeeDatabase;
  return host.mitjeeDatabase = createDatabase();
}
/** An isolated pool for the unbundled custom server; no compiled application objects cross into Next. */
export function createDatabase(): Client {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Database configuration is required");
  const caPath = process.env.DATABASE_TLS_CA_PATH;
  const ca = process.env.DATABASE_TLS_CA || (caPath ? readFileSync(caPath, "utf8") : undefined);
  const rsaPath = process.env.DATABASE_LOOPBACK_RSA_PUBLIC_KEY_PATH;
  return createPrismaClient(url, {
    ...(ca ? { tlsCa: ca } : {}),
    ...(rsaPath ? { loopbackRsaPublicKey: rsaPath } : {}),
  });
}
export async function closeDatabase(client: Client | undefined): Promise<void> {
  if (!client) return;
  if (host.mitjeeDatabase === client) delete host.mitjeeDatabase;
  await client.$disconnect();
}
