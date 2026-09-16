export type CatalogMutationDiagnosticCode =
  | "PHASE_9A_INVALID"
  | "PHASE_9A_NOT_READY"
  | "MANIFEST_INVALID"
  | "MANIFEST_NOT_RESOLVED"
  | "INPUT_SHA_MISMATCH"
  | "CATALOG_CODE_MISMATCH"
  | "REFERENCE_MISSING"
  | "REFERENCE_STATE_INVALID"
  | "IDENTITY_STATE_INVALID"
  | "VERSION_STATE_INVALID"
  | "MANIFEST_TARGET_MISSING"
  | "MANIFEST_TARGET_DUPLICATE"
  | "DEPENDENCY_MISSING"
  | "DEPENDENCY_CYCLE"
  | "UNSUPPORTED_OPERATION"

export interface CatalogMutationDiagnostic {
  readonly severity: "error"
  readonly code: CatalogMutationDiagnosticCode
  readonly path: string
  readonly message: string
}

export interface MutationBindingReference {
  readonly $binding: string
}

export interface MutationOperationOutputReference {
  readonly $operationOutput: {
    readonly operationId: string
    readonly field: "id" | "revision"
  }
}

export type MutationPlanBindingSource =
  | { readonly kind: "resolved_uuid"; readonly id: string }
  | { readonly kind: "operation_output"; readonly operationId: string; readonly field: "id" }
  | { readonly kind: "allocate_uuid" }

export interface MutationPlanBindingV1 {
  readonly handle: string
  readonly source: MutationPlanBindingSource
}

export type CatalogMutationOperationKind =
  | "create_food"
  | "save_food_fact_draft"
  | "publish_food_fact"
  | "create_recipe"
  | "save_recipe_version_draft"
  | "publish_recipe"
  | "create_price_book"
  | "save_price_book_draft"
  | "publish_price_book"
  | "create_meal_option"
  | "save_meal_option_version_draft"
  | "publish_meal_option"

export interface CatalogMutationPlanOperationV1 {
  readonly operationId: string
  readonly kind: CatalogMutationOperationKind
  readonly logicalKey: string
  readonly dependsOn: readonly string[]
  readonly input: unknown
  readonly outputs: readonly ("id" | "revision" | "status")[]
}

export interface CatalogMutationPlanV1 {
  readonly schemaVersion: "1"
  readonly catalogCode: string | null
  readonly inputSha256: string
  readonly resolvedManifestSha256: string
  readonly productionSnapshotSha256: string
  readonly executable: boolean
  readonly operations: readonly CatalogMutationPlanOperationV1[]
  readonly bindings: readonly MutationPlanBindingV1[]
  readonly diagnostics: readonly CatalogMutationDiagnostic[]
}
