import { describe, expect, test } from "vitest"

import { evaluatePlannerEligibility } from "./evaluate-eligibility"
import { normalizePlannerInput } from "./normalize-planner-input"
import { PLANNER_CONFIG_V1 } from "./planner-config"
import { plannerCandidate, plannerInput } from "./planner-test-fixture"
import { calculateCompletedPlanCandidate, qualityLowerBound, searchWeek } from "./search-week"
import { scoreWeeklyPlan } from "./score-week"
import { evaluatePlannerEligibilityV2, normalizePlannerInputV2, searchWeekV2 } from "./planner-v2"
import { plannerCandidateV2, plannerInputV2 } from "./planner-v2-test-fixture"

const groups = ["fish", "seafood", "tofu", "pork", "poultry"]

function candidates() {
  return groups.flatMap((group, groupIndex) =>
    Array.from({ length: 4 }, (_, index) => {
      const candidate = plannerCandidate(`meal-${groupIndex}-${index}-v1`)
      return {
        ...candidate,
        ingredientLineage: candidate.ingredientLineage.map((line) => ({
          ...line,
          categoryAncestry: [group]
        })),
        prices: candidate.prices.map((price) => ({
          ...price,
          packagePriceVnd: groupIndex < 3 ? 40_000 : 60_000
        })),
        mealOption: {
          ...candidate.mealOption,
          tags: candidate.mealOption.tags.map((tag) =>
            tag.kind === "protein_hint" ? { ...tag, code: group } : tag
          )
        }
      }
    })
  )
}

function eligibleMeals() {
  const normalized = normalizePlannerInput(plannerInput(candidates()))
  if (!normalized.ok) throw new Error("Invalid input fixture")
  const result = evaluatePlannerEligibility(normalized.value)
  if (!result.ok) throw new Error("Invalid eligibility fixture")
  return result.value.eligible
}

function nutritionInput(preferences: readonly string[], budget = 1_200_000) {
  const input = plannerInputV2(
    candidates().map((candidate) => {
      const nutritionCandidate = plannerCandidateV2(candidate.mealOption.mealOptionVersionId)
      return {
        ...nutritionCandidate,
        mealOption: candidate.mealOption,
        ingredientLineage: nutritionCandidate.ingredientLineage.map((line) => ({
          ...line,
          categoryAncestry: candidate.ingredientLineage[0]!.categoryAncestry
        })),
        prices: nutritionCandidate.prices.map((price) => ({
          ...price,
          quotePriceVnd: candidate.prices[0]!.packagePriceVnd
        }))
      }
    })
  )
  const result = normalizePlannerInputV2({
    ...input,
    weeklyPlanBudgetVnd: budget,
    softPreferenceCodes: preferences
  })
  if (!result.ok) throw new Error("Invalid nutrition-aware fixture")
  return result.value
}

describe("preferences before bounded search prunes candidates", () => {
  test.each(["pork", "poultry", "fish", "beef", "seafood", "tofu"])(
    "uses the %s category preference in a partial week",
    (group) => {
      const meal = eligibleMeals()[0]!
      const matching = { ...meal, foodCategoryCodes: [group] }
      const nonmatching = { ...meal, foodCategoryCodes: ["vegetable"] }
      expect(qualityLowerBound([matching], [`prefer_${group}`], PLANNER_CONFIG_V1)).toBeLessThan(
        qualityLowerBound([nonmatching], [`prefer_${group}`], PLANNER_CONFIG_V1)
      )
    }
  )

  test("keeps preference penalties below the score of a completed week", () => {
    const meals = eligibleMeals().slice(0, 7)
    const preferences = ["prefer_pork", "prefer_poultry", "prefer_soup"]
    const completed = scoreWeeklyPlan(meals, { lines: [] }, preferences)
    for (let depth = 0; depth <= 7; depth += 1) {
      expect(
        qualityLowerBound(meals.slice(0, depth), preferences, PLANNER_CONFIG_V1)
      ).toBeLessThanOrEqual(completed.totalQualityPenalty)
    }
  })

  test("retains more preferred pork and poultry meals inside the same budget", () => {
    const meals = eligibleMeals()
    const baseline = searchWeek(meals, 1_200_000, [], "2026-08-26")
    const preferred = searchWeek(meals, 1_200_000, ["prefer_pork", "prefer_poultry"], "2026-08-26")
    if (!("plan" in baseline) || !("plan" in preferred)) throw new Error("Expected complete weeks")
    const countPreferred = (selected: typeof meals) =>
      selected.filter((meal) => ["pork", "poultry"].includes(meal.primaryProteinGroup)).length
    expect(preferred.status).toBe("ready_within_budget")
    expect(countPreferred(preferred.plan.selected)).toBeGreaterThan(
      countPreferred(baseline.plan.selected)
    )
    expect(
      JSON.stringify(
        searchWeek([...meals].reverse(), 1_200_000, ["prefer_pork", "prefer_poultry"], "2026-08-26")
      )
    ).toBe(JSON.stringify(preferred))
  })

  test("retains an affordable preferred meal when higher-scoring weeks exceed the budget", () => {
    const meals = eligibleMeals()
    const preferences = ["prefer_pork", "prefer_poultry"]
    const budget = 300_000
    const preferred = searchWeek(meals, budget, preferences, "2026-08-26")
    if (!("plan" in preferred)) throw new Error("Expected complete week")
    const preferredCount = preferred.plan.selected.filter((meal) =>
      ["pork", "poultry"].includes(meal.primaryProteinGroup)
    ).length
    // Seven cheaper meals cost 280k; replacing one with pork costs exactly 300k.
    // The planner must keep that affordable branch instead of pruning it for 320k+ weeks.
    const cheap = meals
      .filter((meal) => !["pork", "poultry"].includes(meal.primaryProteinGroup))
      .slice(0, 6)
    const matching = meals.find((meal) => meal.primaryProteinGroup === "pork")!
    const feasible = calculateCompletedPlanCandidate(
      [...cheap, matching],
      preferences,
      "2026-08-26"
    )
    expect(feasible?.basket.totalEstimatedCostVnd).toBe(budget)
    expect(preferred.status).toBe("ready_within_budget")
    expect(preferredCount).toBe(1)
  })

  test("applies the same preference search to nutrition-aware v6 plans", () => {
    const baselineInput = nutritionInput([])
    const eligibility = evaluatePlannerEligibilityV2(baselineInput)
    if (!eligibility.ok) throw new Error("Expected eligible nutrition-aware meals")
    const baseline = searchWeekV2(baselineInput, eligibility.value.eligible)
    const preferred = searchWeekV2(
      nutritionInput(["prefer_pork", "prefer_poultry"]),
      eligibility.value.eligible
    )
    if (!("plan" in baseline) || !("plan" in preferred)) throw new Error("Expected complete weeks")
    const countPreferred = (selected: typeof eligibility.value.eligible) =>
      selected.filter((meal) => ["pork", "poultry"].includes(meal.primaryProteinGroup)).length
    expect(preferred.status).toBe("ready_within_budget")
    expect(countPreferred(preferred.plan.selected)).toBeGreaterThan(
      countPreferred(baseline.plan.selected)
    )
  })

  test("keeps affordable preferred meals in the v6 budget frontier", () => {
    const input = nutritionInput(["prefer_pork", "prefer_poultry"], 240_000)
    const eligibility = evaluatePlannerEligibilityV2(input)
    if (!eligibility.ok) throw new Error("Expected eligible nutrition-aware meals")
    const preferred = searchWeekV2(input, eligibility.value.eligible)
    if (!("plan" in preferred)) throw new Error("Expected complete week")
    expect(preferred.status).toBe("ready_within_budget")
    expect(preferred.plan.totalEstimatedCostVnd).toBe(240_000)
    expect(
      preferred.plan.selected.filter((meal) =>
        ["pork", "poultry"].includes(meal.primaryProteinGroup)
      )
    ).toHaveLength(1)
  })
})
