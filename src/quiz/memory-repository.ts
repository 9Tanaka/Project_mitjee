import type { QuizAttempt, QuizRepository } from "./contracts.js";
export class InMemoryQuizRepository implements QuizRepository {
  private rows = new Map<string, QuizAttempt>();
  async create(attempt: QuizAttempt) { if (this.rows.has(attempt.id)) return false; this.rows.set(attempt.id, structuredClone(attempt)); return true; }
  async get(id: string, ownerId: string) { const row = this.rows.get(id); return row?.ownerId === ownerId ? structuredClone(row) : null; }
  async recent(ownerId: string) { return structuredClone([...this.rows.values()].filter(r => r.ownerId === ownerId).sort((a,b) => b.startedAt - a.startedAt || b.id.localeCompare(a.id)).slice(0,50)); }
  async latestPreTest(ownerId: string, bankVersion: string, blueprint: string, before: number) {
    const row = [...this.rows.values()].filter(r => r.ownerId === ownerId && r.mode === "PRE_TEST" && r.status === "COMPLETED" && r.bankVersion === bankVersion && r.blueprint === blueprint && r.result!.completedAt <= before)
      .sort((a,b) => b.result!.completedAt - a.result!.completedAt || b.id.localeCompare(a.id))[0];
    return row ? structuredClone(row) : null;
  }
  async commit(attempt: QuizAttempt, expectedRevision: number) {
    const row = this.rows.get(attempt.id);
    if (!row || row.ownerId !== attempt.ownerId || row.revision !== expectedRevision || row.status !== "ACTIVE") return false;
    this.rows.set(attempt.id, structuredClone(attempt)); return true;
  }
}
