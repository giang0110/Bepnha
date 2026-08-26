import type { MealOptionVersionInput } from "@/domain/meal-option/meal-option"

const gramConversion = {
  unitId: "unit-g",
  unitCode: "g",
  sourceDimension: "mass",
  sourceToDimensionBase: "1",
  foodBaseUnitId: "unit-g",
  foodBaseDimension: "mass",
  foodBaseUnitToDimensionBase: "1",
  baseQuantityPerUnit: "1",
  grossGramsPerUnit: "1",
  displayStep: "5"
} as const

export const mealOptionRecipeFixture = {
  recipeId: "recipe-main",
  recipeVersionId: "recipe-main-v1",
  yieldAdultEquivalent: "4",
  activeMinutes: 20,
  elapsedMinutes: 45,
  ingredients: [
    {
      recipeIngredientId: "ingredient-main",
      foodId: "food-main",
      foodFactVersionId: "fact-main-v1",
      quantity: "400",
      order: 1,
      conversion: gramConversion
    }
  ],
  steps: [
    {
      order: 1,
      instructionVi: "Nấu chín.",
      timerMinutes: 20,
      ingredientIds: ["ingredient-main"]
    }
  ]
} as const

export const mealOptionFixture: MealOptionVersionInput = {
  mealOptionId: "meal-option-1",
  mealOptionVersionId: "meal-option-1-v1",
  versionNumber: 1,
  contentHash: "a".repeat(64),
  status: "published",
  yieldAdultEquivalent: "4",
  activeMinutes: 25,
  elapsedMinutes: 30,
  components: [
    {
      mealOptionRecipeId: "component-main",
      recipeId: "recipe-main",
      recipeVersionId: "recipe-main-v1",
      recipeVersionNumber: 1,
      recipeContentHash: "b".repeat(64),
      recipeStatus: "published",
      quantityMultiplier: "1",
      mealRole: "main",
      sortOrder: 1,
      recipe: mealOptionRecipeFixture
    }
  ],
  tags: [
    { tagId: "tag-protein", code: "chicken", kind: "protein_hint" },
    { tagId: "tag-style", code: "braised", kind: "cooking_style" }
  ]
}
