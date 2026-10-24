// Fixed identifiers and bound values. Proof-only; not imported by runtime.
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

export function hydrateAggregate(row) {
  if (row === null) return null;
  const date = value => {
    if (value === null) return null;
    const d = new Date(value); if (!Number.isFinite(d.getTime())) throw new Error("SHADOW_TIMESTAMP_INVALID"); return d;
  };
  const numeric = value => value === null ? null : Number(value);
  // Hydrate only declared SQL scalar columns, never date-looking JSON payloads.
  for (const field of ["startedAt", "lastActivityAt", "endedAt"]) row[field] = date(row[field]);
  row.actions.forEach(a => { a.at = date(a.at); });
  row.opportunities.forEach(o => { o.openedAt = date(o.openedAt); o.finalizedAt = date(o.finalizedAt); o.eligibleMaximum = numeric(o.eligibleMaximum); o.earned = numeric(o.earned); });
  row.events.forEach(e => { e.at = date(e.at); }); row.messages.forEach(m => { m.at = date(m.at); });
  if (row.result) { row.result.calculatedAt = date(row.result.calculatedAt); row.result.trainingScore = numeric(row.result.trainingScore); }
  return row;
}

export async function readExplicit(tx, id, ownerId) {
  const rows = await tx.$queryRawUnsafe(sql, id, ownerId);
  return hydrateAggregate(rows[0]?.aggregate ?? null);
}
