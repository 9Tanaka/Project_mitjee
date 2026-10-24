import { afterAll, describe } from "vitest";
import { postgresTestClient } from "./postgres.helpers.js";
import { PrismaTrainingRepository } from "../src/persistence/prisma-repository.js";
import { preflightContract } from "./preflight-contract.js";

const client = postgresTestClient();
afterAll(async () => { await client?.$disconnect(); });
describe.skipIf(!client)("Live PostgreSQL pre-provider guard", () => {
  preflightContract("Same contract against PostgreSQL", options => new PrismaTrainingRepository(client!, options));
});
