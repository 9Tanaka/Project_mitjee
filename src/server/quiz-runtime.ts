import { QuizService } from "../quiz/service.js";
import { PrismaQuizRepository } from "../persistence/quiz-repository.js";
import { getDatabase } from "./database.js";
// Uses the shared DB pool; Quiz does not initialize the dialogue or live AI provider.
export function getQuizService() { return new QuizService(new PrismaQuizRepository(getDatabase())); }
