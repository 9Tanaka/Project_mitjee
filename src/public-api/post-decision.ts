import { z } from "zod";

const text = z.string().trim().min(1);
const list = z.array(text);
const reviewedAt = z.iso.date();
const officialUrl = z.url().refine(value => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["www.bot.or.th", "mdes.go.th", "www.thaipoliceonline.go.th"].includes(url.hostname) && !url.username && !url.password && !url.port;
  } catch { return false; }
});
const source = z.strictObject({ title: text, url: officialUrl, reviewedAt });
export const postDecisionGuidanceDto = z.strictObject({
  contentRef: z.string().regex(/^L-[a-f0-9-]{36}$/), contentVersion: z.number().int().positive(), reviewedAt,
  checkpoints: z.array(z.strictObject({ ruleRef: z.string().regex(/^R-[a-f0-9]{16}$/), label: text,
    assessment: z.enum(["SAFE", "REVIEW", "UNASSESSED", "CRITICAL"]), explanation: text,
    selectedAction: text.nullable(), saferAlternative: text })),
  tutorial: z.array(z.strictObject({ ref: z.string().regex(/^T-\d+$/), title: text, explanation: text,
    independentVerification: list, commonMistakes: list, nextTimePrevention: list })),
  recovery: z.array(z.strictObject({ incidentType: z.enum(["MONEY_TRANSFERRED", "OTP_OR_CREDENTIAL_DISCLOSED"]),
    confirmedAction: text, immediateActions: list, evidenceToPreserve: list,
    officialHelp: z.array(z.strictObject({ category: z.enum(["BANK", "AOC", "POLICE"]), label: text, url: officialUrl })),
    accountRecoverySteps: list, nextTimePrevention: list, retryRecommendation: text, sources: z.array(source) })),
  nextTimePrevention: list,
});
