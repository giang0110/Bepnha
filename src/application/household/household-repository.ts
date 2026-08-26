import type { HouseholdSetup, HouseholdSetupInput } from "@/domain/household/household"

export type HouseholdRepositoryErrorCode =
  "UNAUTHORIZED" | "DEPENDENCY_UNAVAILABLE" | "INVALID_STORED_DATA"

export class HouseholdRepositoryError extends Error {
  readonly code: HouseholdRepositoryErrorCode

  constructor(code: HouseholdRepositoryErrorCode, causeMessage?: string) {
    super(causeMessage === undefined ? code : causeMessage)
    this.name = "HouseholdRepositoryError"
    this.code = code
  }
}

export type SaveHouseholdResult =
  | { ok: true; household: HouseholdSetup }
  | {
      ok: false
      reason:
        | "STALE_HOUSEHOLD_VERSION"
        | "UNAUTHORIZED"
        | "INVALID_HOUSEHOLD_STATE"
        | "DEPENDENCY_UNAVAILABLE"
    }

export interface HouseholdRepository {
  loadOwn(): Promise<HouseholdSetup | null>
  saveOwn(input: HouseholdSetupInput, expectedVersion: number | null): Promise<SaveHouseholdResult>
}
