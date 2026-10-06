// Demo State Model derived from the scenario progression in Proposal v4.
// These enum names are Demo Assumptions, not directly attributed requirements.
export const LEGACY_STATES = [
  "contact", "build_trust", "create_pressure", "request_action",
  "user_verification", "end_scenario",
] as const;
// Call Center phone/story engine superset; authored templates choose reachable subsets.
export const CALL_STATES = [
  "INCOMING_CALL", "CALL_CONNECTED", "IDENTITY_CLAIM", "CONTEXT_CLAIM", "PRESSURE",
  "MAIN_REQUEST", "PLAYER_DECISION", "INDEPENDENT_VERIFICATION", "CALL_ENDING", "END_SCENARIO",
] as const;
export const STATES = [...LEGACY_STATES, ...CALL_STATES] as const;
export const CALL_STORIES = ["CC-01", "CC-02", "CC-N01", "CC-N02"] as const;

export const CATEGORIES = [
  "CALL_CENTER", "INVESTMENT", "ROMANCE", "ECOMMERCE", "SMS_PHISHING",
  "TASK", "FAKE_LOAN", "RECOVERY", "JOB",
] as const;

export const EVENT_CODES = [
  "VERIFY_SOURCE", "IDENTIFY_WARNING_SIGN", "REFUSE_SENSITIVE_INFO",
  "REFUSE_OTP", "REFUSE_TRANSFER", "END_CONTACT", "REPORT_INCIDENT",
  "DISCLOSE_OTP", "CONFIRM_UNVERIFIED_TRANSFER",
  "ENTER_PASSWORD_SUSPICIOUS_LINK", "INSTALL_UNTRUSTED_APP",
  "GRANT_REMOTE_CONTROL",
] as const;

export const CRITICAL_CODES = [
  "DISCLOSE_OTP", "CONFIRM_UNVERIFIED_TRANSFER",
  "ENTER_PASSWORD_SUSPICIOUS_LINK", "INSTALL_UNTRUSTED_APP",
  "GRANT_REMOTE_CONTROL",
] as const;

export const SKILLS = ["D", "W", "S"] as const;
export const DECISION_POINTS = { safe: 10, partially_safe: 5, risky: 0 } as const;
export const SCORE_WEIGHTS = { D: 0.5, W: 0.3, S: 0.2 } as const;
export const PASS_SCORE = 70;
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
