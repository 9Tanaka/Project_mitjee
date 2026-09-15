import { InMemoryTrainingRepository } from "../src/domain/repository.js";
import { repositoryContract } from "./repository-contract.js";
repositoryContract("InMemory repository port", () => new InMemoryTrainingRepository());
