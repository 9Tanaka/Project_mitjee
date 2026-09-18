import type { AuthenticatedPrincipal } from "../application/contracts.js";
export interface RequestAuthenticator {
  authenticate(request: Request): Promise<AuthenticatedPrincipal | null>;
}
