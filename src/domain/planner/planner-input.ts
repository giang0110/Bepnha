import type { AllergenAssessment, FoodFactNutrientAmount } from "@/domain/catalog/catalog"
import type { MealOptionVersionInput } from "@/domain/meal-option/meal-option"
import type { PortionMemberGroupInput } from "@/domain/portion/calculate-adult-equivalent"
import type { FoodPriceInput } from "@/domain/pricing/pricing"
import type { PortionConfigV1 } from "@/domain/portion/portion-config"
import type { PriceFreshnessConfigV1 } from "@/domain/pricing/pricing"

import type { PlannerConfigV1 } from "./planner-config"

export interface PlannerIngredientLineageInput {
  readonly mealOptionRecipeId: string
  readonly recipeIngredientId: string
  readonly foodId: string
  readonly foodFactVersionId: string
  readonly foodFactContentHash: string
  readonly foodFactStatus: "draft" | "published"
  readonly baseUnitId: string
  readonly allergenAssessments: readonly AllergenAssessment[]
  readonly categoryAncestry: readonly string[]
  readonly dietaryTagCodes: readonly string[]
  readonly nutrients: readonly FoodFactNutrientAmount[]
}

export interface PlannerCandidateInput {
  readonly identityStatus: "draft" | "published" | "retired"
  readonly mealOptionContentHash: string
  readonly priceBookStatus: "draft" | "published" | "retired"
  readonly priceBookContentHash: string
  readonly mealOption: MealOptionVersionInput
  readonly ingredientLineage: readonly PlannerIngredientLineageInput[]
  readonly prices: readonly FoodPriceInput[]
}

export interface PlannerInputV1 {
  readonly householdId: string
  readonly householdSetupVersion: number
  readonly weekStart: string
  readonly timezone: string
  readonly calculationDate: string
  readonly weeklyPlanBudgetVnd: number
  readonly maxElapsedMinutes: number
  readonly memberGroups: readonly PortionMemberGroupInput[]
  readonly hardRuleCodes: readonly string[]
  readonly softPreferenceCodes: readonly string[]
  readonly candidates: readonly PlannerCandidateInput[]
}

export interface NormalizedPlannerInputV1 extends PlannerInputV1 {
  readonly timezone: "Asia/Ho_Chi_Minh"
  readonly dayIndexes: readonly [0, 1, 2, 3, 4, 5, 6]
  readonly mealSlot: "primary"
  readonly portionConfig: PortionConfigV1
  readonly priceFreshnessConfig: PriceFreshnessConfigV1
  readonly plannerConfig: PlannerConfigV1
}
