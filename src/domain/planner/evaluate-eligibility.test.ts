import { describe, expect, test } from "vitest"

import { evaluatePlannerEligibility } from "./evaluate-eligibility"
import { normalizePlannerInput } from "./normalize-planner-input"
import { plannerCandidate, plannerInput } from "./planner-test-fixture"

function evaluate(input = plannerInput()) {
  const normalized = normalizePlannerInput(input)
  if (!normalized.ok) throw new Error("fixture invalid")
  return evaluatePlannerEligibility(normalized.value)
}

describe("evaluatePlannerEligibility", () => {
  test("uses editorial meal-option elapsed time, preserves exact ingredient provenance, and emits stale-price success warnings", () => {
    const result = evaluate()
    expect(result).toMatchObject({
      ok: true,
      value: {
        eligible: [
          {
            elapsedMinutes: 25,
            scaledIngredients: [
              {
                mealOptionRecipeId: "option-v1-component",
                recipeIngredientId: "option-v1-ingredient",
                componentSortOrder: 1,
                ingredientOrder: 1
              }
            ]
          }
        ],
        warnings: [{ code: "STALE_PRICE" }]
      }
    })
  })

  test("fails closed before scoring for exclusions and unknown allergen lineage", () => {
    const excluded = evaluate({ ...plannerInput(), hardRuleCodes: ["exclude_poultry"] })
    expect(excluded).toMatchObject({ ok: false, error: { code: "HARD_FILTER_EXHAUSTED" } })

    const candidate = plannerCandidate()
    const unknown = {
      ...candidate,
      ingredientLineage: candidate.ingredientLineage.map((lineage) => ({
        ...lineage,
        allergenAssessments: lineage.allergenAssessments.filter(
          (item) => item.allergenCode !== "peanut"
        )
      }))
    }
    expect(
      evaluate({ ...plannerInput([unknown]), hardRuleCodes: ["allergen_peanut"] })
    ).toMatchObject({ ok: false, error: { code: "INCOMPLETE_CATALOG_LINEAGE" } })
  })

  test("returns request-level unsupported rule and never interprets soft score as eligibility", () => {
    expect(evaluate({ ...plannerInput(), hardRuleCodes: ["allergen_other"] })).toEqual({
      ok: false,
      error: { code: "UNSUPPORTED_HARD_RULE", ruleCode: "allergen_other" }
    })
    expect(
      evaluate({
        ...plannerInput(),
        hardRuleCodes: ["exclude_poultry"],
        softPreferenceCodes: ["prefer_poultry"]
      })
    ).toMatchObject({ ok: false, error: { code: "HARD_FILTER_EXHAUSTED" } })
  })

  test.each([
    ["draft", "HARD_FILTER_EXHAUSTED"],
    ["too_old", "NO_USABLE_PRICE"],
    ["future", "NO_USABLE_PRICE"],
    ["missing", "NO_USABLE_PRICE"],
    ["nutrition", "INCOMPLETE_CATALOG_LINEAGE"]
  ] as const)("maps %s rejection to a deterministic scoped fatal result", (kind, code) => {
    const candidate = plannerCandidate()
    const changed =
      kind === "draft"
        ? { ...candidate, identityStatus: "draft" as const }
        : kind === "missing"
          ? { ...candidate, prices: [] }
          : kind === "nutrition"
            ? {
                ...candidate,
                ingredientLineage: candidate.ingredientLineage.map((lineage) => ({
                  ...lineage,
                  nutrients: []
                }))
              }
            : {
                ...candidate,
                prices: candidate.prices.map((price) => ({
                  ...price,
                  observedAt: kind === "future" ? "2026-08-27" : "2026-05-01"
                }))
              }
    expect(evaluate(plannerInput([changed]))).toMatchObject({ ok: false, error: { code } })
  })
})
