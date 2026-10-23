import { spawnSync } from "node:child_process";
import { dedicatedPostgresTestUrl } from "./postgres-config.mjs";

try {
  dedicatedPostgresTestUrl(process.env.POSTGRES_TEST_DATABASE_URL, process.env.DATABASE_URL);
  const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/persistence.postgres.test.ts",
    "tests/accounts.postgres.test.ts", "tests/quiz.postgres.test.ts", "tests/call-variants.postgres.test.ts", "tests/postgres.metadata.test.ts"],
  { stdio: "inherit", windowsHide: true });
  process.exitCode = result.error ? 1 : result.status ?? 1;
} catch (error) { console.error(error instanceof Error ? error.message : "Dedicated PostgreSQL test configuration rejected"); process.exitCode = 1; }
