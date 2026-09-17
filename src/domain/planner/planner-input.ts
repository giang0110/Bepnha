import type { AllergenAssessment, FoodFactNutrientAmount } from "../catalog/catalog.js"
import type { MealOptionVersionInput } from "../meal-option/meal-option.js"
import type { PantrySnapshotV1 } from "../pantry/pantry.js"
import type { PortionMemberGroupInput } from "../portion/calculate-adult-equivalent.js"
import type { FoodPriceInput } from "../pricing/pricing.js"
import type { PortionConfigV1 } from "../portion/portion-config.js"
import type { PriceFreshnessConfigV1 } from "../pricing/pricing.js"

import type { PlannerConfigV1 } from "./planner-config.js"

export interface PlannerIngredientLineageInput {
  readonly mealOptionRecipeId: string
  readonly recipeIngredientId: string
  readonly foodId: string
  readonly foodFactVersionId: string
  readonly foodFactContentHash: string
  readonly foodFactStatus: "draft" | "published"
  readonly edibleFraction: string
  readonly baseUnitId: string
  readonly baseDimension: "mass" | "volume" | "count"
  readonly allergenAssessments: readonly AllergenAssessment[]
  readonly categoryAncestry: readonly string[]
  readonly dietaryTagCodes: readonly string[]
  readonly nutrients: readonly FoodFactNutrientAmount[]
}

export interface PlannerCandidateInput {
  readonly identityStatus: "draft" | "published" | "retired"
  readonly mealOptionCode: string
  readonly mealOptionNameVi: string
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
  readonly pantrySnapshot: PantrySnapshotV1
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
