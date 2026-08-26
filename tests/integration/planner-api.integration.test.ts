import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { beforeAll, describe, expect, test } from "vitest"

import type { CatalogAdminCommand } from "@/application/catalog/catalog-admin-command.js"
import { executeCatalogAdminCommand } from "@/application/catalog/execute-catalog-admin-command.js"
import {
  executeMealOptionAdminCommand,
  type MealOptionAdminCommand
} from "@/application/meal-option/execute-meal-option-admin-command.js"
import { NodeContentHasher } from "@/infrastructure/server/node-content-hasher.js"
import { createPlannerHttpHandlers } from "@/infrastructure/server/planner-http.js"
import { createSupabaseCatalogAdminRepository } from "@/infrastructure/server/supabase-catalog-admin-repository.js"
import { createSupabaseMealOptionAdminRepository } from "@/infrastructure/server/supabase-meal-option-admin-repository.js"
import { createSupabasePlannerInputLoader } from "@/infrastructure/server/supabase-planner-input-loader.js"
import {
  createSupabasePlannerRepository,
  type PlannerRpcClient
} from "@/infrastructure/server/supabase-planner-repository.js"
import type { Database } from "@/infrastructure/supabase/database.types.js"
import { createServerAuthVerifier } from "@/infrastructure/supabase/server-auth.js"
import { createSupabaseHouseholdRepository } from "@/infrastructure/supabase/supabase-household-repository.js"

const calculationDate = "2026-08-26"
const weekStart = "2026-08-31"
const hasher = new NodeContentHasher()

let url: string
let publishableKey: string
let secretKey: string
let publicClient: SupabaseClient<Database>
let secretClient: SupabaseClient<Database>
let userClient: SupabaseClient<Database>
let userId: string
let token: string
let householdId: string
let mealOptionIds: string[]
let fixtureFoodId: string
let fixtureFactId: string
let fixturePriceBookVersion: number

function rpcClient(client: SupabaseClient<Database>): PlannerRpcClient {
  return {
    rpc(name, args) {
      return client.rpc(name as keyof Database["public"]["Functions"], args as never) as never
    }
  }
}

async function catalog(command: CatalogAdminCommand) {
  const result = await executeCatalogAdminCommand(
    createSupabaseCatalogAdminRepository(secretClient, userId),
    hasher,
    command
  )
  if (!result.ok) throw new Error(`Catalog fixture failed: ${result.reason}`)
  return result.value
}

async function mealOption(command: MealOptionAdminCommand) {
  const result = await executeMealOptionAdminCommand(
    createSupabaseMealOptionAdminRepository(secretClient, userId),
    hasher,
    command
  )
  if (!result.ok) throw new Error(`Meal-option fixture failed: ${result.reason}`)
  return result.value
}

function responseDouble() {
  const state = { body: undefined as unknown, statusCode: 0 }
  const response = {
    setHeader() {},
    status(code: number) {
      state.statusCode = code
      return response
    },
    json(body: unknown) {
      state.body = body
      return response
    }
  } as unknown as VercelResponse
  return { state, response }
}

function request(body: unknown, accessToken = token): VercelRequest {
  return {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body,
    query: {}
  } as unknown as VercelRequest
}

function plannerHandlers() {
  return createPlannerHttpHandlers({
    auth: createServerAuthVerifier(publicClient),
    repositoryFor: () =>
      createSupabasePlannerRepository({
        userClient: rpcClient(userClient),
        loader: createSupabasePlannerInputLoader(userClient),
        secretClientFactory: () => rpcClient(secretClient)
      }),
    hasher,
    calculationDate: () => calculationDate
  })
}

beforeAll(async () => {
  url = process.env.SUPABASE_URL ?? ""
  publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? ""
  secretKey = process.env.SUPABASE_SECRET_KEY ?? ""
  const parsed = new URL(url)
  if (
    publishableKey === "" ||
    secretKey === "" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)
  ) {
    throw new Error("Planner integration requires loopback Supabase configuration")
  }
  publicClient = createClient<Database>(url, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
  })
  secretClient = createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
  })
  const signUp = await publicClient.auth.signUp({
    email: `phase3-planner-${crypto.randomUUID()}@example.test`,
    password: "phase3-local-planner-password"
  })
  if (signUp.error !== null || signUp.data.user === null || signUp.data.session === null) {
    throw new Error("Unable to create local planner user")
  }
  userId = signUp.data.user.id
  token = signUp.data.session.access_token
  const promotion = await secretClient.auth.admin.updateUserById(userId, {
    app_metadata: { role: "admin" }
  })
  if (promotion.error !== null) throw new Error("Unable to bootstrap local planner administrator")
  userClient = createClient<Database>(url, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  })
  const household = await createSupabaseHouseholdRepository(userClient).saveOwn(
    {
      memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 2 }],
      weeklyPlanBudgetVnd: 100_000,
      maxElapsedMinutes: 30,
      ruleCodes: []
    },
    0
  )
  if (!household.ok) throw new Error(`Unable to create planner household: ${household.reason}`)
  householdId = household.household.householdId

  const food = await catalog({
    action: "create_food",
    input: {
      code: `tofu_${crypto.randomUUID().replaceAll("-", "")}`,
      nameVi: "Đậu hũ kiểm thử planner",
      baseDimension: "mass",
      baseUnitId: "70010000-0000-0000-0000-000000000001"
    }
  })
  const factId = crypto.randomUUID()
  fixtureFoodId = food.id
  fixtureFactId = factId
  const allergens = await secretClient.from("allergens").select("code").order("code")
  const nutrients = await secretClient.from("nutrients").select("code").order("code")
  if (allergens.error !== null || nutrients.error !== null)
    throw new Error("Reference data missing")
  await catalog({
    action: "save_food_fact_draft",
    input: {
      foodFactVersionId: factId,
      expectedRevision: 1,
      foodId: food.id,
      versionNumber: 1,
      categoryId: "70020000-0000-0000-0000-000000000011",
      edibleFraction: "1",
      provenance: "Local planner integration fixture",
      allergenAssessments: allergens.data.map(({ code }) => ({
        allergenCode: code,
        status: "absent",
        provenance: "Local planner integration fixture"
      })),
      nutrients: nutrients.data.map(({ code }) => ({
        nutrientCode: code,
        amountPer100g: code === "energy_kcal" ? "100" : "1",
        provenance: "Local planner integration fixture"
      })),
      categoryAncestry: ["tofu", "food"],
      dietaryTagCodes: ["vegetarian"],
      conversions: [
        {
          unitId: "70010000-0000-0000-0000-000000000001",
          baseQuantityPerUnit: "1",
          grossGramsPerUnit: "1",
          displayStep: "5",
          provenance: "Gram identity"
        }
      ]
    }
  })
  await catalog({
    action: "publish_food_fact",
    input: { foodFactVersionId: factId, expectedRevision: 1 }
  })

  const latestBook = await secretClient
    .from("price_books")
    .select("version_number")
    .eq("region_id", "70060000-0000-0000-0000-000000000001")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestBook.error !== null) throw new Error("Unable to inspect local price-book versions")
  const priceBookVersion = (latestBook.data?.version_number ?? 0) + 1
  fixturePriceBookVersion = priceBookVersion
  const book = await catalog({
    action: "create_price_book",
    input: {
      regionId: "70060000-0000-0000-0000-000000000001",
      versionNumber: priceBookVersion,
      effectiveFrom: "2026-07-01",
      effectiveTo: null
    }
  })
  await catalog({
    action: "save_price_book_draft",
    input: {
      priceBookId: book.id,
      expectedRevision: 1,
      effectiveFrom: "2026-07-01",
      effectiveTo: null,
      prices: [
        {
          foodPriceId: "planner-price-reference",
          foodId: food.id,
          foodFactVersionId: factId,
          packageQuantity: "1",
          packageUnitId: "70010000-0000-0000-0000-000000000002",
          packageBaseQuantity: "1000",
          baseUnitId: "70010000-0000-0000-0000-000000000001",
          packagePriceVnd: 30_000,
          purchaseIncrement: "1",
          observedAt: "2026-07-15",
          sourceReference: "Local planner integration fixture"
        }
      ]
    }
  })
  await catalog({
    action: "publish_price_book",
    input: { priceBookId: book.id, expectedRevision: 2 }
  })

  mealOptionIds = []
  for (let index = 0; index < 8; index += 1) {
    const recipe = await catalog({
      action: "create_recipe",
      input: {
        code: `planner_recipe_${index}_${crypto.randomUUID().replaceAll("-", "")}`,
        nameVi: `Món planner ${index + 1}`
      }
    })
    const recipeVersionId = crypto.randomUUID()
    const ingredientReference = `planner-ingredient-${index}`
    await catalog({
      action: "save_recipe_version_draft",
      input: {
        recipeVersionId,
        expectedRevision: 1,
        recipeId: recipe.id,
        versionNumber: 1,
        yieldAdultEquivalent: "2",
        activeMinutes: 10,
        elapsedMinutes: 20,
        ingredients: [
          {
            recipeIngredientId: ingredientReference,
            foodId: food.id,
            foodFactVersionId: factId,
            quantity: "500",
            unitId: "70010000-0000-0000-0000-000000000001",
            preparationNoteVi: null,
            order: 1
          }
        ],
        steps: [
          {
            order: 1,
            instructionVi: `Nấu món planner ${index + 1}.`,
            timerMinutes: 10,
            ingredientIds: [ingredientReference]
          }
        ],
        tagIds: ["70070000-0000-0000-0000-000000000014"]
      }
    })
    await catalog({
      action: "publish_recipe",
      input: { recipeVersionId, expectedRevision: 1 }
    })
    const option = await mealOption({
      action: "create_meal_option",
      input: {
        code: `planner_option_${index}_${crypto.randomUUID().replaceAll("-", "")}`,
        nameVi: `Bữa planner ${index + 1}`
      }
    })
    const mealOptionVersionId = crypto.randomUUID()
    await mealOption({
      action: "save_meal_option_version_draft",
      input: {
        mealOptionVersionId,
        mealOptionId: option.id,
        expectedRevision: 1,
        versionNumber: 1,
        yieldAdultEquivalent: "2",
        activeMinutes: 10,
        elapsedMinutes: 20,
        components: [
          {
            recipeId: recipe.id,
            recipeVersionId,
            quantityMultiplier: "1",
            mealRole: "main",
            order: 1
          }
        ],
        tagIds: ["70070000-0000-0000-0000-000000000001", "70070000-0000-0000-0000-000000000012"]
      }
    })
    await mealOption({
      action: "publish_meal_option",
      input: { mealOptionVersionId, expectedRevision: 1 }
    })
    mealOptionIds.push(option.id)
  }
}, 120_000)

describe("authoritative planner API integration", () => {
  test("generates idempotently from DB authority with basket invariant, stale warning, and owner isolation", async () => {
    const handlers = plannerHandlers()
    const idempotencyKey = crypto.randomUUID()
    const body = { householdId, weekStart, idempotencyKey }
    const first = responseDouble()
    await handlers.generate(request(body), first.response)
    expect(first.state.statusCode).toBe(200)
    const generated = first.state.body as {
      planId: string
      revisionId: string
      planVersion: number
      idempotent: boolean
      status: string
      warnings: { code: string }[]
      plan: { items: unknown[]; totalEstimatedCostVnd: number }
    }
    expect(generated.plan.items).toHaveLength(7)
    expect(generated.status).toBe("ready_over_budget")
    expect(generated.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining([
        "PLAN_OVER_BUDGET",
        "NO_UNDER_BUDGET_PLAN_FOUND_IN_DETERMINISTIC_SEARCH",
        "STALE_PRICE"
      ])
    )

    const retry = responseDouble()
    await handlers.generate(request(body), retry.response)
    expect(retry.state.statusCode).toBe(200)
    expect(retry.state.body).toMatchObject({
      planId: generated.planId,
      revisionId: generated.revisionId,
      idempotent: true
    })

    const persisted = await secretClient
      .from("meal_plan_revisions")
      .select("total_estimated_cost_vnd, calculation_snapshot")
      .eq("id", generated.revisionId)
      .single()
    expect(persisted.error).toBeNull()
    const snapshot = persisted.data?.calculation_snapshot as {
      purchaseBasket: { totalEstimatedCostVnd: number; lines: { lineCostVnd: number }[] }
    }
    expect(generated.plan.totalEstimatedCostVnd).toBe(persisted.data?.total_estimated_cost_vnd)
    expect(snapshot.purchaseBasket.totalEstimatedCostVnd).toBe(
      snapshot.purchaseBasket.lines.reduce((sum, line) => sum + line.lineCostVnd, 0)
    )

    const other = await publicClient.auth.signUp({
      email: `phase3-other-${crypto.randomUUID()}@example.test`,
      password: "phase3-local-other-password"
    })
    if (other.data.session === null) throw new Error("Unable to create second local user")
    const otherClient = createClient<Database>(url, publishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${other.data.session.access_token}` } }
    })
    const crossRead = await otherClient.from("meal_plans").select("id").eq("id", generated.planId)
    expect(crossRead.error).toBeNull()
    expect(crossRead.data).toEqual([])

    const forged = responseDouble()
    await handlers.generate(
      request({ ...body, totalEstimatedCostVnd: 1, score: 999 }),
      forged.response
    )
    expect(forged.state.statusCode).toBe(400)
  }, 60_000)

  test("previews without writing and applies one immutable one-day replacement", async () => {
    const handlers = plannerHandlers()
    const generatedResponse = responseDouble()
    await handlers.generate(
      request({ householdId, weekStart: "2026-09-07", idempotencyKey: crypto.randomUUID() }),
      generatedResponse.response
    )
    expect(generatedResponse.state.statusCode).toBe(200)
    const generated = generatedResponse.state.body as {
      planId: string
      revisionId: string
      planVersion: number
      plan: { items: { dayIndex: number; mealOptionVersionId: string }[] }
    }
    const before = JSON.stringify(generated.plan.items)

    const newerBook = await catalog({
      action: "create_price_book",
      input: {
        regionId: "70060000-0000-0000-0000-000000000001",
        versionNumber: fixturePriceBookVersion + 1,
        effectiveFrom: "2026-08-01",
        effectiveTo: null
      }
    })
    await catalog({
      action: "save_price_book_draft",
      input: {
        priceBookId: newerBook.id,
        expectedRevision: 1,
        effectiveFrom: "2026-08-01",
        effectiveTo: null,
        prices: [
          {
            foodPriceId: "planner-new-price-reference",
            foodId: fixtureFoodId,
            foodFactVersionId: fixtureFactId,
            packageQuantity: "1",
            packageUnitId: "70010000-0000-0000-0000-000000000002",
            packageBaseQuantity: "1000",
            baseUnitId: "70010000-0000-0000-0000-000000000001",
            packagePriceVnd: 300_000,
            purchaseIncrement: "1",
            observedAt: "2026-08-20",
            sourceReference: "Pointer-change integration fixture"
          }
        ]
      }
    })
    await catalog({
      action: "publish_price_book",
      input: { priceBookId: newerBook.id, expectedRevision: 2 }
    })

    const previewResponse = responseDouble()
    await handlers.preview(
      request({ planId: generated.planId, targetDayIndex: 3, expectedPlanVersion: 1 }),
      previewResponse.response
    )
    expect(previewResponse.state.statusCode).toBe(200)
    const preview = previewResponse.state.body as {
      previewFingerprint: string
      items: { dayIndex: number; mealOptionVersionId: string }[]
      costDeltaVnd: number
    }
    expect(preview.costDeltaVnd).toBe(0)
    const beforeApply = await secretClient
      .from("meal_plan_revisions")
      .select("id", { count: "exact" })
      .eq("meal_plan_id", generated.planId)
    expect(beforeApply.count).toBe(1)

    const applyResponse = responseDouble()
    await handlers.apply(
      request({
        planId: generated.planId,
        targetDayIndex: 3,
        expectedPlanVersion: 1,
        expectedCurrentRevisionId: generated.revisionId,
        previewCalculationFingerprint: preview.previewFingerprint,
        idempotencyKey: crypto.randomUUID()
      }),
      applyResponse.response
    )
    expect(applyResponse.state.statusCode).toBe(200)
    const applied = applyResponse.state.body as {
      revisionId: string
      planVersion: number
      costDeltaVnd: number
      plan: { items: { dayIndex: number; mealOptionVersionId: string }[] }
    }
    expect(applied.planVersion).toBe(2)
    expect(applied.costDeltaVnd).toBe(preview.costDeltaVnd)
    expect(
      applied.plan.items.filter(
        (item, index) =>
          item.mealOptionVersionId !== generated.plan.items[index]?.mealOptionVersionId
      )
    ).toHaveLength(1)
    expect(JSON.stringify(generated.plan.items)).toBe(before)
    const revisions = await secretClient
      .from("meal_plan_revisions")
      .select("id, revision_number")
      .eq("meal_plan_id", generated.planId)
      .order("revision_number")
    expect(revisions.data).toEqual([
      { id: generated.revisionId, revision_number: 1 },
      { id: applied.revisionId, revision_number: 2 }
    ])

    const oldBeforeRetirement = await userClient
      .from("meal_plan_revisions")
      .select("calculation_snapshot")
      .eq("id", generated.revisionId)
      .single()
    expect(oldBeforeRetirement.error).toBeNull()
    const retired = await mealOption({
      action: "retire_meal_option",
      input: { mealOptionId: mealOptionIds[0]!, expectedRevision: 2 }
    })
    expect(retired.status).toBe("retired")
    const oldRevision = await userClient
      .from("meal_plan_revisions")
      .select("calculation_snapshot")
      .eq("id", generated.revisionId)
      .single()
    expect(oldRevision.error).toBeNull()
    expect(JSON.stringify(oldRevision.data?.calculation_snapshot)).toBe(
      JSON.stringify(oldBeforeRetirement.data?.calculation_snapshot)
    )
  }, 60_000)
})
