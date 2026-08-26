import type { RecipeCalculationInputV1 } from "@/domain/calculation/recipe-calculation-input"

export interface PublishedRecipeCalculationRecord {
  readonly recipePublicationStatus: "draft" | "published"
  readonly priceBookPublicationStatus: "draft" | "published"
  readonly priceBookRetiredAt: string | null
  readonly recipe: RecipeCalculationInputV1["recipe"]
  readonly priceBook: RecipeCalculationInputV1["priceBook"]
}

export type CatalogReadResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: "NOT_FOUND" | "DEPENDENCY_UNAVAILABLE" }

export interface CatalogReadRepository {
  readonly getCurrentPriceBook: (
    regionId: string
  ) => Promise<CatalogReadResult<{ readonly priceBookId: string }>>
  readonly getPublishedRecipeCalculation: (
    recipeVersionId: string,
    priceBookId: string
  ) => Promise<CatalogReadResult<PublishedRecipeCalculationRecord>>
}
