import { copy } from "../domain/repository.js";
import type { ScenarioTemplate } from "../domain/schema.js";
import { smsPhishingDialogueFixture } from "./sms-phishing-dialogue.js";

// Published version 3. Versions 1 and 2 keep their original scoring and history.
const template = copy(smsPhishingDialogueFixture);
template.version = 3;
template.evaluationMode = "DECISION_RULES_V1";
for (const opportunity of template.opportunities) {
  if (opportunity.skill === "D") {
    delete opportunity.maxScore;
    for (const choice of opportunity.choices) {
      choice.assessment = choice.rating === "safe" ? "SAFE" : "REVIEW";
      delete choice.score;
    }
  } else if (opportunity.skill === "S") {
    delete opportunity.maxScore;
    const assessments = { "verify-end-report": "SAFE", "end-only": "SAFE", "dismiss-without-checking": "REVIEW" } as const;
    for (const action of opportunity.actions) {
      action.assessment = assessments[action.id as keyof typeof assessments] ?? "UNASSESSED";
      delete action.score;
    }
  } else {
    opportunity.assessmentRule = "ALL_WARNINGS_NO_FALSE_POSITIVES";
  }
}
template.states.find(state => state.id === "contact")!.transitions.push({
  id: "end-contact-early", target: "end_scenario", requiresFinalized: [], requiresEvents: [],
  safeResolution: true, earlySafeResolution: true,
});
export const smsPhishingDecisionRulesFixture: ScenarioTemplate = template;
