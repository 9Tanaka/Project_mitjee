import { DECISION_POINTS, SKILLS } from "./constants.js";
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
  requireRule(!t.publicFeedbackEnabled || decisionRules, "Public feedback requires decision rules");
  unique(t.states.map(s => s.id), "state");
  unique(t.opportunities.map(o => o.id), "opportunity");
  unique(t.criticalFailureRules.map(r => r.id), "critical rule");
  unique(t.states.flatMap(s => s.transitions.map(tr => tr.id)), "transition");
  requireRule(t.category === "CALL_CENTER" ? t.variant !== "DEFAULT" : t.variant === "DEFAULT", "Variant/category mismatch");

  const states = new Map(t.states.map(s => [s.id, s]));
  const opportunities = new Map(t.opportunities.map(o => [o.id, o]));
  requireRule(states.has(t.initialState) && states.has("end_scenario"), "Missing initial/terminal state");
  requireRule(states.get("end_scenario")!.transitions.length === 0, "Terminal state has outgoing transitions");

  for (const o of t.opportunities) {
    if (t.publicFeedbackEnabled) requireRule(!!o.publicCheckpointLabel && !!o.unassessedFeedback, `Missing public checkpoint feedback: ${o.id}`);
    const state = states.get(o.state);
    requireRule(state && o.state !== "end_scenario", `Invalid opportunity state: ${o.id}`);
    if (o.skill === "W") {
      if (t.publicFeedbackEnabled) requireRule(!!o.safeFeedback && !!o.reviewFeedback, `Missing warning feedback: ${o.id}`);
      if (decisionRules) requireRule(o.assessmentRule === "ALL_WARNINGS_NO_FALSE_POSITIVES", `Missing warning assessment rule: ${o.id}`);
      unique(o.evidence.map(e => e.id), `evidence in ${o.id}`);
      const warnings = o.evidence.flatMap(e => e.warningSignId === null ? [] : [e.warningSignId]);
      requireRule(warnings.length > 0, `No warning-sign maximum: ${o.id}`);
      unique(warnings, `warning sign in ${o.id}`);
      requireRule(state.allowedEventCodes.includes("IDENTIFY_WARNING_SIGN"), `Warning event not allowed: ${o.id}`);
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
      requireRule(!tr.earlySafeResolution || (decisionRules && tr.safeResolution && tr.requiresFinalized.length === 0 && tr.requiresEvents.length === 0), `Invalid early safe resolution: ${tr.id}`);
      requireRule(states.has(tr.target), `Unknown target ${tr.target}`);
      requireRule(tr.safeResolution === (tr.target === "end_scenario"), "Only safe-resolution transitions may target end_scenario");
      for (const id of tr.requiresFinalized) requireRule(opportunities.has(id), `Unknown guard opportunity: ${id}`);
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
    if (stateId !== "end_scenario") requireRule(state.transitions.length > 0, `Nonterminal dead end: ${stateId}`);
    for (const tr of state.transitions) {
      for (const id of tr.requiresFinalized) requireRule(nextEligible.has(id), `Guard references ineligible opportunity ${id} on path ${[...path, stateId].join(" -> ")}`);
      // Event guards must be producible on this path by a noncritical explicit action.
      const availableEvents = new Set([...nextEligible].flatMap(id => {
        const o = opportunities.get(id)!;
        return o.skill === "W" ? ["IDENTIFY_WARNING_SIGN"] : (o.skill === "D" ? o.choices : o.actions).flatMap(c => c.eventCodes);
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
