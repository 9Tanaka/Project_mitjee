/** Exact issued simulation token only. This detects a confirmation candidate, never an event. */
export function containsSimulatedOtp(text: string, issuedCode: string): boolean {
  if (!/^\d{6}$/.test(issuedCode)) return false;
  return new RegExp(`(?<![0-9])${issuedCode}(?![0-9])`).test(text);
}
