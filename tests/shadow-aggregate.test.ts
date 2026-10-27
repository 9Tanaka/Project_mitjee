import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mismatchCategories, sameMembersIgnoringOrder } from "../scripts/shadow-aggregate/oracle.mjs";
import { hydrateAggregate, readExplicit } from "../scripts/shadow-aggregate/explicit-reader.mjs";
import { nativeCapability } from "../scripts/shadow-aggregate/native.mjs";

describe("non-authoritative aggregate shadow proof", () => {
  it("compares value, key presence, array order, signed zero and timestamp instants without logging data", () => {
    expect(mismatchCategories({ a: 1, b: null }, { b: null, a: 1 })).toEqual([]);
    expect(mismatchCategories({}, { assessment: undefined })).toContain("OWN_PROPERTY_PRESENCE");
    expect(mismatchCategories(null, {})).toEqual(["NULLNESS"]);
    expect(mismatchCategories(["PRIVATE_A", "PRIVATE_B"], ["PRIVATE_B", "PRIVATE_A"])).toContain("ARRAY_CONTENT_OR_ORDER");
    expect(mismatchCategories(-0, 0)).toEqual(["SCALAR_VALUE"]);
    expect(mismatchCategories(new Date(1), new Date(2))).toEqual(["TIMESTAMP_INSTANT"]);
    expect(mismatchCategories(new Date(1), "1970-01-01T00:00:00.001Z")).toEqual(["TIMESTAMP_TYPE"]);
    const mismatches = mismatchCategories({ privateKey: "PRIVATE_SECRET" }, {});
    expect(JSON.stringify(mismatches)).not.toMatch(/PRIVATE_SECRET|privateKey/);
  });
  it("hydrates SQL scalar dates/floats with explicit nulls while leaving nested JSON untouched", () => {
    const wire = { startedAt: "2026-10-23T19:34:56.789+07:00", lastActivityAt: "2026-10-23T12:34:56.789Z", endedAt: null,
      actions: [{ at: "1969-12-31T23:59:58.766Z" }], opportunities: [{ openedAt: "1970-01-01T00:00:00.001Z", finalizedAt: null, eligibleMaximum: "10.5", earned: "-0", assessment: null }], events: [], messages: [],
      result: { calculatedAt: "2026-10-23T12:34:56.789Z", trainingScore: null, scores: { nestedDate: "2026-01-01T00:00:00Z", nested: [false, 0, null, [], {}] } } };
    const row = hydrateAggregate(structuredClone(wire));
    expect(row.startedAt.getTime()).toBe(Date.parse("2026-10-23T12:34:56.789Z"));
    expect(row.startedAt.getTime()).toBe(row.lastActivityAt.getTime()); expect(row.endedAt).toBeNull();
    expect(row.actions[0].at.getTime()).toBe(-1234); expect(Object.is(row.opportunities[0].earned, -0)).toBe(true);
    expect(row.opportunities[0].eligibleMaximum).toBe(10.5); expect(row.opportunities[0]).toHaveProperty("assessment", null);
    expect(row.result.trainingScore).toBeNull(); expect(row.result.scores).toEqual(wire.result.scores);
    expect(hydrateAggregate(null)).toBeNull();
  });
  it("binds both owner and session as values; they cannot alter the fixed SELECT", async () => {
    let captured: unknown[] = [];
    const tx = { async $queryRawUnsafe(...args: unknown[]) { captured = args; return []; } };
    expect(await readExplicit(tx, "private-id' OR 1=1", "private-owner")).toBeNull();
    expect(captured[0]).not.toContain("private-id"); expect(captured[0]).not.toContain("private-owner");
    expect(captured.slice(1)).toEqual(["private-id' OR 1=1", "private-owner"]);
  });
  it("characterizes ordering separately without masking timestamp or signed-zero differences", () => {
    expect(sameMembersIgnoringOrder([{ id: 1, at: new Date(1) }, { id: 2 }], [{ id: 2 }, { at: new Date(1), id: 1 }])).toBe(true);
    expect(sameMembersIgnoringOrder([{ at: new Date(1) }], [{ at: new Date(2) }])).toBe(false);
    expect(sameMembersIgnoringOrder([-0], [0])).toBe(false);
  });
  it("refuses generator output outside ignored scratch before creating any directory", async () => {
    const path = "src/generated/forbidden-shadow-probe";
    expect(existsSync(path)).toBe(false); await expect(nativeCapability(path)).rejects.toThrow("SHADOW_OUTPUT_OUTSIDE_SCRATCH");
    expect(existsSync(path)).toBe(false);
  });
  it("no authoritative source imports the shadow harness or isolated generated client", () => {
    const files = readdirSync("src", { recursive: true, withFileTypes: true }).filter(f => f.isFile() && /\.tsx?$/.test(f.name));
    for (const f of files) {
      const text = readFileSync(`${f.parentPath}/${f.name}`, "utf8");
      expect(text).not.toMatch(/shadow-aggregate|phase5d-native|prove-postgres-aggregate/);
    }
  });
});
