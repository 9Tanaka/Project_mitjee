import { CALL_STATES, DECISION_POINTS, LEGACY_STATES, SKILLS } from "./constants.js";
import { terminalState } from "./call-center.js";
import { isCritical } from "./event-registry.js";
import { scenarioTemplateSchema } from "./schema.js";
import type { ScenarioTemplate } from "./schema.js";
import { DomainError } from "./types.js";

function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new DomainError("INVALID_TEMPLATE", message);
}

function unique(values: string[], label: string): void {
  requireRule(new Set(values).size === values.length, `Duplicate ${label}`);
}

/** Publication gate. Never expose an unvalidated template through the Core service. */
export function validateTemplate(input: unknown): ScenarioTemplate {
  const parsed = scenarioTemplateSchema.safeParse(input);
  requireRule(parsed.success, parsed.success ? "" : parsed.error.message);
  const t = parsed.data;
  const decisionRules = t.evaluationMode === "DECISION_RULES_V1";
  const terminal = terminalState(t);
  if (t.callCenter) {
    const { storyId, topic } = t.callCenter;
    requireRule(t.category === "CALL_CENTER" && decisionRules && t.publicActionBindings && t.initialState === "INCOMING_CALL", "Invalid phone template");
    requireRule(!!t.characterRole, "Phone templates require a character role");
    requireRule(t.variant === (storyId.startsWith("CC-N") ? "NORMAL_CALL" : "SCAM_CALL"), "Story/variant mismatch");
    requireRule(topic === (["CC-01", "CC-N01"].includes(storyId) ? "PARCEL" : "BANK"), "Story/topic mismatch");
    requireRule(t.states.every(s => (CALL_STATES as readonly string[]).includes(s.id)), "Phone templates require Call Center states");
    requireRule(t.states.find(s => s.id === "INCOMING_CALL")?.transitions.some(e => e.id === "ANSWER_CALL" && e.target === "CALL_CONNECTED"), "Missing answer-call edge");
    requireRule(t.states.find(s => s.id === "INCOMING_CALL")?.transitions.length === 1, "Incoming call cannot bypass answer");
    requireRule(t.opportunities.every(o => o.state !== "INCOMING_CALL" && (t.callCenter?.fullStory || o.state !== "CALL_CONNECTED")), "Incoming/opening cannot create checkpoints");
    if (t.callCenter.fullStory) {
      requireRule(t.version >= 4 && !!t.callCenter.content, "Full phone story requires new version and authored content");
      unique(t.states.flatMap(s => (s.interactions ?? []).map(i => i.id)), "phone interaction");
      for (const state of t.states) {
        requireRule(typeof state.callerTurnRequired === "boolean" && !!state.internalApps && !!state.interactions, "Full phone states require explicit beat metadata");
        requireRule(state.callerTurnRequired === !["INCOMING_CALL", "CALL_ENDING", "END_SCENARIO"].includes(state.id), "Invalid caller beat");
        unique(state.internalApps, "phone app");
        requireRule(t.opportunities.filter(o => o.state === state.id).length <= 1, "One contextual checkpoint per phone beat");
        for (const interaction of state.interactions) {
          requireRule(state.internalApps.includes(interaction.app) && (!interaction.navigationTarget || state.internalApps.includes(interaction.navigationTarget)), "Interaction app unavailable");
          requireRule(!interaction.transitionId || state.transitions.some(e => e.id === interaction.transitionId), "Invalid interaction transition");
          if (interaction.resolutionChoiceId) {
            const o = t.opportunities.find(o => o.state === state.id);
            requireRule(o && o.skill !== "W" && (o.skill === "D" ? o.choices : o.actions).some(c => c.id === interaction.resolutionChoiceId), "Missing interaction resolution");
          }
        }
      }
      for (const rule of t.criticalFailureRules) {
        const preparation = t.states.find(s => s.id === rule.state)?.interactions?.find(i => i.id === rule.preparationInteractionId);
        requireRule(rule.app && rule.behavior && preparation?.app === rule.app && !!preparation.requiresBehaviors?.length, "Critical confirmation requires authored preparation");
      }
    }
  } else {
    requireRule(t.initialState === "contact" && t.states.every(s => (LEGACY_STATES as readonly string[]).includes(s.id)), "Legacy templates require legacy states");
  }
  requireRule(!t.publicFeedbackEnabled || decisionRules, "Public feedback requires decision rules");
  requireRule(!t.publicActionBindings || (decisionRules && t.publicFeedbackEnabled && !!t.description), "Public bindings require described decision rules");
  unique(t.states.map(s => s.id), "state");
  unique(t.opportunities.map(o => o.id), "opportunity");
  unique(t.criticalFailureRules.map(r => r.id), "critical rule");
  unique(t.states.flatMap(s => s.transitions.map(tr => tr.id)), "transition");
  requireRule(t.category === "CALL_CENTER" ? t.variant !== "DEFAULT" : t.variant === "DEFAULT", "Variant/category mismatch");
  if (t.variant === "NORMAL_CALL") {
    requireRule(decisionRules && t.criticalFailureRules.length === 0, "Normal calls require decision rules and zero critical rules");
    requireRule(t.states.every(s => s.allowedEventCodes.every(code => !isCritical(code))), "Normal calls cannot allow critical events");
    requireRule(t.opportunities.filter(o => o.skill === "W").every(o => o.assessmentRule === "NO_WARNINGS_EXPECTED"), "Normal calls expect no warnings");
  }

  const states = new Map(t.states.map(s => [s.id, s]));
  const opportunities = new Map(t.opportunities.map(o => [o.id, o]));
  requireRule(states.has(t.initialState) && states.has(terminal), "Missing initial/terminal state");
  requireRule(states.get(terminal)!.transitions.length === 0, "Terminal state has outgoing transitions");

  for (const o of t.opportunities) {
    if (t.publicFeedbackEnabled) requireRule(!!o.publicCheckpointLabel && !!o.unassessedFeedback, `Missing public checkpoint feedback: ${o.id}`);
    const state = states.get(o.state);
    requireRule(state && o.state !== terminal, `Invalid opportunity state: ${o.id}`);
    if (o.skill === "W") {
      if (t.publicFeedbackEnabled) requireRule(!!o.safeFeedback && !!o.reviewFeedback, `Missing warning feedback: ${o.id}`);
      if (decisionRules) requireRule(o.assessmentRule !== undefined, `Missing warning assessment rule: ${o.id}`);
      unique(o.evidence.map(e => e.id), `evidence in ${o.id}`);
      const warnings = o.evidence.flatMap(e => e.warningSignId === null ? [] : [e.warningSignId]);
      if (o.assessmentRule === "NO_WARNINGS_EXPECTED") {
        requireRule(decisionRules && t.variant === "NORMAL_CALL" && warnings.length === 0, `No-warnings rule requires normal call and neutral evidence: ${o.id}`);
      } else requireRule(warnings.length > 0, `No warning-sign maximum: ${o.id}`);
      unique(warnings, `warning sign in ${o.id}`);
      if (o.assessmentRule !== "NO_WARNINGS_EXPECTED") requireRule(state.allowedEventCodes.includes("IDENTIFY_WARNING_SIGN"), `Warning event not allowed: ${o.id}`);
    } else {
      const options = o.skill === "D" ? o.choices : o.actions;
      unique(options.map(option => option.id), `option in ${o.id}`);
      if (decisionRules) requireRule(o.maxScore === undefined && options.every(option => option.score === undefined), `Numeric rubric forbidden in decision rules: ${o.id}`);
      else {
        requireRule(o.maxScore !== undefined && options.every(option => option.score !== undefined), `Missing legacy score: ${o.id}`);
        requireRule(options.some(option => option.score === o.maxScore), `Maximum not attainable: ${o.id}`);
      }
      for (const option of options) {
        if (t.publicFeedbackEnabled) requireRule(!!option.publicFeedback, `Missing option feedback: ${o.id}:${option.id}`);
        if (t.publicActionBindings) requireRule(!!option.publicLabel, `Missing public option label: ${o.id}:${option.id}`);
        if (decisionRules) requireRule(option.assessment !== undefined, `Missing decision assessment: ${o.id}:${option.id}`);
        if (!decisionRules) requireRule(option.score! <= o.maxScore!, `Score above maximum: ${o.id}`);
        unique(option.eventCodes, `option event in ${o.id}`);
        for (const code of option.eventCodes) {
          requireRule(!isCritical(code), "Critical events require explicit simulated-action rules, not scoring mappings");
          requireRule(state.allowedEventCodes.includes(code), `Disallowed event ${code} in ${o.id}`);
        }
      }
      if (o.skill === "D") {
        if (!decisionRules) {
          requireRule(new Set(o.choices.map(c => c.rating)).size === 3, `D must expose all three ratings: ${o.id}`);
          for (const c of o.choices) requireRule(c.score === DECISION_POINTS[c.rating], `Invalid 10/5/0 mapping: ${o.id}`);
        }
      }
    }
  }

  for (const rule of t.criticalFailureRules) {
    if (t.publicFeedbackEnabled) requireRule(!!rule.publicLabel && !!rule.publicFeedback, `Missing critical feedback: ${rule.id}`);
    requireRule(states.get(rule.state)?.allowedEventCodes.includes(rule.eventCode), `Critical event not allowed: ${rule.id}`);
    requireRule(opportunities.get(rule.opportunityId)?.state === rule.state, `Critical action requires a current-state opportunity: ${rule.id}`);
  }
  for (const s of t.states) {
    unique(s.allowedEventCodes, `allowed event in ${s.id}`);
    for (const tr of s.transitions) {
      if (t.publicActionBindings) requireRule(!!tr.publicLabel, `Missing public transition label: ${tr.id}`);
      requireRule(!tr.earlySafeResolution || (decisionRules && tr.safeResolution && tr.requiresFinalized.length === 0 && tr.requiresEvents.length === 0), `Invalid early safe resolution: ${tr.id}`);
      requireRule(states.has(tr.target), `Unknown target ${tr.target}`);
      requireRule(tr.safeResolution === (tr.target === terminal), "Only safe-resolution transitions may target terminal state");
      for (const id of tr.requiresFinalized) requireRule(opportunities.has(id), `Unknown guard opportunity: ${id}`);
      for (const guard of tr.requiresChoices ?? []) {
        const o = opportunities.get(guard.opportunityId);
        requireRule(o?.skill === "D" && guard.choiceIds.every(id => o.choices.some(c => c.id === id)), "Invalid decision branch guard");
        requireRule(tr.requiresFinalized.includes(guard.opportunityId), "Decision branch requires finalized checkpoint");
      }
      if (t.callCenter?.fullStory && t.version >= 5 && tr.target === "INDEPENDENT_VERIFICATION") {
        const checkBehavior = t.callCenter.topic === "PARCEL" ? "CHECKED_EXISTING_ORDER" : "CHECKED_TRANSACTION";
        requireRule(tr.requiresEvents.includes("VERIFY_SOURCE") && tr.requiresBehaviors?.includes(checkBehavior) &&
          tr.requiresChoices?.some(g => opportunities.get(g.opportunityId)?.state === s.id && g.choiceIds.length === 1 && g.choiceIds[0] === "checked"),
          "Independent verification requires explicit completed evidence check, not callback intent");
      }
    }
  }

  // Deliberately acyclic MVP progression; multi-turn chat does not change the state.
  // Enumerate every path, carrying eligible opportunities (not merely global presence).
  const reached = new Set<string>();
  let safePaths = 0;
  function visit(stateId: typeof t.initialState | ScenarioTemplate["states"][number]["id"], path: string[], eligible: Set<string>): void {
    requireRule(!path.includes(stateId), "Cyclic state progression is not supported by the MVP template validator");
    reached.add(stateId);
    const nextEligible = new Set(eligible);
    t.opportunities.filter(o => o.state === stateId).forEach(o => nextEligible.add(o.id));
    const state = states.get(stateId)!;
    if (stateId !== terminal) requireRule(state.transitions.length > 0, `Nonterminal dead end: ${stateId}`);
    for (const tr of state.transitions) {
      for (const id of tr.requiresFinalized) requireRule(nextEligible.has(id), `Guard references ineligible opportunity ${id} on path ${[...path, stateId].join(" -> ")}`);
      // Event guards must be producible on this path by a noncritical explicit action.
      const availableEvents = new Set([...nextEligible].flatMap(id => {
        const o = opportunities.get(id)!;
        return o.skill === "W" ? (o.assessmentRule === "NO_WARNINGS_EXPECTED" ? [] : ["IDENTIFY_WARNING_SIGN"]) : (o.skill === "D" ? o.choices : o.actions).flatMap(c => c.eventCodes);
      }));
      for (const code of tr.requiresEvents) requireRule(availableEvents.has(code), `Unproducible event guard: ${code}`);
      if (tr.safeResolution) {
        safePaths++;
        const skills = new Set([...nextEligible].map(id => opportunities.get(id)!.skill));
        if (!decisionRules) for (const skill of SKILLS) requireRule(skills.has(skill), `Safe Resolution path missing eligible ${skill}: ${[...path, stateId, tr.target].join(" -> ")}`);
      }
      visit(tr.target, [...path, stateId], nextEligible);
    }
  }
  visit(t.initialState, [], new Set());
  requireRule(safePaths > 0, "No Safe Resolution path");
  requireRule(reached.size === states.size, "Unreachable state definitions");
  return t;
}
