import { spawnSync } from "node:child_process";
if (!process.env.MYSQL_TEST_DATABASE_URL) {
  console.error("MYSQL_TEST_DATABASE_URL is required. Use a dedicated mitjee_test database; this command must not silently skip DB tests.");
  process.exit(1);
}
const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/persistence.mysql.test.ts", "tests/accounts.mysql.test.ts", "tests/quiz.mysql.test.ts"], { stdio: "inherit" });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
