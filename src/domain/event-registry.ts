import { CRITICAL_CODES, EVENT_CODES } from "./constants.js";
import type { EventCode } from "./types.js";

export const EVENT_REGISTRY: Readonly<Record<EventCode, { readonly critical: boolean }>> =
  Object.freeze(Object.fromEntries(EVENT_CODES.map(code => [
    code, Object.freeze({ critical: (CRITICAL_CODES as readonly string[]).includes(code) }),
  ])) as Record<EventCode, { readonly critical: boolean }>);

export function isCritical(code: EventCode): boolean {
  return EVENT_REGISTRY[code].critical;
}
