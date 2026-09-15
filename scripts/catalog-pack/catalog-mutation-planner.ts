import { createHash } from "node:crypto"

import { parseResolvedCatalogManifestBytes } from "./catalog-mutation-manifest-parser.ts"
import type {
  CatalogMutationDiagnostic,
  CatalogMutationDiagnosticCode,
  CatalogMutationPlanV1,
  MutationPlanBindingV1
} from "./catalog-mutation-types.ts"
import { validateCatalogPackBytes } from "./catalog-pack-report.ts"
import type { CatalogPackV1 } from "./catalog-pack-types.ts"
import { validateCatalogPackValue } from "./catalog-pack-validator.ts"
import type {
  ResolvedCatalogManifestV1,
  ResolvedIdentityVersion,
  ResolvedRecipeTagReference,
  ResolvedReference
} from "./catalog-production-types.ts"

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function diagnostic(
  code: CatalogMutationDiagnosticCode,
  path: string,
  message: string
): CatalogMutationDiagnostic {
  return { severity: "error", code, path, message }
}

function failurePlan(
  catalogCode: string | null,
  inputSha256: string,
  resolvedManifestSha256: string,
  productionSnapshotSha256: string,
  issue: CatalogMutationDiagnostic
): CatalogMutationPlanV1 {
  return {
    schemaVersion: "1",
    catalogCode,
    inputSha256,
    resolvedManifestSha256,
    productionSnapshotSha256,
    executable: false,
    operations: [],
    bindings: [],
    diagnostics: [issue]
  }
}

function decodeValidatedPack(inputBytes: Uint8Array): CatalogPackV1 | null {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(inputBytes)
    const value = JSON.parse(text) as unknown
    return validateCatalogPackValue(value).pack
  } catch {
    return null
  }
}

function lexical(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function uniqueCodes(codes: readonly string[]): string[] {
  return [...new Set(codes)].sort(lexical)
}

function requiredUnitCodes(pack: CatalogPackV1): string[] {
  return uniqueCodes([
    ...pack.foods.flatMap((food) => [
      food.baseUnitCode,
      ...food.fact.conversions.map((conversion) => conversion.unitCode)
    ]),
    ...pack.recipes.flatMap((recipe) =>
      recipe.version.ingredients.map((ingredient) => ingredient.unitCode)
    ),
    ...pack.priceBook.prices.flatMap((price) => [price.packageUnitCode, price.baseUnitCode])
  ])
}

function requiredCategoryCodes(pack: CatalogPackV1): string[] {
  return uniqueCodes(pack.foods.flatMap((food) => food.fact.categoryAncestry))
}

function requiredAllergenCodes(pack: CatalogPackV1): string[] {
  return uniqueCodes(
    pack.foods.flatMap((food) =>
      food.fact.allergenAssessments.map((assessment) => assessment.allergenCode)
    )
  )
}

function requiredNutrientCodes(pack: CatalogPackV1): string[] {
  return uniqueCodes(
    pack.foods.flatMap((food) => food.fact.nutrients.map((nutrient) => nutrient.nutrientCode))
  )
}

function requiredDietaryTagCodes(pack: CatalogPackV1): string[] {
  return uniqueCodes(pack.foods.flatMap((food) => food.fact.dietaryTagCodes))
}

interface RequiredRecipeTag {
  readonly code: string
  readonly kind: ResolvedRecipeTagReference["kind"] | null
}

function requiredRecipeTags(pack: CatalogPackV1): RequiredRecipeTag[] {
  const required = new Map<string, RequiredRecipeTag>()

  for (const recipe of pack.recipes) {
    for (const code of recipe.version.tagCodes) {
      required.set(`semantic:${code}`, { code, kind: null })
    }
  }

  for (const mealOption of pack.mealOptions) {
    const proteinCode = mealOption.version.proteinHintCode
    required.set(`protein_hint:${proteinCode}`, { code: proteinCode, kind: "protein_hint" })

    for (const code of mealOption.version.cookingStyleCodes) {
      required.set(`cooking_style:${code}`, { code, kind: "cooking_style" })
    }
    for (const code of mealOption.version.dishRoleCodes) {
      required.set(`dish_role:${code}`, { code, kind: "dish_role" })
    }
  }

  return [...required.values()].sort((left, right) => {
    const leftKey = `${left.kind ?? "semantic"}:${left.code}`
    const rightKey = `${right.kind ?? "semantic"}:${right.code}`
    return lexical(leftKey, rightKey)
  })
}

function exactReferenceByCode<T extends { readonly code: string }>(
  rows: readonly T[],
  code: string
): T | null {
  const matches = rows.filter((row) => row.code === code)
  return matches.length === 1 ? (matches[0] ?? null) : null
}

function validateReferences(
  pack: CatalogPackV1,
  manifest: ResolvedCatalogManifestV1
): CatalogMutationDiagnostic | null {
  for (const code of requiredUnitCodes(pack)) {
    if (exactReferenceByCode(manifest.references.units, code) === null) {
      return diagnostic(
        "REFERENCE_MISSING",
        `$.references.units.${code}`,
        `Required unit reference ${code} is missing or not unique`
      )
    }
  }

  for (const code of requiredCategoryCodes(pack)) {
    const reference = exactReferenceByCode(manifest.references.categories, code)
    if (reference === null) {
      return diagnostic(
        "REFERENCE_MISSING",
        `$.references.categories.${code}`,
        `Required category reference ${code} is missing or not unique`
      )
    }

    const expectedAncestry = pack.foods
      .map((food) => food.fact.categoryAncestry)
      .find((ancestry) => ancestry.includes(code))
    if (expectedAncestry !== undefined) {
      const start = expectedAncestry.indexOf(code)
      const expected = expectedAncestry.slice(start)
      if (
        expected.length !== reference.ancestryCodes.length ||
        expected.some((item, index) => item !== reference.ancestryCodes[index])
      ) {
        return diagnostic(
          "REFERENCE_STATE_INVALID",
          `$.references.categories.${code}`,
          `Category reference ${code} has unexpected ancestry`
        )
      }
    }
  }

  const simpleReferences: readonly [readonly string[], readonly ResolvedReference[], string][] = [
    [requiredAllergenCodes(pack), manifest.references.allergens, "allergens"],
    [requiredNutrientCodes(pack), manifest.references.nutrients, "nutrients"],
    [requiredDietaryTagCodes(pack), manifest.references.dietaryTags, "dietaryTags"]
  ]

  for (const [codes, references, collection] of simpleReferences) {
    for (const code of codes) {
      if (exactReferenceByCode(references, code) === null) {
        return diagnostic(
          "REFERENCE_MISSING",
          `$.references.${collection}.${code}`,
          `Required ${collection} reference ${code} is missing or not unique`
        )
      }
    }
  }

  const priceRegion = manifest.references.priceRegion
  if (priceRegion === null || priceRegion.code !== pack.priceBook.regionCode) {
    return diagnostic(
      "REFERENCE_MISSING",
      "$.references.priceRegion",
      `Required price region reference ${pack.priceBook.regionCode} is missing`
    )
  }

  for (const required of requiredRecipeTags(pack)) {
    const matches = manifest.references.recipeTags.filter(
      (reference) =>
        reference.code === required.code &&
        (required.kind === null || reference.kind === required.kind)
    )
    if (matches.length !== 1) {
      return diagnostic(
        "REFERENCE_MISSING",
        `$.references.recipeTags.${required.kind ?? "semantic"}.${required.code}`,
        `Required recipe tag ${required.code} is missing or not unique`
      )
    }
  }

  return null
}

function targetStateIssue(
  target: ResolvedIdentityVersion,
  path: string
): CatalogMutationDiagnostic | null {
  if (target.identity.state === "conflict") {
    return diagnostic(
      "IDENTITY_STATE_INVALID",
      `${path}.identity`,
      "Identity conflict is not executable"
    )
  }

  if (target.identity.state === "existing") {
    if (
      target.identity.id === null ||
      target.identity.revision === null ||
      target.identity.revision < 1 ||
      target.identity.status === null ||
      target.identity.status === "retired"
    ) {
      return diagnostic(
        "IDENTITY_STATE_INVALID",
        `${path}.identity`,
        "Existing identity state is incomplete or incompatible"
      )
    }
    if (
      target.version.state !== "missing" ||
      target.version.id !== null ||
      target.version.revision !== null ||
      target.version.publicationStatus !== null
    ) {
      return diagnostic(
        "VERSION_STATE_INVALID",
        `${path}.version`,
        "Existing identity requires a missing new version with no production ID"
      )
    }
    return null
  }

  if (
    target.identity.id !== null ||
    target.identity.revision !== null ||
    target.identity.status !== null
  ) {
    return diagnostic(
      "IDENTITY_STATE_INVALID",
      `${path}.identity`,
      "Missing identity must not carry production state"
    )
  }
  if (
    target.version.state !== "pending_parent_creation" ||
    target.version.id !== null ||
    target.version.revision !== null ||
    target.version.publicationStatus !== null
  ) {
    return diagnostic(
      "VERSION_STATE_INVALID",
      `${path}.version`,
      "Missing identity requires a pending-parent version with no production ID"
    )
  }

  return null
}

function exactTarget(
  targets: readonly ResolvedIdentityVersion[],
  code: string,
  path: string
): { readonly target: ResolvedIdentityVersion } | { readonly issue: CatalogMutationDiagnostic } {
  const matches = targets.filter((target) => target.code === code)
  if (matches.length === 0) {
    return {
      issue: diagnostic("MANIFEST_TARGET_MISSING", path, `Manifest target ${code} is missing`)
    }
  }
  if (matches.length !== 1) {
    return {
      issue: diagnostic("MANIFEST_TARGET_DUPLICATE", path, `Manifest target ${code} is duplicated`)
    }
  }
  const target = matches[0]
  if (target === undefined) {
    return {
      issue: diagnostic("MANIFEST_TARGET_MISSING", path, `Manifest target ${code} is missing`)
    }
  }
  return { target }
}

function validateTargets(
  pack: CatalogPackV1,
  manifest: ResolvedCatalogManifestV1
): CatalogMutationDiagnostic | null {
  for (const food of pack.foods) {
    const result = exactTarget(manifest.foods, food.code, `$.foods.${food.code}`)
    if ("issue" in result) return result.issue
    if (result.target.requestedVersionNumber !== food.fact.versionNumber) {
      return diagnostic(
        "VERSION_STATE_INVALID",
        `$.foods.${food.code}.requestedVersionNumber`,
        `Food ${food.code} requested version does not match the pack`
      )
    }
    const issue = targetStateIssue(result.target, `$.foods.${food.code}`)
    if (issue !== null) return issue
  }

  for (const recipe of pack.recipes) {
    const result = exactTarget(manifest.recipes, recipe.code, `$.recipes.${recipe.code}`)
    if ("issue" in result) return result.issue
    if (result.target.requestedVersionNumber !== recipe.version.versionNumber) {
      return diagnostic(
        "VERSION_STATE_INVALID",
        `$.recipes.${recipe.code}.requestedVersionNumber`,
        `Recipe ${recipe.code} requested version does not match the pack`
      )
    }
    const issue = targetStateIssue(result.target, `$.recipes.${recipe.code}`)
    if (issue !== null) return issue
  }

  for (const mealOption of pack.mealOptions) {
    const result = exactTarget(
      manifest.mealOptions,
      mealOption.code,
      `$.mealOptions.${mealOption.code}`
    )
    if ("issue" in result) return result.issue
    if (result.target.requestedVersionNumber !== mealOption.version.versionNumber) {
      return diagnostic(
        "VERSION_STATE_INVALID",
        `$.mealOptions.${mealOption.code}.requestedVersionNumber`,
        `Meal option ${mealOption.code} requested version does not match the pack`
      )
    }
    const issue = targetStateIssue(result.target, `$.mealOptions.${mealOption.code}`)
    if (issue !== null) return issue
  }

  const priceBook = manifest.priceBook
  if (priceBook === null) {
    return diagnostic(
      "MANIFEST_TARGET_MISSING",
      "$.priceBook",
      "Price-book manifest target is missing"
    )
  }
  if (
    priceBook.regionCode !== pack.priceBook.regionCode ||
    priceBook.requestedVersionNumber !== pack.priceBook.versionNumber
  ) {
    return diagnostic(
      "VERSION_STATE_INVALID",
      "$.priceBook",
      "Price-book target does not match the pack region/version"
    )
  }
  if (
    priceBook.version.state !== "missing" ||
    priceBook.version.id !== null ||
    priceBook.version.revision !== null ||
    priceBook.version.publicationStatus !== null
  ) {
    return diagnostic(
      "VERSION_STATE_INVALID",
      "$.priceBook.version",
      "Price-book version must be a new missing production version"
    )
  }
  if (
    manifest.references.priceRegion === null ||
    manifest.references.priceRegion.id !== priceBook.regionId
  ) {
    return diagnostic(
      "REFERENCE_STATE_INVALID",
      "$.priceBook.regionId",
      "Price-book region ID must match the resolved price-region reference"
    )
  }

  return null
}

const foodIdentityHandle = (code: string): string => `identity:food:${code}`
const foodFactVersionHandle = (code: string, version: number): string =>
  `version:food_fact:${code}:${version}`
const recipeIdentityHandle = (code: string): string => `identity:recipe:${code}`
const recipeVersionHandle = (code: string, version: number): string =>
  `version:recipe:${code}:${version}`
const priceBookHandle = (regionCode: string, version: number): string =>
  `identity:price_book:${regionCode}:${version}`
const mealOptionIdentityHandle = (code: string): string => `identity:meal_option:${code}`
const mealOptionVersionHandle = (code: string, version: number): string =>
  `version:meal_option:${code}:${version}`

function buildBindings(
  pack: CatalogPackV1,
  manifest: ResolvedCatalogManifestV1
): MutationPlanBindingV1[] {
  const bindings: MutationPlanBindingV1[] = []

  for (const code of requiredUnitCodes(pack)) {
    const reference = exactReferenceByCode(manifest.references.units, code)
    if (reference !== null) {
      bindings.push({
        handle: `reference:unit:${code}`,
        source: { kind: "resolved_uuid", id: reference.id }
      })
    }
  }

  for (const code of uniqueCodes(pack.foods.map((food) => food.fact.categoryCode))) {
    const reference = exactReferenceByCode(manifest.references.categories, code)
    if (reference !== null) {
      bindings.push({
        handle: `reference:category:${code}`,
        source: { kind: "resolved_uuid", id: reference.id }
      })
    }
  }

  for (const required of requiredRecipeTags(pack)) {
    const reference = manifest.references.recipeTags.find(
      (item) =>
        item.code === required.code && (required.kind === null || item.kind === required.kind)
    )
    if (reference !== undefined) {
      bindings.push({
        handle: `reference:recipe_tag:${reference.kind}:${reference.code}`,
        source: { kind: "resolved_uuid", id: reference.id }
      })
    }
  }

  const priceRegion = manifest.references.priceRegion
  if (priceRegion !== null) {
    bindings.push({
      handle: `reference:price_region:${priceRegion.code}`,
      source: { kind: "resolved_uuid", id: priceRegion.id }
    })
  }

  for (const food of pack.foods) {
    const target = manifest.foods.find((item) => item.code === food.code)
    if (target === undefined) continue
    bindings.push({
      handle: foodIdentityHandle(food.code),
      source:
        target.identity.state === "existing" && target.identity.id !== null
          ? { kind: "resolved_uuid", id: target.identity.id }
          : { kind: "operation_output", operationId: `create_food:${food.code}`, field: "id" }
    })
    bindings.push({
      handle: foodFactVersionHandle(food.code, food.fact.versionNumber),
      source: { kind: "allocate_uuid" }
    })
  }

  for (const recipe of pack.recipes) {
    const target = manifest.recipes.find((item) => item.code === recipe.code)
    if (target === undefined) continue
    bindings.push({
      handle: recipeIdentityHandle(recipe.code),
      source:
        target.identity.state === "existing" && target.identity.id !== null
          ? { kind: "resolved_uuid", id: target.identity.id }
          : { kind: "operation_output", operationId: `create_recipe:${recipe.code}`, field: "id" }
    })
    bindings.push({
      handle: recipeVersionHandle(recipe.code, recipe.version.versionNumber),
      source: { kind: "allocate_uuid" }
    })
  }

  bindings.push({
    handle: priceBookHandle(pack.priceBook.regionCode, pack.priceBook.versionNumber),
    source: {
      kind: "operation_output",
      operationId: `create_price_book:${pack.priceBook.regionCode}:${pack.priceBook.versionNumber}`,
      field: "id"
    }
  })

  for (const mealOption of pack.mealOptions) {
    const target = manifest.mealOptions.find((item) => item.code === mealOption.code)
    if (target === undefined) continue
    bindings.push({
      handle: mealOptionIdentityHandle(mealOption.code),
      source:
        target.identity.state === "existing" && target.identity.id !== null
          ? { kind: "resolved_uuid", id: target.identity.id }
          : {
              kind: "operation_output",
              operationId: `create_meal_option:${mealOption.code}`,
              field: "id"
            }
    })
    bindings.push({
      handle: mealOptionVersionHandle(mealOption.code, mealOption.version.versionNumber),
      source: { kind: "allocate_uuid" }
    })
  }

  const byHandle = new Map<string, MutationPlanBindingV1>()
  for (const binding of bindings) byHandle.set(binding.handle, binding)
  return [...byHandle.values()].sort((left, right) => lexical(left.handle, right.handle))
}

export function planCatalogMutations(
  inputBytes: Uint8Array,
  manifestBytes: Uint8Array
): CatalogMutationPlanV1 {
  const resolvedManifestSha256 = digest(manifestBytes)
  const phase9A = validateCatalogPackBytes(inputBytes)
  const fail = (
    code: CatalogMutationDiagnosticCode,
    path: string,
    message: string,
    productionSnapshotSha256 = ""
  ): CatalogMutationPlanV1 =>
    failurePlan(
      phase9A.catalogCode,
      phase9A.inputSha256,
      resolvedManifestSha256,
      productionSnapshotSha256,
      diagnostic(code, path, message)
    )

  if (!phase9A.valid) {
    return fail("PHASE_9A_INVALID", "$", "Phase 9A replay rejected the input catalog pack")
  }
  if (!phase9A.ready) {
    return fail("PHASE_9A_NOT_READY", "$", "Phase 9A replay found the catalog pack not ready")
  }

  const pack = decodeValidatedPack(inputBytes)
  if (pack === null) {
    return fail("PHASE_9A_INVALID", "$", "Phase 9A validated pack could not be recovered")
  }

  const parsedManifest = parseResolvedCatalogManifestBytes(manifestBytes)
  if (!parsedManifest.ok) {
    return fail("MANIFEST_INVALID", "$", "Resolved manifest must be valid strict UTF-8 JSON")
  }
  const manifest = parsedManifest.manifest
  const manifestFail = (
    code: CatalogMutationDiagnosticCode,
    path: string,
    message: string
  ): CatalogMutationPlanV1 => fail(code, path, message, manifest.productionSnapshotSha256)

  if (!manifest.resolved || manifest.diagnostics.length !== 0) {
    return manifestFail(
      "MANIFEST_NOT_RESOLVED",
      "$",
      "Resolved manifest is not executable or contains diagnostics"
    )
  }
  if (manifest.inputSha256 !== phase9A.inputSha256) {
    return manifestFail(
      "INPUT_SHA_MISMATCH",
      "$.inputSha256",
      "Resolved manifest input SHA-256 does not match the exact pack bytes"
    )
  }
  if (manifest.catalogCode !== phase9A.catalogCode) {
    return manifestFail(
      "CATALOG_CODE_MISMATCH",
      "$.catalogCode",
      "Resolved manifest catalog code does not match the validated pack"
    )
  }

  const referenceIssue = validateReferences(pack, manifest)
  if (referenceIssue !== null) {
    return failurePlan(
      pack.catalogCode,
      phase9A.inputSha256,
      resolvedManifestSha256,
      manifest.productionSnapshotSha256,
      referenceIssue
    )
  }

  const targetIssue = validateTargets(pack, manifest)
  if (targetIssue !== null) {
    return failurePlan(
      pack.catalogCode,
      phase9A.inputSha256,
      resolvedManifestSha256,
      manifest.productionSnapshotSha256,
      targetIssue
    )
  }

  return {
    schemaVersion: "1",
    catalogCode: pack.catalogCode,
    inputSha256: phase9A.inputSha256,
    resolvedManifestSha256,
    productionSnapshotSha256: manifest.productionSnapshotSha256,
    executable: true,
    operations: [],
    bindings: buildBindings(pack, manifest),
    diagnostics: []
  }
}
