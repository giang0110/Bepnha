import type { SupabaseClient } from "@supabase/supabase-js"
import { expect, test, vi } from "vitest"

import { plannerCandidate } from "@/domain/planner/planner-test-fixture"
import type { Database } from "@/infrastructure/supabase/database.types"

import { createSupabasePlannerInputLoader } from "./supabase-planner-input-loader"

test("keeps only prices for foods actually used by the meal-option candidate", async () => {
  const source = plannerCandidate("option-v1")
  const component = source.mealOption.components[0]
  const ingredient = component?.recipe.ingredients[0]
  const lineage = source.ingredientLineage[0]
  const matchingPrice = source.prices[0]
  if (
    component === undefined ||
    ingredient === undefined ||
    lineage === undefined ||
    matchingPrice === undefined
  ) {
    throw new Error("invalid fixture")
  }
  const unrelatedPrice = {
    ...matchingPrice,
    foodPriceId: "unrelated-price",
    foodId: "unrelated-food",
    foodFactVersionId: "unrelated-fact"
  }

  const rpc = vi.fn((name: string) => {
    if (name === "get_pantry") return Promise.resolve({ data: [], error: null })
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
                baseDimension: "mass"
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
          priceBookId: matchingPrice.priceBookId,
          contentHash: source.priceBookContentHash,
          prices: [unrelatedPrice, matchingPrice]
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
      return {
        select: vi.fn(() => ({
          in: vi.fn(() => Promise.resolve({ data: [], error: null }))
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

  const client = { rpc, from } as unknown as SupabaseClient<Database>
  const result = await createSupabasePlannerInputLoader(client).hydrateGeneration(
    {
      household: {
        id: "household-1",
        version: 1,
        timezone: "Asia/Ho_Chi_Minh",
        weekly_plan_budget_vnd: 700_000,
        max_elapsed_minutes: 30
      },
      memberGroups: [{ member_kind: "adult", age_band: "adult", member_count: 2 }],
      foodRules: [],
      weekStart: "2026-08-31",
      calculationDate: "2026-08-26",
      mealOptionVersionIds: [source.mealOption.mealOptionVersionId],
      priceBook: { priceBookId: matchingPrice.priceBookId }
    },
    client as never
  )

  expect(result.candidates[0]?.prices).toEqual([matchingPrice])
})
