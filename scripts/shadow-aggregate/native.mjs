import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

/** Separate schema, config, generated client and tsc; never writes src/generated. */
export async function nativeCapability(scratch) {
  const root = resolve(scratch), allowed = resolve("test-results") + "/";
  if (!root.replaceAll("\\", "/").startsWith(allowed.replaceAll("\\", "/"))) throw new Error("SHADOW_OUTPUT_OUTSIDE_SCRATCH");
  mkdirSync(scratch, { recursive: true });
  const original = readFileSync("prisma/schema.prisma", "utf8");
  const schema = original.replace(/output\s*=\s*"[^"]+"/, 'output = "./client"').replace('provider = "prisma-client"', 'provider = "prisma-client"\n  previewFeatures = ["relationJoins"]');
  writeFileSync(resolve(root, "schema.prisma"), schema);
  writeFileSync(resolve(root, "prisma.config.ts"), 'import { defineConfig } from "prisma/config"; export default defineConfig({schema:"schema.prisma",datasource:{url:"postgresql://invalid:invalid@127.0.0.1:1/invalid"}});');
  const generated = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "generate", "--config", resolve(root, "prisma.config.ts")], { windowsHide: true, encoding: "utf8" });
  const result = { generationExitCode: generated.status, isolated: true, dependencyUpgrade: false, typecheckExitCode: null, available: false };
  if (generated.status !== 0) { result.failureCategory = "ISOLATED_GENERATION_FAILED"; return result; }
  writeFileSync(resolve(root, "probe.ts"), 'import type { Prisma } from "./client/client.js"; const training:Prisma.TrainingSessionFindFirstArgs={relationLoadStrategy:"join",include:{actions:true}}; const quiz:Prisma.QuizAttemptFindFirstArgs={relationLoadStrategy:"query",include:{receipts:true}}; void training; void quiz;');
  writeFileSync(resolve(root, "tsconfig.json"), JSON.stringify({ extends: "../../tsconfig.json", compilerOptions: { incremental: false, noEmit: true }, include: ["probe.ts", "client/**/*.ts"], exclude: [] }));
  const checked = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "--project", resolve(root, "tsconfig.json")], { windowsHide: true, encoding: "utf8" });
  result.typecheckExitCode = checked.status;
  if (checked.status !== 0) { result.failureCategory = "ISOLATED_TYPECHECK_FAILED"; return result; }
  const module = await import(pathToFileURL(resolve(root, "client/client.ts")).href);
  result.available = true; return { result, PrismaClient: module.PrismaClient };
}
