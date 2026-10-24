import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { applyPrismaPgTimezonePatch, patchAdapterSource } from "../scripts/patch-prisma-pg-timezone.mjs";

// Minimal reproduction of the pinned adapter's two original conversions.
const original = String.raw`function normalize_timestamptz(time) {
  return time.replace(" ", "T").replace(/[+-]\d{2}(:\d{2})?$/, "+00:00");
}
function formatDateTime(date) {
  const pad = (n, z = 2) => String(n).padStart(z, "0");
  const ms = date.getUTCMilliseconds();
  return pad(date.getUTCFullYear(), 4) + "-" + pad(date.getUTCMonth() + 1) + "-" + pad(date.getUTCDate()) + " " + pad(date.getUTCHours()) + ":" + pad(date.getUTCMinutes()) + ":" + pad(date.getUTCSeconds()) + (ms ? "." + String(ms).padStart(3, "0") : "");
}`;
const digest = createHash("sha256").update(original).digest("hex");
const patched = patchAdapterSource(original, digest);
const conversions = runInNewContext(`${patched}; ({ read: normalize_timestamptz, write: formatDateTime })`) as {
  read(value: string): string; write(value: Date): string;
};

function removeOwnPackageFixture(directory: string) {
  const target = resolve(directory);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("mitjee-adapter-")) {
    throw new Error("Test cleanup path rejected");
  }
  rmSync(target, { recursive: true, force: true });
}

describe("pinned PostgreSQL adapter timezone compatibility", () => {
  it.each([
    ["2026-10-23 19:34:56.789+07", "2026-10-23T12:34:56.789Z"],
    ["2026-10-23 06:34:56.789-06", "2026-10-23T12:34:56.789Z"],
    ["2026-10-24 00:15:00.001+05:30", "2026-10-23T18:45:00.001Z"],
    ["2026-10-23 23:15:00.999-09:30", "2026-10-24T08:45:00.999Z"],
    ["1970-01-01 00:00:00+00", "1970-01-01T00:00:00.000Z"],
  ])("preserves the real instant when reading %s", (input, expected) => {
    expect(conversions.read(input)).toBe(expected);
  });
  it.each(["2026-10-23T12:34:56.789Z", "1970-01-01T00:00:00.000Z"])("writes an explicit UTC offset for %s", input => {
    const wire = conversions.write(new Date(input));
    expect(wire).toMatch(/\+00:00$/);
    expect(new Date(wire).toISOString()).toBe(input);
  });
  it("is idempotent and rejects changed or partially patched bundle bytes", () => {
    expect(patchAdapterSource(patched, digest)).toBe(patched);
    expect(() => patchAdapterSource(patched + "\n// changed", digest)).toThrow("BUILD_UNSUPPORTED");
    expect(() => patchAdapterSource(original.replace("+00:00", "+01:00"), digest)).toThrow("BUILD_UNSUPPORTED");
    const reader = /function normalize_timestamptz\([^]*?\n\}/;
    const partial = original.replace(reader, patched.match(reader)![0]);
    expect(() => patchAdapterSource(partial, digest)).toThrow("BUILD_UNSUPPORTED");
  });
  it("rejects another version before modifying either module", () => {
    const directory = mkdtempSync(join(tmpdir(), "mitjee-adapter-version-"));
    try {
      mkdirSync(join(directory, "dist"));
      writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "@prisma/adapter-pg", version: "99.0.0" }));
      writeFileSync(join(directory, "dist/index.js"), original);
      expect(() => applyPrismaPgTimezonePatch(directory)).toThrow("VERSION_UNSUPPORTED");
      expect(readFileSync(join(directory, "dist/index.js"), "utf8")).toBe(original);
    } finally { removeOwnPackageFixture(directory); }
  });
  it("refuses unsupported builds before writing either module", () => {
    const directory = mkdtempSync(join(tmpdir(), "mitjee-adapter-build-"));
    try {
      mkdirSync(join(directory, "dist"));
      writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "@prisma/adapter-pg", version: "7.10.0" }));
      // First bundle is a valid original release and would need patching; the
      // invalid second bundle must prevent that first write as well.
      let firstBundle = readFileSync(new URL("../node_modules/@prisma/adapter-pg/dist/index.js", import.meta.url), "utf8");
      for (const name of ["normalize_timestamptz", "formatDateTime"]) {
        const pattern = new RegExp(`function ${name}\\([^]*?\\n\\}`);
        firstBundle = firstBundle.replace(pattern, original.match(pattern)![0]);
      }
      writeFileSync(join(directory, "dist/index.js"), firstBundle);
      writeFileSync(join(directory, "dist/index.mjs"), original);
      expect(() => applyPrismaPgTimezonePatch(directory)).toThrow("BUILD_UNSUPPORTED");
      expect(readFileSync(join(directory, "dist/index.js"), "utf8")).toBe(firstBundle);
    } finally { removeOwnPackageFixture(directory); }
  });
});
