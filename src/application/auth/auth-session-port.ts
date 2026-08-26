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

export interface AuthSessionPort {
  getSession(): Promise<AuthSession | null>
  onAuthStateChange(listener: (session: AuthSession | null) => void): () => void
  signIn(email: string, password: string): Promise<AuthOperationResult>
  signOut(): Promise<{ ok: true } | { ok: false; reason: "RETRYABLE_FAILURE" }>
  signUp(email: string, password: string): Promise<AuthOperationResult>
}
