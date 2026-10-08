import { describe, expect, it } from "vitest"

import {
  calculateWeeklyNutritionOverview,
  type MealNutritionInput
} from "./weekly-nutrition-overview"

describe("calculateWeeklyNutritionOverview", () => {
  it("returns zeroed values when meal list is empty", () => {
    const result = calculateWeeklyNutritionOverview([])

    expect(result.mealCount).toBe(0)
    expect(result.averageEnergyKcal).toBe(0)
    expect(result.averageProteinG).toBe(0)
    expect(result.averageCarbohydrateG).toBe(0)
    expect(result.averageFatG).toBe(0)
    expect(result.averageFibreG).toBe(0)
    expect(result.averageSodiumMg).toBe(0)
    expect(result.proteinCaloriePercent).toBe(0)
    expect(result.carbCaloriePercent).toBe(0)
    expect(result.fatCaloriePercent).toBe(0)
    expect(result.macroBalanceStatus).toBe("insufficient_data")
  })

  it("calculates accurate averages and macro calorie percentages for 7 meals", () => {
    // 7 sample meals with nutrients
    const meals: MealNutritionInput[] = [
      {
        nutrients: [
          { nutrientCode: "energy_kcal", displayAmount: "600" },
          { nutrientCode: "protein_g", displayAmount: "30" }, // 120 kcal
          { nutrientCode: "carbohydrate_g", displayAmount: "70" }, // 280 kcal
          { nutrientCode: "fat_g", displayAmount: "20" }, // 180 kcal => total macro = 580 kcal
          { nutrientCode: "fibre_g", displayAmount: "6" },
          { nutrientCode: "sodium_mg", displayAmount: "800" }
        ]
      },
      {
        nutrients: [
          { nutrientCode: "energy_kcal", displayAmount: "500" },
          { nutrientCode: "protein_g", displayAmount: "25" },
          { nutrientCode: "carbohydrate_g", displayAmount: "60" },
          { nutrientCode: "fat_g", displayAmount: "15" },
          { nutrientCode: "fibre_g", displayAmount: "5" },
          { nutrientCode: "sodium_mg", displayAmount: "700" }
        ]
      }
    ]

    const result = calculateWeeklyNutritionOverview(meals)

    expect(result.mealCount).toBe(2)
    // Avg energy: (600 + 500) / 2 = 550
    expect(result.averageEnergyKcal).toBe(550)
    // Avg protein: (30 + 25) / 2 = 27.5
    expect(result.averageProteinG).toBe(27.5)
    // Avg carb: (70 + 60) / 2 = 65
    expect(result.averageCarbohydrateG).toBe(65)
    // Avg fat: (20 + 15) / 2 = 17.5
    expect(result.averageFatG).toBe(17.5)
    // Avg fibre: (6 + 5) / 2 = 5.5
    expect(result.averageFibreG).toBe(5.5)
    // Avg sodium: (800 + 700) / 2 = 750
    expect(result.averageSodiumMg).toBe(750)

    // Total Protein: 55g * 4 = 220 kcal
    // Total Carb: 130g * 4 = 520 kcal
    // Total Fat: 35g * 9 = 315 kcal
    // Total Macro Kcal: 220 + 520 + 315 = 1055 kcal
    // Protein %: 220 / 1055 * 100 = 20.85% -> 20.9%
    // Carb %: 520 / 1055 * 100 = 49.29% -> 49.3%
    // Fat %: 315 / 1055 * 100 = 29.86% -> 29.9%
    expect(result.proteinCaloriePercent).toBe(20.9)
    expect(result.carbCaloriePercent).toBe(49.3)
    expect(result.fatCaloriePercent).toBe(29.9)

    expect(result.macroBalanceStatus).toBe("balanced")
    expect(result.summaryMessage).toContain("Cân bằng dinh dưỡng")
  })

  it("handles missing or unparseable nutrient values gracefully", () => {
    const meals: MealNutritionInput[] = [
      {
        nutrients: [
          { nutrientCode: "energy_kcal", displayAmount: "invalid" },
          { nutrientCode: "protein_g", displayAmount: "30" }
        ]
      }
    ]

    const result = calculateWeeklyNutritionOverview(meals)
    expect(result.mealCount).toBe(1)
    expect(result.averageEnergyKcal).toBe(0)
    expect(result.averageProteinG).toBe(30)
    expect(result.averageCarbohydrateG).toBe(0)
  })
})
