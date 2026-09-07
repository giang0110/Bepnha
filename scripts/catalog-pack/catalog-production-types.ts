export type CatalogResolutionDiagnosticCode =
  | "PHASE_9A_INVALID"
  | "PHASE_9A_NOT_READY"
  | "REFERENCE_NOT_FOUND"
  | "REFERENCE_AMBIGUOUS"
  | "REFERENCE_DRIFT"
  | "IDENTITY_CONFLICT"
  | "VERSION_ALREADY_EXISTS"
  | "DEPENDENCY_UNAVAILABLE"

export interface CatalogResolutionDiagnostic {
  readonly severity: "error"
  readonly code: CatalogResolutionDiagnosticCode
  readonly path: string
  readonly message: string
}

export type CatalogIdentityState = "missing" | "existing" | "conflict"
export type CatalogVersionState = "missing" | "collision" | "pending_parent_creation"

export interface ProductionUnitRow {
  readonly id: string
  readonly code: string
  readonly dimension: "mass" | "volume" | "count"
}

export interface ProductionCategoryRow {
  readonly id: string
  readonly code: string
  readonly parentId: string | null
}

export interface ProductionCodeRow {
  readonly id: string
  readonly code: string
}

export interface ProductionNutrientRow extends ProductionCodeRow {
  readonly requiredForPublication: boolean
}

export interface ProductionPriceRegionRow extends ProductionCodeRow {
  readonly isLaunchDefault: boolean
}

export interface ProductionRecipeTagRow extends ProductionCodeRow {
  readonly tagKind: "cooking_style" | "protein_hint" | "dish_role"
}

export interface ProductionFoodRow {
  readonly id: string
  readonly code: string
  readonly nameVi: string
  readonly baseDimension: "mass" | "volume" | "count"
  readonly baseUnitId: string
  readonly status: "draft" | "published" | "retired"
  readonly revision: number
}

export interface ProductionIdentityRow {
  readonly id: string
  readonly code: string
  readonly nameVi: string
  readonly status: "draft" | "published" | "retired"
  readonly revision: number
}

export interface ProductionVersionRow {
  readonly id: string
  readonly parentId: string
  readonly versionNumber: number
  readonly revision: number
  readonly publicationStatus: "draft" | "published"
}

export interface ProductionPriceBookRow {
  readonly id: string
  readonly regionId: string
  readonly versionNumber: number
  readonly revision: number
  readonly publicationStatus: "draft" | "published"
}

export interface CatalogProductionSnapshot {
  readonly units: readonly ProductionUnitRow[]
  readonly categories: readonly ProductionCategoryRow[]
  readonly allergens: readonly ProductionCodeRow[]
  readonly dietaryTags: readonly ProductionCodeRow[]
  readonly nutrients: readonly ProductionNutrientRow[]
  readonly priceRegions: readonly ProductionPriceRegionRow[]
  readonly recipeTags: readonly ProductionRecipeTagRow[]
  readonly foods: readonly ProductionFoodRow[]
  readonly foodFactVersions: readonly ProductionVersionRow[]
  readonly recipes: readonly ProductionIdentityRow[]
  readonly recipeVersions: readonly ProductionVersionRow[]
  readonly priceBooks: readonly ProductionPriceBookRow[]
  readonly mealOptions: readonly ProductionIdentityRow[]
  readonly mealOptionVersions: readonly ProductionVersionRow[]
}

export interface ResolvedReference {
  readonly code: string
  readonly productionCode: string
  readonly id: string
}

export interface ResolvedCategoryReference extends ResolvedReference {
  readonly ancestryCodes: readonly string[]
}

export interface ResolvedRecipeTagReference extends ResolvedReference {
  readonly kind: "cooking_style" | "protein_hint" | "dish_role"
}

export interface ResolvedIdentityVersion {
  readonly code: string
  readonly requestedVersionNumber: number
  readonly identity: {
    readonly state: CatalogIdentityState
    readonly id: string | null
    readonly revision: number | null
    readonly status: "draft" | "published" | "retired" | null
  }
  readonly version: {
    readonly state: CatalogVersionState
    readonly id: string | null
    readonly revision: number | null
    readonly publicationStatus: "draft" | "published" | null
  }
}

export interface ResolvedPriceBookTarget {
  readonly regionCode: string
  readonly regionId: string
  readonly requestedVersionNumber: number
  readonly version: ResolvedIdentityVersion["version"]
}

export interface ResolvedCatalogManifestV1 {
  readonly schemaVersion: "1"
  readonly catalogCode: string
  readonly inputSha256: string
  readonly productionSnapshotSha256: string
  readonly resolved: boolean
  readonly references: {
    readonly units: readonly ResolvedReference[]
    readonly categories: readonly ResolvedCategoryReference[]
    readonly allergens: readonly ResolvedReference[]
    readonly nutrients: readonly ResolvedReference[]
    readonly dietaryTags: readonly ResolvedReference[]
    readonly priceRegion: ResolvedReference | null
    readonly recipeTags: readonly ResolvedRecipeTagReference[]
  }
  readonly foods: readonly ResolvedIdentityVersion[]
  readonly recipes: readonly ResolvedIdentityVersion[]
  readonly priceBook: ResolvedPriceBookTarget | null
  readonly mealOptions: readonly ResolvedIdentityVersion[]
  readonly diagnostics: readonly CatalogResolutionDiagnostic[]
}
