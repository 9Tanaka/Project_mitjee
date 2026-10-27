import { spawnSync } from "node:child_process";
import { directMigrationUrl } from "./postgres-config.mjs";

try {
  const direct = directMigrationUrl(process.env.DIRECT_URL);
  const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    // Prisma diagnostics may contain connection identity. Keep child output private.
    stdio: "pipe", windowsHide: true, env: { ...process.env, DIRECT_URL: direct },
  });
  process.exitCode = result.error ? 1 : result.status ?? 1;
  if (process.exitCode) console.error("PostgreSQL migration failed; inspect private deployment diagnostics without sharing connection details.");
  else console.log("PostgreSQL migration deployment completed.");
} catch (error) {
  // Only closed configuration messages from our guard are exposed, never URLs.
  console.error(error instanceof Error ? error.message : "PostgreSQL migration configuration rejected");
  process.exitCode = 1;
}
