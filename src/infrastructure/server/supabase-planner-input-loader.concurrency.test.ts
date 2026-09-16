import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, test } from "vitest"

import { normalizePlannerInput } from "@/domain/planner/normalize-planner-input"
import { PLANNER_CONFIG_V1 } from "@/domain/planner/planner-config"
import type { Database } from "@/infrastructure/supabase/database.types"

import { createSupabasePlannerInputLoader } from "./supabase-planner-input-loader"

interface FixtureOptions {
  readonly mealOptionVersionIds: readonly string[]
  readonly componentsPerOption?: number
  readonly mealOptionDelayMs?: (mealOptionVersionId: string) => number
  readonly recipeDelayMs?: (recipeVersionId: string) => number
}

interface Trace {
  readonly hydratedMealOptionVersionIds: string[]
  maxConcurrentMealOptionCalls: number
  maxConcurrentRecipeCalls: number
}

async function delay(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function recipeVersionIdFor(mealOptionVersionId: string, index: number): string {
  return `${mealOptionVersionId}-recipe-${index}-v1`
}

function mealOptionAggregate(mealOptionVersionId: string, componentCount: number) {
  return {
    mealOption: {
      mealOptionId: mealOptionVersionId.replace("-v1", ""),
      code: mealOptionVersionId.replace("-v1", ""),
      nameVi: `Bữa ăn ${mealOptionVersionId}`
    },
    version: {
      mealOptionVersionId,
      versionNumber: 1,
      yieldAdultEquivalent: "2",
      activeMinutes: 15,
      elapsedMinutes: 25,
      contentHash: "a".repeat(64)
    },
    components: Array.from({ length: componentCount }, (_unused, index) => ({
      mealOptionRecipeId: `${mealOptionVersionId}-component-${index}`,
      recipeId: `${mealOptionVersionId}-recipe-${index}`,
      recipeVersionId: recipeVersionIdFor(mealOptionVersionId, index),
      recipeVersionNumber: 1,
      recipeContentHash: "c".repeat(64),
      quantityMultiplier: "1",
      mealRole: "main",
      sortOrder: index + 1
    })),
    tags: []
  }
}

function recipeCalculationInput(recipeVersionId: string) {
  return {
    recipe: {
      recipeId: recipeVersionId.replace("-v1", ""),
      recipeVersionId,
      yieldAdultEquivalent: "2",
      activeMinutes: 10,
      elapsedMinutes: 20,
      ingredients: [
        {
          recipeIngredientId: `${recipeVersionId}-ingredient`,
          order: 1,
          quantity: "400",
          unitId: "unit-g",
          food: {
            foodId: `${recipeVersionId}-food`,
            baseUnitId: "unit-g",
            baseDimension: "mass"
          },
          fact: {
            foodFactVersionId: `${recipeVersionId}-fact`,
            contentHash: "d".repeat(64),
            edibleFraction: "1",
            conversion: {
              baseQuantityPerUnit: "1",
              grossGramsPerUnit: "1",
              displayStep: "1"
            },
            nutrients: [],
            allergenAssessments: [],
            categoryAncestry: ["protein"],
            dietaryTagCodes: []
          }
        }
      ]
    },
    priceBook: {
      priceBookId: "book-v1",
      contentHash: "b".repeat(64),
      prices: [
        {
          foodPriceId: `${recipeVersionId}-price`,
          priceBookId: "book-v1",
          foodId: `${recipeVersionId}-food`,
          foodFactVersionId: `${recipeVersionId}-fact`,
          baseUnitId: "unit-g",
          packageBaseQuantity: "100",
          packagePriceVnd: 10_000,
          purchaseIncrement: "1",
          observedAt: "2026-08-20"
        }
      ]
    }
  }
}

function fixtureClient(options: FixtureOptions) {
  const componentCount = options.componentsPerOption ?? 1
  const trace: Trace = {
    hydratedMealOptionVersionIds: [],
    maxConcurrentMealOptionCalls: 0,
    maxConcurrentRecipeCalls: 0
  }
  let inFlightMealOptionCalls = 0
  let inFlightRecipeCalls = 0

  const rpc = async (name: string, args: Record<string, unknown>) => {
    if (name === "get_pantry") return { data: [], error: null }

    if (name === "get_published_meal_option_calculation_input") {
      const mealOptionVersionId = String(args.p_meal_option_version_id)
      trace.hydratedMealOptionVersionIds.push(mealOptionVersionId)
      inFlightMealOptionCalls += 1
      trace.maxConcurrentMealOptionCalls = Math.max(
        trace.maxConcurrentMealOptionCalls,
        inFlightMealOptionCalls
      )
      try {
        await delay(options.mealOptionDelayMs?.(mealOptionVersionId) ?? 0)
        return { data: mealOptionAggregate(mealOptionVersionId, componentCount), error: null }
      } finally {
        inFlightMealOptionCalls -= 1
      }
    }

    const recipeVersionId = String(args.p_recipe_version_id)
    inFlightRecipeCalls += 1
    trace.maxConcurrentRecipeCalls = Math.max(trace.maxConcurrentRecipeCalls, inFlightRecipeCalls)
    try {
      await delay(options.recipeDelayMs?.(recipeVersionId) ?? 0)
      return { data: recipeCalculationInput(recipeVersionId), error: null }
    } finally {
      inFlightRecipeCalls -= 1
    }
  }

  const from = (table: string) => {
    if (table === "units") {
      return {
        select: () =>
          Promise.resolve({
            data: [{ id: "unit-g", code: "g", dimension: "mass", to_dimension_base: 1 }],
            error: null
          })
      }
    }
    if (
      table === "foods" ||
      table === "food_fact_versions" ||
      table === "food_fact_unit_conversions"
    ) {
      return { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }
    }
    const data =
      table === "recipe_steps"
        ? [{ id: "step-1", sort_order: 1, instruction_vi: "Nấu chín.", timer_minutes: 10 }]
        : []
    return {
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data, error: null }) }) })
    }
  }

  return { client: { rpc, from } as unknown as SupabaseClient<Database>, trace }
}

function generationRaw(mealOptionVersionIds: readonly string[]) {
  return {
    household: {
      id: "household-1",
      version: 3,
      timezone: "Asia/Ho_Chi_Minh",
      weekly_plan_budget_vnd: 700_000,
      max_elapsed_minutes: 30
    },
    memberGroups: [{ member_kind: "adult", age_band: "adult", member_count: 2 }],
    foodRules: [],
    weekStart: "2026-08-31",
    calculationDate: "2026-08-26",
    mealOptionVersionIds,
    priceBook: { priceBookId: "book-v1" }
  }
}

describe("Supabase planner input loader fan-out", () => {
  test("hydrates meal options concurrently instead of one round trip at a time", async () => {
    const mealOptionVersionIds = Array.from({ length: 6 }, (_unused, index) => `option-${index}-v1`)
    const { client, trace } = fixtureClient({ mealOptionVersionIds, mealOptionDelayMs: () => 5 })

    await createSupabasePlannerInputLoader(client).hydrateGeneration(
      generationRaw(mealOptionVersionIds),
      client as never
    )

    expect(trace.maxConcurrentMealOptionCalls).toBeGreaterThan(1)
  })

  test("keeps candidate order stable when later meal options resolve first", async () => {
    const mealOptionVersionIds = ["option-0-v1", "option-1-v1", "option-2-v1", "option-3-v1"]
    const { client } = fixtureClient({
      mealOptionVersionIds,
      // Invert completion order relative to request order.
      mealOptionDelayMs: (id) =>
        (mealOptionVersionIds.length - mealOptionVersionIds.indexOf(id)) * 5
    })

    const result = await createSupabasePlannerInputLoader(client).hydrateGeneration(
      generationRaw(mealOptionVersionIds),
      client as never
    )

    expect(result.candidates.map((item) => item.mealOption.mealOptionVersionId)).toEqual(
      mealOptionVersionIds
    )
  })

  test("merges concurrently loaded components in exact source order", async () => {
    const mealOptionVersionId = "option-0-v1"
    const { client, trace } = fixtureClient({
      mealOptionVersionIds: [mealOptionVersionId],
      componentsPerOption: 3,
      // Invert completion order relative to component order.
      recipeDelayMs: (recipeVersionId) => (recipeVersionId.includes("-0-") ? 15 : 5)
    })

    const result = await createSupabasePlannerInputLoader(client).hydrateGeneration(
      generationRaw([mealOptionVersionId]),
      client as never
    )
    const candidate = result.candidates[0]
    if (candidate === undefined) throw new Error("missing candidate")

    expect(trace.maxConcurrentRecipeCalls).toBeGreaterThan(1)
    expect(candidate.mealOption.components.map((item) => item.mealOptionRecipeId)).toEqual([
      `${mealOptionVersionId}-component-0`,
      `${mealOptionVersionId}-component-1`,
      `${mealOptionVersionId}-component-2`
    ])
    expect(candidate.ingredientLineage.map((item) => item.foodId)).toEqual([
      `${recipeVersionIdFor(mealOptionVersionId, 0)}-food`,
      `${recipeVersionIdFor(mealOptionVersionId, 1)}-food`,
      `${recipeVersionIdFor(mealOptionVersionId, 2)}-food`
    ])
    expect(candidate.prices.map((item) => item.foodPriceId)).toEqual([
      `${recipeVersionIdFor(mealOptionVersionId, 0)}-price`,
      `${recipeVersionIdFor(mealOptionVersionId, 1)}-price`,
      `${recipeVersionIdFor(mealOptionVersionId, 2)}-price`
    ])
  })

  test("bounds hydration past the domain candidate limit and still fails closed", async () => {
    const mealOptionVersionIds = Array.from(
      { length: PLANNER_CONFIG_V1.candidateLimit + 25 },
      (_unused, index) => `option-${String(index).padStart(4, "0")}-v1`
    )
    const { client, trace } = fixtureClient({ mealOptionVersionIds })

    const result = await createSupabasePlannerInputLoader(client).hydrateGeneration(
      generationRaw(mealOptionVersionIds),
      client as never
    )

    expect(trace.hydratedMealOptionVersionIds).toHaveLength(PLANNER_CONFIG_V1.candidateLimit + 1)
    expect(normalizePlannerInput(result)).toEqual({
      ok: false,
      error: { code: "CATALOG_CANDIDATE_LIMIT_EXCEEDED" }
    })
  })
})
