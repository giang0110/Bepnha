import {
  ACCOUNT_DELETE_CONFIRMATION,
  type AccountApi,
  type DeleteAccountFailure
} from "@/application/account/account-deletion"

type Fetcher = (url: string, init: RequestInit) => Promise<Response>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function failureFrom(payload: unknown, status: number): DeleteAccountFailure {
  const code = isRecord(payload) && typeof payload.error === "string" ? payload.error : ""
  if (code === "ACCOUNT_RETAINED_FOR_CATALOG_AUTHORSHIP") return code
  if (code === "UNAUTHORIZED" || status === 401) return "UNAUTHORIZED"
  return "ACCOUNT_DELETE_UNAVAILABLE"
}

export function createAccountApi(fetcher: Fetcher = fetch): AccountApi {
  return {
    async deleteOwnAccount(accessToken) {
      try {
        const response = await fetcher("/api/account", {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          // The endpoint derives the target from the token; this only proves the call was intended.
          body: JSON.stringify({ confirmation: ACCOUNT_DELETE_CONFIRMATION })
        })
        if (response.ok) return { ok: true }
        const payload: unknown = await response.json().catch(() => null)
        return { ok: false, reason: failureFrom(payload, response.status) }
      } catch {
        return { ok: false, reason: "ACCOUNT_DELETE_UNAVAILABLE" }
      }
    }
  }
}
