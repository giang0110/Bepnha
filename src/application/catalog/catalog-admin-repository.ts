import type {
  FoodFactDraftInput,
  PriceBookDraftInput,
  RecipeDraftIngredient,
  RecipeVersionDraftInput
} from "@/application/catalog/catalog-admin-command"
import type { CatalogDimension } from "@/domain/catalog/catalog"

export interface FoodFactPublicationAggregate {
  readonly aggregateType: "food_fact_version"
  readonly food: {
    readonly foodId: string
    readonly code: string
    readonly nameVi: string
    readonly baseDimension: CatalogDimension
    readonly baseUnitId: string
    readonly revision: number
  }
  readonly fact: {
    readonly foodFactVersionId: string
    readonly versionNumber: number
    readonly revision: number
    readonly categoryId: string
    readonly edibleFraction: string
    readonly nutritionBasis: "per_100g_edible"
    readonly provenance: string
    readonly publicationStatus: "draft" | "published"
    readonly contentHash: string | null
  }
  readonly conversions: FoodFactDraftInput["conversions"]
  readonly assessments: FoodFactDraftInput["allergenAssessments"]
  readonly nutrients: FoodFactDraftInput["nutrients"]
  readonly dietaryTags: readonly { readonly dietaryTagId: string; readonly code: string }[]
}

export interface RecipePublicationAggregate {
  readonly aggregateType: "recipe_version"
  readonly recipe: {
    readonly recipeId: string
    readonly code: string
    readonly nameVi: string
    readonly revision: number
  }
  readonly version: {
    readonly recipeVersionId: string
    readonly versionNumber: number
    readonly revision: number
    readonly yieldAdultEquivalent: string
    readonly activeMinutes: number
    readonly elapsedMinutes: number
    readonly publicationStatus: "draft" | "published"
    readonly contentHash: string | null
  }
  readonly ingredients: readonly (RecipeDraftIngredient & {
    readonly foodFactContentHash: string
    readonly foodFactPublicationStatus: "draft" | "published"
    readonly hasPinnedConversion: boolean
  })[]
  readonly steps: readonly {
    readonly recipeStepId: string
    readonly order: number
    readonly instructionVi: string
    readonly timerMinutes: number | null
  }[]
  readonly stepIngredients: readonly {
    readonly recipeStepId: string
    readonly recipeIngredientId: string
    readonly referenceOrder: number
  }[]
  readonly tags: readonly {
    readonly recipeTagId: string
    readonly code: string
    readonly kind: string
  }[]
}

export interface PriceBookPublicationAggregate {
  readonly aggregateType: "price_book"
  readonly book: {
    readonly priceBookId: string
    readonly regionId: string
    readonly versionNumber: number
    readonly revision: number
    readonly effectiveFrom: string
    readonly effectiveTo: string | null
    readonly publicationStatus: "draft" | "published"
    readonly contentHash: string | null
  }
  readonly prices: readonly (PriceBookDraftInput["prices"][number] & {
    readonly foodFactContentHash: string
    readonly foodFactPublicationStatus: "draft" | "published"
  })[]
}

export type CatalogPublicationAggregate =
  FoodFactPublicationAggregate | RecipePublicationAggregate | PriceBookPublicationAggregate

export type CatalogAdminFailureReason =
  | "VALIDATION_FAILED"
  | "STALE_CATALOG_REVISION"
  | "PUBLICATION_INCOMPLETE"
  | "NOT_FOUND"
  | "DEPENDENCY_UNAVAILABLE"

export type CatalogAdminResult =
  | {
      readonly ok: true
      readonly value: {
        readonly id: string
        readonly revision: number
        readonly status: "draft" | "published" | "retired"
        readonly contentHash?: string
      }
    }
  | { readonly ok: false; readonly reason: CatalogAdminFailureReason }

export type CatalogAggregateResult =
  | { readonly ok: true; readonly value: CatalogPublicationAggregate }
  | { readonly ok: false; readonly reason: "NOT_FOUND" | "DEPENDENCY_UNAVAILABLE" }

export interface CatalogAdminRepository {
  readonly createFood: (input: {
    readonly code: string
    readonly nameVi: string
    readonly baseDimension: CatalogDimension
    readonly baseUnitId: string
  }) => Promise<CatalogAdminResult>
  readonly saveFoodFactDraft: (input: FoodFactDraftInput) => Promise<CatalogAdminResult>
  readonly publishFoodFact: (input: {
    readonly id: string
    readonly expectedRevision: number
    readonly contentHash: string
  }) => Promise<CatalogAdminResult>
  readonly retireFood: (input: {
    readonly id: string
    readonly expectedRevision: number
  }) => Promise<CatalogAdminResult>
  readonly createRecipe: (input: {
    readonly code: string
    readonly nameVi: string
  }) => Promise<CatalogAdminResult>
  readonly saveRecipeVersionDraft: (input: RecipeVersionDraftInput) => Promise<CatalogAdminResult>
  readonly publishRecipe: (input: {
    readonly id: string
    readonly expectedRevision: number
    readonly contentHash: string
  }) => Promise<CatalogAdminResult>
  readonly retireRecipe: (input: {
    readonly id: string
    readonly expectedRevision: number
  }) => Promise<CatalogAdminResult>
  readonly createPriceBook: (input: {
    readonly regionId: string
    readonly versionNumber: number
    readonly effectiveFrom: string
    readonly effectiveTo: string | null
  }) => Promise<CatalogAdminResult>
  readonly savePriceBookDraft: (input: PriceBookDraftInput) => Promise<CatalogAdminResult>
  readonly publishPriceBook: (input: {
    readonly id: string
    readonly expectedRevision: number
    readonly contentHash: string
  }) => Promise<CatalogAdminResult>
  readonly retirePriceBook: (input: {
    readonly id: string
    readonly expectedRevision: number
  }) => Promise<CatalogAdminResult>
  readonly getAggregateForPublication: (
    aggregateType: CatalogPublicationAggregate["aggregateType"],
    id: string
  ) => Promise<CatalogAggregateResult>
}
