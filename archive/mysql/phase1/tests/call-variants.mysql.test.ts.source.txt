import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createApplication } from "../src/application/composition.js";
import { MockScenarioModelProvider } from "../src/dialogue/mock-provider.js";
import type { TrainingSession } from "../src/domain/types.js";
import { createPrismaClient } from "../src/persistence/prisma-client.js";
import { PrismaTrainingRepository } from "../src/persistence/prisma-repository.js";

const url = process.env.MYSQL_TEST_DATABASE_URL;
if (url && !/^mitjee_test(?:_[a-z0-9_]+)?$/.test(new URL(url).pathname.slice(1))) {
  throw new Error("Use a dedicated database named mitjee_test or mitjee_test_<suffix>");
}
const key = process.env.MYSQL_TEST_RSA_PUBLIC_KEY_PATH;
const connection = key ? { loopbackRsaPublicKey: key } : {};
const clients = url ? [createPrismaClient(url, connection), createPrismaClient(url, connection)] : [];
afterAll(async () => { await Promise.all(clients.map(client => client.$disconnect())); });

describe.skipIf(!url)("Call variant concurrency on real MySQL", () => {
  it("independent clients return the persisted winner for concurrent opposite variant selections", async () => {
    let arrived = 0;
    let release!: () => void;
    const bothReady = new Promise<void>(resolve => { release = resolve; });
    class RacingPrismaRepository extends PrismaTrainingRepository {
      override async create(session: TrainingSession) {
        if (++arrived === 2) release();
        await bothReady;
        return super.create(session);
      }
    }
    const owner = { id: `call-race-${randomUUID()}` };
    const firstSelector = vi.fn(() => "NORMAL_CALL" as const);
    const secondSelector = vi.fn(() => "SCAM_CALL" as const);
    const firstApp = await createApplication(new RacingPrismaRepository(clients[0]!), new MockScenarioModelProvider(), Date.now, firstSelector);
    const secondApp = await createApplication(new RacingPrismaRepository(clients[1]!), new MockScenarioModelProvider(), Date.now, secondSelector);
    const input = { startId: randomUUID(), expectedRevision: 0 as const };
    const [a, b] = await Promise.all([
      firstApp.start("call-center-scam", owner, input),
      secondApp.start("call-center-scam", owner, input),
    ]);
    expect(arrived).toBe(2);
    expect(a.session).toEqual(b.session);
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
    const row = await clients[0]!.trainingSession.findUniqueOrThrow({ where: { id: a.session.sessionId } });
    const winner = a.duplicate ? "SCAM_CALL" : "NORMAL_CALL";
    expect(row.variant).toBe(winner);
    expect(row.revision).toBe(0);
    expect(row.state).toBe("INCOMING_CALL");
    expect(await clients[1]!.trainingSession.count({ where: { id: row.id } })).toBe(1);
    expect(await clients[1]!.sessionOpportunity.count({ where: { sessionId: row.id } })).toBe(0);
    expect(await clients[1]!.trainingAction.count({ where: { sessionId: row.id } })).toBe(0);
    expect(await clients[1]!.trainingEvent.count({ where: { sessionId: row.id } })).toBe(0);
    const reloaded = await createApplication(new PrismaTrainingRepository(clients[1]!), new MockScenarioModelProvider(), Date.now,
      () => { throw new Error("Persisted starts must not reroll"); });
    expect(await reloaded.start("call-center-scam", owner, input)).toEqual({ session: a.session, duplicate: true });
    expect(await reloaded.resume(row.id, owner)).toEqual(a.session);
    expect(firstSelector).toHaveBeenCalledTimes(1);
    expect(secondSelector).toHaveBeenCalledTimes(1);
    expect((await clients[0]!.trainingSession.findUniqueOrThrow({ where: { id: row.id } })).variant).toBe(winner);
  }, 30_000);
});
