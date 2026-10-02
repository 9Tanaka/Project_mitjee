import { createDatabase } from "./database.js";
import { createScenarioProvider } from "./scenario-provider.js";
import { PrismaTrainingRepository } from "../persistence/prisma-repository.js";
import { createApplication } from "../application/composition.js";
import type { TrainingApplicationService } from "../application/training-service.js";

/** Node custom server and Next bundles use separate class instances, sharing only database rows.
 * This keeps instanceof error mapping and Auth.js request context inside the matching module graph. */
export function createCallRuntime() {
  let pending: Promise<TrainingApplicationService> | undefined;
  let client: ReturnType<typeof createDatabase> | undefined;
  return {
    application() {
      return pending ??= (async () => {
        const provider = createScenarioProvider();
        client = createDatabase();
        return createApplication(new PrismaTrainingRepository(client), provider);
      })().catch(async error => { await client?.$disconnect(); client = undefined; pending = undefined; throw error; });
    },
    async close() { try { await pending; } catch { /* Initialization disposed its pool. */ }
      await client?.$disconnect(); client = undefined; pending = undefined; },
  };
}
