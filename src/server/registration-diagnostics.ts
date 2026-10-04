/** Server-only diagnostics: never serialize an exception, request, SQL or credentials. */
const categories: ReadonlyArray<readonly [string, RegExp]> = [
  ["DATABASE_TLS", /CERT_|ERR_TLS|self[- ]signed certificate|unable to verify|certificate has expired|certificate verify/i],
  ["DATABASE_AUTH", /P1000|ER_ACCESS_DENIED|access denied for user|authentication failed/i],
  ["DATABASE_SCHEMA", /P2021|P2022|ER_NO_SUCH_TABLE|ER_BAD_FIELD|table .*does not exist/i],
  ["DATABASE_NETWORK", /P1001|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|can't reach database/i],
  ["DATABASE_TIMEOUT", /P1002|P2024|ETIMEDOUT|ER_(?:GET_)?CONNECTION_TIMEOUT|pool timeout|pool failed to retrieve a connection|connect timeout|connection timed out|\b450(?:12|26|28)\b/i],
  ["DATABASE_CONFIGURATION", /Database configuration is required|Expected a mysql|Configure TLS explicitly|require a trusted TLS CA|RSA public key configuration/i],
  ["RUNTIME_DEPENDENCY", /MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|cannot find module|could not locate the bindings|no native build|WebAssembly/i],
];

export type RegistrationStage = "input" | "runtime" | "account_write" | "response";

export function registrationFailureCategory(error: unknown): string {
  // Prisma/driver failures can wrap the useful code in meta.driverAdapterError.cause.
  const pending: unknown[] = [error], seen = new Set<object>();
  const signals: string[] = [];
  for (let visited = 0; pending.length && visited < 16; visited++) {
    const value = pending.shift();
    if (typeof value === "string") { signals.push(value.slice(0, 8192)); continue; }
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    for (const key of ["code", "originalCode", "message", "originalMessage"]) {
      const field = Object.getOwnPropertyDescriptor(value, key)?.value;
      if (typeof field === "string") signals.push(field.slice(0, 8192));
    }
    for (const key of ["cause", "meta", "driverAdapterError"]) {
      pending.push(Object.getOwnPropertyDescriptor(value, key)?.value);
    }
  }
  const signal = signals.join("\n");
  return categories.find(([, pattern]) => pattern.test(signal))?.[0] ?? "UNCLASSIFIED";
}

export function logRegistrationFailure(error: unknown, stage: RegistrationStage, startedAt: number): void {
  // Diagnostics must never change the public response if a logger/classifier fails.
  try {
    console.error(JSON.stringify({
      event: "registration_failed", stage,
      category: registrationFailureCategory(error),
      durationMs: Math.max(0, Date.now() - startedAt),
    }));
  } catch { /* Preserve the fixed public error contract. */ }
}
