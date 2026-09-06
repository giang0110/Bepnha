import {
  LAUNCH_ALLERGEN_CODES,
  LAUNCH_REQUIRED_NUTRIENT_CODES,
  type CatalogPackFood,
  type CatalogPackRecipe,
  type CatalogPackV1
} from "./catalog-pack-types.ts"

type Mutable<T> = T extends readonly (infer U)[]
  ? Mutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : T

export type MutableCatalogPackV1 = Mutable<CatalogPackV1>

const SYNTHETIC = "Synthetic Phase 9A test data"

const nutrientValues: Readonly<Record<(typeof LAUNCH_REQUIRED_NUTRIENT_CODES)[number], string>> = {
  energy_kcal: "100",
  protein_g: "10",
  carbohydrate_g: "5",
  fat_g: "4",
  fibre_g: "2",
  sodium_mg: "50"
}

function buildFood(
  code: string,
  nameVi: string,
  categoryCode: string,
  categoryAncestry: readonly string[],
  containedAllergen: string | null,
  vegetarian: boolean
): Mutable<CatalogPackFood> {
  return {
    code,
    nameVi,
    baseDimension: "mass",
    baseUnitCode: "g",
    fact: {
      versionNumber: 1,
      categoryCode,
      categoryAncestry: [...categoryAncestry],
      edibleFraction: "1",
      provenance: SYNTHETIC,
      allergenAssessments: LAUNCH_ALLERGEN_CODES.map((allergenCode) => ({
        allergenCode,
        status: allergenCode === containedAllergen ? "contains" : "absent",
        provenance: SYNTHETIC
      })),
      nutrients: LAUNCH_REQUIRED_NUTRIENT_CODES.map((nutrientCode) => ({
        nutrientCode,
        amountPer100g: nutrientValues[nutrientCode],
        provenance: SYNTHETIC
      })),
      dietaryTagCodes: vegetarian ? ["vegetarian"] : [],
      conversions: [
        {
          unitCode: "g",
          baseQuantityPerUnit: "1",
          grossGramsPerUnit: "1",
          displayStep: "5",
          provenance: SYNTHETIC
        }
      ]
    }
  }
}

function buildRecipe(code: string, nameVi: string, foodCode: string): Mutable<CatalogPackRecipe> {
  const ingredientCode = `${code}_ingredient`
  return {
    code,
    nameVi,
    version: {
      versionNumber: 1,
      yieldAdultEquivalent: "1",
      activeMinutes: 10,
      elapsedMinutes: 20,
      ingredients: [
        {
          ingredientCode,
          foodCode,
          foodFactVersionNumber: 1,
          quantity: "100",
          unitCode: "g",
          preparationNoteVi: SYNTHETIC,
          order: 1
        }
      ],
      steps: [
        {
          order: 1,
          instructionVi: `${SYNTHETIC}: prepare ${foodCode}`,
          timerMinutes: 10,
          ingredientCodes: [ingredientCode]
        }
      ],
      tagCodes: ["main"]
    }
  }
}

export function buildReadyCatalogPack(): MutableCatalogPackV1 {
  const foods = [
    buildFood("test_tofu", "Đậu hũ kiểm thử", "tofu", ["tofu", "food"], "soy", true),
    buildFood("test_chicken", "Gà kiểm thử", "poultry", ["poultry", "food"], null, false),
    buildFood("test_fish", "Cá kiểm thử", "fish", ["fish", "seafood", "food"], "fish", false)
  ]

  const recipes = [
    buildRecipe("test_tofu_recipe", "Món đậu hũ kiểm thử", "test_tofu"),
    buildRecipe("test_chicken_recipe", "Món gà kiểm thử", "test_chicken"),
    buildRecipe("test_fish_recipe", "Món cá kiểm thử", "test_fish")
  ]

  const prices = foods.map((food) => ({
    foodCode: food.code,
    foodFactVersionNumber: 1,
    packageQuantity: "1",
    packageUnitCode: "g",
    packageBaseQuantity: "1",
    baseUnitCode: "g",
    packagePriceVnd: 10000,
    purchaseIncrement: "1",
    observedAt: "2026-09-06",
    sourceReference: SYNTHETIC
  }))

  const mealOptions = Array.from({ length: 21 }, (_, index) => {
    const slot = index % 3
    const recipeCode =
      slot === 0 ? "test_tofu_recipe" : slot === 1 ? "test_chicken_recipe" : "test_fish_recipe"
    const proteinHintCode = slot === 0 ? "plant" : slot === 1 ? "poultry" : "fish"
    return {
      code: `test_meal_${String(index + 1).padStart(2, "0")}`,
      nameVi: `Bữa kiểm thử ${index + 1}`,
      version: {
        versionNumber: 1,
        yieldAdultEquivalent: "1",
        activeMinutes: 10,
        elapsedMinutes: 20,
        proteinHintCode,
        cookingStyleCodes: ["boil"],
        dishRoleCodes: ["main"],
        components: [
          {
            recipeCode,
            recipeVersionNumber: 1,
            quantityMultiplier: "1",
            mealRole: "main" as const,
            order: 1
          }
        ]
      }
    }
  })

  return {
    schemaVersion: "1",
    catalogCode: "launch_v1",
    preparedAt: "2026-09-06T00:00:00Z",
    source: { name: "Synthetic catalog team", provenance: SYNTHETIC },
    foods,
    recipes,
    priceBook: {
      regionCode: "vn_baseline",
      versionNumber: 1,
      effectiveFrom: "2026-09-06",
      effectiveTo: null,
      prices
    },
    mealOptions
  }
}
