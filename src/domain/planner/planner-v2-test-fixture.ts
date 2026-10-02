import { plannerCandidate, plannerInput } from "./planner-test-fixture.js"
import type { PlannerCandidateInputV2, PlannerInputV2 } from "./planner-v2.js"
import { ExactDecimal, roundDecimal, ROUND_HALF_UP } from "../shared/decimal.js"
export function plannerCandidateV2(
  id = "option-01-v1",
  standardEnergy = "750"
): PlannerCandidateInputV2 {
  const c = plannerCandidate(id)
  const suffix = String([...id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 0)).padStart(
    12,
    "0"
  )
  return {
    ...c,
    ingredientLineage: c.ingredientLineage.map((l) => ({
      ...l,
      nutrients: l.nutrients.map((n) =>
        n.nutrientCode === "energy_kcal"
          ? {
              ...n,
              amountPer100g: roundDecimal(
                new ExactDecimal(standardEnergy).div(2),
                18,
                ROUND_HALF_UP
              )
            }
          : n
      )
    })),
    quantityPolicies: [
      {
        id: `10000000-0000-4000-8000-${suffix}`,
        versionNumber: 1,
        version: "food-quantity-v1",
        foodFactVersionId: c.ingredientLineage[0]!.foodFactVersionId,
        baseUnitId: "unit-g",
        baseDimension: "mass",
        foodForm: "portionable_mass",
        stepBaseQuantity: "1",
        rounding: "half_up",
        provenance: "Synthetic reviewed gram portions",
        contentHash: "e".repeat(64)
      }
    ],
    prices: c.prices.map((p) => ({
      version: "purchase-v2",
      foodPriceId: p.foodPriceId,
      priceBookId: p.priceBookId,
      foodId: p.foodId,
      foodFactVersionId: p.foodFactVersionId,
      baseUnitId: p.baseUnitId,
      baseDimension: "mass",
      quoteBaseQuantity: p.packageBaseQuantity,
      quotePriceVnd: p.packagePriceVnd,
      purchaseRule: { mode: "loose_mass", saleStepBaseQuantity: "50" },
      purchaseProvenance: "Synthetic verified increments of 50g",
      purchaseTermsContentHash: "f".repeat(64),
      observedAt: p.observedAt
    }))
  }
}
export function plannerInputV2(
  candidates: readonly PlannerCandidateInputV2[] = [plannerCandidateV2()]
): PlannerInputV2 {
  return { ...plannerInput([]), inputVersion: "planner-input-v2", candidates }
}
