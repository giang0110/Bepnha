export interface MealNutrientValue {
  readonly nutrientCode: string
  readonly displayAmount: string
  readonly unitCode?: string
}

export interface MealNutritionInput {
  readonly nutrients: readonly MealNutrientValue[]
}

export type MacroBalanceStatus =
  "balanced" | "protein_rich" | "carb_rich" | "fat_rich" | "insufficient_data"

export interface WeeklyNutritionOverview {
  readonly mealCount: number
  readonly averageEnergyKcal: number
  readonly averageProteinG: number
  readonly averageCarbohydrateG: number
  readonly averageFatG: number
  readonly averageFibreG: number
  readonly averageSodiumMg: number
  readonly proteinCaloriePercent: number
  readonly carbCaloriePercent: number
  readonly fatCaloriePercent: number
  readonly macroBalanceStatus: MacroBalanceStatus
  readonly summaryMessage: string
}

function parseAmount(amountStr: string | undefined): number {
  if (!amountStr) return 0
  const parsed = Number(amountStr.replace(",", ".").trim())
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function roundTo1Decimal(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Calculates deterministic weekly nutrition averages and macronutrient energy distribution.
 *
 * Energy equivalents:
 * - Protein: 4 kcal/g
 * - Carbohydrate: 4 kcal/g
 * - Fat: 9 kcal/g
 *
 * AMDR (Acceptable Macronutrient Distribution Ranges):
 * - Protein: 10% - 25% of energy
 * - Carbohydrate: 45% - 65% of energy
 * - Fat: 20% - 35% of energy
 */
export function calculateWeeklyNutritionOverview(
  meals: readonly MealNutritionInput[]
): WeeklyNutritionOverview {
  const mealCount = meals.length

  if (mealCount === 0) {
    return {
      mealCount: 0,
      averageEnergyKcal: 0,
      averageProteinG: 0,
      averageCarbohydrateG: 0,
      averageFatG: 0,
      averageFibreG: 0,
      averageSodiumMg: 0,
      proteinCaloriePercent: 0,
      carbCaloriePercent: 0,
      fatCaloriePercent: 0,
      macroBalanceStatus: "insufficient_data",
      summaryMessage: "Chưa có đủ dữ liệu dinh dưỡng cho tuần này."
    }
  }

  let totalEnergy = 0
  let totalProtein = 0
  let totalCarb = 0
  let totalFat = 0
  let totalFibre = 0
  let totalSodium = 0

  for (const meal of meals) {
    for (const item of meal.nutrients) {
      const val = parseAmount(item.displayAmount)
      switch (item.nutrientCode) {
        case "energy_kcal":
          totalEnergy += val
          break
        case "protein_g":
          totalProtein += val
          break
        case "carbohydrate_g":
          totalCarb += val
          break
        case "fat_g":
          totalFat += val
          break
        case "fibre_g":
          totalFibre += val
          break
        case "sodium_mg":
          totalSodium += val
          break
      }
    }
  }

  const averageEnergyKcal = Math.round(totalEnergy / mealCount)
  const averageProteinG = roundTo1Decimal(totalProtein / mealCount)
  const averageCarbohydrateG = roundTo1Decimal(totalCarb / mealCount)
  const averageFatG = roundTo1Decimal(totalFat / mealCount)
  const averageFibreG = roundTo1Decimal(totalFibre / mealCount)
  const averageSodiumMg = Math.round(totalSodium / mealCount)

  const proteinKcal = totalProtein * 4
  const carbKcal = totalCarb * 4
  const fatKcal = totalFat * 9
  const totalMacroKcal = proteinKcal + carbKcal + fatKcal

  if (totalMacroKcal <= 0) {
    return {
      mealCount,
      averageEnergyKcal,
      averageProteinG,
      averageCarbohydrateG,
      averageFatG,
      averageFibreG,
      averageSodiumMg,
      proteinCaloriePercent: 0,
      carbCaloriePercent: 0,
      fatCaloriePercent: 0,
      macroBalanceStatus: "insufficient_data",
      summaryMessage: "Chưa có đủ dữ liệu năng lượng đa lượng."
    }
  }

  const proteinCaloriePercent = roundTo1Decimal((proteinKcal / totalMacroKcal) * 100)
  const carbCaloriePercent = roundTo1Decimal((carbKcal / totalMacroKcal) * 100)
  const fatCaloriePercent = roundTo1Decimal((fatKcal / totalMacroKcal) * 100)

  let macroBalanceStatus: MacroBalanceStatus = "balanced"
  let summaryMessage = "Cân bằng dinh dưỡng: Tỷ lệ các nhóm chất hài hòa theo khuyến nghị."

  if (proteinCaloriePercent > 25) {
    macroBalanceStatus = "protein_rich"
    summaryMessage = "Giàu chất đạm: Rất tốt cho cơ bắp và sự phát triển của trẻ nhỏ."
  } else if (fatCaloriePercent > 35) {
    macroBalanceStatus = "fat_rich"
    summaryMessage = "Nhiều chất béo: Nên kết hợp thêm món luộc, hấp thanh nhẹ."
  } else if (carbCaloriePercent > 65) {
    macroBalanceStatus = "carb_rich"
    summaryMessage = "Giàu năng lượng từ tinh bột: Phù hợp ngày hoạt động nhiều."
  }

  return {
    mealCount,
    averageEnergyKcal,
    averageProteinG,
    averageCarbohydrateG,
    averageFatG,
    averageFibreG,
    averageSodiumMg,
    proteinCaloriePercent,
    carbCaloriePercent,
    fatCaloriePercent,
    macroBalanceStatus,
    summaryMessage
  }
}
