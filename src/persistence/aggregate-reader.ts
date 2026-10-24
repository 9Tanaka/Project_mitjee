import { Prisma } from "../generated/prisma/client.js";

// Phase 5D/5E proven explicit SELECT. Identifiers are fixed; values are bound.
const sql = `SELECT to_jsonb(s) || jsonb_build_object(
 'template', jsonb_build_object('configuration', t.configuration),
 'actions', (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.revision), '[]'::jsonb) FROM "public"."TrainingAction" a WHERE a."sessionId"=s.id),
 'opportunities', (SELECT COALESCE(jsonb_agg(to_jsonb(o) || jsonb_build_object('eligibleMaximum', o."eligibleMaximum"::text, 'earned', o.earned::text) ORDER BY o.position), '[]'::jsonb) FROM "public"."SessionOpportunity" o WHERE o."sessionId"=s.id),
 'events', (SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.position), '[]'::jsonb) FROM "public"."TrainingEvent" e WHERE e."sessionId"=s.id),
 'messages', (SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.position), '[]'::jsonb) FROM "public"."TrainingMessage" m WHERE m."sessionId"=s.id),
 'turns', (SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d."committedRevision"), '[]'::jsonb) FROM "public"."DialogueTurnReceipt" d WHERE d."sessionId"=s.id),
 'result', (SELECT to_jsonb(r) || jsonb_build_object('trainingScore', r."trainingScore"::text) FROM "public"."TrainingResult" r WHERE r."sessionId"=s.id)
) AS aggregate FROM "public"."TrainingSession" s
JOIN "public"."ScenarioTemplateVersion" t ON t."templateId"=s."templateId" AND t.version=s."templateVersion" AND t.variant=s.variant
WHERE s.id=$1 AND s."ownerId"=$2`;

type AggregateRow = Prisma.TrainingSessionGetPayload<{ include: {
  template: { select: { configuration: true } }; actions: true; opportunities: true;
  events: true; messages: true; turns: true; result: true;
} }>;

/** The fixed SQL defines the JSON boundary. Hydrate SQL columns only; leave
 * nested JSON/null/property presence intact for the existing domain decoder. */
export function hydrateAggregate(value: unknown): AggregateRow | null {
  const row = value as AggregateRow | null;
  if (row === null) return null;
  const date = (value: unknown) => {
    if (value === null) return null;
    const d = new Date(value as string);
    if (!Number.isFinite(d.getTime())) throw new Error("INVALID_PERSISTED_TIMESTAMP");
    return d;
  };
  const numeric = (value: unknown) => value === null ? null : Number(value);
  row.startedAt = date(row.startedAt)!; row.lastActivityAt = date(row.lastActivityAt)!; row.endedAt = date(row.endedAt);
  row.actions.forEach(a => { a.at = date(a.at)!; });
  row.opportunities.forEach(o => {
    o.openedAt = date(o.openedAt)!; o.finalizedAt = date(o.finalizedAt);
    o.eligibleMaximum = numeric(o.eligibleMaximum)!; o.earned = numeric(o.earned)!;
  });
  row.events.forEach(e => { e.at = date(e.at)!; }); row.messages.forEach(m => { m.at = date(m.at)!; });
  if (row.result) { row.result.calculatedAt = date(row.result.calculatedAt)!; row.result.trainingScore = numeric(row.result.trainingScore); }
  return row;
}

/** Phase 5E supported-state boundary. Reject malformed order; never sort/repair.
 * Receipt revisions may have gaps from explicit actions or expiry. Shared by both scopes. */
function assertSupportedOrdering(row: AggregateRow): void {
  for (const relation of [row.opportunities, row.events, row.messages]) {
    if (relation.some((item, index) => item.position !== index)) throw new Error("UNSUPPORTED_PERSISTED_ORDERING");
  }
  let previousRevision = 0;
  for (const turn of row.turns) {
    if (!Number.isSafeInteger(turn.committedRevision) || turn.committedRevision <= previousRevision || turn.committedRevision > row.revision) {
      throw new Error("UNSUPPORTED_PERSISTED_ORDERING");
    }
    previousRevision = turn.committedRevision;
  }
}

export async function readTrainingAggregate(tx: Pick<Prisma.TransactionClient, "$queryRawUnsafe">, id: string, ownerId: string): Promise<AggregateRow | null> {
  const rows = await tx.$queryRawUnsafe<Array<{ aggregate: unknown }>>(sql, id, ownerId);
  const row = hydrateAggregate(rows[0]?.aggregate ?? null);
  if (row) assertSupportedOrdering(row);
  return row;
}

// SAVE-only post-CAS reload: same aggregate and codec, original ID-only scope.
const saveSql = sql.replace('WHERE s.id=$1 AND s."ownerId"=$2', 'WHERE s.id=$1');

/** Call only after a successful session CAS in the same transaction. Persisted
 * ownership/identity is validated by the unchanged assertUpdate caller. */
export async function readTrainingAggregateAfterCas(tx: Pick<Prisma.TransactionClient, "$queryRawUnsafe">, id: string): Promise<AggregateRow> {
  const rows = await tx.$queryRawUnsafe<Array<{ aggregate: unknown }>>(saveSql, id);
  const row = hydrateAggregate(rows[0]?.aggregate ?? null);
  if (!row) {
    // Preserve findUniqueOrThrow's missing-record error category. A successful
    // locked CAS makes this unreachable for supported persisted states.
    throw new Prisma.PrismaClientKnownRequestError("No record was found for a query.", { code: "P2025", clientVersion: Prisma.prismaVersion.client });
  }
  assertSupportedOrdering(row);
  return row;
}
