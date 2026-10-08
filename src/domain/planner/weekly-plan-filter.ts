import { detectProteinGroup, type ProteinGroup } from "./meal-rotation-insights.js"
import { detectDishThermalAffinity } from "./seasonal-weather-insights.js"

export type ThermalAffinityFilter = "all" | "cooling" | "warming"
export type CookTimeFilter = "all" | "quick_30"

export interface WeeklyPlanFilterOptions {
  readonly keyword?: string
  readonly proteinGroup?: ProteinGroup | "all"
  readonly cookTime?: CookTimeFilter
  readonly thermalAffinity?: ThermalAffinityFilter
}

export interface PlanFilterableMeal {
  readonly dayIndex: number
  readonly mealOptionNameVi: string
  readonly elapsedMinutes: number
}

export interface WeeklyPlanFilterCounts {
  readonly all: number
  readonly quickCook: number
  readonly seafood: number
  readonly poultry: number
  readonly pork: number
  readonly beef: number
  readonly eggTofu: number
  readonly cooling: number
}

/**
 * Filters meal plan items deterministically based on keyword, cooking duration,
 * protein category, and thermal affinity.
 */
export function filterWeeklyPlanMeals<T extends PlanFilterableMeal>(
  items: readonly T[],
  options: WeeklyPlanFilterOptions
): readonly T[] {
  const { keyword, proteinGroup = "all", cookTime = "all", thermalAffinity = "all" } = options

  const normalizedKeyword = keyword?.trim().toLowerCase() ?? ""

  return items.filter((meal) => {
    // 1. Text keyword search
    if (normalizedKeyword !== "") {
      const matchName = meal.mealOptionNameVi.toLowerCase().includes(normalizedKeyword)
      if (!matchName) return false
    }

    // 2. Cooking duration
    if (cookTime === "quick_30" && meal.elapsedMinutes > 30) {
      return false
    }

    // 3. Protein group
    if (proteinGroup !== "all") {
      const detectedProtein = detectProteinGroup(meal.mealOptionNameVi)
      if (detectedProtein !== proteinGroup) return false
    }

    // 4. Thermal affinity
    if (thermalAffinity !== "all") {
      const affinity = detectDishThermalAffinity(meal.mealOptionNameVi)
      if (affinity !== thermalAffinity) return false
    }

    return true
  })
}

/**
 * Computes counts of meals that match key predefined filters.
 */
export function computeWeeklyPlanFilterCounts(
  items: readonly PlanFilterableMeal[]
): WeeklyPlanFilterCounts {
  let quickCook = 0
  let seafood = 0
  let poultry = 0
  let pork = 0
  let beef = 0
  let eggTofu = 0
  let cooling = 0

  for (const meal of items) {
    if (meal.elapsedMinutes <= 30) {
      quickCook += 1
    }

    const protein = detectProteinGroup(meal.mealOptionNameVi)
    if (protein === "seafood") seafood += 1
    else if (protein === "poultry") poultry += 1
    else if (protein === "pork") pork += 1
    else if (protein === "beef") beef += 1
    else if (protein === "egg_tofu") eggTofu += 1

    const thermal = detectDishThermalAffinity(meal.mealOptionNameVi)
    if (thermal === "cooling") cooling += 1
  }

  return {
    all: items.length,
    quickCook,
    seafood,
    poultry,
    pork,
    beef,
    eggTofu,
    cooling
  }
}
