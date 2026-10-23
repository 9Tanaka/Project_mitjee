import { readFileSync } from "node:fs";
import { samplesCsv } from "./benchmark-latency-helpers.mjs";

try {
  if (process.argv.length !== 3) throw new Error();
  const records = readFileSync(process.argv[2], "utf8").trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  process.stdout.write(samplesCsv(records));
} catch { console.error("Sample export failed; provide a valid benchmark JSONL file."); process.exitCode = 1; }
