import type { PantrySnapshotV1 } from "../pantry/pantry.js"

import type { PersistedPlannerEngineVersion } from "./planner-engine-version.js"

export interface PlannerCandidateManifestEntry {
  readonly mealOptionId: string
  readonly mealOptionVersionId: string
  readonly mealOptionContentHash: string
  readonly recipeVersions: readonly {
    readonly recipeVersionId: string
    readonly contentHash: string
  }[]
  readonly foodFacts: readonly {
    readonly foodFactVersionId: string
    readonly contentHash: string
  }[]
  readonly prices: readonly {
    readonly priceBookId: string
    readonly foodPriceId: string
    readonly fingerprint: string
  }[]
}

export interface PlannerSnapshotSource {
  readonly engineVersion: PersistedPlannerEngineVersion
  readonly household: unknown
  readonly weekStart: string
  readonly timezone: "Asia/Ho_Chi_Minh"
  readonly calculationDate: string
  readonly portionConfig: unknown
  readonly priceFreshnessConfig: unknown
  readonly plannerConfig: unknown
  readonly pantrySnapshot?: PantrySnapshotV1
  /**
   * What the household had cooked recently when this plan was made.
   *
   * Recorded as evidence, so a plan can be read back and explained: without it there is no way to
   * tell later why the search passed over a dish it was otherwise free to choose. Absent for a plan
   * made before the field existed, and for one whose history could not be read.
   */
  readonly recentMealOptionIds?: readonly string[]
  readonly candidateManifest: readonly PlannerCandidateManifestEntry[]
  readonly calculation: unknown
}

function canonicalManifest(
  manifest: readonly PlannerCandidateManifestEntry[]
): readonly PlannerCandidateManifestEntry[] {
  return [...manifest]
    .map((entry) => ({
      ...entry,
      recipeVersions: [...entry.recipeVersions].sort((left, right) =>
        left.recipeVersionId.localeCompare(right.recipeVersionId)
      ),
      foodFacts: [...entry.foodFacts].sort((left, right) =>
        left.foodFactVersionId.localeCompare(right.foodFactVersionId)
      ),
      prices: [...entry.prices].sort(
        (left, right) =>
          left.priceBookId.localeCompare(right.priceBookId) ||
          left.foodPriceId.localeCompare(right.foodPriceId)
      )
    }))
    .sort((left, right) => left.mealOptionVersionId.localeCompare(right.mealOptionVersionId))
}

function canonicalPantry(snapshot: PantrySnapshotV1): PantrySnapshotV1 {
  return {
    version: snapshot.version,
    items: [...snapshot.items].sort(
      (left, right) =>
        left.foodId.localeCompare(right.foodId) ||
        left.pantryItemId.localeCompare(right.pantryItemId)
    )
  }
}

export function buildPlannerSnapshotPayloads(source: PlannerSnapshotSource) {
  const candidateManifest = canonicalManifest(source.candidateManifest)
  const catalogPayload = { candidateManifest }
  const inputPayload = {
    engineVersion: source.engineVersion,
    household: source.household,
    weekStart: source.weekStart,
    timezone: source.timezone,
    calculationDate: source.calculationDate,
    portionConfig: source.portionConfig,
    priceFreshnessConfig: source.priceFreshnessConfig,
    plannerConfig: source.plannerConfig,
    ...(source.pantrySnapshot === undefined
      ? {}
      : { pantrySnapshot: canonicalPantry(source.pantrySnapshot) }),
    ...(source.recentMealOptionIds === undefined
      ? {}
      : { recentMealOptionIds: [...source.recentMealOptionIds].sort() }),
    candidateManifest
  }
  return {
    catalogPayload,
    inputPayload,
    calculationPayload: source.calculation
  }
}
