import { describe, expect, it } from "vitest"

import {
  computeWeeklyPlanFilterCounts,
  filterWeeklyPlanMeals,
  type PlanFilterableMeal
} from "./weekly-plan-filter"

const MOCK_MEALS: readonly PlanFilterableMeal[] = [
  { dayIndex: 0, mealOptionNameVi: "Cá thu sốt cà chua", elapsedMinutes: 25 },
  { dayIndex: 1, mealOptionNameVi: "Thịt kho tàu", elapsedMinutes: 45 },
  { dayIndex: 2, mealOptionNameVi: "Canh chua ngao thanh mát", elapsedMinutes: 20 },
  { dayIndex: 3, mealOptionNameVi: "Gà rang gừng ấm nồng", elapsedMinutes: 30 },
  { dayIndex: 4, mealOptionNameVi: "Bò xào cần tỏi", elapsedMinutes: 15 },
  { dayIndex: 5, mealOptionNameVi: "Đậu phụ sốt cà chua", elapsedMinutes: 20 },
  { dayIndex: 6, mealOptionNameVi: "Sườn xào chua ngọt", elapsedMinutes: 40 }
]

describe("weekly-plan-filter domain", () => {
  it("returns all meals when no filters are set", () => {
    const result = filterWeeklyPlanMeals(MOCK_MEALS, {})
    expect(result).toHaveLength(7)
  })

  it("filters meals by search keyword case-insensitively", () => {
    const result = filterWeeklyPlanMeals(MOCK_MEALS, { keyword: "cà chua" })
    expect(result).toHaveLength(2)
    expect(result.map((m) => m.mealOptionNameVi)).toEqual([
      "Cá thu sốt cà chua",
      "Đậu phụ sốt cà chua"
    ])
  })

  it("filters meals by quick cook time (<= 30 minutes)", () => {
    const result = filterWeeklyPlanMeals(MOCK_MEALS, { cookTime: "quick_30" })
    expect(result).toHaveLength(5)
    expect(result.every((m) => m.elapsedMinutes <= 30)).toBe(true)
  })

  it("filters meals by protein group", () => {
    const seafood = filterWeeklyPlanMeals(MOCK_MEALS, { proteinGroup: "seafood" })
    expect(seafood).toHaveLength(2)
    expect(seafood.map((m) => m.mealOptionNameVi)).toContain("Cá thu sốt cà chua")
    expect(seafood.map((m) => m.mealOptionNameVi)).toContain("Canh chua ngao thanh mát")

    const pork = filterWeeklyPlanMeals(MOCK_MEALS, { proteinGroup: "pork" })
    expect(pork).toHaveLength(2)
    expect(pork.map((m) => m.mealOptionNameVi)).toContain("Thịt kho tàu")
    expect(pork.map((m) => m.mealOptionNameVi)).toContain("Sườn xào chua ngọt")
  })

  it("filters meals by thermal affinity", () => {
    const cooling = filterWeeklyPlanMeals(MOCK_MEALS, { thermalAffinity: "cooling" })
    expect(cooling.length).toBeGreaterThan(0)
    expect(cooling.some((m) => m.mealOptionNameVi.includes("Canh chua"))).toBe(true)
  })

  it("computes filter counts accurately across categories", () => {
    const counts = computeWeeklyPlanFilterCounts(MOCK_MEALS)
    expect(counts.all).toBe(7)
    expect(counts.quickCook).toBe(5)
    expect(counts.seafood).toBe(2)
    expect(counts.pork).toBe(2)
    expect(counts.beef).toBe(1)
    expect(counts.poultry).toBe(1)
    expect(counts.eggTofu).toBe(1)
  })
})
