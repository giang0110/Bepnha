import type { HouseholdSetupInput } from "@/domain/household/household"
import {
  validateHouseholdSetup,
  type HouseholdSetupValidationError
} from "@/domain/household/validate-household-setup"

import type { HouseholdRepository, SaveHouseholdResult } from "./household-repository"

export type SaveHouseholdUseCaseResult =
  | SaveHouseholdResult
  | { ok: false; reason: "INVALID_EXPECTED_VERSION" }
  | { ok: false; reason: "VALIDATION_FAILED"; errors: readonly HouseholdSetupValidationError[] }

export async function saveHousehold(
  repository: HouseholdRepository,
  input: HouseholdSetupInput,
  expectedVersion: number | null
): Promise<SaveHouseholdUseCaseResult> {
  if (expectedVersion !== null && (!Number.isInteger(expectedVersion) || expectedVersion < 1)) {
    return { ok: false, reason: "INVALID_EXPECTED_VERSION" }
  }

  const validation = validateHouseholdSetup(input)
  if (!validation.ok) {
    return { ok: false, reason: "VALIDATION_FAILED", errors: validation.errors }
  }

  return repository.saveOwn(validation.value, expectedVersion)
}
