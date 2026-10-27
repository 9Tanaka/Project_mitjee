import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Temporary compatibility fix for the pinned adapter, not a Prisma API fork.
// Reproduction/proposed upstream fix: https://github.com/prisma/orm/pull/29481
// Remove only after a reviewed dependency upgrade passes the non-UTC live test.
const version = "7.10.0";
const bundles = {
  "index.js": "d57ac2ea38047c648b0f3b4b8012031b5adaa9f919dbb21419a4153f7e02d3c4",
  "index.mjs": "e6879b3429f9efade5696321da768476fd4710f2aff7de95c01cca15d6a8d1d1",
};

const oldReader = String.raw`function normalize_timestamptz(time) {
  return time.replace(" ", "T").replace(/[+-]\d{2}(:\d{2})?$/, "+00:00");
}`;
const newReader = String.raw`function normalize_timestamptz(time) {
  const iso = time.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  return new Date(iso).toISOString();
}`;
const oldWriter = String.raw`function formatDateTime(date) {
  const pad = (n, z = 2) => String(n).padStart(z, "0");
  const ms = date.getUTCMilliseconds();
  return pad(date.getUTCFullYear(), 4) + "-" + pad(date.getUTCMonth() + 1) + "-" + pad(date.getUTCDate()) + " " + pad(date.getUTCHours()) + ":" + pad(date.getUTCMinutes()) + ":" + pad(date.getUTCSeconds()) + (ms ? "." + String(ms).padStart(3, "0") : "");
}`;
const newWriter = oldWriter.replace(' : "");', ' : "") + "+00:00";');
const hash = value => createHash("sha256").update(value).digest("hex");

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error("PG_ADAPTER_BUILD_UNSUPPORTED");
  return source.replace(before, () => after);
}

/** Exact original or exact already-patched bytes only; no fuzzy patching. */
export function patchAdapterSource(source, expectedOriginalHash) {
  if (hash(source) === expectedOriginalHash) {
    return replaceOnce(replaceOnce(source, oldReader, newReader), oldWriter, newWriter);
  }
  const restored = replaceOnce(replaceOnce(source, newReader, oldReader), newWriter, oldWriter);
  if (hash(restored) !== expectedOriginalHash) throw new Error("PG_ADAPTER_BUILD_UNSUPPORTED");
  return source;
}

export function applyPrismaPgTimezonePatch(directory = fileURLToPath(new URL("../node_modules/@prisma/adapter-pg/", import.meta.url))) {
  const metadata = JSON.parse(readFileSync(resolve(directory, "package.json"), "utf8"));
  if (metadata.name !== "@prisma/adapter-pg" || metadata.version !== version) throw new Error("PG_ADAPTER_VERSION_UNSUPPORTED");
  // Validate both module formats before writing either one.
  const changes = Object.entries(bundles).map(([file, expected]) => {
    const path = resolve(directory, "dist", file), original = readFileSync(path, "utf8");
    return { path, original, patched: patchAdapterSource(original, expected) };
  });
  for (const change of changes) if (change.original !== change.patched) writeFileSync(change.path, change.patched);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    applyPrismaPgTimezonePatch();
    console.info("Prisma PostgreSQL timezone compatibility patch verified (7.10.0).");
  } catch {
    console.error("Pinned PostgreSQL adapter compatibility check failed; review dependency version/build before installation or build.");
    process.exitCode = 1;
  }
}
