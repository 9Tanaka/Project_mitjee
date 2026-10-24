import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import type { TrainingSession } from "../src/domain/types.js";
import { preflightContract } from "./preflight-contract.js";

preflightContract("Shared pre-provider application guard / in-memory", options => new class extends InMemoryTrainingRepository {
  override async save(session: TrainingSession, revision: number) { options?.beforeCommit?.(); return super.save(session, revision); }
}());
