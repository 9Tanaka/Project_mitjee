import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

/** Extract the actual baseline include/decoder, never a rewritten domain decoder. */
export async function loadOracle(scratch, kind = "training") {
  const path = resolve(kind === "quiz" ? "src/persistence/quiz-repository.ts" : "src/persistence/prisma-repository.ts"), text = readFileSync(path, "utf8");
  // Pinned-source anchors; no general-purpose source rewriting. TS 7's native
  // package has no createSourceFile/transpileModule API, so tsx loads this copy.
  const decoder = text.match(kind === "quiz" ? /^function decode\(row: Row\): QuizAttempt \{[\s\S]*?^\}/m : /^function decode\(row: AggregateRow\): TrainingSession \{[\s\S]*?^\}/m)?.[0];
  const include = text.match(/^const include = \{[\s\S]*?;/m)?.[0];
  if (!decoder || !include) throw new Error("ORACLE_SOURCE_UNSUPPORTED");
  const validate = pathToFileURL(resolve("src/domain/template-validator.ts")).href;
  const source = `import { validateTemplate } from ${JSON.stringify(validate)};\nexport ${include}\nexport ${decoder};`;
  const output = resolve(scratch, `baseline-${kind}-oracle.ts`); writeFileSync(output, source);
  const loaded = await import(pathToFileURL(output).href);
  return { ...loaded, sourceSha256: createHash("sha256").update(text).digest("hex"), decoderSha256: createHash("sha256").update(decoder).digest("hex") };
}

/** Mismatch output is a closed category set; no values, keys, paths or rows. */
export function mismatchCategories(a, b) {
  const categories = new Set();
  function visit(x, y) {
    if (x instanceof Date || y instanceof Date) {
      if (!(x instanceof Date && y instanceof Date)) categories.add("TIMESTAMP_TYPE");
      else if (!Object.is(x.getTime(), y.getTime())) categories.add("TIMESTAMP_INSTANT");
      return;
    }
    if (x === null || y === null) { if (x !== y) categories.add("NULLNESS"); return; }
    if (typeof x !== typeof y) { categories.add("SCALAR_TYPE"); return; }
    if (Array.isArray(x) || Array.isArray(y)) {
      if (!(Array.isArray(x) && Array.isArray(y))) { categories.add("ARRAY_TYPE"); return; }
      if (x.length !== y.length) categories.add("ARRAY_LENGTH");
      for (let i = 0; i < Math.min(x.length, y.length); i++) visit(x[i], y[i]);
      if (!isDeepStrictEqual(x, y)) categories.add("ARRAY_CONTENT_OR_ORDER");
      return;
    }
    if (typeof x === "object") {
      const xk = Object.keys(x), yk = Object.keys(y);
      if (xk.length !== yk.length || xk.some(k => !Object.hasOwn(y, k))) categories.add("OWN_PROPERTY_PRESENCE");
      for (const k of xk) if (Object.hasOwn(y, k)) visit(x[k], y[k]);
      return;
    }
    if (!Object.is(x, y)) categories.add("SCALAR_VALUE");
  }
  visit(a, b); return [...categories].sort();
}

/** Fidelity-preserving private encoding used only to characterize tied arrays.
 * Its strings/digests never leave the harness. Dates and signed zero survive. */
function fidelity(value) {
  if (value instanceof Date) return ["date", value.getTime()];
  if (typeof value === "number") return ["number", Object.is(value, -0) ? "-0" : String(value)];
  if (value === null) return ["null"];
  if (Array.isArray(value)) return ["array", ...value.map(fidelity)];
  if (typeof value === "object") return ["object", ...Object.keys(value).sort().map(k => [k, fidelity(value[k])])];
  return [typeof value, value];
}
export function sameMembersIgnoringOrder(a, b) {
  if (a.length !== b.length) return false;
  const encode = values => values.map(v => JSON.stringify(fidelity(v))).sort();
  return isDeepStrictEqual(encode(a), encode(b));
}
