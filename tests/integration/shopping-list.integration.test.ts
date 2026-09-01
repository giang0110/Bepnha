import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { beforeAll, describe, expect, test } from "vitest"

import type { CatalogAdminCommand } from "@/application/catalog/catalog-admin-command.js"
import { executeCatalogAdminCommand } from "@/application/catalog/execute-catalog-admin-command.js"
import {
  executeMealOptionAdminCommand,
  type MealOptionAdminCommand
} from "@/application/meal-option/execute-meal-option-admin-command.js"
import type { ReadyShoppingList } from "@/application/shopping/shopping-list-repository.js"
import { PLANNER_ENGINE_VERSION } from "@/domain/planner/planner-engine-version.js"
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
import { createSupabaseShoppingListRepository } from "@/infrastructure/supabase/supabase-shopping-list-repository.js"

const calculationDate = "2026-08-26"
const baseWeekStart = "2026-08-31"
const gramUnitId = "70010000-0000-0000-0000-000000000001"
const kilogramUnitId = "70010000-0000-0000-0000-000000000002"
const regionId = "70060000-0000-0000-0000-000000000001"
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
let fixtureFoodId: string
let fixtureFactId: string
let mealOptionIds: string[]

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

function ready(result: Awaited<ReturnType<ReturnType<typeof createSupabaseShoppingListRepository>["load"]>>) {
  if (result === null || result.status !== "ready") {
    throw new Error("Expected ready shopping list")
  }
  return result
}

function immutableLineEvidence(list: ReadyShoppingList) {
  return list.items.map(({ checked: _checked, checkedAt: _checkedAt, foodNameVi: _name, ...item }) => item)
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
    throw new Error("Shopping integration requires loopback Supabase configuration")
  }

  publicClient = createClient<Database>(url, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
  })
  secretClient = createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
  })

  const signUp = await publicClient.auth.signUp({
    email: `phase4-shopping-${crypto.randomUUID()}@example.test`,
    password: "phase4-local-shopping-password"
  })
  if (signUp.error !== null || signUp.data.user === null || signUp.data.session === null) {
    throw new Error("Unable to create local shopping user")
  }
  userId = signUp.data.user.id
  token = signUp.data.session.access_token
  const promotion = await secretClient.auth.admin.updateUserById(userId, {
    app_metadata: { role: "admin" }
  })
  if (promotion.error !== null) throw new Error("Unable to bootstrap shopping fixture actor")

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
    null
  )
  if (!household.ok) throw new Error(`Unable to create shopping household: ${household.reason}`)
  householdId = household.household.householdId

  const food = await catalog({
    action: "create_food",
    input: {
      code: `shopping_tofu_${crypto.randomUUID().replaceAll("-", "")}`,
      nameVi: "Đậu hũ đi chợ",
      baseDimension: "mass",
      baseUnitId: gramUnitId
    }
  })
  fixtureFoodId = food.id
  fixtureFactId = crypto.randomUUID()

  const allergens = await secretClient.from("allergens").select("code").order("code")
  const nutrients = await secretClient.from("nutrients").select("code").order("code")
  if (allergens.error !== null || nutrients.error !== null) throw new Error("Reference data missing")

  await catalog({
    action: "save_food_fact_draft",
    input: {
      foodFactVersionId: fixtureFactId,
      expectedRevision: 1,
      foodId: fixtureFoodId,
      versionNumber: 1,
      categoryId: "70020000-0000-0000-0000-000000000011",
      edibleFraction: "1",
      provenance: "Phase 4 shopping integration fixture",
      allergenAssessments: allergens.data.map(({ code }) => ({
        allergenCode: code,
        status: "absent",
        provenance: "Phase 4 shopping integration fixture"
      })),
      nutrients: nutrients.data.map(({ code }) => ({
        nutrientCode: code,
        amountPer100g: code === "energy_kcal" ? "100" : "1",
        provenance: "Phase 4 shopping integration fixture"
      })),
      categoryAncestry: ["tofu", "food"],
      dietaryTagCodes: ["vegetarian"],
      conversions: [
        {
          unitId: gramUnitId,
          baseQuantityPerUnit: "1",
          grossGramsPerUnit: "1",
          displayStep: "5",
          provenance: "Gram identity"
        },
        {
          unitId: kilogramUnitId,
          baseQuantityPerUnit: "1000",
          grossGramsPerUnit: "1000",
          displayStep: "0.1",
          provenance: "Kilogram conversion"
        }
      ]
    }
  })
  await catalog({
    action: "publish_food_fact",
    input: { foodFactVersionId: fixtureFactId, expectedRevision: 1 }
  })

  const latestBook = await secretClient
    .from("price_books")
    .select("version_number")
    .eq("region_id", regionId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestBook.error !== null) throw new Error("Unable to inspect shopping price-book versions")
  const book = await catalog({
    action: "create_price_book",
    input: {
      regionId,
      versionNumber: (latestBook.data?.version_number ?? 0) + 1,
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
          foodPriceId: `shopping-price-${crypto.randomUUID()}`,
          foodId: fixtureFoodId,
          foodFactVersionId: fixtureFactId,
          packageQuantity: "1",
          packageUnitId: kilogramUnitId,
          packageBaseQuantity: "1000",
          baseUnitId: gramUnitId,
          packagePriceVnd: 30_000,
          purchaseIncrement: "1",
          observedAt: "2026-07-15",
          sourceReference: "Phase 4 stale-price fixture"
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
        code: `shopping_recipe_${index}_${crypto.randomUUID().replaceAll("-", "")}`,
        nameVi: `Món đi chợ ${index + 1}`
      }
    })
    const recipeVersionId = crypto.randomUUID()
    const ingredientId = `shopping-ingredient-${index}-${crypto.randomUUID()}`
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
            recipeIngredientId: ingredientId,
            foodId: fixtureFoodId,
            foodFactVersionId: fixtureFactId,
            quantity: index === 7 ? "0.5" : "500",
            unitId: index === 7 ? kilogramUnitId : gramUnitId,
            preparationNoteVi: null,
            order: 1
          }
        ],
        steps: [
          {
            order: 1,
            instructionVi: `Nấu món đi chợ ${index + 1}.`,
            timerMinutes: 10,
            ingredientIds: [ingredientId]
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
        code: `shopping_option_${index}_${crypto.randomUUID().replaceAll("-", "")}`,
        nameVi: `Bữa đi chợ ${index + 1}`
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
        tagIds: [
          "70070000-0000-0000-0000-000000000001",
          "70070000-0000-0000-0000-000000000012"
        ]
      }
    })
    await mealOption({
      action: "publish_meal_option",
      input: { mealOptionVersionId, expectedRevision: 1 }
    })
    mealOptionIds.push(option.id)
  }
}, 120_000)

describe("Phase 4 shopping-list integration", () => {
  test("binds one immutable consolidated list to the generated v2 revision and owner", async () => {
    const handlers = plannerHandlers()
    const generatedResponse = responseDouble()
    await handlers.generate(
      request({ householdId, weekStart: baseWeekStart, idempotencyKey: crypto.randomUUID() }),
      generatedResponse.response
    )
    expect(generatedResponse.state.statusCode).toBe(200)
    const generated = generatedResponse.state.body as {
      planId: string
      revisionId: string
      plan: { totalEstimatedCostVnd: number }
    }

    const revision = await secretClient
      .from("meal_plan_revisions")
      .select(
        "engine_version, input_snapshot, calculation_fingerprint, calculation_snapshot, total_estimated_cost_vnd"
      )
      .eq("id", generated.revisionId)
      .single()
    expect(revision.error).toBeNull()
    expect(revision.data?.engine_version).toBe(PLANNER_ENGINE_VERSION)
    expect((revision.data?.input_snapshot as { engineVersion?: string }).engineVersion).toBe(
      PLANNER_ENGINE_VERSION
    )

    const repository = createSupabaseShoppingListRepository(userClient)
    const current = ready(await repository.load(generated.planId))
    const historical = ready(await repository.load(generated.planId, generated.revisionId))
    expect(current.revisionId).toBe(generated.revisionId)
    expect(historical).toEqual(current)
    expect(current.calculationFingerprint).toBe(revision.data?.calculation_fingerprint)
    expect(current.totalEstimatedCostVnd).toBe(revision.data?.total_estimated_cost_vnd)
    expect(current.totalEstimatedCostVnd).toBe(generated.plan.totalEstimatedCostVnd)
    expect(current.items.reduce((sum, item) => sum + item.lineCostVnd, 0)).toBe(
      current.totalEstimatedCostVnd
    )
    expect(current.items).toHaveLength(1)
    expect(current.items[0]?.foodId).toBe(fixtureFoodId)
    expect(current.items[0]?.baseUnitId).toBe(gramUnitId)
    expect(current.items[0]?.sources).toHaveLength(7)
    expect(current.items[0]?.sources.every((source) => source.baseUnitId === gramUnitId)).toBe(true)
    expect(current.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "STALE_PRICE", observedAt: "2026-07-15" })
      ])
    )

    const other = await publicClient.auth.signUp({
      email: `phase4-shopping-other-${crypto.randomUUID()}@example.test`,
      password: "phase4-local-shopping-other-password"
    })
    if (other.data.session === null) throw new Error("Unable to create second shopping user")
    const otherClient = createClient<Database>(url, publishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${other.data.session.access_token}` } }
    })
    const otherRepository = createSupabaseShoppingListRepository(otherClient)
    await expect(otherRepository.load(generated.planId)).resolves.toBeNull()
    await expect(otherRepository.load(generated.planId, generated.revisionId)).resolves.toBeNull()

    const item = current.items[0]!
    const immutableBefore = immutableLineEvidence(current)
    await repository.setChecked(item.shoppingListItemId, true)
    expect(ready(await repository.load(generated.planId)).items[0]?.checked).toBe(true)

    const correctedName = "Đậu hũ đi chợ đã sửa tên"
    const rename = await secretClient.from("foods").update({ name_vi: correctedName }).eq("id", fixtureFoodId)
    expect(rename.error).toBeNull()
    const afterRename = ready(await repository.load(generated.planId, generated.revisionId))
    expect(afterRename.items[0]?.foodNameVi).toBe(correctedName)
    expect(immutableLineEvidence(afterRename)).toEqual(immutableBefore)
    expect(afterRename.calculationFingerprint).toBe(current.calculationFingerprint)
    expect(afterRename.items[0]?.checked).toBe(true)
  }, 60_000)

  test("replacement writes a full new list, preserves exact history, and carries identical check state", async () => {
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
    }

    const repository = createSupabaseShoppingListRepository(userClient)
    const before = ready(await repository.load(generated.planId, generated.revisionId))
    const beforeItem = before.items[0]!
    await repository.setChecked(beforeItem.shoppingListItemId, true)
    const checkedBefore = ready(await repository.load(generated.planId, generated.revisionId))

    const previewResponse = responseDouble()
    await handlers.preview(
      request({ planId: generated.planId, targetDayIndex: 3, expectedPlanVersion: 1 }),
      previewResponse.response
    )
    expect(previewResponse.state.statusCode).toBe(200)
    const preview = previewResponse.state.body as {
      previewFingerprint: string
    }

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
    const applied = applyResponse.state.body as { revisionId: string; planVersion: number }
    expect(applied.planVersion).toBe(2)
    expect(applied.revisionId).not.toBe(generated.revisionId)

    const oldAfter = ready(await repository.load(generated.planId, generated.revisionId))
    const currentAfter = ready(await repository.load(generated.planId))
    expect(oldAfter).toEqual(checkedBefore)
    expect(currentAfter.revisionId).toBe(applied.revisionId)
    expect(currentAfter.items).toHaveLength(1)
    expect(currentAfter.items[0]?.sources).toHaveLength(7)
    expect(currentAfter.items[0]?.checked).toBe(true)
    expect(currentAfter.items[0]?.requiredBaseQuantity).toBe(beforeItem.requiredBaseQuantity)

    const beforeByDay = new Map(
      beforeItem.sources.map((source) => [source.dayIndex, source.mealOptionVersionId])
    )
    const afterByDay = new Map(
      currentAfter.items[0]!.sources.map((source) => [source.dayIndex, source.mealOptionVersionId])
    )
    const changedDays = [...afterByDay].filter(
      ([dayIndex, mealOptionVersionId]) => beforeByDay.get(dayIndex) !== mealOptionVersionId
    )
    expect(changedDays).toHaveLength(1)
    expect(changedDays[0]?.[0]).toBe(3)

    const replacementRevision = await secretClient
      .from("meal_plan_revisions")
      .select("engine_version, input_snapshot")
      .eq("id", applied.revisionId)
      .single()
    expect(replacementRevision.error).toBeNull()
    expect(replacementRevision.data?.engine_version).toBe(PLANNER_ENGINE_VERSION)
    expect((replacementRevision.data?.input_snapshot as { engineVersion?: string }).engineVersion).toBe(
      PLANNER_ENGINE_VERSION
    )

    const retiredSource = beforeItem.sources[0]!
    const retired = await mealOption({
      action: "retire_meal_option",
      input: { mealOptionId: retiredSource.mealOptionId, expectedRevision: 2 }
    })
    expect(retired.status).toBe("retired")
    expect(await repository.load(generated.planId, generated.revisionId)).toEqual(oldAfter)
  }, 60_000)
})
