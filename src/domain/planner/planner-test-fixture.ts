import type { PlannerCandidateInput, PlannerInputV1 } from "./planner-input"

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
]

export function plannerCandidate(id = "option-v1"): PlannerCandidateInput {
  const stableId = id.replace("-v1", "")
  return {
    identityStatus: "published",
    mealOptionCode: stableId,
    mealOptionNameVi: `Bữa ăn ${stableId}`,
    mealOptionContentHash: "a".repeat(64),
    priceBookStatus: "published",
    priceBookContentHash: "b".repeat(64),
    mealOption: {
      mealOptionId: stableId,
      mealOptionVersionId: id,
      versionNumber: 1,
      contentHash: "a".repeat(64),
      status: "published",
      yieldAdultEquivalent: "2",
      activeMinutes: 15,
      elapsedMinutes: 25,
      components: [
        {
          mealOptionRecipeId: `${id}-component`,
          recipeId: `${id}-recipe`,
          recipeVersionId: `${id}-recipe-v1`,
          recipeVersionNumber: 1,
          recipeContentHash: "c".repeat(64),
          recipeStatus: "published",
          quantityMultiplier: "1",
          mealRole: "main",
          sortOrder: 1,
          recipe: {
            recipeId: `${id}-recipe`,
            recipeVersionId: `${id}-recipe-v1`,
            yieldAdultEquivalent: "2",
            activeMinutes: 10,
            elapsedMinutes: 120,
            ingredients: [
              {
                recipeIngredientId: `${id}-ingredient`,
                foodId: `${id}-food`,
                foodFactVersionId: `${id}-fact-v1`,
                quantity: "400",
                order: 1,
                conversion: {
                  unitId: "unit-g",
                  unitCode: "g",
                  sourceDimension: "mass",
                  sourceToDimensionBase: "1",
                  foodBaseUnitId: "unit-g",
                  foodBaseDimension: "mass",
                  foodBaseUnitToDimensionBase: "1",
                  baseQuantityPerUnit: "1",
                  grossGramsPerUnit: "1",
                  displayStep: "1"
                }
              }
            ],
            steps: [
              {
                order: 1,
                instructionVi: "Nấu chín.",
                timerMinutes: 10,
                ingredientIds: [`${id}-ingredient`]
              }
            ]
          }
        }
      ],
      tags: [
        { tagId: `${id}-protein`, code: "poultry", kind: "protein_hint" },
        { tagId: `${id}-style`, code: "boil", kind: "cooking_style" }
      ]
    },
    ingredientLineage: [
      {
        mealOptionRecipeId: `${id}-component`,
        recipeIngredientId: `${id}-ingredient`,
        foodId: `${id}-food`,
        foodFactVersionId: `${id}-fact-v1`,
        foodFactContentHash: "d".repeat(64),
        foodFactStatus: "published",
        edibleFraction: "1",
        baseUnitId: "unit-g",
        baseDimension: "mass",
        allergenAssessments: allergenCodes.map((allergenCode) => ({
          allergenCode,
          status: "absent" as const
        })),
        categoryAncestry: ["poultry"],
        dietaryTagCodes: [],
        nutrients: [
          "energy_kcal",
          "protein_g",
          "carbohydrate_g",
          "fat_g",
          "fibre_g",
          "sodium_mg"
        ].map((nutrientCode) => ({ nutrientCode, amountPer100g: "1" }))
      }
    ],
    prices: [
      {
        foodPriceId: `${id}-price`,
        priceBookId: "book-v1",
        foodId: `${id}-food`,
        foodFactVersionId: `${id}-fact-v1`,
        packageBaseQuantity: "500",
        baseUnitId: "unit-g",
        packagePriceVnd: 50_000,
        purchaseIncrement: "1",
        observedAt: "2026-07-01"
      }
    ]
  }
}

export function plannerInput(
  candidates: readonly PlannerCandidateInput[] = [plannerCandidate()]
): PlannerInputV1 {
  return {
    householdId: "household-1",
    householdSetupVersion: 1,
    weekStart: "2026-08-31",
    timezone: "Asia/Ho_Chi_Minh",
    calculationDate: "2026-08-26",
    weeklyPlanBudgetVnd: 700_000,
    maxElapsedMinutes: 30,
    memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 2 }],
    hardRuleCodes: [],
    softPreferenceCodes: [],
    pantrySnapshot: { version: "pantry-snapshot-v1", items: [] },
    candidates
  }
}
