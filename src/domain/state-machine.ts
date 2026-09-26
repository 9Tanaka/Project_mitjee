import { createMachine, transition } from "xstate";
import type { ScenarioTemplate } from "./schema.js";
import { DomainError } from "./types.js";
import type { ScenarioState, TrainingSession } from "./types.js";

type Edge = ScenarioTemplate["states"][number]["transitions"][number];

function guardSatisfied(session: TrainingSession, t: ScenarioTemplate, edge: Edge): boolean {
  const requiredHere = edge.earlySafeResolution ? [] : t.opportunities.filter(o => o.state === session.state && o.required).map(o => o.id);
  const required = new Set([...requiredHere, ...edge.requiresFinalized]);
  return [...required].every(id => session.opportunities.some(o => o.definitionId === id && o.finalizedAt !== null))
    && edge.requiresEvents.every(code => session.events.some(e => e.code === code));
}

export function advanceState(session: TrainingSession, t: ScenarioTemplate, transitionId: string): { state: ScenarioState; safeResolution: boolean } {
  if (session.status !== "ACTIVE") throw new DomainError("SESSION_NOT_ACTIVE");
  const current = t.states.find(s => s.id === session.state)!;
  const edge = current.transitions.find(tr => tr.id === transitionId);
  if (!edge) throw new DomainError("INVALID_TRANSITION");
  if (!guardSatisfied(session, t, edge)) throw new DomainError("CHECKPOINT_OR_EVENT_REQUIRED");

  const machine = createMachine({
    id: t.id, initial: t.initialState,
    states: Object.fromEntries(t.states.map(s => [s.id, {
      on: Object.fromEntries(s.transitions.map(tr => [tr.id, {
        target: tr.target,
        guard: () => guardSatisfied(session, t, tr),
      }])),
    }])),
  });
  const snapshot = machine.resolveState({ value: session.state });
  const [next] = transition(machine, snapshot, { type: transitionId });
  if (next.value !== edge.target) throw new DomainError("INVALID_TRANSITION");
  return { state: edge.target, safeResolution: edge.safeResolution };
}
