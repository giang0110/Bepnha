import type { CatalogPackV1 } from "./catalog-pack-types.ts"

/**
 * The catalog pack as a set of flat tables, so it can be authored in a spreadsheet instead of by
 * hand-editing five levels of nested JSON. Parent and child rows are joined by the parent's `code`,
 * which is the same identifier the pack itself uses.
 *
 * This module converts shape, never meaning. It does not decide whether a value is acceptable, fill
 * a missing one, or normalise a number — `catalog:validate` remains the only authority on that. The
 * one rule it enforces is that a blank cell never becomes a value: a missing number arrives as
 * `null` and is rejected downstream, because `0` is a real nutrition figure and `absent` is a real
 * allergen conclusion, and a converter that guessed either would publish a claim nobody made.
 */

export const LIST_SEPARATOR = "|"

export const SHEET_FILE_NAMES = [
  "pack.csv",
  "foods.csv",
  "food_allergens.csv",
  "food_nutrients.csv",
  "food_conversions.csv",
  "recipes.csv",
  "recipe_ingredients.csv",
  "recipe_steps.csv",
  "price_book.csv",
  "prices.csv",
  "meal_options.csv",
  "meal_option_components.csv"
] as const

export type SheetFileName = (typeof SHEET_FILE_NAMES)[number]

export const SHEET_HEADERS: Record<SheetFileName, readonly string[]> = {
  "pack.csv": ["catalogCode", "preparedAt", "sourceName", "sourceProvenance"],
  "foods.csv": [
    "code",
    "nameVi",
    "baseDimension",
    "baseUnitCode",
    "factVersionNumber",
    "categoryCode",
    "categoryAncestry",
    "edibleFraction",
    "provenance",
    "dietaryTagCodes"
  ],
  "food_allergens.csv": ["foodCode", "allergenCode", "status", "provenance"],
  "food_nutrients.csv": ["foodCode", "nutrientCode", "amountPer100g", "provenance"],
  "food_conversions.csv": [
    "foodCode",
    "unitCode",
    "baseQuantityPerUnit",
    "grossGramsPerUnit",
    "displayStep",
    "provenance"
  ],
  "recipes.csv": [
    "code",
    "nameVi",
    "versionNumber",
    "yieldAdultEquivalent",
    "activeMinutes",
    "elapsedMinutes",
    "tagCodes"
  ],
  "recipe_ingredients.csv": [
    "recipeCode",
    "ingredientCode",
    "foodCode",
    "foodFactVersionNumber",
    "quantity",
    "unitCode",
    "preparationNoteVi",
    "order"
  ],
  "recipe_steps.csv": ["recipeCode", "order", "instructionVi", "timerMinutes", "ingredientCodes"],
  "price_book.csv": ["regionCode", "versionNumber", "effectiveFrom", "effectiveTo"],
  "prices.csv": [
    "foodCode",
    "foodFactVersionNumber",
    "packageQuantity",
    "packageUnitCode",
    "packageBaseQuantity",
    "baseUnitCode",
    "packagePriceVnd",
    "purchaseIncrement",
    "observedAt",
    "sourceReference"
  ],
  "meal_options.csv": [
    "code",
    "nameVi",
    "versionNumber",
    "yieldAdultEquivalent",
    "activeMinutes",
    "elapsedMinutes",
    "proteinHintCode",
    "cookingStyleCodes",
    "dishRoleCodes"
  ],
  "meal_option_components.csv": [
    "mealOptionCode",
    "recipeCode",
    "recipeVersionNumber",
    "quantityMultiplier",
    "mealRole",
    "order"
  ]
}

export type SheetBundle = Record<SheetFileName, string[][]>

/* ------------------------------------------------------------------ cells */

function text(value: string | null): string {
  return value ?? ""
}

function list(values: readonly string[]): string {
  return values.join(LIST_SEPARATOR)
}

function number_(value: number): string {
  return String(value)
}

function optionalNumber(value: number | null): string {
  return value === null ? "" : String(value)
}

/** A blank or malformed cell yields null so the schema rejects it; it never yields 0. */
function readInteger(cell: string): number | null {
  const trimmed = cell.trim()
  return /^-?\d+$/u.test(trimmed) ? Number(trimmed) : null
}

function readOptionalText(cell: string): string | null {
  return cell === "" ? null : cell
}

function readList(cell: string): string[] {
  const trimmed = cell.trim()
  if (trimmed === "") return []
  return trimmed.split(LIST_SEPARATOR).map((entry) => entry.trim())
}

/* ----------------------------------------------------------------- export */

export function packToSheets(pack: CatalogPackV1): SheetBundle {
  const bundle = Object.fromEntries(
    SHEET_FILE_NAMES.map((name) => [name, [[...SHEET_HEADERS[name]]]])
  ) as SheetBundle

  bundle["pack.csv"].push([
    pack.catalogCode,
    pack.preparedAt,
    pack.source.name,
    pack.source.provenance
  ])

  for (const food of pack.foods) {
    bundle["foods.csv"].push([
      food.code,
      food.nameVi,
      food.baseDimension,
      food.baseUnitCode,
      number_(food.fact.versionNumber),
      food.fact.categoryCode,
      list(food.fact.categoryAncestry),
      food.fact.edibleFraction,
      food.fact.provenance,
      list(food.fact.dietaryTagCodes)
    ])
    for (const assessment of food.fact.allergenAssessments) {
      bundle["food_allergens.csv"].push([
        food.code,
        assessment.allergenCode,
        assessment.status,
        assessment.provenance
      ])
    }
    for (const nutrient of food.fact.nutrients) {
      bundle["food_nutrients.csv"].push([
        food.code,
        nutrient.nutrientCode,
        nutrient.amountPer100g,
        nutrient.provenance
      ])
    }
    for (const conversion of food.fact.conversions) {
      bundle["food_conversions.csv"].push([
        food.code,
        conversion.unitCode,
        conversion.baseQuantityPerUnit,
        conversion.grossGramsPerUnit,
        conversion.displayStep,
        conversion.provenance
      ])
    }
  }

  for (const recipe of pack.recipes) {
    bundle["recipes.csv"].push([
      recipe.code,
      recipe.nameVi,
      number_(recipe.version.versionNumber),
      recipe.version.yieldAdultEquivalent,
      number_(recipe.version.activeMinutes),
      number_(recipe.version.elapsedMinutes),
      list(recipe.version.tagCodes)
    ])
    for (const ingredient of recipe.version.ingredients) {
      bundle["recipe_ingredients.csv"].push([
        recipe.code,
        ingredient.ingredientCode,
        ingredient.foodCode,
        number_(ingredient.foodFactVersionNumber),
        ingredient.quantity,
        ingredient.unitCode,
        text(ingredient.preparationNoteVi),
        number_(ingredient.order)
      ])
    }
    for (const step of recipe.version.steps) {
      bundle["recipe_steps.csv"].push([
        recipe.code,
        number_(step.order),
        step.instructionVi,
        optionalNumber(step.timerMinutes),
        list(step.ingredientCodes)
      ])
    }
  }

  bundle["price_book.csv"].push([
    pack.priceBook.regionCode,
    number_(pack.priceBook.versionNumber),
    pack.priceBook.effectiveFrom,
    text(pack.priceBook.effectiveTo)
  ])
  for (const price of pack.priceBook.prices) {
    bundle["prices.csv"].push([
      price.foodCode,
      number_(price.foodFactVersionNumber),
      price.packageQuantity,
      price.packageUnitCode,
      price.packageBaseQuantity,
      price.baseUnitCode,
      number_(price.packagePriceVnd),
      price.purchaseIncrement,
      price.observedAt,
      price.sourceReference
    ])
  }

  for (const option of pack.mealOptions) {
    bundle["meal_options.csv"].push([
      option.code,
      option.nameVi,
      number_(option.version.versionNumber),
      option.version.yieldAdultEquivalent,
      number_(option.version.activeMinutes),
      number_(option.version.elapsedMinutes),
      option.version.proteinHintCode,
      list(option.version.cookingStyleCodes),
      list(option.version.dishRoleCodes)
    ])
    for (const component of option.version.components) {
      bundle["meal_option_components.csv"].push([
        option.code,
        component.recipeCode,
        number_(component.recipeVersionNumber),
        component.quantityMultiplier,
        component.mealRole,
        number_(component.order)
      ])
    }
  }

  return bundle
}

/* ----------------------------------------------------------------- import */

export interface SheetReadError {
  readonly file: SheetFileName
  readonly message: string
}

type Record_ = { cell: (column: string) => string }

interface SheetTable {
  /** Columns are matched by name, so a spreadsheet may reorder them or carry extra notes columns. */
  missingColumns: () => string[]
  records: () => Record_[]
}

/** Written as a factory rather than a class: Node runs these scripts by stripping types only, and
 * that mode rejects TypeScript parameter properties. */
function sheetTable(file: SheetFileName, rows: readonly (readonly string[])[]): SheetTable {
  const header = rows[0] ?? []
  const indexByColumn = new Map(header.map((name, index) => [name.trim(), index]))

  return {
    missingColumns: () => SHEET_HEADERS[file].filter((name) => !indexByColumn.has(name)),
    records: () =>
      rows.slice(1).map((row) => ({
        cell: (column: string) => {
          const index = indexByColumn.get(column)
          return index === undefined ? "" : (row[index] ?? "")
        }
      }))
  }
}

function groupBy(records: readonly Record_[], column: string): Map<string, Record_[]> {
  const grouped = new Map<string, Record_[]>()
  for (const record of records) {
    const key = record.cell(column)
    const existing = grouped.get(key)
    if (existing === undefined) grouped.set(key, [record])
    else existing.push(record)
  }
  return grouped
}

/**
 * Builds the pack document from the tables. The result is deliberately typed as unknown rather than
 * `CatalogPackV1`: a half-filled spreadsheet cannot produce a valid pack, and pretending otherwise
 * would move the judgement out of the validator and into this file. Feed the output to
 * `catalog:validate`.
 */
export function sheetsToPack(bundle: SheetBundle): {
  readonly pack: unknown
  readonly errors: readonly SheetReadError[]
} {
  const errors: SheetReadError[] = []
  const tables = {} as Record<SheetFileName, SheetTable>

  for (const name of SHEET_FILE_NAMES) {
    const table = sheetTable(name, bundle[name] ?? [])
    const missing = table.missingColumns()
    if (missing.length > 0) {
      errors.push({ file: name, message: `missing column(s): ${missing.join(", ")}` })
    }
    tables[name] = table
  }
  if (errors.length > 0) return { pack: null, errors }

  const packRows = tables["pack.csv"].records()
  const priceBookRows = tables["price_book.csv"].records()
  for (const [name, rows] of [
    ["pack.csv", packRows],
    ["price_book.csv", priceBookRows]
  ] as const) {
    if (rows.length !== 1) {
      errors.push({ file: name, message: `expected exactly one data row, found ${rows.length}` })
    }
  }
  if (errors.length > 0) return { pack: null, errors }

  const packRow = packRows[0] as Record_
  const priceBookRow = priceBookRows[0] as Record_

  const allergensByFood = groupBy(tables["food_allergens.csv"].records(), "foodCode")
  const nutrientsByFood = groupBy(tables["food_nutrients.csv"].records(), "foodCode")
  const conversionsByFood = groupBy(tables["food_conversions.csv"].records(), "foodCode")
  const ingredientsByRecipe = groupBy(tables["recipe_ingredients.csv"].records(), "recipeCode")
  const stepsByRecipe = groupBy(tables["recipe_steps.csv"].records(), "recipeCode")
  const componentsByOption = groupBy(
    tables["meal_option_components.csv"].records(),
    "mealOptionCode"
  )

  const pack = {
    schemaVersion: "1",
    catalogCode: packRow.cell("catalogCode"),
    preparedAt: packRow.cell("preparedAt"),
    source: {
      name: packRow.cell("sourceName"),
      provenance: packRow.cell("sourceProvenance")
    },
    foods: tables["foods.csv"].records().map((food) => {
      const code = food.cell("code")
      return {
        code,
        nameVi: food.cell("nameVi"),
        baseDimension: food.cell("baseDimension"),
        baseUnitCode: food.cell("baseUnitCode"),
        fact: {
          versionNumber: readInteger(food.cell("factVersionNumber")),
          categoryCode: food.cell("categoryCode"),
          categoryAncestry: readList(food.cell("categoryAncestry")),
          edibleFraction: food.cell("edibleFraction"),
          provenance: food.cell("provenance"),
          allergenAssessments: (allergensByFood.get(code) ?? []).map((row) => ({
            allergenCode: row.cell("allergenCode"),
            status: row.cell("status"),
            provenance: row.cell("provenance")
          })),
          nutrients: (nutrientsByFood.get(code) ?? []).map((row) => ({
            nutrientCode: row.cell("nutrientCode"),
            amountPer100g: row.cell("amountPer100g"),
            provenance: row.cell("provenance")
          })),
          dietaryTagCodes: readList(food.cell("dietaryTagCodes")),
          conversions: (conversionsByFood.get(code) ?? []).map((row) => ({
            unitCode: row.cell("unitCode"),
            baseQuantityPerUnit: row.cell("baseQuantityPerUnit"),
            grossGramsPerUnit: row.cell("grossGramsPerUnit"),
            displayStep: row.cell("displayStep"),
            provenance: row.cell("provenance")
          }))
        }
      }
    }),
    recipes: tables["recipes.csv"].records().map((recipe) => {
      const code = recipe.cell("code")
      return {
        code,
        nameVi: recipe.cell("nameVi"),
        version: {
          versionNumber: readInteger(recipe.cell("versionNumber")),
          yieldAdultEquivalent: recipe.cell("yieldAdultEquivalent"),
          activeMinutes: readInteger(recipe.cell("activeMinutes")),
          elapsedMinutes: readInteger(recipe.cell("elapsedMinutes")),
          ingredients: (ingredientsByRecipe.get(code) ?? []).map((row) => ({
            ingredientCode: row.cell("ingredientCode"),
            foodCode: row.cell("foodCode"),
            foodFactVersionNumber: readInteger(row.cell("foodFactVersionNumber")),
            quantity: row.cell("quantity"),
            unitCode: row.cell("unitCode"),
            preparationNoteVi: readOptionalText(row.cell("preparationNoteVi")),
            order: readInteger(row.cell("order"))
          })),
          steps: (stepsByRecipe.get(code) ?? []).map((row) => ({
            order: readInteger(row.cell("order")),
            instructionVi: row.cell("instructionVi"),
            timerMinutes: readInteger(row.cell("timerMinutes")),
            ingredientCodes: readList(row.cell("ingredientCodes"))
          })),
          tagCodes: readList(recipe.cell("tagCodes"))
        }
      }
    }),
    priceBook: {
      regionCode: priceBookRow.cell("regionCode"),
      versionNumber: readInteger(priceBookRow.cell("versionNumber")),
      effectiveFrom: priceBookRow.cell("effectiveFrom"),
      effectiveTo: readOptionalText(priceBookRow.cell("effectiveTo")),
      prices: tables["prices.csv"].records().map((row) => ({
        foodCode: row.cell("foodCode"),
        foodFactVersionNumber: readInteger(row.cell("foodFactVersionNumber")),
        packageQuantity: row.cell("packageQuantity"),
        packageUnitCode: row.cell("packageUnitCode"),
        packageBaseQuantity: row.cell("packageBaseQuantity"),
        baseUnitCode: row.cell("baseUnitCode"),
        packagePriceVnd: readInteger(row.cell("packagePriceVnd")),
        purchaseIncrement: row.cell("purchaseIncrement"),
        observedAt: row.cell("observedAt"),
        sourceReference: row.cell("sourceReference")
      }))
    },
    mealOptions: tables["meal_options.csv"].records().map((option) => {
      const code = option.cell("code")
      return {
        code,
        nameVi: option.cell("nameVi"),
        version: {
          versionNumber: readInteger(option.cell("versionNumber")),
          yieldAdultEquivalent: option.cell("yieldAdultEquivalent"),
          activeMinutes: readInteger(option.cell("activeMinutes")),
          elapsedMinutes: readInteger(option.cell("elapsedMinutes")),
          proteinHintCode: option.cell("proteinHintCode"),
          cookingStyleCodes: readList(option.cell("cookingStyleCodes")),
          dishRoleCodes: readList(option.cell("dishRoleCodes")),
          components: (componentsByOption.get(code) ?? []).map((row) => ({
            recipeCode: row.cell("recipeCode"),
            recipeVersionNumber: readInteger(row.cell("recipeVersionNumber")),
            quantityMultiplier: row.cell("quantityMultiplier"),
            mealRole: row.cell("mealRole"),
            order: readInteger(row.cell("order"))
          }))
        }
      }
    })
  }

  return { pack, errors: [] }
}
