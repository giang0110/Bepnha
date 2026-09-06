import type { CatalogPackV1 } from "./catalog-pack-types.ts"
import type { CatalogProductionSnapshot, ProductionRecipeTagRow } from "./catalog-production-types.ts"

const id = (group: number, index: number): string =>
  `900${group}0000-0000-0000-0000-${String(index).padStart(12, "0")}`

const unitRows = [
  { code: "g", dimension: "mass" as const },
  { code: "kg", dimension: "mass" as const },
  { code: "ml", dimension: "volume" as const },
  { code: "l", dimension: "volume" as const },
  { code: "tsp", dimension: "volume" as const },
  { code: "tbsp", dimension: "volume" as const },
  { code: "item", dimension: "count" as const }
]

const categoryRows = [
  { code: "food", parentCode: null },
  { code: "pork", parentCode: "food" },
  { code: "beef", parentCode: "food" },
  { code: "poultry", parentCode: "food" },
  { code: "seafood", parentCode: "food" },
  { code: "fish", parentCode: "seafood" },
  { code: "crustacean", parentCode: "seafood" },
  { code: "mollusc", parentCode: "seafood" },
  { code: "egg", parentCode: "food" },
  { code: "dairy", parentCode: "food" },
  { code: "tofu", parentCode: "food" },
  { code: "vegetable", parentCode: "food" },
  { code: "staple", parentCode: "food" },
  { code: "seasoning", parentCode: "food" }
] as const

const allergenCodes = [
  "peanut",
  "tree_nut",
  "dairy",
  "egg",
  "soy",
  "wheat",
  "fish",
  "crustacean",
  "mollusc",
  "sesame"
] as const

const nutrientCodes = [
  "energy_kcal",
  "protein_g",
  "carbohydrate_g",
  "fat_g",
  "fibre_g",
  "sodium_mg"
] as const

function recipeTagsFor(pack: CatalogPackV1): ProductionRecipeTagRow[] {
  const tags = new Map<string, ProductionRecipeTagRow>()
  let index = 1
  const add = (
    code: string,
    tagKind: ProductionRecipeTagRow["tagKind"]
  ): void => {
    if (tags.has(code)) return
    tags.set(code, { id: id(7, index), code, tagKind })
    index += 1
  }

  for (const meal of pack.mealOptions) {
    add(`protein_${meal.version.proteinHintCode}`, "protein_hint")
    for (const code of meal.version.cookingStyleCodes) add(`style_${code}`, "cooking_style")
    for (const code of meal.version.dishRoleCodes) add(`role_${code}`, "dish_role")
  }

  for (const recipe of pack.recipes) {
    for (const code of recipe.version.tagCodes) {
      if (code === "main" || code === "staple" || code === "vegetable" || code === "soup" || code === "side") {
        add(`role_${code}`, "dish_role")
      }
    }
  }

  return [...tags.values()]
}

export function buildResolvableProductionSnapshot(pack: CatalogPackV1): CatalogProductionSnapshot {
  const categoryIdByCode = new Map(
    categoryRows.map((row, index) => [row.code, id(2, index + 1)] as const)
  )

  return {
    units: unitRows.map((row, index) => ({ id: id(1, index + 1), ...row })),
    categories: categoryRows.map((row) => ({
      id: categoryIdByCode.get(row.code)!,
      code: row.code,
      parentId: row.parentCode === null ? null : categoryIdByCode.get(row.parentCode)!
    })),
    allergens: allergenCodes.map((code, index) => ({ id: id(3, index + 1), code })),
    dietaryTags: pack.foods.some((food) => food.fact.dietaryTagCodes.includes("vegetarian"))
      ? [{ id: id(4, 1), code: "vegetarian" }]
      : [],
    nutrients: nutrientCodes.map((code, index) => ({
      id: id(5, index + 1),
      code,
      requiredForPublication: true
    })),
    priceRegions: [
      { id: id(6, 1), code: "vn_baseline", isLaunchDefault: true }
    ],
    recipeTags: recipeTagsFor(pack),
    foods: [],
    foodFactVersions: [],
    recipes: [],
    recipeVersions: [],
    priceBooks: [],
    mealOptions: [],
    mealOptionVersions: []
  }
}
