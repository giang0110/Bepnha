/**
 * Confirmation sentinel echoed by the browser when asking to delete its own account.
 *
 * It lives in the application layer because both the browser client and the server handler need the
 * exact same value, and `features` may not reach into `infrastructure`. The endpoint derives the
 * account to delete from the verified token, never from the request body — this sentinel only
 * proves the call was deliberate, so a stray or mis-wired request cannot destroy an account.
 */
export const ACCOUNT_DELETE_CONFIRMATION = "XOA TAI KHOAN"

export type DeleteAccountFailure =
  "ACCOUNT_DELETE_UNAVAILABLE" | "ACCOUNT_RETAINED_FOR_CATALOG_AUTHORSHIP" | "UNAUTHORIZED"

export type DeleteAccountResult = { ok: true } | { ok: false; reason: DeleteAccountFailure }

export interface AccountApi {
  deleteOwnAccount(accessToken: string): Promise<DeleteAccountResult>
}
