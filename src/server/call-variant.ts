import type { CallVariantSelector } from "../application/training-service.js";

/** Explicit demo override only. Undefined retains the application's secure random selector. */
export function demoCallVariant(env: Readonly<Record<string, string | undefined>> = process.env): CallVariantSelector | undefined {
  const variant = env.CALL_CENTER_DEMO_VARIANT;
  if (variant === undefined || variant === "") return undefined;
  if (variant !== "SCAM_CALL" && variant !== "NORMAL_CALL") throw new Error("Invalid CALL_CENTER_DEMO_VARIANT configuration");
  return () => variant;
}
