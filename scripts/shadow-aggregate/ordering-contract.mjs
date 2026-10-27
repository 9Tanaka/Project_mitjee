// Proof-only assertions. No authoritative source imports this module.
export const orderedRelations = [
  ["SessionOpportunity", "opportunities", "position"],
  ["TrainingEvent", "events", "position"],
  ["TrainingMessage", "messages", "position"],
  ["DialogueTurnReceipt", "turns", "committedRevision"],
];

/** Closed categories only; never return identities, values, rows or JSON paths. */
export function orderingViolations(row) {
  const failures = new Set();
  for (const [table, relation, key] of orderedRelations) {
    const values = row[relation].map(r => r[key]);
    if (values.some(v => !Number.isSafeInteger(v))) failures.add(table + ":INVALID_KEY");
    if (new Set(values).size !== values.length) failures.add(table + ":TIED_KEY");
    if (key === "position" && values.some((v, i) => v !== i)) failures.add(table + ":NON_DENSE_POSITION");
    if (key === "committedRevision") {
      if (values.some((v, i) => v < 1 || v > row.revision || i > 0 && v <= values[i - 1])) failures.add(table + ":INVALID_REVISION_SEQUENCE");
      for (const turn of row.turns) {
        const action = row.actions.find(a => a.id === `dialogue:${turn.id}`);
        if (!action || action.revision !== turn.snapshotRevision || turn.committedRevision !== turn.snapshotRevision + 1) failures.add(table + ":ACTION_REVISION_MISMATCH");
      }
    }
  }
  return [...failures].sort();
}

export function domainOrderingViolations(session) {
  return orderingViolations({ ...session,
    opportunities: session.opportunities.map((o, position) => ({ ...o, position })),
    events: session.events.map((e, position) => ({ ...e, position })),
    messages: session.messages.map((m, position) => ({ ...m, position })),
    turns: session.dialogueTurns });
}

/** Static provenance evidence complements, rather than replaces, runtime tests. */
export function writerFacts(source) {
  return {
    opportunityIndex: source.includes("for (const [position, o] of s.opportunities.entries())"),
    eventIndex: source.includes("for (const [position, e] of s.events.entries())"),
    messageIndex: source.includes("for (const [position, m] of s.messages.entries())") ||
      source.includes("position: (previous?.messages.length ?? 0) + offset"),
    receiptCopiedFromCore: source.includes("committedRevision: t.committedRevision"),
  };
}
export function coreFacts(source) {
  return {
    oneReceiptAppendSite: (source.match(/session\.dialogueTurns\.push\(/g) ?? []).length === 1,
    nextRevision: source.includes("committedRevision: session.revision + 1"),
    expectedRevisionSnapshot: source.includes("snapshotRevision: command.expectedRevision"),
    freshnessGuard: source.includes("session.revision !== command.expectedRevision"),
    casSave: source.includes("this.repository.save(session, command.expectedRevision)"),
    revisionIncrement: source.includes("session.revision++"),
  };
}
