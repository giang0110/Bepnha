import type { FoodQuantityPolicyV1 } from "../../domain/recipe/food-quantity-policy.ts"
import type { PurchaseRuleV2 } from "../../domain/pricing/purchasing-v2.ts"
import type { RecipeHeatLevel } from "../../domain/recipe/recipe.js"

import type { AllergenAssessmentStatus, CatalogDimension } from "../../domain/catalog/catalog.js"

export interface RecipeDraftIngredient {
  readonly recipeIngredientId: string
  readonly foodId: string
  readonly foodFactVersionId: string
  readonly quantity: string
  readonly unitId: string
  readonly preparationNoteVi: string | null
  readonly order: number
}

export interface RecipeDraftStep {
  readonly order: number
  readonly instructionVi: string
  readonly timerMinutes: number | null
  readonly heatLevel: RecipeHeatLevel | null
  readonly temperatureCelsius: number | null
  readonly ingredientIds: readonly string[]
}

export interface FoodFactDraftInput {
  readonly foodFactVersionId: string
  readonly expectedRevision: number
  readonly foodId: string
  readonly versionNumber: number
  readonly categoryId: string
  readonly edibleFraction: string
  readonly provenance: string
  readonly allergenAssessments: readonly {
    readonly allergenCode: string
    readonly status: AllergenAssessmentStatus
    readonly provenance: string
  }[]
  readonly nutrients: readonly {
    readonly nutrientCode: string
    readonly amountPer100g: string
    readonly provenance: string
  }[]
  readonly categoryAncestry: readonly string[]
  readonly dietaryTagCodes: readonly string[]
  readonly conversions: readonly {
    readonly unitId: string
    readonly baseQuantityPerUnit: string
    readonly grossGramsPerUnit: string
    readonly displayStep: string
    readonly provenance: string
  }[]
}

export interface RecipeVersionDraftInput {
  readonly recipeVersionId: string
  readonly expectedRevision: number
  readonly recipeId: string
  readonly versionNumber: number
  readonly yieldAdultEquivalent: string
  readonly activeMinutes: number
  readonly elapsedMinutes: number
  readonly ingredients: readonly RecipeDraftIngredient[]
  readonly steps: readonly RecipeDraftStep[]
  readonly tagIds: readonly string[]
}

export interface PriceBookDraftInputV1 {
  readonly purchasingVersion?: never
  readonly priceBookId: string
  readonly expectedRevision: number
  readonly effectiveFrom: string
  readonly effectiveTo: string | null
  readonly prices: readonly {
    readonly foodPriceId: string
    readonly foodId: string
    readonly foodFactVersionId: string
    readonly packageQuantity: string
    readonly packageUnitId: string
    readonly packageBaseQuantity: string
    readonly baseUnitId: string
    readonly packagePriceVnd: number
    readonly purchaseIncrement: string
    readonly observedAt: string
    readonly sourceReference: string
  }[]
}

export type PriceDraftV1 = PriceBookDraftInputV1["prices"][number]
export interface PriceDraftV2 extends PriceDraftV1 {
  readonly baseDimension: CatalogDimension
  readonly purchaseRule: PurchaseRuleV2
  readonly purchaseProvenance: string
}
export interface PriceBookDraftInputV2 extends Omit<
  PriceBookDraftInputV1,
  "prices" | "purchasingVersion"
> {
  readonly purchasingVersion: "purchase-v2"
  readonly prices: readonly PriceDraftV2[]
}
export type PriceBookDraftInput = PriceBookDraftInputV1 | PriceBookDraftInputV2
export interface FoodQuantityPolicyDraftInput extends Omit<
  FoodQuantityPolicyV1,
  "id" | "version" | "contentHash"
> {
  readonly foodQuantityPolicyVersionId: string
  readonly expectedRevision: number
  readonly foodId: string
}

export type CatalogAdminCommand =
  | {
      readonly action: "create_food"
      readonly input: {
        readonly code: string
        readonly nameVi: string
        readonly baseDimension: CatalogDimension
        readonly baseUnitId: string
      }
    }
  | {
      readonly action: "save_food_quantity_policy_draft"
      readonly input: FoodQuantityPolicyDraftInput
    }
  | {
      readonly action: "publish_food_quantity_policy"
      readonly input: {
        readonly foodQuantityPolicyVersionId: string
        readonly expectedRevision: number
      }
    }
  | { readonly action: "save_food_fact_draft"; readonly input: FoodFactDraftInput }
  | {
      readonly action: "publish_food_fact"
      readonly input: { readonly foodFactVersionId: string; readonly expectedRevision: number }
    }
  | {
      readonly action: "retire_food"
      readonly input: { readonly foodId: string; readonly expectedRevision: number }
    }
  | {
      readonly action: "create_recipe"
      readonly input: { readonly code: string; readonly nameVi: string }
    }
  | { readonly action: "save_recipe_version_draft"; readonly input: RecipeVersionDraftInput }
  | {
      readonly action: "publish_recipe"
      readonly input: { readonly recipeVersionId: string; readonly expectedRevision: number }
    }
  | {
      readonly action: "retire_recipe"
      readonly input: { readonly recipeId: string; readonly expectedRevision: number }
    }
  | {
      readonly action: "create_price_book"
      readonly input: {
        readonly regionId: string
        readonly versionNumber: number
        readonly effectiveFrom: string
        readonly effectiveTo: string | null
      }
    }
  | { readonly action: "save_price_book_draft"; readonly input: PriceBookDraftInput }
  | {
      readonly action: "publish_price_book"
      readonly input: { readonly priceBookId: string; readonly expectedRevision: number }
    }
  | {
      readonly action: "retire_price_book"
      readonly input: { readonly priceBookId: string; readonly expectedRevision: number }
    }
