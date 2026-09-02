import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, test, vi } from "vitest"

import { plannerCandidate } from "@/domain/planner/planner-test-fixture"
import type { Database } from "@/infrastructure/supabase/database.types"

import {
  createSupabasePlannerInputLoader,
  readHistoricalPlannerPriceBookId
} from "./supabase-planner-input-loader"

interface PantryFixture {
  readonly rows: readonly Record<string, unknown>[]
  readonly foods: readonly {
    id: string
    base_unit_id: string
    base_dimension: "mass" | "volume" | "count"
  }[]
  readonly facts: readonly { id: string; food_id: string }[]
  readonly conversions: readonly {
    food_fact_version_id: string
    unit_id: string
    base_quantity_per_unit: number
  }[]
}

const emptyPantry: PantryFixture = {
  rows: [],
  foods: [],
  facts: [],
  conversions: []
}

function fixtureClient(
  baseDimension: "mass" | "volume" = "mass",
  pantry: PantryFixture = emptyPantry
) {
  const source = plannerCandidate("option-v1")
  const component = source.mealOption.components[0]
  const ingredient = component?.recipe.ingredients[0]
  const lineage = source.ingredientLineage[0]
  const price = source.prices[0]
  if (
    component === undefined ||
    ingredient === undefined ||
    lineage === undefined ||
    price === undefined
  ) {
    throw new Error("invalid fixture")
  }
  const rpc = vi.fn((name: string) => {
    if (name === "get_pantry") {
      return Promise.resolve({ data: pantry.rows, error: null })
    }
    if (name === "get_published_meal_option_calculation_input") {
      return Promise.resolve({
        data: {
          mealOption: {
            mealOptionId: source.mealOption.mealOptionId,
            code: source.mealOptionCode,
            nameVi: source.mealOptionNameVi
          },
          version: {
            mealOptionVersionId: source.mealOption.mealOptionVersionId,
            versionNumber: 1,
            yieldAdultEquivalent: "2",
            activeMinutes: 15,
            elapsedMinutes: 25,
            contentHash: source.mealOptionContentHash
          },
          components: [
            {
              mealOptionRecipeId: component.mealOptionRecipeId,
              recipeId: component.recipeId,
              recipeVersionId: component.recipeVersionId,
              recipeVersionNumber: 1,
              recipeContentHash: component.recipeContentHash,
              quantityMultiplier: "1",
              mealRole: "main",
              sortOrder: 1
            }
          ],
          tags: source.mealOption.tags
        },
        error: null
      })
    }
    return Promise.resolve({
      data: {
        recipe: {
          recipeId: component.recipeId,
          recipeVersionId: component.recipeVersionId,
          yieldAdultEquivalent: "2",
          activeMinutes: 10,
          elapsedMinutes: 20,
          ingredients: [
            {
              recipeIngredientId: ingredient.recipeIngredientId,
              order: 1,
              quantity: "400",
              unitId: "unit-g",
              food: {
                foodId: ingredient.foodId,
                baseUnitId: "unit-g",
                baseDimension
              },
              fact: {
                foodFactVersionId: ingredient.foodFactVersionId,
                contentHash: lineage.foodFactContentHash,
                edibleFraction: "1",
                conversion: {
                  baseQuantityPerUnit: "1",
                  grossGramsPerUnit: "1",
                  displayStep: "1"
                },
                nutrients: lineage.nutrients,
                allergenAssessments: lineage.allergenAssessments,
                categoryAncestry: lineage.categoryAncestry,
                dietaryTagCodes: lineage.dietaryTagCodes
              }
            }
          ]
        },
        priceBook: {
          priceBookId: price.priceBookId,
          contentHash: source.priceBookContentHash,
          prices: [price]
        }
      },
      error: null
    })
  })
  const from = vi.fn((table: string) => {
    if (table === "units") {
      return {
        select: vi.fn(() =>
          Promise.resolve({
            data: [{ id: "unit-g", code: "g", dimension: "mass", to_dimension_base: 1 }],
            error: null
          })
        )
      }
    }
    if (
      table === "foods" ||
      table === "food_fact_versions" ||
      table === "food_fact_unit_conversions"
    ) {
      const data =
        table === "foods"
          ? pantry.foods
          : table === "food_fact_versions"
            ? pantry.facts
            : pantry.conversions
      return {
        select: vi.fn(() => ({
          in: vi.fn(() => Promise.resolve({ data, error: null }))
        }))
      }
    }
    const data =
      table === "recipe_steps"
        ? [{ id: "step-1", sort_order: 1, instruction_vi: "Nấu chín.", timer_minutes: 10 }]
        : [
            {
              recipe_step_id: "step-1",
              recipe_ingredient_id: ingredient.recipeIngredientId,
              reference_order: 1
            }
          ]
    const order = vi.fn(() => Promise.resolve({ data, error: null }))
    const eq = vi.fn(() => ({ order }))
    return { select: vi.fn(() => ({ eq })) }
  })
  return {
    client: { rpc, from } as unknown as SupabaseClient<Database>,
    source
  }
}

function generationRaw(mealOptionVersionId: string) {
  return {
    household: {
      id: "household-1",
      version: 3,
      timezone: "Asia/Ho_Chi_Minh",
      weekly_plan_budget_vnd: 700_000,
      max_elapsed_minutes: 30
    },
    memberGroups: [{ member_kind: "adult", age_band: "adult", member_count: 2 }],
    foodRules: ["exclude_pork", "prefer_fish"],
    weekStart: "2026-08-31",
    calculationDate: "2026-08-26",
    mealOptionVersionIds: [mealOptionVersionId],
    priceBook: { priceBookId: "book-v1" }
  }
}

describe("Supabase planner input loader", () => {
  test("pins replacement hydration to the historical exact price book instead of a current pointer", () => {
    expect(
      readHistoricalPlannerPriceBookId({
        input_snapshot: {
          candidateManifest: [
            {
              prices: [
                {
                  priceBookId: "historical-book-id",
                  foodPriceId: "historical-price-id"
                }
              ]
            }
          ]
        },
        currentPriceBookId: "must-not-be-used"
      })
    ).toBe("historical-book-id")
  })

  test("hydrates exact published recipe/fact/price lineage including permanent base dimension", async () => {
    const { client, source } = fixtureClient()
    const loader = createSupabasePlannerInputLoader(client)
    const result = await loader.hydrateGeneration(
      generationRaw(source.mealOption.mealOptionVersionId),
      client as never
    )

    expect(result).toMatchObject({
      householdId: "household-1",
      householdSetupVersion: 3,
      hardRuleCodes: ["exclude_pork"],
      softPreferenceCodes: ["prefer_fish"],
      pantrySnapshot: { version: "pantry-snapshot-v1", items: [] }
    })
    expect(result.candidates[0]).toMatchObject({
      mealOptionNameVi: source.mealOptionNameVi,
      mealOption: {
        components: [{ recipe: { steps: [{ instructionVi: "Nấu chín." }] } }]
      },
      ingredientLineage: [{ edibleFraction: "1", baseUnitId: "unit-g", baseDimension: "mass" }],
      prices: [{ purchaseIncrement: "1" }]
    })
  })

  test("hydrates authoritative pantry with deterministic ordering and exact conversion evidence", async () => {
    const pantry: PantryFixture = {
      rows: [
        {
          id: "pantry-b",
          household_id: "household-1",
          food_id: "food-b",
          food_fact_version_id: "fact-b",
          quantity: 2,
          unit_id: "unit-g",
          base_quantity: 2,
          base_unit_id: "unit-g",
          version: 1
        },
        {
          id: "pantry-a",
          household_id: "household-1",
          food_id: "food-a",
          food_fact_version_id: "fact-a",
          quantity: 0.25,
          unit_id: "unit-kg",
          base_quantity: 250,
          base_unit_id: "unit-g",
          version: 3
        }
      ],
      foods: [
        { id: "food-b", base_unit_id: "unit-g", base_dimension: "mass" },
        { id: "food-a", base_unit_id: "unit-g", base_dimension: "mass" }
      ],
      facts: [
        { id: "fact-b", food_id: "food-b" },
        { id: "fact-a", food_id: "food-a" }
      ],
      conversions: [
        { food_fact_version_id: "fact-b", unit_id: "unit-g", base_quantity_per_unit: 1 },
        { food_fact_version_id: "fact-a", unit_id: "unit-kg", base_quantity_per_unit: 1000 }
      ]
    }
    const { client, source } = fixtureClient("mass", pantry)
    const result = await createSupabasePlannerInputLoader(client).hydrateGeneration(
      generationRaw(source.mealOption.mealOptionVersionId),
      client as never
    )

    expect(result.pantrySnapshot).toEqual({
      version: "pantry-snapshot-v1",
      items: [
        {
          pantryItemId: "pantry-a",
          foodId: "food-a",
          foodFactVersionId: "fact-a",
          quantity: "0.25",
          unitId: "unit-kg",
          baseQuantity: "250",
          baseUnitId: "unit-g",
          baseDimension: "mass",
          version: 3
        },
        {
          pantryItemId: "pantry-b",
          foodId: "food-b",
          foodFactVersionId: "fact-b",
          quantity: "2",
          unitId: "unit-g",
          baseQuantity: "2",
          baseUnitId: "unit-g",
          baseDimension: "mass",
          version: 1
        }
      ]
    })
  })

  test("rejects malformed pantry conversion evidence instead of silently trusting stored base quantity", async () => {
    const pantry: PantryFixture = {
      rows: [
        {
          id: "pantry-a",
          household_id: "household-1",
          food_id: "food-a",
          food_fact_version_id: "fact-a",
          quantity: 0.25,
          unit_id: "unit-kg",
          base_quantity: 251,
          base_unit_id: "unit-g",
          version: 1
        }
      ],
      foods: [{ id: "food-a", base_unit_id: "unit-g", base_dimension: "mass" }],
      facts: [{ id: "fact-a", food_id: "food-a" }],
      conversions: [
        { food_fact_version_id: "fact-a", unit_id: "unit-kg", base_quantity_per_unit: 1000 }
      ]
    }
    const { client, source } = fixtureClient("mass", pantry)

    await expect(
      createSupabasePlannerInputLoader(client).hydrateGeneration(
        generationRaw(source.mealOption.mealOptionVersionId),
        client as never
      )
    ).rejects.toThrow("INVALID_PANTRY_DATA")
  })

  test("rejects catalog lineage when declared food base dimension disagrees with its permanent base unit", async () => {
    const { client, source } = fixtureClient("volume")
    const loader = createSupabasePlannerInputLoader(client)
    await expect(
      loader.hydrateGeneration(
        generationRaw(source.mealOption.mealOptionVersionId),
        client as never
      )
    ).rejects.toThrow("INCOMPLETE_UNIT_LINEAGE")
  })
})
