export interface AuthenticatedUser { id: string }
export interface RequestAuthenticator {
  authenticate(request: Request): Promise<AuthenticatedUser | null>;
}

/** Fail closed until a real identity adapter is supplied at the composition root. */
export class UnconfiguredAuthenticator implements RequestAuthenticator {
  async authenticate(_request: Request): Promise<null> { return null; }
}
