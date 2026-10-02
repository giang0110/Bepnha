import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { beforeAll, describe, expect, test } from "vitest"

import type { CatalogAdminCommand } from "@/application/catalog/catalog-admin-command.js"
import { executeCatalogAdminCommand } from "@/application/catalog/execute-catalog-admin-command.js"
import type { HouseholdSetupInput } from "@/domain/household/household.js"
import {
  executeMealOptionAdminCommand,
  type MealOptionAdminCommand
} from "@/application/meal-option/execute-meal-option-admin-command.js"
import { evaluateCatalogReadiness } from "@/application/release/catalog-readiness.js"
import { evaluatePlannerEligibility } from "@/domain/planner/evaluate-eligibility.js"
import { normalizePlannerInput } from "@/domain/planner/normalize-planner-input.js"
import type { PlannerInputV1 } from "@/domain/planner/planner-input.js"
import { searchWeek } from "@/domain/planner/search-week.js"
import { NodeContentHasher } from "@/infrastructure/server/node-content-hasher.js"
import { createSupabaseCatalogAdminRepository } from "@/infrastructure/server/supabase-catalog-admin-repository.js"
import { createSupabaseMealOptionAdminRepository } from "@/infrastructure/server/supabase-meal-option-admin-repository.js"
import {
  createSupabasePlannerInputLoader,
  createSupabasePlannerInputLoaderV2
} from "@/infrastructure/server/supabase-planner-input-loader.js"
import {
  createSupabasePlannerRepository,
  createSupabasePlannerRepositoryV2
} from "@/infrastructure/server/supabase-planner-repository.js"
import { createVersionedPlannerUseCases } from "@/application/planner/planner-nutrition-use-cases.js"
import {
  normalizePlannerInputV2,
  evaluatePlannerEligibilityV2,
  searchWeekV2,
  type PlannerInputV2
} from "@/domain/planner/planner-v2.js"
import { createSupabaseVersionedShoppingListRepository } from "@/infrastructure/supabase/supabase-shopping-list-repository.js"
import type { PlannerRpcClient } from "@/infrastructure/server/supabase-planner-repository.js"
import type { Database } from "@/infrastructure/supabase/database.types.js"
import { createSupabaseHouseholdRepository } from "@/infrastructure/supabase/supabase-household-repository.js"
import { createSupabasePantryRepository } from "@/infrastructure/supabase/supabase-pantry-repository.js"

const calculationDate = "2026-09-02"
const weekStart = "2026-09-07"
const gramUnitId = "70010000-0000-0000-0000-000000000001"
const launchRegionId = "70060000-0000-0000-0000-000000000001"
const roleMainTagId = "70070000-0000-0000-0000-000000000014"
const hasher = new NodeContentHasher()

const styleTags = [
  { id: "70070000-0000-0000-0000-000000000001", name: "luộc" },
  { id: "70070000-0000-0000-0000-000000000002", name: "kho" },
  { id: "70070000-0000-0000-0000-000000000003", name: "chiên" },
  { id: "70070000-0000-0000-0000-000000000004", name: "nướng" },
  { id: "70070000-0000-0000-0000-000000000005", name: "hấp" },
  { id: "70070000-0000-0000-0000-000000000006", name: "xào" }
] as const

const proteinTagIds = {
  plant: "70070000-0000-0000-0000-000000000012",
  poultry: "70070000-0000-0000-0000-000000000009",
  fish: "70070000-0000-0000-0000-000000000010",
  pork: "70070000-0000-0000-0000-000000000007",
  egg: "70070000-0000-0000-0000-000000000018"
} as const

type ProteinGroup = keyof typeof proteinTagIds

type FoodSpec = {
  readonly key: string
  readonly nameVi: string
  readonly categoryId: string
  readonly categoryAncestry: readonly string[]
  readonly vegetarian: boolean
  readonly peanutContains?: boolean
  readonly proteinGroup: ProteinGroup
  readonly baseDimension?: "count"
  readonly pieceBaseQuantity?: string
}

type SeededFood = FoodSpec & {
  readonly foodId: string
  readonly foodFactVersionId: string
}

const plantFoods: readonly FoodSpec[] = [
  {
    key: "tofu",
    nameVi: "Đậu hũ non",
    categoryId: "70020000-0000-0000-0000-000000000011",
    categoryAncestry: ["tofu", "food"],
    vegetarian: true,
    proteinGroup: "plant"
  },
  {
    key: "chickpea",
    nameVi: "Đậu gà",
    categoryId: "70020000-0000-0000-0000-000000000013",
    categoryAncestry: ["staple", "food"],
    vegetarian: true,
    proteinGroup: "plant"
  },
  {
    key: "lentil",
    nameVi: "Đậu lăng đỏ",
    categoryId: "70020000-0000-0000-0000-000000000013",
    categoryAncestry: ["staple", "food"],
    vegetarian: true,
    proteinGroup: "plant"
  },
  {
    key: "mushroom",
    nameVi: "Nấm đùi gà",
    categoryId: "70020000-0000-0000-0000-000000000012",
    categoryAncestry: ["vegetable", "food"],
    vegetarian: true,
    proteinGroup: "plant"
  },
  {
    key: "eggplant",
    nameVi: "Cà tím",
    categoryId: "70020000-0000-0000-0000-000000000012",
    categoryAncestry: ["vegetable", "food"],
    vegetarian: true,
    proteinGroup: "plant"
  },
  {
    key: "pumpkin",
    nameVi: "Bí đỏ",
    categoryId: "70020000-0000-0000-0000-000000000012",
    categoryAncestry: ["vegetable", "food"],
    vegetarian: true,
    proteinGroup: "plant"
  },
  {
    key: "sweet_potato",
    nameVi: "Khoai lang",
    categoryId: "70020000-0000-0000-0000-000000000013",
    categoryAncestry: ["staple", "food"],
    vegetarian: true,
    proteinGroup: "plant"
  },
  {
    key: "peanut",
    nameVi: "Đậu phộng",
    categoryId: "70020000-0000-0000-0000-000000000013",
    categoryAncestry: ["staple", "food"],
    vegetarian: true,
    peanutContains: true,
    proteinGroup: "plant"
  }
]

const animalFoods: readonly FoodSpec[] = [
  {
    key: "chicken_breast",
    nameVi: "Ức gà",
    categoryId: "70020000-0000-0000-0000-000000000004",
    categoryAncestry: ["poultry", "food"],
    vegetarian: false,
    proteinGroup: "poultry"
  },
  {
    key: "chicken_thigh",
    nameVi: "Đùi gà",
    categoryId: "70020000-0000-0000-0000-000000000004",
    categoryAncestry: ["poultry", "food"],
    vegetarian: false,
    proteinGroup: "poultry"
  },
  {
    key: "basa",
    nameVi: "Cá basa",
    categoryId: "70020000-0000-0000-0000-000000000006",
    categoryAncestry: ["fish", "seafood", "food"],
    vegetarian: false,
    proteinGroup: "fish"
  },
  {
    key: "mackerel",
    nameVi: "Cá thu",
    categoryId: "70020000-0000-0000-0000-000000000006",
    categoryAncestry: ["fish", "seafood", "food"],
    vegetarian: false,
    proteinGroup: "fish"
  },
  {
    key: "pork_shoulder",
    nameVi: "Nạc vai heo",
    categoryId: "70020000-0000-0000-0000-000000000002",
    categoryAncestry: ["pork", "food"],
    vegetarian: false,
    proteinGroup: "pork"
  },
  {
    key: "pork_rib",
    nameVi: "Sườn non heo",
    categoryId: "70020000-0000-0000-0000-000000000002",
    categoryAncestry: ["pork", "food"],
    vegetarian: false,
    proteinGroup: "pork"
  }
]

let publicClient: SupabaseClient<Database>
let secretClient: SupabaseClient<Database>
let userClient: SupabaseClient<Database>
let userId: string
let householdId: string
let householdVersion: number
let allergenCodes: string[]
let nutrientCodes: string[]
let launchFoods: SeededFood[]

function uniqueCode(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`
}

async function catalog(command: CatalogAdminCommand) {
  const result = await executeCatalogAdminCommand(
    createSupabaseCatalogAdminRepository(secretClient, userId),
    hasher,
    command
  )
  if (!result.ok) throw new Error(`Catalog readiness fixture failed: ${result.reason}`)
  return result.value
}

async function mealOption(command: MealOptionAdminCommand) {
  const result = await executeMealOptionAdminCommand(
    createSupabaseMealOptionAdminRepository(secretClient, userId),
    hasher,
    command
  )
  if (!result.ok) throw new Error(`Meal-option readiness fixture failed: ${result.reason}`)
  return result.value
}

async function seedFood(spec: FoodSpec): Promise<SeededFood> {
  const dimension = spec.baseDimension ?? "mass"
  const baseUnitId = dimension === "count" ? "70010000-0000-0000-0000-000000000007" : gramUnitId
  const food = await catalog({
    action: "create_food",
    input: {
      code: uniqueCode(`launch_${spec.key}`),
      nameVi: spec.nameVi,
      baseDimension: dimension,
      baseUnitId
    }
  })
  const foodFactVersionId = await publishFoodFact({ ...spec, foodId: food.id }, 1)
  return { ...spec, foodId: food.id, foodFactVersionId }
}

async function publishFoodFact(
  spec: FoodSpec & { readonly foodId: string },
  versionNumber: number,
  pieceBaseQuantity = spec.pieceBaseQuantity
): Promise<string> {
  const dimension = spec.baseDimension ?? "mass"
  const baseUnitId = dimension === "count" ? "70010000-0000-0000-0000-000000000007" : gramUnitId
  const foodFactVersionId = crypto.randomUUID()
  await catalog({
    action: "save_food_fact_draft",
    input: {
      foodFactVersionId,
      expectedRevision: 1,
      foodId: spec.foodId,
      versionNumber,
      categoryId: spec.categoryId,
      edibleFraction: "1",
      provenance: "Phase 6 launch-readiness curated integration fixture",
      allergenAssessments: allergenCodes.map((code) => ({
        allergenCode: code,
        status:
          (spec.peanutContains === true && code === "peanut") ||
          ((dimension === "count" || pieceBaseQuantity !== undefined) && code === "egg")
            ? "contains"
            : "absent",
        provenance: "Phase 6 launch-readiness curated integration fixture"
      })),
      nutrients: nutrientCodes.map((code) => ({
        nutrientCode: code,
        amountPer100g: code === "energy_kcal" ? "150" : code === "protein_g" ? "8" : "2",
        provenance: "Phase 6 launch-readiness curated integration fixture"
      })),
      categoryAncestry: [...spec.categoryAncestry],
      dietaryTagCodes: spec.vegetarian ? ["vegetarian"] : [],
      conversions: [
        {
          unitId: baseUnitId,
          baseQuantityPerUnit: "1",
          grossGramsPerUnit: dimension === "count" ? "50" : "1",
          displayStep: dimension === "count" ? "1" : "5",
          provenance: "Synthetic measured physical conversion for local readiness fixture"
        },
        ...(pieceBaseQuantity === undefined
          ? []
          : [
              {
                unitId: "70010000-0000-0000-0000-000000000007",
                baseQuantityPerUnit: pieceBaseQuantity,
                grossGramsPerUnit: pieceBaseQuantity,
                displayStep: "1",
                provenance: "Synthetic measured mass of one whole egg for local regression"
              }
            ])
      ]
    }
  })
  await catalog({
    action: "publish_food_fact",
    input: { foodFactVersionId, expectedRevision: 1 }
  })
  return foodFactVersionId
}

async function publishPriceBook(
  foods: readonly SeededFood[],
  explicitTerms = false
): Promise<void> {
  const latestBook = await secretClient
    .from("price_books")
    .select("version_number")
    .eq("region_id", launchRegionId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestBook.error !== null) throw new Error("Unable to inspect launch price-book versions")

  const book = await catalog({
    action: "create_price_book",
    input: {
      regionId: launchRegionId,
      versionNumber: (latestBook.data?.version_number ?? 0) + 1,
      effectiveFrom: "2026-08-01",
      effectiveTo: null
    }
  })
  const prices = foods.map((food, index) => {
    const count = food.baseDimension === "count"
    return {
      foodPriceId: `launch-price-${index + 1}`,
      foodId: food.foodId,
      foodFactVersionId: food.foodFactVersionId,
      packageQuantity: count ? "10" : "500",
      packageUnitId: count ? "70010000-0000-0000-0000-000000000007" : gramUnitId,
      packageBaseQuantity: count ? "10" : "500",
      baseUnitId: count ? "70010000-0000-0000-0000-000000000007" : gramUnitId,
      packagePriceVnd: count ? 24000 : 9000 + index * 750,
      purchaseIncrement: "1",
      observedAt: "2026-08-20",
      sourceReference: "Synthetic local catalog-readiness quote"
    }
  })
  const legacyDraft = {
    priceBookId: book.id,
    expectedRevision: 1,
    effectiveFrom: "2026-08-01",
    effectiveTo: null,
    prices
  }
  await catalog({
    action: "save_price_book_draft",
    input: !explicitTerms
      ? legacyDraft
      : {
          ...legacyDraft,
          purchasingVersion: "purchase-v2",
          prices: prices.map((price, index) => ({
            ...price,
            baseDimension: foods[index]!.baseDimension ?? "mass",
            purchaseRule:
              foods[index]!.baseDimension === "count" ||
              foods[index]!.pieceBaseQuantity !== undefined
                ? { mode: "fixed_pack", packIncrement: "1" }
                : { mode: "loose_mass", saleStepBaseQuantity: "50" },
            purchaseProvenance:
              "Synthetic local quote: mass sold in 50g steps; eggs in fixed boxes of ten"
          }))
        }
  })
  await catalog({
    action: "publish_price_book",
    input: { priceBookId: book.id, expectedRevision: 2 }
  })
}

async function publishMeal(
  index: number,
  nameVi: string,
  foods: readonly SeededFood[],
  proteinGroup: ProteinGroup
): Promise<string> {
  const style = styleTags[index % styleTags.length]!
  const recipe = await catalog({
    action: "create_recipe",
    input: { code: uniqueCode(`launch_recipe_${index}`), nameVi }
  })
  const recipeVersionId = crypto.randomUUID()
  const ingredients = foods.map((food, ingredientIndex) => ({
    recipeIngredientId: `launch-ingredient-${index}-${ingredientIndex + 1}`,
    foodId: food.foodId,
    foodFactVersionId: food.foodFactVersionId,
    quantity:
      food.baseDimension === "count" || food.pieceBaseQuantity !== undefined
        ? "2.4"
        : String(160 + ingredientIndex * 40 + (index % 3) * 10),
    unitId:
      food.baseDimension === "count" || food.pieceBaseQuantity !== undefined
        ? "70010000-0000-0000-0000-000000000007"
        : gramUnitId,
    preparationNoteVi: null,
    order: ingredientIndex + 1
  }))
  await catalog({
    action: "save_recipe_version_draft",
    input: {
      recipeVersionId,
      expectedRevision: 1,
      recipeId: recipe.id,
      versionNumber: 1,
      yieldAdultEquivalent: "2",
      activeMinutes: 10,
      elapsedMinutes: 20 + (index % 6),
      ingredients,
      steps: [
        {
          order: 1,
          instructionVi: `Sơ chế và ${style.name} ${nameVi.toLowerCase()} đến khi chín.`,
          timerMinutes: 10,
          heatLevel: "medium",
          temperatureCelsius: null,
          ingredientIds: ingredients.map((ingredient) => ingredient.recipeIngredientId)
        }
      ],
      tagIds: [roleMainTagId]
    }
  })
  await catalog({
    action: "publish_recipe",
    input: { recipeVersionId, expectedRevision: 1 }
  })

  const option = await mealOption({
    action: "create_meal_option",
    input: { code: uniqueCode(`launch_option_${index}`), nameVi: `Bữa ${nameVi}` }
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
      elapsedMinutes: 20 + (index % 6),
      components: [
        {
          recipeId: recipe.id,
          recipeVersionId,
          quantityMultiplier: "1",
          mealRole: "main",
          order: 1
        }
      ],
      tagIds: [style.id, proteinTagIds[proteinGroup]]
    }
  })
  await mealOption({
    action: "publish_meal_option",
    input: { mealOptionVersionId, expectedRevision: 1 }
  })
  return mealOptionVersionId
}

async function seedLaunchCatalog(): Promise<void> {
  const foods: SeededFood[] = []
  for (const spec of [...plantFoods, ...animalFoods]) foods.push(await seedFood(spec))
  launchFoods = foods
  await publishPriceBook(foods)

  const plant = foods.slice(0, plantFoods.length)
  let mealIndex = 0
  for (let left = 0; left < plant.length; left += 1) {
    for (let right = left + 1; right < plant.length; right += 1) {
      const first = plant[left]!
      const second = plant[right]!
      const style = styleTags[mealIndex % styleTags.length]!
      await publishMeal(
        mealIndex,
        `${first.nameVi} ${style.name} ${second.nameVi}`,
        [first, second],
        "plant"
      )
      mealIndex += 1
    }
  }

  for (const food of foods.slice(plantFoods.length)) {
    const style = styleTags[mealIndex % styleTags.length]!
    await publishMeal(mealIndex, `${food.nameVi} ${style.name}`, [food], food.proteinGroup)
    mealIndex += 1
  }
  expect(mealIndex).toBe(34)
}

async function saveHousehold(input: HouseholdSetupInput): Promise<void> {
  const saved = await createSupabaseHouseholdRepository(userClient).saveOwn(input, householdVersion)
  if (!saved.ok) throw new Error(`Unable to update launch household: ${saved.reason}`)
  householdId = saved.household.householdId
  householdVersion = saved.household.version
}

async function loadInput(): Promise<PlannerInputV1> {
  const raw = await userClient.rpc("get_planner_generation_input", {
    p_household_id: householdId,
    p_week_start: weekStart,
    p_calculation_date: calculationDate
  })
  if (raw.error !== null || raw.data === null) {
    throw new Error(`Unable to load launch planner input: ${raw.error?.message ?? "missing data"}`)
  }
  return createSupabasePlannerInputLoader(userClient).hydrateGeneration(
    raw.data,
    userClient as unknown as PlannerRpcClient
  )
}

function evaluateSearch(input: PlannerInputV1) {
  const normalized = normalizePlannerInput(input)
  if (!normalized.ok) throw new Error(`Invalid launch planner input: ${normalized.error.code}`)
  const eligibility = evaluatePlannerEligibility(normalized.value)
  if (!eligibility.ok) throw new Error(`Launch eligibility failed: ${eligibility.error.code}`)
  const search = searchWeek(
    eligibility.value.eligible,
    normalized.value.weeklyPlanBudgetVnd,
    normalized.value.softPreferenceCodes,
    normalized.value.calculationDate,
    normalized.value.priceFreshnessConfig,
    normalized.value.plannerConfig
  )
  return { normalized: normalized.value, eligibility: eligibility.value, search }
}

beforeAll(async () => {
  const url = process.env.SUPABASE_URL ?? ""
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? ""
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? ""
  const parsed = new URL(url)
  if (
    publishableKey === "" ||
    secretKey === "" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)
  ) {
    throw new Error("Catalog readiness integration requires loopback Supabase configuration")
  }

  publicClient = createClient<Database>(url, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
  })
  secretClient = createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
  })
  const signUp = await publicClient.auth.signUp({
    email: `phase6-readiness-${crypto.randomUUID()}@example.test`,
    password: "phase6-local-readiness-password"
  })
  if (signUp.error !== null || signUp.data.user === null || signUp.data.session === null) {
    throw new Error("Unable to create local launch-readiness user")
  }
  userId = signUp.data.user.id
  const promotion = await secretClient.auth.admin.updateUserById(userId, {
    app_metadata: { role: "admin" }
  })
  if (promotion.error !== null) throw new Error("Unable to bootstrap launch-readiness admin")

  userClient = createClient<Database>(url, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${signUp.data.session.access_token}` } }
  })
  const household = await createSupabaseHouseholdRepository(userClient).saveOwn(
    {
      memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 2 }],
      weeklyPlanBudgetVnd: 1_000_000,
      maxElapsedMinutes: 30,
      ruleCodes: []
    },
    null
  )
  if (!household.ok) throw new Error(`Unable to create launch household: ${household.reason}`)
  householdId = household.household.householdId
  householdVersion = household.household.version

  const [allergens, nutrients] = await Promise.all([
    secretClient.from("allergens").select("code").order("code"),
    secretClient.from("nutrients").select("code").order("code")
  ])
  if (allergens.error !== null || nutrients.error !== null) {
    throw new Error("Launch reference data missing")
  }
  allergenCodes = allergens.data.map(({ code }) => code)
  nutrientCodes = nutrients.data.map(({ code }) => code)

  await seedLaunchCatalog()
}, 240_000)

describe("database-backed catalog launch readiness", () => {
  test("covers representative launch households and deterministic budget fallbacks", async () => {
    const baseHousehold: HouseholdSetupInput = {
      memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 2 }],
      weeklyPlanBudgetVnd: 1_000_000,
      maxElapsedMinutes: 30,
      ruleCodes: []
    }

    let input = await loadInput()
    expect(evaluateCatalogReadiness(input, "two-adults")).toMatchObject({
      eligibleMealOptionCount: 34,
      proteinCapacityOk: true,
      coverageOk: true,
      ready: true,
      blockers: []
    })

    await saveHousehold({
      ...baseHousehold,
      memberGroups: [
        { memberKind: "adult", ageBand: "adult", memberCount: 2 },
        { memberKind: "child", ageBand: "1_3", memberCount: 1 }
      ]
    })
    input = await loadInput()
    expect(evaluateCatalogReadiness(input, "two-adults-young-child").ready).toBe(true)

    await saveHousehold({
      ...baseHousehold,
      memberGroups: [
        { memberKind: "adult", ageBand: "adult", memberCount: 2 },
        { memberKind: "child", ageBand: "7_9", memberCount: 1 },
        { memberKind: "elderly", ageBand: "elderly", memberCount: 1 }
      ]
    })
    input = await loadInput()
    expect(evaluateCatalogReadiness(input, "multigenerational").ready).toBe(true)

    await saveHousehold({ ...baseHousehold, ruleCodes: ["diet_vegetarian"] })
    input = await loadInput()
    const vegetarian = evaluateCatalogReadiness(input, "vegetarian-exclusion")
    expect(vegetarian).toMatchObject({
      eligibleMealOptionCount: 28,
      proteinCapacityOk: true,
      coverageOk: true,
      ready: true
    })
    const reuse = evaluateSearch(input)
    expect(reuse.eligibility.eligible).toHaveLength(28)
    expect(
      new Set(
        reuse.eligibility.eligible.flatMap((candidate) =>
          candidate.requirements.map((requirement) => requirement.foodId)
        )
      ).size
    ).toBe(8)

    await saveHousehold({ ...baseHousehold, ruleCodes: ["allergen_peanut"] })
    input = await loadInput()
    expect(evaluateCatalogReadiness(input, "common-allergen-exclusion")).toMatchObject({
      eligibleMealOptionCount: 27,
      coverageOk: true,
      ready: true
    })

    await saveHousehold(baseHousehold)
    input = await loadInput()
    const highBudgetSearch = evaluateSearch(input).search
    expect(highBudgetSearch).toHaveProperty("status", "ready_within_budget")
    if (!("plan" in highBudgetSearch)) throw new Error("Expected launch-ready high-budget plan")
    const tightBudgetVnd = highBudgetSearch.plan.totalEstimatedCostVnd

    await saveHousehold({ ...baseHousehold, weeklyPlanBudgetVnd: tightBudgetVnd })
    input = await loadInput()
    const tight = evaluateSearch(input).search
    expect(tight).toHaveProperty("status", "ready_within_budget")
    if (!("plan" in tight)) throw new Error("Expected tight feasible plan")
    expect(tight.plan.totalEstimatedCostVnd).toBeLessThanOrEqual(tightBudgetVnd)

    await saveHousehold({ ...baseHousehold, weeklyPlanBudgetVnd: 1 })
    input = await loadInput()
    const fallback = evaluateSearch(input).search
    expect(fallback).toHaveProperty("status", "ready_over_budget")
    if (!("warnings" in fallback)) throw new Error("Expected over-budget fallback warnings")
    expect(fallback.warnings.map((warning) => warning.code)).toContain(
      "NO_UNDER_BUDGET_PLAN_FOUND_IN_DETERMINISTIC_SEARCH"
    )

    await saveHousehold({ ...baseHousehold, maxElapsedMinutes: 10 })
    input = await loadInput()
    const infeasible = evaluateCatalogReadiness(input, "infeasible-time-catalog")
    expect(infeasible.ready).toBe(false)
    expect(infeasible.coverageOk).toBe(true)
    expect(infeasible.blockers).toContain("HARD_FILTER_EXHAUSTED")
  }, 120_000)

  test("v6 readiness requires policies, preserves legacy fixed quotes and publishes actual whole eggs", async () => {
    await saveHousehold({
      memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 2 }],
      weeklyPlanBudgetVnd: 1000000,
      maxElapsedMinutes: 30,
      ruleCodes: [],
      nutritionSetup: {
        version: "household-nutrition-v1",
        plannedMealSharePercent: 33,
        memberProfiles: ["maintain", "gain"].map((goal, index) => ({
          id: crypto.randomUUID(),
          memberKind: "adult" as const,
          sortOrder: index + 1,
          label: `Thành viên ${index + 1}`,
          heightCm: "170",
          weightKg: "65",
          ageYears: 30,
          sexForEquation: "male" as const,
          activityLevel: "light" as const,
          goal: goal as "maintain" | "gain"
        }))
      }
    })
    const loader = createSupabasePlannerInputLoaderV2(userClient)
    const load = async (): Promise<PlannerInputV2> => {
      const raw = await userClient.rpc("get_planner_generation_input", {
        p_household_id: householdId,
        p_week_start: weekStart,
        p_calculation_date: calculationDate
      })
      if (raw.error || !raw.data) throw new Error("Missing v6 generation input")
      return loader.hydrateGeneration(raw.data, userClient as unknown as PlannerRpcClient)
    }
    const before = await load()
    expect(evaluateCatalogReadiness(before, "v6-missing-policy").blockers).toContain(
      "MISSING_QUANTITY_POLICY"
    )
    expect(
      before.candidates.every((c) => c.prices.every((p) => p.purchaseRule.mode === "fixed_pack"))
    ).toBe(true)
    for (const food of launchFoods) {
      const id = crypto.randomUUID()
      await catalog({
        action: "save_food_quantity_policy_draft",
        input: {
          foodQuantityPolicyVersionId: id,
          expectedRevision: 1,
          foodId: food.foodId,
          foodFactVersionId: food.foodFactVersionId,
          versionNumber: 1,
          baseUnitId: gramUnitId,
          baseDimension: "mass",
          foodForm: "portionable_mass",
          stepBaseQuantity: "1",
          rounding: "half_up",
          provenance: "Synthetic reviewed gram portions for local readiness"
        }
      })
      await catalog({
        action: "publish_food_quantity_policy",
        input: { foodQuantityPolicyVersionId: id, expectedRevision: 1 }
      })
    }
    const fixedReady = await load()
    expect(evaluateCatalogReadiness(fixedReady, "v6-reviewed-legacy-quotes")).toMatchObject({
      ready: true,
      eligibleMealOptionCount: 34,
      blockers: []
    })
    const normalized = normalizePlannerInputV2(fixedReady)
    if (!normalized.ok) throw new Error(normalized.error.code)
    const eligible = evaluatePlannerEligibilityV2(normalized.value)
    if (!eligible.ok) throw new Error(eligible.error.code)
    const search = searchWeekV2(normalized.value, eligible.value.eligible)
    expect(search).toHaveProperty("status", "ready_within_budget")

    const eggs = await seedFood({
      key: "eggs",
      nameVi: "Trứng nguyên quả readiness",
      categoryId: "70020000-0000-0000-0000-000000000009",
      categoryAncestry: ["egg", "food"],
      vegetarian: false,
      proteinGroup: "egg",
      baseDimension: "count"
    })
    const policyId = crypto.randomUUID()
    await catalog({
      action: "save_food_quantity_policy_draft",
      input: {
        foodQuantityPolicyVersionId: policyId,
        expectedRevision: 1,
        foodId: eggs.foodId,
        foodFactVersionId: eggs.foodFactVersionId,
        versionNumber: 1,
        baseUnitId: "70010000-0000-0000-0000-000000000007",
        baseDimension: "count",
        foodForm: "whole_piece",
        stepBaseQuantity: "1",
        rounding: "ceil",
        provenance: "Synthetic measured 50g egg, one whole piece per step"
      }
    })
    await catalog({
      action: "publish_food_quantity_policy",
      input: { foodQuantityPolicyVersionId: policyId, expectedRevision: 1 }
    })
    await publishPriceBook([...launchFoods, eggs], true)
    const eggMealIds: string[] = []
    for (let index = 40; index < 47; index++)
      eggMealIds.push(await publishMeal(index, `Trứng readiness ${index}`, [eggs], "egg"))
    const reviewed = await load()
    expect(evaluateCatalogReadiness(reviewed, "v6-reviewed-terms").ready).toBe(true)
    const userRpc = userClient as unknown as PlannerRpcClient
    const legacyRepository = createSupabasePlannerRepository({
      userClient: userRpc,
      secretClientFactory: () => secretClient as unknown as PlannerRpcClient,
      loader: createSupabasePlannerInputLoader(userClient)
    })
    // A narrow, published fixture pool makes the whole-egg week observable deterministically.
    const repository = createSupabasePlannerRepositoryV2({
      userClient: userRpc,
      secretClientFactory: () => secretClient as unknown as PlannerRpcClient,
      legacyRepository,
      loader: {
        ...loader,
        hydrateGeneration: async (raw) => {
          const input = await loader.hydrateGeneration(raw, userRpc)
          return {
            ...input,
            candidates: input.candidates.filter((c) =>
              eggMealIds.includes(c.mealOption.mealOptionVersionId)
            )
          }
        }
      }
    })
    const generated = await createVersionedPlannerUseCases({
      repository,
      legacyRepository,
      hasher
    }).generate({
      actorUserId: userId,
      householdId,
      weekStart: "2026-09-14",
      calculationDate,
      idempotencyKey: crypto.randomUUID()
    })
    if (!generated.ok) throw new Error(generated.error.code)
    for (const meal of generated.value.plan.items) {
      expect(meal.snapshot.scaledIngredients[0]!.baseQuantity).toMatch(/^\d+$/u)
      if (!("memberPortions" in meal.snapshot)) throw new Error("Missing personal portions")
      expect(meal.snapshot.memberPortions).toHaveLength(2)
    }
    for (const privateField of ["heightCm", "weightKg", "ageYears", "bmi", "bmrKcal", "tdeeKcal"])
      expect(JSON.stringify(generated)).not.toContain(privateField)
    const shopping = await createSupabaseVersionedShoppingListRepository(userClient).load(
      generated.value.planId
    )
    expect(shopping?.status).toBe("ready")
    if (!shopping || shopping.status !== "ready" || !("snapshotVersion" in shopping))
      throw new Error("Missing shopping v2")
    expect(shopping.items[0]).toMatchObject({
      wholeUnit: { unitCode: "item", baseQuantityPerPiece: "1" },
      purchaseRule: { mode: "fixed_pack" }
    })
    expect(shopping.items[0]!.requiredBaseQuantity).toMatch(/^\d+$/u)
  }, 120_000)

  test("v6 rejects changed unused pantry input and settles surplus with its pinned measured fact", async () => {
    await saveHousehold({
      memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 2 }],
      weeklyPlanBudgetVnd: 1000000,
      maxElapsedMinutes: 30,
      ruleCodes: [],
      nutritionSetup: {
        version: "household-nutrition-v1",
        plannedMealSharePercent: 33,
        memberProfiles: [1, 3].map((sortOrder) => ({
          id: crypto.randomUUID(),
          memberKind: "adult",
          sortOrder,
          label: null,
          heightCm: null,
          weightKg: null,
          ageYears: null,
          sexForEquation: null,
          activityLevel: null,
          goal: "maintain"
        }))
      }
    })
    const eggs = await seedFood({
      key: "mass_eggs",
      nameVi: "Trứng 50g kiểm thử chốt quy đổi",
      categoryId: "70020000-0000-0000-0000-000000000009",
      categoryAncestry: ["egg", "food"],
      vegetarian: false,
      proteinGroup: "egg",
      pieceBaseQuantity: "50"
    })
    const unused = await seedFood({ ...plantFoods[0]!, key: "unused_pantry" })
    const publishPolicy = async (food: SeededFood, versionNumber: number) => {
      const id = crypto.randomUUID()
      await catalog({
        action: "save_food_quantity_policy_draft",
        input: {
          foodQuantityPolicyVersionId: id,
          expectedRevision: 1,
          foodId: food.foodId,
          foodFactVersionId: food.foodFactVersionId,
          versionNumber,
          baseUnitId: gramUnitId,
          baseDimension: "mass",
          foodForm: food.pieceBaseQuantity ? "whole_piece" : "portionable_mass",
          stepBaseQuantity: food.pieceBaseQuantity ?? "1",
          rounding: food.pieceBaseQuantity ? "ceil" : "half_up",
          provenance: "Synthetic reviewed measured fact for immutable revision regression"
        }
      })
      await catalog({
        action: "publish_food_quantity_policy",
        input: { foodQuantityPolicyVersionId: id, expectedRevision: 1 }
      })
    }
    await publishPolicy(eggs, 1)
    await publishPolicy(unused, 1)
    const pantryRepo = createSupabasePantryRepository(userClient)
    const stock = await pantryRepo.upsert({
      householdId,
      foodId: unused.foodId,
      foodFactVersionId: unused.foodFactVersionId,
      unitId: gramUnitId,
      quantity: "100",
      expectedVersion: 0
    })
    await publishPriceBook([...launchFoods, eggs], true)
    const mealIds: string[] = [await publishMeal(50, "Trứng chốt quy đổi", [eggs], "egg")]
    for (let i = 0; i < 6; i++)
      mealIds.push(await publishMeal(51 + i, `Rau chốt quy đổi ${i}`, [launchFoods[i]!], "plant"))
    const userRpc = userClient as unknown as PlannerRpcClient
    const loader = createSupabasePlannerInputLoaderV2(userClient)
    const legacyRepository = createSupabasePlannerRepository({
      userClient: userRpc,
      secretClientFactory: () => secretClient as unknown as PlannerRpcClient,
      loader: createSupabasePlannerInputLoader(userClient)
    })
    const repository = createSupabasePlannerRepositoryV2({
      userClient: userRpc,
      secretClientFactory: () => secretClient as unknown as PlannerRpcClient,
      legacyRepository,
      loader: {
        ...loader,
        hydrateGeneration: async (raw) => {
          const input = await loader.hydrateGeneration(raw, userRpc)
          return {
            ...input,
            candidates: input.candidates.filter((c) =>
              mealIds.includes(c.mealOption.mealOptionVersionId)
            )
          }
        }
      }
    })
    const useCases = createVersionedPlannerUseCases({ repository, legacyRepository, hasher })
    const command = {
      actorUserId: userId,
      householdId,
      weekStart: "2026-09-21",
      calculationDate,
      idempotencyKey: crypto.randomUUID()
    }
    const generated = await useCases.generate(command)
    if (!generated.ok) throw new Error(generated.error.code)
    const replacement = {
      actorUserId: userId,
      planId: generated.value.planId,
      expectedPlanVersion: generated.value.planVersion,
      expectedCurrentRevisionId: generated.value.revisionId,
      targetDayIndex: 2
    }
    const assertChanged = async () => {
      expect
        .soft(await useCases.preview(replacement))
        .toMatchObject({ ok: false, error: { code: "PLAN_INPUT_CHANGED_REGENERATION_REQUIRED" } })
      expect
        .soft(
          await useCases.apply({
            ...replacement,
            previewFingerprint: "f".repeat(64),
            idempotencyKey: crypto.randomUUID()
          })
        )
        .toMatchObject({ ok: false, error: { code: "PLAN_INPUT_CHANGED_REGENERATION_REQUIRED" } })
      const revisions = await userClient
        .from("meal_plan_revisions")
        .select("id", { count: "exact", head: true })
        .eq("meal_plan_id", generated.value.planId)
      expect(revisions.count).toBe(1)
    }
    await pantryRepo.remove(stock.pantryItemId, stock.version)
    await assertChanged()
    const unusedNewFact = await publishFoodFact(unused, 2)
    await publishPolicy({ ...unused, foodFactVersionId: unusedNewFact }, 2)
    await pantryRepo.upsert({
      householdId,
      foodId: unused.foodId,
      foodFactVersionId: unusedNewFact,
      unitId: gramUnitId,
      quantity: "100",
      expectedVersion: 0
    })
    await assertChanged()
    const shoppingRepo = createSupabaseVersionedShoppingListRepository(userClient)
    const shopping = await shoppingRepo.load(generated.value.planId)
    if (!shopping || shopping.status !== "ready" || !("snapshotVersion" in shopping))
      throw new Error("Missing mass-egg shopping v2")
    const eggLine = shopping.items.find((i) => i.foodId === eggs.foodId)!
    const otherLine = shopping.items.find(
      (i) => i.foodId !== eggs.foodId && i.leftoverBaseQuantity !== "0"
    )!
    expect(eggLine).toMatchObject({
      requiredBaseQuantity: "150",
      purchaseBaseQuantity: "500",
      leftoverBaseQuantity: "350",
      wholeUnit: { baseQuantityPerPiece: "50", unitCode: "item" }
    })
    expect(otherLine).toBeDefined()
    await shoppingRepo.setChecked(eggLine.shoppingListItemId, true)
    await shoppingRepo.setChecked(otherLine.shoppingListItemId, true)
    const newEggFact = await publishFoodFact(eggs, 2, "60")
    await publishPolicy({ ...eggs, foodFactVersionId: newEggFact, pieceBaseQuantity: "60" }, 2)
    const incompatible = await pantryRepo.upsert({
      householdId,
      foodId: eggs.foodId,
      foodFactVersionId: newEggFact,
      quantity: "1",
      unitId: "70010000-0000-0000-0000-000000000007",
      expectedVersion: 0
    })
    await expect
      .soft(shoppingRepo.applyToPantry(generated.value.revisionId))
      .rejects.toMatchObject({ code: "PANTRY_FACT_CHANGED_REGENERATION_REQUIRED" })
    const otherStock = await userClient
      .from("pantry_items")
      .select("id")
      .eq("household_id", householdId)
      .eq("food_id", otherLine.foodId)
    expect(otherStock.data).toEqual([])
    await pantryRepo.remove(incompatible.pantryItemId, incompatible.version)
    const settled = await userClient.rpc("apply_shopping_to_pantry", {
      p_meal_plan_revision_id: generated.value.revisionId
    })
    expect(settled.error).toBeNull()
    expect(settled.data).toMatchObject({ transferredLineCount: 2 })
    const eggStock = await userClient
      .from("pantry_items")
      .select("food_fact_version_id,base_quantity")
      .eq("household_id", householdId)
      .eq("food_id", eggs.foodId)
      .single()
    expect(eggStock.data).toMatchObject({
      food_fact_version_id: eggs.foodFactVersionId,
      base_quantity: 350
    })
    expect(Number(eggStock.data?.base_quantity) / 50).toBe(7)
    expect(await shoppingRepo.applyToPantry(generated.value.revisionId)).toMatchObject({
      transferredLineCount: 0,
      totalTransferredLineCount: 2
    })
    const afterRetry = await userClient
      .from("pantry_items")
      .select("food_fact_version_id,base_quantity")
      .eq("household_id", householdId)
      .eq("food_id", eggs.foodId)
      .single()
    expect(afterRetry.data).toEqual(eggStock.data)
    const familyRepo = createSupabaseHouseholdRepository(userClient)
    const family = await familyRepo.loadOwn()
    if (!family?.nutritionSetup) throw new Error("Missing saved family")
    const rename = await familyRepo.saveOwn(
      {
        ...family,
        nutritionSetup: {
          ...family.nutritionSetup,
          memberProfiles: family.nutritionSetup.memberProfiles.map((p) => ({
            ...p,
            label: `Tên mới ${p.sortOrder}`
          }))
        }
      },
      family.version
    )
    expect(rename.ok).toBe(true)
    const frozen = await useCases.current(command)
    if (!frozen.ok || !frozen.value) throw new Error("Missing frozen current plan")
    expect(frozen.value.plan).toEqual(generated.value.plan)
    const firstMeal = frozen.value.plan.items[0]!.snapshot
    if (!("memberPortions" in firstMeal)) throw new Error("Missing saved portions")
    expect(firstMeal.memberPortions.map((p) => p.label)).toEqual(["Người lớn 1", "Người lớn 3"])
  }, 120_000)
})
