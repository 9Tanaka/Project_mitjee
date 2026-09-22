import { readdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
async function walk(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = path + "/" + entry.name;
    if (entry.isDirectory()) result.push(...await walk(file));
    else if (file.endsWith(".js")) result.push(file);
  }
  return result;
}
const files = await walk(".next/static");
assert.ok(files.length, "Build client artifacts before auditing");
const forbidden = /PrismaClient|@prisma\/|bcrypt|AUTH_SECRET|DATABASE_URL|MYSQL_TEST_DATABASE_URL|passwordHash|PrismaTrainingRepository|TrainingCore|credentialsAuthorize|OPENAI_API_KEY|OPENAI_MODEL|AI_PROVIDER|OpenAIScenarioModelProvider|MITJEE_SCENARIO_DIALOGUE_V1|api\.openai\.com|dangerouslyAllowBrowser|OpenAIProviderError/;
for (const file of files) assert.ok(!forbidden.test(await readFile(file, "utf8")), "Server dependency or secret-name marker in " + file);
console.log("Client bundle audit passed: " + files.length + " JavaScript artifacts; server dependency/secret markers absent.");
