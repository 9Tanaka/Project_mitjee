import { createHash } from "node:crypto";
import type { TrainingCore } from "../core.js";
import type { ScenarioDialogueOrchestrator } from "../dialogue/orchestrator.js";
import { DomainError } from "../domain/types.js";
import type { AuthenticatedPrincipal, SubmitActionInput, SendMessageInput, QuitTrainingInput, StartTrainingInput } from "./contracts.js";
import { ApplicationError } from "./errors.js";
import { actionBindings, playableTemplates, publicScenario } from "./catalog.js";
import { projectResult, projectSession } from "./projections.js";

export class TrainingApplicationService {
  constructor(private readonly core: TrainingCore, private readonly dialogue: ScenarioDialogueOrchestrator) {}
  listScenarios() { return playableTemplates.map(publicScenario); }
  scenario(id: string) {
    const template = playableTemplates.find(t => t.id === id);
    if (!template) throw new ApplicationError("SCENARIO_NOT_FOUND");
    return publicScenario(template);
  }
  private async snapshot(id: string, user: AuthenticatedPrincipal) {
    const session = await this.core.resume(id, user.id);
    if (session.status === "EXPIRED") throw new ApplicationError("SESSION_EXPIRED");
    return session;
  }
  async start(scenarioId: string, user: AuthenticatedPrincipal, input: StartTrainingInput) {
    this.scenario(scenarioId);
    const template = playableTemplates.find(t => t.id === scenarioId)!;
    // Backend identity, version and variant. Repeated startId is stable for this owner/scenario.
    const id = createHash("sha256").update(JSON.stringify([user.id, scenarioId, input.startId])).digest("hex");
    let duplicate = false;
    try { await this.core.start(id, user.id, template.id, template.version, template.variant); }
    catch (error) {
      if (!(error instanceof DomainError) || error.code !== "SESSION_ALREADY_EXISTS") throw error;
      duplicate = true;
    }
    return { session: await this.resume(id, user), duplicate };
  }
  async resume(id: string, user: AuthenticatedPrincipal) {
    const s = await this.snapshot(id, user);
    return projectSession(s, await this.core.getSessionTemplate(id, user.id));
  }
  async action(id: string, user: AuthenticatedPrincipal, input: SubmitActionInput) {
    await this.snapshot(id, user);
    const t = await this.core.getSessionTemplate(id, user.id);
    // Resolve against the pinned version, not just currently visible actions, so old retries still replay.
    const binding = actionBindings(t).find(b => b.public.id === input.actionDefinitionId);
    if (!binding) throw new ApplicationError("INVALID_ACTION");
    const reply = await this.core.submit({ sessionId: id, ownerId: user.id, actionId: input.actionId,
      expectedRevision: input.expectedRevision, action: binding.toDomain(input.payload) });
    return { session: projectSession(reply.session, t), duplicate: reply.duplicate };
  }
  async message(id: string, user: AuthenticatedPrincipal, input: SendMessageInput) {
    await this.snapshot(id, user);
    try {
      const reply = await this.dialogue.sendMessage({ ...input, sessionId: id, ownerId: user.id });
      return { session: await this.resume(id, user), duplicate: reply.duplicate,
        turn: { turnId: reply.turn.id, committedRevision: reply.turn.committedRevision, characterMessage: reply.turn.response.character_message } };
    } catch (error) {
      // Core may expire while awaiting the provider. Preserve the application expiry policy.
      if (error instanceof DomainError && error.code === "SESSION_NOT_ACTIVE") await this.snapshot(id, user);
      throw error;
    }
  }
  async quit(id: string, user: AuthenticatedPrincipal, input: QuitTrainingInput) {
    await this.snapshot(id, user);
    const reply = await this.core.submit({ ...input, sessionId: id, ownerId: user.id, action: { kind: "QUIT_SESSION" } });
    return { session: projectSession(reply.session, await this.core.getSessionTemplate(id, user.id)), duplicate: reply.duplicate };
  }
  async result(id: string, user: AuthenticatedPrincipal) { return projectResult(await this.snapshot(id, user)); }
}
