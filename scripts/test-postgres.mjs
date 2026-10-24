import { spawnSync } from "node:child_process";
import { dedicatedPostgresTestUrl } from "./postgres-config.mjs";

try {
  dedicatedPostgresTestUrl(process.env.POSTGRES_TEST_DATABASE_URL, process.env.DATABASE_URL);
  // Full-path cases contain many bounded transactions over a remote connection.
  // This is a test-case budget, not an application transaction/provider deadline.
  // The HTTP file contains the sixtieth PostgreSQL case alongside its mock tests.
  const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/persistence.postgres.test.ts",
    "tests/accounts.postgres.test.ts", "tests/quiz.postgres.test.ts", "tests/call-variants.postgres.test.ts", "tests/postgres.metadata.test.ts",
    "tests/http.integration.test.ts", "--maxWorkers=1", "--testTimeout=300000", "--hookTimeout=60000"],
  { stdio: "inherit", windowsHide: true });
  process.exitCode = result.error ? 1 : result.status ?? 1;
} catch (error) { console.error(error instanceof Error ? error.message : "Dedicated PostgreSQL test configuration rejected"); process.exitCode = 1; }
