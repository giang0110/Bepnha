import type { CatalogPackV1 } from "./catalog-pack-types.ts"
import type {
  CatalogProductionSnapshot,
  ProductionCategoryRow,
  ProductionCodeRow,
  ProductionFoodRow,
  ProductionIdentityRow,
  ProductionNutrientRow,
  ProductionPriceBookRow,
  ProductionPriceRegionRow,
  ProductionRecipeTagRow,
  ProductionUnitRow,
  ProductionVersionRow
} from "./catalog-production-types.ts"

export const CATALOG_PRODUCTION_TABLES = [
  "units",
  "food_categories",
  "allergens",
  "dietary_tags",
  "nutrients",
  "price_regions",
  "recipe_tags",
  "foods",
  "food_fact_versions",
  "recipes",
  "recipe_versions",
  "price_books",
  "meal_options",
  "meal_option_versions"
] as const

export type CatalogProductionTable = (typeof CATALOG_PRODUCTION_TABLES)[number]

export interface CatalogSelectFilter {
  readonly column: string
  readonly operation: "eq" | "in"
  readonly value: string | number | readonly string[] | readonly number[]
}

export interface CatalogSelectRequest {
  readonly table: CatalogProductionTable
  readonly columns: string
  readonly filters: readonly CatalogSelectFilter[]
}

export type CatalogSelectGatewayResult =
  { readonly ok: true; readonly rows: readonly unknown[] } | { readonly ok: false }

export interface CatalogSelectGateway {
  readonly select: (request: CatalogSelectRequest) => Promise<CatalogSelectGatewayResult>
}

export type CatalogProductionSnapshotLoadResult =
  | { readonly ok: true; readonly value: CatalogProductionSnapshot }
  | { readonly ok: false; readonly reason: "DEPENDENCY_UNAVAILABLE" }

export interface CatalogReferenceReader {
  readonly loadSnapshot: (pack: CatalogPackV1) => Promise<CatalogProductionSnapshotLoadResult>
}

const COLUMNS = {
  units: "id,code,dimension",
  food_categories: "id,code,parent_id",
  allergens: "id,code",
  dietary_tags: "id,code",
  nutrients: "id,code,required_for_publication",
  price_regions: "id,code,is_launch_default",
  recipe_tags: "id,code,tag_kind",
  foods: "id,code,name_vi,base_dimension,base_unit_id,status,revision",
  food_fact_versions: "id,food_id,version_number,revision,publication_status",
  recipes: "id,code,name_vi,status,revision",
  recipe_versions: "id,recipe_id,version_number,revision,publication_status",
  price_books: "id,region_id,version_number,revision,publication_status",
  meal_options: "id,code,name_vi,status,revision",
  meal_option_versions: "id,meal_option_id,version_number,revision,publication_status"
} as const satisfies Readonly<Record<CatalogProductionTable, string>>

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const dependencyUnavailable = (): CatalogProductionSnapshotLoadResult => ({
  ok: false,
  reason: "DEPENDENCY_UNAVAILABLE"
})

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort()
}

function uniqueSortedNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right)
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringField(row: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = row[key]
  return typeof value === "string" && value.length > 0 ? value : null
}

function uuidField(row: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = stringField(row, key)
  return value !== null && UUID_PATTERN.test(value) ? value : null
}

function nullableUuidField(
  row: Readonly<Record<string, unknown>>,
  key: string
): string | null | undefined {
  const value = row[key]
  if (value === null) return null
  if (typeof value === "string" && UUID_PATTERN.test(value)) return value
  return undefined
}

function positiveIntegerField(row: Readonly<Record<string, unknown>>, key: string): number | null {
  const value = row[key]
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null
}

function booleanField(row: Readonly<Record<string, unknown>>, key: string): boolean | null {
  const value = row[key]
  return typeof value === "boolean" ? value : null
}

function parseCodeRow(value: unknown): ProductionCodeRow | null {
  if (!isRecord(value)) return null
  const id = uuidField(value, "id")
  const code = stringField(value, "code")
  return id === null || code === null ? null : { id, code }
}

function parseUnitRow(value: unknown): ProductionUnitRow | null {
  if (!isRecord(value)) return null
  const id = uuidField(value, "id")
  const code = stringField(value, "code")
  const dimension = value.dimension
  if (
    id === null ||
    code === null ||
    (dimension !== "mass" && dimension !== "volume" && dimension !== "count")
  ) {
    return null
  }
  return { id, code, dimension }
}

function parseCategoryRow(value: unknown): ProductionCategoryRow | null {
  if (!isRecord(value)) return null
  const id = uuidField(value, "id")
  const code = stringField(value, "code")
  const parentId = nullableUuidField(value, "parent_id")
  if (id === null || code === null || parentId === undefined) return null
  return { id, code, parentId }
}

function parseNutrientRow(value: unknown): ProductionNutrientRow | null {
  if (!isRecord(value)) return null
  const base = parseCodeRow(value)
  const requiredForPublication = booleanField(value, "required_for_publication")
  return base === null || requiredForPublication === null
    ? null
    : { ...base, requiredForPublication }
}

function parsePriceRegionRow(value: unknown): ProductionPriceRegionRow | null {
  if (!isRecord(value)) return null
  const base = parseCodeRow(value)
  const isLaunchDefault = booleanField(value, "is_launch_default")
  return base === null || isLaunchDefault === null ? null : { ...base, isLaunchDefault }
}

function parseRecipeTagRow(value: unknown): ProductionRecipeTagRow | null {
  if (!isRecord(value)) return null
  const base = parseCodeRow(value)
  const tagKind = value.tag_kind
  if (
    base === null ||
    (tagKind !== "cooking_style" && tagKind !== "protein_hint" && tagKind !== "dish_role")
  ) {
    return null
  }
  return { ...base, tagKind }
}

function identityStatus(value: unknown): ProductionIdentityRow["status"] | null {
  return value === "draft" || value === "published" || value === "retired" ? value : null
}

function publicationStatus(value: unknown): ProductionVersionRow["publicationStatus"] | null {
  return value === "draft" || value === "published" ? value : null
}

function parseFoodRow(value: unknown): ProductionFoodRow | null {
  if (!isRecord(value)) return null
  const id = uuidField(value, "id")
  const code = stringField(value, "code")
  const nameVi = stringField(value, "name_vi")
  const baseDimension = value.base_dimension
  const baseUnitId = uuidField(value, "base_unit_id")
  const status = identityStatus(value.status)
  const revision = positiveIntegerField(value, "revision")
  if (
    id === null ||
    code === null ||
    nameVi === null ||
    (baseDimension !== "mass" && baseDimension !== "volume" && baseDimension !== "count") ||
    baseUnitId === null ||
    status === null ||
    revision === null
  ) {
    return null
  }
  return { id, code, nameVi, baseDimension, baseUnitId, status, revision }
}

function parseIdentityRow(value: unknown): ProductionIdentityRow | null {
  if (!isRecord(value)) return null
  const id = uuidField(value, "id")
  const code = stringField(value, "code")
  const nameVi = stringField(value, "name_vi")
  const status = identityStatus(value.status)
  const revision = positiveIntegerField(value, "revision")
  if (id === null || code === null || nameVi === null || status === null || revision === null) {
    return null
  }
  return { id, code, nameVi, status, revision }
}

function parseVersionRow(value: unknown, parentKey: string): ProductionVersionRow | null {
  if (!isRecord(value)) return null
  const id = uuidField(value, "id")
  const parentId = uuidField(value, parentKey)
  const versionNumber = positiveIntegerField(value, "version_number")
  const revision = positiveIntegerField(value, "revision")
  const status = publicationStatus(value.publication_status)
  if (
    id === null ||
    parentId === null ||
    versionNumber === null ||
    revision === null ||
    status === null
  ) {
    return null
  }
  return { id, parentId, versionNumber, revision, publicationStatus: status }
}

function parsePriceBookRow(value: unknown): ProductionPriceBookRow | null {
  if (!isRecord(value)) return null
  const id = uuidField(value, "id")
  const regionId = uuidField(value, "region_id")
  const versionNumber = positiveIntegerField(value, "version_number")
  const revision = positiveIntegerField(value, "revision")
  const status = publicationStatus(value.publication_status)
  if (
    id === null ||
    regionId === null ||
    versionNumber === null ||
    revision === null ||
    status === null
  ) {
    return null
  }
  return { id, regionId, versionNumber, revision, publicationStatus: status }
}

function parseRows<T>(rows: readonly unknown[], parser: (row: unknown) => T | null): T[] | null {
  const parsed: T[] = []
  for (const row of rows) {
    const value = parser(row)
    if (value === null) return null
    parsed.push(value)
  }
  return parsed
}

function requiredUnitCodes(pack: CatalogPackV1): string[] {
  const values: string[] = []
  for (const food of pack.foods) {
    values.push(food.baseUnitCode)
    for (const conversion of food.fact.conversions) values.push(conversion.unitCode)
  }
  for (const recipe of pack.recipes) {
    for (const ingredient of recipe.version.ingredients) values.push(ingredient.unitCode)
  }
  for (const price of pack.priceBook.prices) {
    values.push(price.packageUnitCode, price.baseUnitCode)
  }
  return uniqueSorted(values)
}

function requiredCategoryCodes(pack: CatalogPackV1): string[] {
  return uniqueSorted(pack.foods.flatMap((food) => food.fact.categoryAncestry))
}

function requiredAllergenCodes(pack: CatalogPackV1): string[] {
  return uniqueSorted(
    pack.foods.flatMap((food) =>
      food.fact.allergenAssessments.map((assessment) => assessment.allergenCode)
    )
  )
}

function requiredDietaryTagCodes(pack: CatalogPackV1): string[] {
  return uniqueSorted(pack.foods.flatMap((food) => food.fact.dietaryTagCodes))
}

function requiredNutrientCodes(pack: CatalogPackV1): string[] {
  return uniqueSorted(
    pack.foods.flatMap((food) => food.fact.nutrients.map((nutrient) => nutrient.nutrientCode))
  )
}

function requiredRecipeTagCodes(pack: CatalogPackV1): string[] {
  const values: string[] = []
  for (const meal of pack.mealOptions) {
    values.push(`protein_${meal.version.proteinHintCode}`)
    for (const code of meal.version.cookingStyleCodes) values.push(`style_${code}`)
    for (const code of meal.version.dishRoleCodes) values.push(`role_${code}`)
  }
  for (const recipe of pack.recipes) {
    for (const code of recipe.version.tagCodes) {
      values.push(`style_${code}`, `protein_${code}`, `role_${code}`)
    }
  }
  return uniqueSorted(values)
}

function codeRequest(
  table: CatalogProductionTable,
  codes: readonly string[]
): CatalogSelectRequest {
  return {
    table,
    columns: COLUMNS[table],
    filters: [{ column: "code", operation: "in", value: codes }]
  }
}

async function select(
  gateway: CatalogSelectGateway,
  request: CatalogSelectRequest
): Promise<readonly unknown[] | null> {
  const result = await gateway.select(request)
  return result.ok ? result.rows : null
}

async function loadSnapshot(
  gateway: CatalogSelectGateway,
  pack: CatalogPackV1
): Promise<CatalogProductionSnapshotLoadResult> {
  const unitsRaw = await select(gateway, codeRequest("units", requiredUnitCodes(pack)))
  if (unitsRaw === null) return dependencyUnavailable()
  const units = parseRows(unitsRaw, parseUnitRow)
  if (units === null) return dependencyUnavailable()

  const categoriesRaw = await select(
    gateway,
    codeRequest("food_categories", requiredCategoryCodes(pack))
  )
  if (categoriesRaw === null) return dependencyUnavailable()
  const categories = parseRows(categoriesRaw, parseCategoryRow)
  if (categories === null) return dependencyUnavailable()

  const allergensRaw = await select(gateway, codeRequest("allergens", requiredAllergenCodes(pack)))
  if (allergensRaw === null) return dependencyUnavailable()
  const allergens = parseRows(allergensRaw, parseCodeRow)
  if (allergens === null) return dependencyUnavailable()

  const dietaryTagsRaw = await select(
    gateway,
    codeRequest("dietary_tags", requiredDietaryTagCodes(pack))
  )
  if (dietaryTagsRaw === null) return dependencyUnavailable()
  const dietaryTags = parseRows(dietaryTagsRaw, parseCodeRow)
  if (dietaryTags === null) return dependencyUnavailable()

  const nutrientsRaw = await select(gateway, codeRequest("nutrients", requiredNutrientCodes(pack)))
  if (nutrientsRaw === null) return dependencyUnavailable()
  const nutrients = parseRows(nutrientsRaw, parseNutrientRow)
  if (nutrients === null) return dependencyUnavailable()

  const priceRegionsRaw = await select(
    gateway,
    codeRequest("price_regions", [pack.priceBook.regionCode])
  )
  if (priceRegionsRaw === null) return dependencyUnavailable()
  const priceRegions = parseRows(priceRegionsRaw, parsePriceRegionRow)
  if (priceRegions === null) return dependencyUnavailable()

  const recipeTagsRaw = await select(
    gateway,
    codeRequest("recipe_tags", requiredRecipeTagCodes(pack))
  )
  if (recipeTagsRaw === null) return dependencyUnavailable()
  const recipeTags = parseRows(recipeTagsRaw, parseRecipeTagRow)
  if (recipeTags === null) return dependencyUnavailable()

  const foodsRaw = await select(
    gateway,
    codeRequest("foods", uniqueSorted(pack.foods.map((food) => food.code)))
  )
  if (foodsRaw === null) return dependencyUnavailable()
  const foods = parseRows(foodsRaw, parseFoodRow)
  if (foods === null) return dependencyUnavailable()

  const recipesRaw = await select(
    gateway,
    codeRequest("recipes", uniqueSorted(pack.recipes.map((recipe) => recipe.code)))
  )
  if (recipesRaw === null) return dependencyUnavailable()
  const recipes = parseRows(recipesRaw, parseIdentityRow)
  if (recipes === null) return dependencyUnavailable()

  const mealOptionsRaw = await select(
    gateway,
    codeRequest("meal_options", uniqueSorted(pack.mealOptions.map((meal) => meal.code)))
  )
  if (mealOptionsRaw === null) return dependencyUnavailable()
  const mealOptions = parseRows(mealOptionsRaw, parseIdentityRow)
  if (mealOptions === null) return dependencyUnavailable()

  let foodFactVersions: ProductionVersionRow[] = []
  if (foods.length > 0) {
    const raw = await select(gateway, {
      table: "food_fact_versions",
      columns: COLUMNS.food_fact_versions,
      filters: [
        { column: "food_id", operation: "in", value: uniqueSorted(foods.map((row) => row.id)) },
        {
          column: "version_number",
          operation: "in",
          value: uniqueSortedNumbers(pack.foods.map((food) => food.fact.versionNumber))
        }
      ]
    })
    if (raw === null) return dependencyUnavailable()
    const parsed = parseRows(raw, (row) => parseVersionRow(row, "food_id"))
    if (parsed === null) return dependencyUnavailable()
    foodFactVersions = parsed
  }

  let recipeVersions: ProductionVersionRow[] = []
  if (recipes.length > 0) {
    const raw = await select(gateway, {
      table: "recipe_versions",
      columns: COLUMNS.recipe_versions,
      filters: [
        {
          column: "recipe_id",
          operation: "in",
          value: uniqueSorted(recipes.map((row) => row.id))
        },
        {
          column: "version_number",
          operation: "in",
          value: uniqueSortedNumbers(pack.recipes.map((recipe) => recipe.version.versionNumber))
        }
      ]
    })
    if (raw === null) return dependencyUnavailable()
    const parsed = parseRows(raw, (row) => parseVersionRow(row, "recipe_id"))
    if (parsed === null) return dependencyUnavailable()
    recipeVersions = parsed
  }

  let priceBooks: ProductionPriceBookRow[] = []
  if (priceRegions.length > 0) {
    const raw = await select(gateway, {
      table: "price_books",
      columns: COLUMNS.price_books,
      filters: [
        {
          column: "region_id",
          operation: "in",
          value: uniqueSorted(priceRegions.map((row) => row.id))
        },
        { column: "version_number", operation: "eq", value: pack.priceBook.versionNumber }
      ]
    })
    if (raw === null) return dependencyUnavailable()
    const parsed = parseRows(raw, parsePriceBookRow)
    if (parsed === null) return dependencyUnavailable()
    priceBooks = parsed
  }

  let mealOptionVersions: ProductionVersionRow[] = []
  if (mealOptions.length > 0) {
    const raw = await select(gateway, {
      table: "meal_option_versions",
      columns: COLUMNS.meal_option_versions,
      filters: [
        {
          column: "meal_option_id",
          operation: "in",
          value: uniqueSorted(mealOptions.map((row) => row.id))
        },
        {
          column: "version_number",
          operation: "in",
          value: uniqueSortedNumbers(pack.mealOptions.map((meal) => meal.version.versionNumber))
        }
      ]
    })
    if (raw === null) return dependencyUnavailable()
    const parsed = parseRows(raw, (row) => parseVersionRow(row, "meal_option_id"))
    if (parsed === null) return dependencyUnavailable()
    mealOptionVersions = parsed
  }

  return {
    ok: true,
    value: {
      units,
      categories,
      allergens,
      dietaryTags,
      nutrients,
      priceRegions,
      recipeTags,
      foods,
      foodFactVersions,
      recipes,
      recipeVersions,
      priceBooks,
      mealOptions,
      mealOptionVersions
    }
  }
}

export function createCatalogProductionReader(
  gateway: CatalogSelectGateway
): CatalogReferenceReader {
  return {
    loadSnapshot(pack) {
      return loadSnapshot(gateway, pack)
    }
  }
}
