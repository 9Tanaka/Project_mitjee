import type { ScenarioTemplate } from "./schema.js";
import { DomainError } from "./types.js";
import type { SessionOpportunity, TrainingSession } from "./types.js";

export function openStateOpportunities(session: TrainingSession, template: ScenarioTemplate, now: number): void {
  for (const definition of template.opportunities.filter(o => o.state === session.state)) {
    if (session.opportunities.some(o => o.definitionId === definition.id)) continue;
    const maximum = definition.skill === "W"
      ? definition.evidence.filter(e => e.warningSignId !== null).length
      : definition.maxScore;
    session.opportunities.push({
      definitionId: definition.id, state: session.state, skill: definition.skill,
      eligibleMaximum: maximum, earned: 0, openedAt: now,
      finalizedAt: null, finalizedByActionId: null,
      correctWarningSignIds: [], incorrectEvidenceIds: [],
    });
  }
}

export function requireOpenOpportunity(session: TrainingSession, id: string): SessionOpportunity {
  const opportunity = session.opportunities.find(o => o.definitionId === id);
  if (!opportunity || opportunity.state !== session.state) throw new DomainError("INELIGIBLE_OPPORTUNITY");
  if (opportunity.finalizedAt !== null) throw new DomainError("OPPORTUNITY_ALREADY_FINALIZED");
  return opportunity;
}
