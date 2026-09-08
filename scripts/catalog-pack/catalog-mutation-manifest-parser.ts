import type {
  CatalogResolutionDiagnostic,
  ResolvedCatalogManifestV1,
  ResolvedCategoryReference,
  ResolvedIdentityVersion,
  ResolvedPriceBookTarget,
  ResolvedRecipeTagReference,
  ResolvedReference
} from "./catalog-production-types.ts"

export type ParseResolvedManifestResult =
  | { readonly ok: true; readonly manifest: ResolvedCatalogManifestV1 }
  | { readonly ok: false }

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu
const SHA256 = /^[0-9a-f]{64}$/u

const diagnosticCodes = new Set([
  "PHASE_9A_INVALID",
  "PHASE_9A_NOT_READY",
  "REFERENCE_NOT_FOUND",
  "REFERENCE_AMBIGUOUS",
  "REFERENCE_DRIFT",
  "IDENTITY_CONFLICT",
  "VERSION_ALREADY_EXISTS",
  "DEPENDENCY_UNAVAILABLE"
])
const identityStates = new Set(["missing", "existing", "conflict"])
const versionStates = new Set(["missing", "collision", "pending_parent_creation"])
const statuses = new Set(["draft", "published", "retired"])
const publicationStatuses = new Set(["draft", "published"])
const recipeTagKinds = new Set(["cooking_style", "protein_hint", "dish_role"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}

function isString(value: unknown): value is string {
  return typeof value === "string"
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value)
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && UUID_SHAPE.test(value))
}

function isNullableInteger(value: unknown): value is number | null {
  return value === null || isSafeInteger(value)
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isString)
}

function isResolvedReference(value: unknown): value is ResolvedReference {
  if (!isRecord(value) || !exactKeys(value, ["code", "productionCode", "id"])) return false
  return (
    isNonEmptyString(value.code) &&
    isNonEmptyString(value.productionCode) &&
    isString(value.id) &&
    UUID_SHAPE.test(value.id)
  )
}

function isResolvedCategoryReference(value: unknown): value is ResolvedCategoryReference {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["code", "productionCode", "id", "ancestryCodes"])
  ) {
    return false
  }
  return (
    isNonEmptyString(value.code) &&
    isNonEmptyString(value.productionCode) &&
    isString(value.id) &&
    UUID_SHAPE.test(value.id) &&
    isStringArray(value.ancestryCodes)
  )
}

function isResolvedRecipeTagReference(value: unknown): value is ResolvedRecipeTagReference {
  if (!isRecord(value) || !exactKeys(value, ["code", "productionCode", "id", "kind"])) {
    return false
  }
  return (
    isNonEmptyString(value.code) &&
    isNonEmptyString(value.productionCode) &&
    isString(value.id) &&
    UUID_SHAPE.test(value.id) &&
    isString(value.kind) &&
    recipeTagKinds.has(value.kind)
  )
}

function isIdentity(value: unknown): value is ResolvedIdentityVersion["identity"] {
  if (!isRecord(value) || !exactKeys(value, ["state", "id", "revision", "status"])) return false
  return (
    isString(value.state) &&
    identityStates.has(value.state) &&
    isNullableUuid(value.id) &&
    isNullableInteger(value.revision) &&
    (value.status === null || (isString(value.status) && statuses.has(value.status)))
  )
}

function isVersion(value: unknown): value is ResolvedIdentityVersion["version"] {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["state", "id", "revision", "publicationStatus"])
  ) {
    return false
  }
  return (
    isString(value.state) &&
    versionStates.has(value.state) &&
    isNullableUuid(value.id) &&
    isNullableInteger(value.revision) &&
    (value.publicationStatus === null ||
      (isString(value.publicationStatus) && publicationStatuses.has(value.publicationStatus)))
  )
}

function isResolvedIdentityVersion(value: unknown): value is ResolvedIdentityVersion {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["code", "requestedVersionNumber", "identity", "version"])
  ) {
    return false
  }
  return (
    isNonEmptyString(value.code) &&
    isSafeInteger(value.requestedVersionNumber) &&
    value.requestedVersionNumber > 0 &&
    isIdentity(value.identity) &&
    isVersion(value.version)
  )
}

function isResolvedPriceBookTarget(value: unknown): value is ResolvedPriceBookTarget {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["regionCode", "regionId", "requestedVersionNumber", "version"])
  ) {
    return false
  }
  return (
    isNonEmptyString(value.regionCode) &&
    isString(value.regionId) &&
    UUID_SHAPE.test(value.regionId) &&
    isSafeInteger(value.requestedVersionNumber) &&
    value.requestedVersionNumber > 0 &&
    isVersion(value.version)
  )
}

function isDiagnostic(value: unknown): value is CatalogResolutionDiagnostic {
  if (!isRecord(value) || !exactKeys(value, ["severity", "code", "path", "message"])) {
    return false
  }
  return (
    value.severity === "error" &&
    isString(value.code) &&
    diagnosticCodes.has(value.code) &&
    isString(value.path) &&
    isString(value.message)
  )
}

function every<T>(value: unknown, guard: (item: unknown) => item is T): value is readonly T[] {
  return Array.isArray(value) && value.every(guard)
}

function isReferences(value: unknown): value is ResolvedCatalogManifestV1["references"] {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "units",
      "categories",
      "allergens",
      "nutrients",
      "dietaryTags",
      "priceRegion",
      "recipeTags"
    ])
  ) {
    return false
  }

  return (
    every(value.units, isResolvedReference) &&
    every(value.categories, isResolvedCategoryReference) &&
    every(value.allergens, isResolvedReference) &&
    every(value.nutrients, isResolvedReference) &&
    every(value.dietaryTags, isResolvedReference) &&
    (value.priceRegion === null || isResolvedReference(value.priceRegion)) &&
    every(value.recipeTags, isResolvedRecipeTagReference)
  )
}

function isManifest(value: unknown): value is ResolvedCatalogManifestV1 {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "schemaVersion",
      "catalogCode",
      "inputSha256",
      "productionSnapshotSha256",
      "resolved",
      "references",
      "foods",
      "recipes",
      "priceBook",
      "mealOptions",
      "diagnostics"
    ])
  ) {
    return false
  }

  return (
    value.schemaVersion === "1" &&
    isNonEmptyString(value.catalogCode) &&
    isString(value.inputSha256) &&
    SHA256.test(value.inputSha256) &&
    isString(value.productionSnapshotSha256) &&
    SHA256.test(value.productionSnapshotSha256) &&
    typeof value.resolved === "boolean" &&
    isReferences(value.references) &&
    every(value.foods, isResolvedIdentityVersion) &&
    every(value.recipes, isResolvedIdentityVersion) &&
    (value.priceBook === null || isResolvedPriceBookTarget(value.priceBook)) &&
    every(value.mealOptions, isResolvedIdentityVersion) &&
    every(value.diagnostics, isDiagnostic)
  )
}

export function parseResolvedCatalogManifestBytes(
  bytes: Uint8Array
): ParseResolvedManifestResult {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    const value = JSON.parse(text) as unknown
    return isManifest(value) ? { ok: true, manifest: value } : { ok: false }
  } catch {
    return { ok: false }
  }
}
