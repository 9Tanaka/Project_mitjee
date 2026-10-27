import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Prisma } from "../src/generated/prisma/client.js";
import { PrismaTrainingRepository } from "../src/persistence/prisma-repository.js";
import { smsPhishingDialogueFixture as fixture } from "../src/fixtures/sms-phishing-dialogue.js";
import { postgresTestClient } from "./postgres.helpers.js";
import { postgresTestUrl, postgresTestOptions } from "./postgres.helpers.js";
import { postgresPoolConfig } from "../src/persistence/prisma-client.js";
import pg from "pg";

const client = postgresTestClient();
afterAll(async () => { await client?.$disconnect(); });

// These tests require real, already migrated disposable PostgreSQL. They never
// create/reset a database and remain explicitly skipped without the guarded URL.
describe.skipIf(!client)("PostgreSQL catalog and native semantics (real database)", () => {
  it("installs all three enabled BEFORE ROW immutability triggers", async () => {
    const rows = await client!.$queryRaw<Array<{ name: string; table_name: string; definition: string; enabled: string }>>`
      SELECT t.tgname AS name, c.relname AS table_name, pg_get_triggerdef(t.oid) AS definition, t.tgenabled::text AS enabled
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND NOT t.tgisinternal AND c.relname IN ('ScenarioTemplateVersion','UserAccount')`;
    expect(rows.map(r => r.name).sort()).toEqual(["UserAccount_id_immutable", "published_template_no_delete", "published_template_no_update"]);
    for (const row of rows) { expect(row.enabled).toBe("O"); expect(row.definition).toContain("FOR EACH ROW"); expect(row.definition).toContain("BEFORE"); }
    expect(rows.find(r => r.name === "published_template_no_update")!.definition).toContain("BEFORE UPDATE");
    expect(rows.find(r => r.name === "published_template_no_delete")!.definition).toContain("BEFORE DELETE");
  });

  it("keeps fixed CHAR widths, all timestamp milliseconds, JSONB and deterministic text", async () => {
    const columns = await client!.$queryRaw<Array<{ table_name: string; column_name: string; data_type: string; character_maximum_length: number | null; datetime_precision: number | null; collation_name: string | null }>>`
      SELECT table_name, column_name, data_type, character_maximum_length, datetime_precision, collation_name
      FROM information_schema.columns WHERE table_schema='public' AND table_name <> '_prisma_migrations'`;
    const chars = columns.filter(c => c.data_type === "character").map(c => [c.table_name, c.column_name, c.character_maximum_length]);
    expect(chars.sort()).toEqual([
      ["QuizReceipt", "fingerprint", 64], ["QuizReceipt", "requestId", 36],
      ["UserAccount", "id", 36], ["UserAccount", "passwordHash", 60],
    ]);
    const dateColumns = columns.filter(c => c.data_type.startsWith("timestamp"));
    expect(dateColumns).toHaveLength(14);
    expect(dateColumns.every(c => c.data_type === "timestamp with time zone" && c.datetime_precision === 3)).toBe(true);
    expect(columns.filter(c => c.data_type === "jsonb")).toHaveLength(12);
    expect(columns.filter(c => ["text", "character", "character varying"].includes(c.data_type)).every(c => c.collation_name === "C")).toBe(true);
  });

  it("preserves every FK column order and RESTRICT/CASCADE action without an owner FK or invented CHECK", async () => {
    const rows = await client!.$queryRaw<Array<{ table_name: string; definition: string }>>`
      SELECT r.relname AS table_name, pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
      WHERE n.nspname='public' AND c.contype='f'`;
    const expected = [
      ["ScenarioTemplateVersion", 'FOREIGN KEY ("templateId") REFERENCES "Scenario"(id) ON UPDATE RESTRICT ON DELETE RESTRICT'],
      ["TrainingSession", 'FOREIGN KEY ("templateId", "templateVersion", variant) REFERENCES "ScenarioTemplateVersion"("templateId", version, variant) ON UPDATE RESTRICT ON DELETE RESTRICT'],
      ...["TrainingAction", "SessionOpportunity", "TrainingEvent", "DialogueTurnReceipt", "TrainingMessage", "TrainingResult"].map(t => [t, 'FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"(id) ON UPDATE CASCADE ON DELETE CASCADE']),
      ["SessionOpportunity", 'FOREIGN KEY ("sessionId", "finalizedByActionId") REFERENCES "TrainingAction"("sessionId", id) ON UPDATE RESTRICT ON DELETE RESTRICT'],
      ["TrainingEvent", 'FOREIGN KEY ("sessionId", "actionId") REFERENCES "TrainingAction"("sessionId", id) ON UPDATE RESTRICT ON DELETE RESTRICT'],
      ["TrainingEvent", 'FOREIGN KEY ("sessionId", "opportunityId") REFERENCES "SessionOpportunity"("sessionId", "definitionId") ON UPDATE RESTRICT ON DELETE RESTRICT'],
      ["DialogueTurnReceipt", 'FOREIGN KEY ("sessionId", "actionId") REFERENCES "TrainingAction"("sessionId", id) ON UPDATE RESTRICT ON DELETE RESTRICT'],
      ["TrainingMessage", 'FOREIGN KEY ("sessionId", "turnId") REFERENCES "DialogueTurnReceipt"("sessionId", id) ON UPDATE RESTRICT ON DELETE RESTRICT'],
      ["QuizReceipt", 'FOREIGN KEY ("attemptId") REFERENCES "QuizAttempt"(id) ON UPDATE CASCADE ON DELETE CASCADE'],
    ];
    expect(rows.map(r => [r.table_name, r.definition]).sort()).toEqual(expected.sort());
    const checks = await client!.$queryRaw<Array<{ name: string }>>`
      SELECT c.conname AS name FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.contype='c'`;
    expect(checks).toEqual([]);
    const indexes = await client!.$queryRaw<Array<{ tablename: string; indexdef: string }>>`
      SELECT tablename, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
    expect(indexes).toHaveLength(20); // 12 primary keys plus the eight inventoried indexes.
    for (const [table, columns] of [
      ["ScenarioTemplateVersion", '("templateId", version, variant)'], ["TrainingAction", '("sessionId", revision)'],
      ["DialogueTurnReceipt", '("sessionId", "actionId")'], ["TrainingMessage", '("sessionId", "turnId", role)'],
      ["QuizReceipt", '("attemptId", revision)'], ["QuizAttempt", '("ownerId", "startedAt", id)'],
      ["QuizAttempt", '("ownerId", mode, "bankVersion", blueprint, "completedAt")'],
    ]) expect(indexes.some(r => r.tablename === table && r.indexdef.endsWith(columns!))).toBe(true);
  });

  it("direct SQL rejects no-op template updates and deletion with P0001", async () => {
    const template = { ...fixture, id: "metadata-" + randomUUID() };
    await new PrismaTrainingRepository(client!).publish(template);
    const pool = new pg.Pool(postgresPoolConfig(postgresTestUrl!, postgresTestOptions));
    try {
      for (const sql of [
        'UPDATE "public"."ScenarioTemplateVersion" SET "configuration"="configuration" WHERE "templateId"=$1',
        'DELETE FROM "public"."ScenarioTemplateVersion" WHERE "templateId"=$1',
      ]) {
        await expect(pool.query(sql, [template.id])).rejects.toMatchObject({ code: "P0001", message: "PUBLISHED_TEMPLATE_IMMUTABLE" });
      }
    } finally { await pool.end(); }
  });

  it("account identity is immutable while same-ID updates and valid CHAR round trips work", async () => {
    const id = randomUUID(), hash = "$2b$12$" + "a".repeat(53);
    await client!.userAccount.create({ data: { id, email: id + "@example.test", passwordHash: hash } });
    await client!.$executeRaw`UPDATE "public"."UserAccount" SET "id"="id" WHERE "id"=${id}`;
    const pool = new pg.Pool(postgresPoolConfig(postgresTestUrl!, postgresTestOptions));
    try {
      await expect(pool.query('UPDATE "public"."UserAccount" SET "id"=$1 WHERE "id"=$2', [randomUUID(), id]))
        .rejects.toMatchObject({ code: "P0001", message: "ACCOUNT_ID_IMMUTABLE" });
    } finally { await pool.end(); }
    const row = await client!.userAccount.findUniqueOrThrow({ where: { id } });
    expect(row.id).toBe(id); expect(row.passwordHash).toBe(hash);
  });

  it("round-trips UTC milliseconds even when the SQL transaction timezone differs", async () => {
    const id = randomUUID(), instant = new Date("2026-10-23T12:34:56.789Z");
    await client!.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'Asia/Bangkok'`;
      const row = await tx.userAccount.create({ data: { id, email: id + "@example.test", passwordHash: "$2b$12$" + "a".repeat(53), createdAt: instant, updatedAt: instant } });
      expect(row.createdAt.getTime()).toBe(instant.getTime());
      const displayed = await tx.$queryRaw<Array<{ local: string }>>`SELECT to_char("createdAt", 'YYYY-MM-DD HH24:MI:SS.MS') AS local FROM "public"."UserAccount" WHERE "id"=${id}`;
      expect(displayed[0]!.local).toBe("2026-10-23 19:34:56.789");
    });
    expect((await client!.userAccount.findUniqueOrThrow({ where: { id } })).createdAt.getTime()).toBe(instant.getTime());
  });

  it("distinguishes JSON null from SQL NULL and compares canonical JSON without property order", async () => {
    const sqlId = "null-" + randomUUID(), jsonId = "null-" + randomUUID();
    const base = { ownerId: "metadata-owner", mode: "PRE_TEST", bankVersion: "metadata", blueprint: "metadata", status: "ACTIVE", revision: 0,
      startedAt: new Date(1234), snapshot: { z: [1, null], a: { nested: true } }, answers: {} };
    await client!.quizAttempt.create({ data: { ...base, id: sqlId, result: Prisma.DbNull } });
    await client!.quizAttempt.create({ data: { ...base, id: jsonId, result: Prisma.JsonNull } });
    const rows = await client!.$queryRaw<Array<{ id: string; sql_null: boolean; json_null: boolean | null }>>`
      SELECT id, result IS NULL AS sql_null, result='null'::jsonb AS json_null FROM "public"."QuizAttempt" WHERE id IN (${sqlId}, ${jsonId})`;
    expect(rows.find(r => r.id === sqlId)).toMatchObject({ sql_null: true, json_null: null });
    expect(rows.find(r => r.id === jsonId)).toMatchObject({ sql_null: false, json_null: true });
    expect((await client!.quizAttempt.findUniqueOrThrow({ where: { id: sqlId } })).snapshot).toEqual({ a: { nested: true }, z: [1, null] });
    const requestId = randomUUID(), fingerprint = "a".repeat(64);
    await client!.quizReceipt.create({ data: { attemptId: sqlId, requestId, fingerprint, revision: 1 } });
    const receipt = await client!.quizReceipt.findUniqueOrThrow({ where: { attemptId_requestId: { attemptId: sqlId, requestId } } });
    expect(receipt.requestId).toBe(requestId); expect(receipt.fingerprint).toBe(fingerprint);
    await client!.quizAttempt.delete({ where: { id: sqlId } });
    expect(await client!.quizReceipt.count({ where: { attemptId: sqlId } })).toBe(0);
  });
});
