import { describe, expect, test } from "vitest"
import { canonicalJson } from "../shared/canonical-json"
import { calculatePurchaseBasketV2 } from "../pricing/calculate-purchase-basket-v2"
import { plannerCandidateV2, plannerInputV2 } from "./planner-v2-test-fixture"
import {
  normalizePlannerInputV2,
  evaluatePlannerEligibilityV2,
  scoreWeeklyPlanV2,
  searchWeekV2,
  previewMealReplacementV2
} from "./planner-v2"
import type { PlannerInputV2 } from "./planner-v2"
const nutrition = {
  version: "household-nutrition-v1" as const,
  plannedMealSharePercent: 33,
  memberProfiles: [
    {
      id: "10000000-0000-4000-8000-000000000001",
      memberKind: "adult" as const,
      sortOrder: 1,
      label: "Anh",
      heightCm: "170",
      weightKg: "65",
      ageYears: 30,
      sexForEquation: "male" as const,
      activityLevel: "light" as const,
      goal: "maintain" as const
    }
  ]
}
function eligible(input: PlannerInputV2) {
  const n = normalizePlannerInputV2(input)
  expect(n.ok).toBe(true)
  if (!n.ok) throw new Error(n.error.code)
  const e = evaluatePlannerEligibilityV2(n.value)
  expect(e.ok).toBe(true)
  if (!e.ok) throw new Error(e.error.code)
  return { input: n.value, eligible: e.value.eligible }
}
function weekly() {
  return plannerInputV2(Array.from({ length: 8 }, (_, i) => plannerCandidateV2(`week-${i}-v1`)))
}
describe("planner v2 portions and actual food quantities", () => {
  test("pins separate planner, portion and energy versions", () => {
    const r = normalizePlannerInputV2(plannerInputV2())
    expect(r).toMatchObject({
      ok: true,
      value: {
        inputVersion: "planner-input-v2",
        portionConfig: { version: "portion-v2" },
        plannerConfig: { version: "planner-v2" },
        energyTargetConfig: { version: "energy-target-v1" }
      }
    })
  })
  test("preserves explicit incomplete profile fallback and actual member energy", () => {
    const e = eligible({
      ...plannerInputV2(),
      memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 1 }],
      nutritionSetup: {
        ...nutrition,
        memberProfiles: nutrition.memberProfiles.map((p) => ({ ...p, activityLevel: null }))
      }
    }).eligible[0]!
    expect(e.memberPortions[0]).toMatchObject({
      energyTargetStatus: "unapplied",
      unappliedReason: "INCOMPLETE_PROFILE",
      coefficientPerMember: "1",
      actualMealKcal: "750"
    })
  })
  test("calculates nutrition and purchases from three actual eggs", () => {
    const c = plannerCandidateV2()
    const component = c.mealOption.components[0]!
    const ingredient = component.recipe.ingredients[0]!
    const candidate = {
      ...c,
      mealOption: {
        ...c.mealOption,
        components: [
          {
            ...component,
            recipe: {
              ...component.recipe,
              ingredients: [
                {
                  ...ingredient,
                  quantity: "4.8",
                  conversion: {
                    ...ingredient.conversion!,
                    unitId: "unit-item",
                    unitCode: "item",
                    sourceDimension: "count" as const,
                    foodBaseUnitId: "unit-item",
                    foodBaseDimension: "count" as const,
                    baseQuantityPerUnit: "1",
                    grossGramsPerUnit: "50"
                  }
                }
              ]
            }
          }
        ]
      },
      ingredientLineage: c.ingredientLineage.map((l) => ({
        ...l,
        baseUnitId: "unit-item",
        baseDimension: "count" as const,
        nutrients: l.nutrients.map((n) =>
          n.nutrientCode === "energy_kcal" ? { ...n, amountPer100g: "143" } : n
        )
      })),
      quantityPolicies: c.quantityPolicies.map((p) => ({
        ...p,
        baseUnitId: "unit-item",
        baseDimension: "count" as const,
        foodForm: "whole_count" as const,
        rounding: "ceil" as const
      })),
      prices: c.prices.map((p) => ({
        ...p,
        baseUnitId: "unit-item",
        baseDimension: "count" as const,
        quoteBaseQuantity: "10",
        quotePriceVnd: 20000,
        purchaseRule: { mode: "loose_count" as const, saleStepBaseQuantity: "1" }
      }))
    }
    const e = eligible({
      ...plannerInputV2([candidate]),
      memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 1 }]
    }).eligible[0]!
    expect(e.scaledIngredients[0]).toMatchObject({
      sourceQuantity: "3",
      baseQuantity: "3",
      grossGrams: "150"
    })
    expect(e.quantityAdjustments[0]?.theoreticalIngredient.sourceQuantity).toBe("2.4")
    expect(e.nutrition.nutrients.find((n) => n.nutrientCode === "energy_kcal")?.rawAmount).toBe(
      "214.5"
    )
    expect(e.basketLines[0]).toMatchObject({
      requiredBaseQuantity: "3",
      purchaseBaseQuantity: "3",
      lineCostVnd: 6000
    })
  })
  test.each(["policy", "energy"])(
    "rejects missing usable %s rather than planning a default",
    (missing) => {
      const c = plannerCandidateV2()
      const input = plannerInputV2([
        {
          ...c,
          ...(missing === "policy"
            ? { quantityPolicies: [] }
            : {
                ingredientLineage: c.ingredientLineage.map((l) => ({
                  ...l,
                  nutrients: l.nutrients.map((n) => ({ ...n, amountPer100g: "0" }))
                }))
              })
        }
      ])
      const n = normalizePlannerInputV2(input)
      if (!n.ok) throw new Error(n.error.code)
      expect(evaluatePlannerEligibilityV2(n.value)).toMatchObject({
        ok: false,
        error: { code: "INCOMPLETE_CATALOG_LINEAGE" }
      })
    }
  )
  test("hard allergies remove candidates before energy goals", () => {
    const c = plannerCandidateV2()
    const n = normalizePlannerInputV2({
      ...plannerInputV2([
        {
          ...c,
          ingredientLineage: c.ingredientLineage.map((l) => ({
            ...l,
            allergenAssessments: l.allergenAssessments.map((a) =>
              a.allergenCode === "egg" ? { ...a, status: "contains" as const } : a
            )
          }))
        }
      ]),
      hardRuleCodes: ["allergen_egg"]
    })
    if (!n.ok) throw new Error(n.error.code)
    expect(evaluatePlannerEligibilityV2(n.value)).toMatchObject({
      ok: false,
      error: { code: "HARD_FILTER_EXHAUSTED" }
    })
  })
  test("changing only a goal reverses equal-quality energy fixture ranking", () => {
    const candidates = [
      plannerCandidateV2("low-0-v1", "640.1278125"),
      plannerCandidateV2("high-0-v1", "782.3784375")
    ]
    const winners = ["lose", "gain"].map((goal) => {
      const e = eligible({
        ...plannerInputV2(candidates),
        memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 1 }],
        nutritionSetup: {
          ...nutrition,
          memberProfiles: nutrition.memberProfiles.map((p) => ({
            ...p,
            goal: goal as "lose" | "gain"
          }))
        }
      })
      return e.eligible
        .map((m) => {
          const b = calculatePurchaseBasketV2(m.requirements, m.prices, e.input.calculationDate)
          if (!b.ok) throw new Error(b.error.code)
          return {
            id: m.mealOptionId,
            score: scoreWeeklyPlanV2([m], b.value, e.input).totalQualityPenalty
          }
        })
        .sort((a, b) => a.score - b.score)[0]!.id
    })
    expect(winners).toEqual(["low-0", "high-0"])
  })
  test("normalizes top-level order and pins policy/terms changes in canonical input", () => {
    const a = weekly()
    const first = normalizePlannerInputV2(a)
    const reverse = normalizePlannerInputV2({
      ...a,
      candidates: [...a.candidates].reverse(),
      memberGroups: [...a.memberGroups].reverse()
    })
    expect(reverse).toEqual(first)
    const changed = normalizePlannerInputV2({
      ...a,
      candidates: a.candidates.map((c) => ({
        ...c,
        quantityPolicies: c.quantityPolicies.map((p) => ({ ...p, contentHash: "9".repeat(64) }))
      }))
    })
    expect(canonicalJson(changed)).not.toBe(canonicalJson(first))
  })
})
describe("v2 deterministic search and pinned replacement", () => {
  test("uses actual purchase baskets at each frontier and retains bounded metrics", () => {
    const e = eligible(weekly())
    const r = searchWeekV2(e.input, e.eligible)
    expect("plan" in r).toBe(true)
    if (!("plan" in r)) throw new Error(r.error.code)
    expect(r.plan.items).toHaveLength(7)
    expect(r.plan.frontierMetrics.every((m) => m.unionSize <= 250)).toBe(true)
    expect(r.plan.purchaseBasket.lines.every((l) => l.version === "purchase-v2")).toBe(true)
    expect(r.plan.score.components.energyGoalFit).toBe(0)
    expect(r.plan.score.explanations).toContain("ENERGY_GOALS_NOT_APPLIED")
  })
  test("replacement preserves exactly six frozen actual snapshots", () => {
    const e = eligible(weekly())
    const r = searchWeekV2(e.input, e.eligible)
    if (!("plan" in r)) throw new Error(r.error.code)
    const preview = previewMealReplacementV2(e.input, r.plan, 2)
    expect(preview.ok).toBe(true)
    if (preview.ok) {
      expect(preview.value.plan.items.filter((i) => i.dayIndex !== 2)).toEqual(
        r.plan.items.filter((i) => i.dayIndex !== 2)
      )
      expect(preview.value.plan.items[2]?.mealOptionId).not.toBe(r.plan.items[2]?.mealOptionId)
    }
  })
  test("rejects changed private profiles and pinned policy drift", () => {
    const e = eligible(weekly())
    const r = searchWeekV2(e.input, e.eligible)
    if (!("plan" in r)) throw new Error(r.error.code)
    for (const changed of [
      { ...e.input, householdSetupVersion: 2 },
      {
        ...e.input,
        candidates: e.input.candidates.map((c) => ({
          ...c,
          quantityPolicies: c.quantityPolicies.map((p) => ({ ...p, contentHash: "9".repeat(64) }))
        }))
      }
    ])
      expect(previewMealReplacementV2(changed, r.plan, 1)).toEqual({
        ok: false,
        error: { code: "PLAN_INPUT_CHANGED_REGENERATION_REQUIRED" }
      })
  })
})

test("purchase budget wins over a preferred energy match", () => {
  const cheap = Array.from({ length: 7 }, (_, i) => {
    const c = plannerCandidateV2(`cheap-${i}-v1`, "640.1278125")
    return { ...c, prices: c.prices.map((p) => ({ ...p, quotePriceVnd: 500 })) }
  })
  const expensive = plannerCandidateV2("expensive-8-v1", "782.3784375")
  const e = eligible({
    ...plannerInputV2([
      ...cheap,
      { ...expensive, prices: expensive.prices.map((p) => ({ ...p, quotePriceVnd: 10000000 })) }
    ]),
    memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 1 }],
    weeklyPlanBudgetVnd: 2000,
    nutritionSetup: {
      ...nutrition,
      memberProfiles: nutrition.memberProfiles.map((p) => ({ ...p, goal: "gain" }))
    }
  })
  const result = searchWeekV2(e.input, e.eligible)
  expect(result).toMatchObject({ status: "ready_within_budget" })
  if ("plan" in result) {
    expect(result.plan.totalEstimatedCostVnd).toBe(1750)
    expect(result.plan.selected.some((m) => m.mealOptionId === "expensive-8")).toBe(false)
  }
})
test("clamping exposes actual energy deviation in the goal score", () => {
  const e = eligible({
    ...plannerInputV2([plannerCandidateV2("dense-1-v1", "3000")]),
    memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 1 }],
    nutritionSetup: {
      ...nutrition,
      memberProfiles: nutrition.memberProfiles.map((p) => ({ ...p, goal: "lose" }))
    }
  })
  const meal = e.eligible[0]!
  expect(meal.memberPortions[0]).toMatchObject({
    coefficientPerMember: "0.5",
    mealTargetKcal: "640.1278125",
    actualMealKcal: "1500"
  })
  const b = calculatePurchaseBasketV2(meal.requirements, meal.prices, e.input.calculationDate)
  if (!b.ok) throw new Error(b.error.code)
  expect(scoreWeeklyPlanV2([meal], b.value, e.input).components.energyGoalFit).toBe(1750)
})
test("fractional existing count stock requires correction instead of discarding a fraction", () => {
  const input = {
    ...plannerInputV2(),
    pantrySnapshot: {
      version: "pantry-snapshot-v1" as const,
      items: [
        {
          pantryItemId: "stock",
          foodId: "egg",
          foodFactVersionId: "egg-fact",
          quantity: "2.4",
          unitId: "item",
          baseQuantity: "2.4",
          baseUnitId: "item",
          baseDimension: "count" as const,
          version: 1
        }
      ]
    }
  }
  expect(normalizePlannerInputV2(input)).toEqual({
    ok: false,
    error: { code: "INVALID_INDIVISIBLE_PANTRY_QUANTITY" }
  })
})

test("legacy divisible stock remains usable in a meal that also contains whole pieces", () => {
  const rice = plannerCandidateV2("rice-v1")
  const eggs = plannerCandidateV2("eggs-v1")
  const eggComponent = eggs.mealOption.components[0]!
  const mixed = {
    ...rice,
    mealOption: {
      ...rice.mealOption,
      components: [
        ...rice.mealOption.components,
        {
          ...eggComponent,
          sortOrder: 2,
          recipe: {
            ...eggComponent.recipe,
            ingredients: eggComponent.recipe.ingredients.map((ingredient) => ({
              ...ingredient,
              quantity: "2",
              conversion: {
                ...ingredient.conversion!,
                unitId: "unit-item",
                unitCode: "item",
                sourceDimension: "count" as const,
                baseQuantityPerUnit: "50",
                grossGramsPerUnit: "50"
              }
            }))
          }
        }
      ]
    },
    ingredientLineage: [...rice.ingredientLineage, ...eggs.ingredientLineage],
    quantityPolicies: [
      ...rice.quantityPolicies,
      ...eggs.quantityPolicies.map((policy) => ({
        ...policy,
        foodForm: "whole_piece" as const,
        rounding: "ceil" as const,
        stepBaseQuantity: "50"
      }))
    ],
    prices: [...rice.prices, ...eggs.prices]
  }
  const stock = rice.ingredientLineage[0]!
  const input = {
    ...plannerInputV2([mixed]),
    pantrySnapshot: {
      version: "pantry-snapshot-v1" as const,
      items: [
        {
          pantryItemId: "legacy-rice-stock",
          foodId: stock.foodId,
          foodFactVersionId: "rice-old-fact",
          quantity: "500",
          unitId: "unit-g",
          baseQuantity: "500",
          baseUnitId: "unit-g",
          baseDimension: "mass" as const,
          version: 1
        }
      ]
    }
  }
  const result = eligible(input)
  expect(result.eligible).toHaveLength(1)
  expect(result.input.pantrySnapshot).toEqual(input.pantrySnapshot)

  const oldEggStock = {
    ...input,
    pantrySnapshot: {
      ...input.pantrySnapshot,
      items: input.pantrySnapshot.items.map((item) => ({
        ...item,
        foodId: eggs.ingredientLineage[0]!.foodId,
        foodFactVersionId: "egg-old-fact"
      }))
    }
  }
  expect(normalizePlannerInputV2(oldEggStock)).toEqual({
    ok: false,
    error: { code: "PANTRY_QUANTITY_POLICY_REQUIRED" }
  })
})

test("whole-piece stock in a mass base still requires whole measured pieces", () => {
  const c = plannerCandidateV2()
  const component = c.mealOption.components[0]!
  const ingredient = component.recipe.ingredients[0]!
  const piece = {
    ...c,
    mealOption: {
      ...c.mealOption,
      components: [
        {
          ...component,
          recipe: {
            ...component.recipe,
            ingredients: [
              {
                ...ingredient,
                quantity: "4.8",
                conversion: {
                  ...ingredient.conversion!,
                  unitId: "unit-item",
                  unitCode: "item",
                  sourceDimension: "count" as const,
                  sourceToDimensionBase: "1",
                  baseQuantityPerUnit: "50",
                  grossGramsPerUnit: "50"
                }
              }
            ]
          }
        }
      ]
    },
    quantityPolicies: c.quantityPolicies.map((p) => ({
      ...p,
      foodForm: "whole_piece" as const,
      rounding: "ceil" as const,
      stepBaseQuantity: "100"
    }))
  }
  const stock = (quantity: string, baseQuantity: string) => ({
    ...plannerInputV2([piece]),
    pantrySnapshot: {
      version: "pantry-snapshot-v1" as const,
      items: [
        {
          pantryItemId: "stock",
          foodId: ingredient.foodId,
          foodFactVersionId: ingredient.foodFactVersionId,
          quantity,
          unitId: "unit-item",
          baseQuantity,
          baseUnitId: "unit-g",
          baseDimension: "mass" as const,
          version: 1
        }
      ]
    }
  })
  expect(normalizePlannerInputV2(stock("2.5", "125"))).toMatchObject({
    ok: false,
    error: { code: "INVALID_INDIVISIBLE_PANTRY_QUANTITY" }
  })
  expect(normalizePlannerInputV2(stock("1", "50"))).toMatchObject({ ok: true })
  const badPrice = normalizePlannerInputV2({
    ...stock("1", "50"),
    candidates: [
      {
        ...piece,
        prices: piece.prices.map((p) => ({
          ...p,
          purchaseRule: { mode: "loose_mass" as const, saleStepBaseQuantity: "55" }
        }))
      }
    ]
  })
  if (!badPrice.ok) throw new Error(badPrice.error.code)
  expect(evaluatePlannerEligibilityV2(badPrice.value)).toMatchObject({
    ok: false,
    error: { code: "INCOMPLETE_CATALOG_LINEAGE" }
  })
})
