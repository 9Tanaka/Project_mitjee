import { afterEach, expect, it, vi } from "vitest";
import { logRegistrationFailure, registrationFailureCategory } from "../src/server/registration-diagnostics.js";

afterEach(() => vi.restoreAllMocks());
it.each([
  ["unable to verify the first certificate", "DATABASE_TLS"],
  ["ER_ACCESS_DENIED_ERROR", "DATABASE_AUTH"],
  ["P2021", "DATABASE_SCHEMA"],
  ["ER_GET_CONNECTION_TIMEOUT", "DATABASE_TIMEOUT"],
  ["ENOTFOUND", "DATABASE_NETWORK"],
  ["Remote database connections require a trusted TLS CA", "DATABASE_CONFIGURATION"],
  ["ERR_MODULE_NOT_FOUND", "RUNTIME_DEPENDENCY"],
  ["private unexpected error", "UNCLASSIFIED"],
])("classifies %s without returning original error text", (message, category) => {
  expect(registrationFailureCategory(new Error(message))).toBe(category);
});
it("inspects bounded nested driver causes and tolerates cycles", () => {
  const cause = { originalCode: "ER_GET_CONNECTION_TIMEOUT", cause: {} };
  cause.cause = cause;
  expect(registrationFailureCategory({ meta: { driverAdapterError: { cause } } })).toBe("DATABASE_TIMEOUT");
  expect(registrationFailureCategory(null)).toBe("UNCLASSIFIED");
});
it("logs only fixed categories and stage, never private exception fields", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  logRegistrationFailure(Object.assign(new Error("P2021 mysql://user:private-password@private-host/db private@example.test"), {
    password: "private-password", sql: "private SQL", stack: "private stack", token: "private-token",
  }), "account_write", Date.now());
  expect(log).toHaveBeenCalledOnce();
  const value = JSON.parse(log.mock.calls[0]![0]);
  expect(value).toEqual({ event: "registration_failed", stage: "account_write", category: "DATABASE_SCHEMA", durationMs: expect.any(Number) });
  expect(JSON.stringify(value)).not.toMatch(/private|mysql|password|token|SQL|stack/);
});
it("does not allow a logging failure to replace the public response", () => {
  vi.spyOn(console, "error").mockImplementation(() => { throw new Error("logger unavailable"); });
  expect(() => logRegistrationFailure(new Error("private"), "runtime", Date.now())).not.toThrow();
});
