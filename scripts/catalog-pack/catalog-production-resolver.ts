import { createHash } from "node:crypto"

import { canonicalUtf8 } from "../../src/domain/shared/canonical-json.ts"
import type { CatalogPackV1 } from "./catalog-pack-types.ts"
import type {
  CatalogProductionSnapshot,
  CatalogResolutionDiagnostic,
  ProductionCategoryRow,
  ProductionCodeRow,
  ProductionRecipeTagRow,
  ResolvedCatalogManifestV1,
  ResolvedCategoryReference,
  ResolvedIdentityVersion,
  ResolvedRecipeTagReference,
  ResolvedReference
} from "./catalog-production-types.ts"

const UNIT_DIMENSIONS = {
  g: "mass",
  kg: "mass",
  ml: "volume",
  l: "volume",
  tsp: "volume",
  tbsp: "volume",
  item: "count"
} as const

const sha256 = (value: unknown): string =>
  createHash("sha256").update(canonicalUtf8(value)).digest("hex")

function addError(
  diagnostics: CatalogResolutionDiagnostic[],
  code: CatalogResolutionDiagnostic["code"],
  path: string,
  message: string
): void {
  diagnostics.push({ severity: "error", code, path, message })
}

function compareDiagnostics(
  left: CatalogResolutionDiagnostic,
  right: CatalogResolutionDiagnostic
): number {
  const code = left.code.localeCompare(right.code)
  if (code !== 0) return code
  const path = left.path.localeCompare(right.path)
  if (path !== 0) return path
  return left.message.localeCompare(right.message)
}

function exactRowByCode<T extends { readonly code: string }>(
  rows: readonly T[],
  code: string,
  path: string,
  diagnostics: CatalogResolutionDiagnostic[]
): T | null {
  const matches = rows.filter((row) => row.code === code)
  if (matches.length === 0) {
    addError(
      diagnostics,
      "REFERENCE_NOT_FOUND",
      path,
      `Production reference ${code} was not found`
    )
    return null
  }
  if (matches.length !== 1) {
    addError(
      diagnostics,
      "REFERENCE_AMBIGUOUS",
      path,
      `Production reference ${code} did not resolve uniquely`
    )
    return null
  }
  return matches[0] ?? null
}

function asReference(code: string, row: ProductionCodeRow): ResolvedReference {
  return { code, productionCode: row.code, id: row.id }
}

function requiredUnitCodes(pack: CatalogPackV1): string[] {
  const codes = new Set<string>()
  for (const food of pack.foods) {
    codes.add(food.baseUnitCode)
    for (const conversion of food.fact.conversions) codes.add(conversion.unitCode)
  }
  for (const recipe of pack.recipes) {
    for (const ingredient of recipe.version.ingredients) codes.add(ingredient.unitCode)
  }
  for (const price of pack.priceBook.prices) {
    codes.add(price.packageUnitCode)
    codes.add(price.baseUnitCode)
  }
  return [...codes].sort()
}

function resolveUnits(
  pack: CatalogPackV1,
  snapshot: CatalogProductionSnapshot,
  diagnostics: CatalogResolutionDiagnostic[]
): ResolvedReference[] {
  const resolved: ResolvedReference[] = []
  for (const code of requiredUnitCodes(pack)) {
    const row = exactRowByCode(snapshot.units, code, `$.references.units.${code}`, diagnostics)
    if (row === null) continue
    const expectedDimension = UNIT_DIMENSIONS[code as keyof typeof UNIT_DIMENSIONS]
    if (expectedDimension === undefined || row.dimension !== expectedDimension) {
      addError(
        diagnostics,
        "REFERENCE_DRIFT",
        `$.references.units.${code}`,
        `Production unit ${code} has unexpected dimension`
      )
      continue
    }
    resolved.push(asReference(code, row))
  }
  return resolved
}

function expectedCategoryChains(pack: CatalogPackV1): Map<string, readonly string[]> {
  const chains = new Map<string, readonly string[]>()
  for (const food of pack.foods) {
    food.fact.categoryAncestry.forEach((code, index) => {
      const chain = food.fact.categoryAncestry.slice(index)
      const existing = chains.get(code)
      if (
        existing === undefined ||
        chain.join("\u0000") === existing.join("\u0000")
      ) {
        chains.set(code, chain)
      }
    })
  }
  return chains
}

function productionCategoryChain(
  row: ProductionCategoryRow,
  rowsById: ReadonlyMap<string, ProductionCategoryRow>
): readonly string[] | null {
  const result: string[] = []
  const seen = new Set<string>()
  let current: ProductionCategoryRow | undefined = row
  while (current !== undefined) {
    if (seen.has(current.id)) return null
    seen.add(current.id)
    result.push(current.code)
    if (current.parentId === null) return result
    current = rowsById.get(current.parentId)
  }
  return null
}

function resolveCategories(
  pack: CatalogPackV1,
  snapshot: CatalogProductionSnapshot,
  diagnostics: CatalogResolutionDiagnostic[]
): ResolvedCategoryReference[] {
  const expectedChains = expectedCategoryChains(pack)
  const rowsById = new Map(snapshot.categories.map((row) => [row.id, row] as const))
  const resolved: ResolvedCategoryReference[] = []

  for (const [code, expected] of [...expectedChains.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const path = `$.references.categories.${code}`
    const row = exactRowByCode(snapshot.categories, code, path, diagnostics)
    if (row === null) continue
    const actual = productionCategoryChain(row, rowsById)
    if (actual === null || actual.join("\u0000") !== expected.join("\u0000")) {
      addError(
        diagnostics,
        "REFERENCE_DRIFT",
        path,
        `Production category ancestry for ${code} differs from the reviewed launch hierarchy`
      )
      continue
    }
    resolved.push({ code, productionCode: row.code, id: row.id, ancestryCodes: [...expected] })
  }
  return resolved
}

function resolveSimpleCodes(
  codes: readonly string[],
  rows: readonly ProductionCodeRow[],
  rootPath: string,
  diagnostics: CatalogResolutionDiagnostic[]
): ResolvedReference[] {
  const resolved: ResolvedReference[] = []
  for (const code of [...new Set(codes)].sort()) {
    const row = exactRowByCode(rows, code, `${rootPath}.${code}`, diagnostics)
    if (row !== null) resolved.push(asReference(code, row))
  }
  return resolved
}

function requiredAllergenCodes(pack: CatalogPackV1): string[] {
  return pack.foods.flatMap((food) =>
    food.fact.allergenAssessments.map((item) => item.allergenCode)
  )
}

function requiredNutrientCodes(pack: CatalogPackV1): string[] {
  return pack.foods.flatMap((food) => food.fact.nutrients.map((item) => item.nutrientCode))
}

function requiredDietaryTagCodes(pack: CatalogPackV1): string[] {
  return pack.foods.flatMap((food) => food.fact.dietaryTagCodes)
}

function resolveNutrients(
  pack: CatalogPackV1,
  snapshot: CatalogProductionSnapshot,
  diagnostics: CatalogResolutionDiagnostic[]
): ResolvedReference[] {
  const resolved: ResolvedReference[] = []
  for (const code of [...new Set(requiredNutrientCodes(pack))].sort()) {
    const path = `$.references.nutrients.${code}`
    const row = exactRowByCode(snapshot.nutrients, code, path, diagnostics)
    if (row === null) continue
    if (!row.requiredForPublication) {
      addError(
        diagnostics,
        "REFERENCE_DRIFT",
        path,
        `Production nutrient ${code} is no longer required for publication`
      )
      continue
    }
    resolved.push(asReference(code, row))
  }
  return resolved
}

function recipeTagCandidates(code: string): readonly {
  readonly productionCode: string
  readonly kind: ProductionRecipeTagRow["tagKind"]
}[] {
  return [
    { productionCode: `style_${code}`, kind: "cooking_style" },
    { productionCode: `protein_${code}`, kind: "protein_hint" },
    { productionCode: `role_${code}`, kind: "dish_role" }
  ]
}

function resolveStructuredRecipeTag(
  semanticCode: string,
  productionCode: string,
  expectedKind: ProductionRecipeTagRow["tagKind"],
  path: string,
  snapshot: CatalogProductionSnapshot,
  diagnostics: CatalogResolutionDiagnostic[]
): ResolvedRecipeTagReference | null {
  const row = exactRowByCode(snapshot.recipeTags, productionCode, path, diagnostics)
  if (row === null) return null
  if (row.tagKind !== expectedKind) {
    addError(
      diagnostics,
      "REFERENCE_DRIFT",
      path,
      `Production recipe tag ${productionCode} has unexpected kind`
    )
    return null
  }
  return { code: semanticCode, productionCode, id: row.id, kind: expectedKind }
}

function resolveSemanticRecipeTag(
  semanticCode: string,
  path: string,
  snapshot: CatalogProductionSnapshot,
  diagnostics: CatalogResolutionDiagnostic[]
): ResolvedRecipeTagReference | null {
  const candidates = recipeTagCandidates(semanticCode)
  const candidateCodes = new Set(candidates.map((candidate) => candidate.productionCode))
  const matches = snapshot.recipeTags.filter((row) => candidateCodes.has(row.code))
  if (matches.length === 0) {
    addError(
      diagnostics,
      "REFERENCE_NOT_FOUND",
      path,
      `Semantic recipe tag ${semanticCode} has no production mapping`
    )
    return null
  }
  if (matches.length !== 1) {
    addError(
      diagnostics,
      "REFERENCE_AMBIGUOUS",
      path,
      `Semantic recipe tag ${semanticCode} resolves to multiple production tags`
    )
    return null
  }
  const row = matches[0]
  if (row === undefined) return null
  const candidate = candidates.find((item) => item.productionCode === row.code)
  if (candidate === undefined || row.tagKind !== candidate.kind) {
    addError(
      diagnostics,
      "REFERENCE_DRIFT",
      path,
      `Production recipe tag ${row.code} has unexpected kind`
    )
    return null
  }
  return { code: semanticCode, productionCode: row.code, id: row.id, kind: candidate.kind }
}

function resolveRecipeTags(
  pack: CatalogPackV1,
  snapshot: CatalogProductionSnapshot,
  diagnostics: CatalogResolutionDiagnostic[]
): ResolvedRecipeTagReference[] {
  const resolved = new Map<string, ResolvedRecipeTagReference>()
  const add = (reference: ResolvedRecipeTagReference | null): void => {
    if (reference !== null) resolved.set(`${reference.kind}:${reference.code}`, reference)
  }

  for (const meal of pack.mealOptions) {
    add(
      resolveStructuredRecipeTag(
        meal.version.proteinHintCode,
        `protein_${meal.version.proteinHintCode}`,
        "protein_hint",
        `$.mealOptions.${meal.code}.version.proteinHintCode`,
        snapshot,
        diagnostics
      )
    )
    for (const code of meal.version.cookingStyleCodes) {
      add(
        resolveStructuredRecipeTag(
          code,
          `style_${code}`,
          "cooking_style",
          `$.mealOptions.${meal.code}.version.cookingStyleCodes.${code}`,
          snapshot,
          diagnostics
        )
      )
    }
    for (const code of meal.version.dishRoleCodes) {
      add(
        resolveStructuredRecipeTag(
          code,
          `role_${code}`,
          "dish_role",
          `$.mealOptions.${meal.code}.version.dishRoleCodes.${code}`,
          snapshot,
          diagnostics
        )
      )
    }
  }

  const semanticRecipeCodes = new Set(
    pack.recipes.flatMap((recipe) => recipe.version.tagCodes)
  )
  for (const code of [...semanticRecipeCodes].sort()) {
    add(resolveSemanticRecipeTag(code, `$.recipes.tags.${code}`, snapshot, diagnostics))
  }

  return [...resolved.values()].sort((left, right) => {
    const leftKey = `${left.code}:${left.kind}:${left.productionCode}`
    const rightKey = `${right.code}:${right.kind}:${right.productionCode}`
    return leftKey.localeCompare(rightKey)
  })
}

function missingIdentityVersion(code: string, versionNumber: number): ResolvedIdentityVersion {
  return {
    code,
    requestedVersionNumber: versionNumber,
    identity: { state: "missing", id: null, revision: null, status: null },
    version: {
      state: "pending_parent_creation",
      id: null,
      revision: null,
      publicationStatus: null
    }
  }
}

function resolvePriceRegion(
  pack: CatalogPackV1,
  snapshot: CatalogProductionSnapshot,
  diagnostics: CatalogResolutionDiagnostic[]
): ResolvedReference | null {
  const code = pack.priceBook.regionCode
  const row = exactRowByCode(
    snapshot.priceRegions,
    code,
    `$.references.priceRegion.${code}`,
    diagnostics
  )
  return row === null ? null : asReference(code, row)
}

export function resolveCatalogProductionReferences(
  pack: CatalogPackV1,
  inputSha256: string,
  snapshot: CatalogProductionSnapshot
): ResolvedCatalogManifestV1 {
  const diagnostics: CatalogResolutionDiagnostic[] = []
  const units = resolveUnits(pack, snapshot, diagnostics)
  const categories = resolveCategories(pack, snapshot, diagnostics)
  const allergens = resolveSimpleCodes(
    requiredAllergenCodes(pack),
    snapshot.allergens,
    "$.references.allergens",
    diagnostics
  )
  const nutrients = resolveNutrients(pack, snapshot, diagnostics)
  const dietaryTags = resolveSimpleCodes(
    requiredDietaryTagCodes(pack),
    snapshot.dietaryTags,
    "$.references.dietaryTags",
    diagnostics
  )
  const priceRegion = resolvePriceRegion(pack, snapshot, diagnostics)
  const recipeTags = resolveRecipeTags(pack, snapshot, diagnostics)
  const sortedDiagnostics = [...diagnostics].sort(compareDiagnostics)

  return {
    schemaVersion: "1",
    catalogCode: pack.catalogCode,
    inputSha256,
    productionSnapshotSha256: sha256(snapshot),
    resolved: sortedDiagnostics.length === 0,
    references: {
      units,
      categories,
      allergens,
      nutrients,
      dietaryTags,
      priceRegion,
      recipeTags
    },
    foods: pack.foods
      .map((food) => missingIdentityVersion(food.code, food.fact.versionNumber))
      .sort((left, right) => left.code.localeCompare(right.code)),
    recipes: pack.recipes
      .map((recipe) => missingIdentityVersion(recipe.code, recipe.version.versionNumber))
      .sort((left, right) => left.code.localeCompare(right.code)),
    priceBook:
      priceRegion === null
        ? null
        : {
            regionCode: pack.priceBook.regionCode,
            regionId: priceRegion.id,
            requestedVersionNumber: pack.priceBook.versionNumber,
            version: {
              state: "missing",
              id: null,
              revision: null,
              publicationStatus: null
            }
          },
    mealOptions: pack.mealOptions
      .map((meal) => missingIdentityVersion(meal.code, meal.version.versionNumber))
      .sort((left, right) => left.code.localeCompare(right.code)),
    diagnostics: sortedDiagnostics
  }
}
