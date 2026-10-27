/** Process-local error context, never raw database error/meta or request data. */
export interface TransactionFailureContext {
  operation: "PUBLISH" | "CREATE" | "GET" | "SAVE";
  durationMs: number;
  budgetMs: number;
}
const failures = new WeakMap<object, Readonly<TransactionFailureContext>>();
export function rememberTransactionFailure(error: object, context: TransactionFailureContext): void {
  failures.set(error, Object.freeze({ ...context }));
}
export function transactionFailureContext(error: unknown): Readonly<TransactionFailureContext> | undefined {
  return error !== null && typeof error === "object" ? failures.get(error) : undefined;
}
