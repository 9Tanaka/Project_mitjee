/** Local demonstration redaction, not a production PII detector or moderation service. */
export function sanitizeMessage(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/(?:otp|password|รหัสผ่าน|รหัสยืนยัน|เลขบัญชี|เลขบัตรประชาชน)\s*(?:ของผม|ของฉัน)?\s*(?:คือ|:|=)?\s*[a-zA-Z0-9!@#$%^&*._-]{3,}/gi, "[REDACTED_SECRET]")
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[REDACTED_EMAIL]")
    .replace(/(?:https?:\/\/|www\.)[^\s<>]+/gi, value => {
      // Only fictional .example links without credentials, query strings or fragments survive.
      return /^(?:https?:\/\/|www\.)[a-z0-9.-]+\.example(?:\/[a-z0-9/_-]*)?$/i.test(value)
        ? value : "[REDACTED_URL]";
    })
    .replace(/\+?\d(?:[ -]?\d){5,}/g, "[REDACTED_NUMBER]")
    .trim()
    .slice(0, 8000);
}

/** The provider gets a detached, deeply frozen, data-only context. */
export function freezeData<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeData(child);
    Object.freeze(value);
  }
  return value;
}
