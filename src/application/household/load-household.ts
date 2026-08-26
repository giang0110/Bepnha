import { HouseholdRepositoryError, type HouseholdRepository } from "./household-repository"

export type LoadHouseholdResult =
  | { ok: true; household: Awaited<ReturnType<HouseholdRepository["loadOwn"]>> }
  | { ok: false; reason: "UNAUTHORIZED" | "RETRYABLE_FAILURE" | "INVALID_STORED_DATA" }

export async function loadHousehold(repository: HouseholdRepository): Promise<LoadHouseholdResult> {
  try {
    return { ok: true, household: await repository.loadOwn() }
  } catch (error) {
    if (error instanceof HouseholdRepositoryError) {
      if (error.code === "UNAUTHORIZED") {
        return { ok: false, reason: "UNAUTHORIZED" }
      }
      if (error.code === "INVALID_STORED_DATA") {
        return { ok: false, reason: "INVALID_STORED_DATA" }
      }
    }
    return { ok: false, reason: "RETRYABLE_FAILURE" }
  }
}
