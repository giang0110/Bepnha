export interface AuthIdentity {
  email: string | null
  userId: string
}

export interface AuthSession {
  accessToken: string
  identity: AuthIdentity
}

export type AuthOperationResult =
  | { ok: true; session: AuthSession | null; confirmationPending?: true }
  | { ok: false; reason: "INVALID_CREDENTIALS" | "RETRYABLE_FAILURE" }

/**
 * Requesting a reset never reports whether the address has an account. Telling an anonymous caller
 * that an email is registered would turn this endpoint into an account-existence oracle, so the
 * only distinction the result carries is "the request was accepted" versus "it could not be sent".
 */
export type PasswordResetRequestResult = { ok: true } | { ok: false; reason: "RETRYABLE_FAILURE" }

export type PasswordUpdateResult =
  | { ok: true }
  | { ok: false; reason: "RECOVERY_SESSION_REQUIRED" | "RETRYABLE_FAILURE" | "WEAK_PASSWORD" }

export interface AuthSessionPort {
  getSession(): Promise<AuthSession | null>
  onAuthStateChange(listener: (session: AuthSession | null) => void): () => void
  requestPasswordReset(email: string, redirectTo: string): Promise<PasswordResetRequestResult>
  signIn(email: string, password: string): Promise<AuthOperationResult>
  signOut(): Promise<{ ok: true } | { ok: false; reason: "RETRYABLE_FAILURE" }>
  signUp(email: string, password: string): Promise<AuthOperationResult>
  updatePassword(password: string): Promise<PasswordUpdateResult>
}
