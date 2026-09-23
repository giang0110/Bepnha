import type { SupabaseClient } from "@supabase/supabase-js"

import { isAllergenAssessmentStatus } from "../../domain/catalog/catalog.js"
import {
  isAllergenStrictness,
  type AllergenStrictness
} from "../../domain/household/allergen-strictness.js"
import {
  HOUSEHOLD_RULE_OPTION_BY_CODE,
  type HouseholdRuleCode
} from "../../domain/household/household-rules.js"
import type {
  MealOptionRecipeInput,
  MealOptionTagInput
} from "../../domain/meal-option/meal-option.js"
import { PLANNER_CONFIG_V1 } from "../../domain/planner/planner-config.js"
import type { PlannerCandidateInput, PlannerInputV1 } from "../../domain/planner/planner-input.js"
import type { ReadyPlan } from "../../domain/planner/search-week.js"
import type { FoodPriceInput } from "../../domain/pricing/pricing.js"
import type { RecipeHeatLevel, RecipeStepInput } from "../../domain/recipe/recipe.js"
import type { Database } from "../supabase/database.types.js"

import { loadPantrySnapshot } from "./load-pantry-snapshot.js"
import type { PlannerInputLoader } from "./supabase-planner-repository.js"

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function object(value: unknown): UnknownRecord {
  if (!isRecord(value)) throw new Error("INVALID_PLANNER_DATA")
  return value
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("INVALID_PLANNER_DATA")
  return value
}

function string(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("INVALID_PLANNER_DATA")
  return value
}

function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error("INVALID_PLANNER_DATA")
  }
  return value
}

/**
 * Reads the household's per-allergy strictness out of the planner projection.
 *
 * The projection only carries rules that departed from the default, so an empty object is the
 * normal case. Anything that is not one of the two recognised values is dropped rather than passed
 * through: the planner would fall back to `strict` for a missing key anyway, and dropping keeps a
 * corrupted value from ever reaching the domain.
 */
function allergenStrictness(value: unknown): Record<string, AllergenStrictness> {
  if (value === undefined || value === null) return {}
  const declared = object(value)
  const resolved: Record<string, AllergenStrictness> = {}
  for (const [ruleCode, raw] of Object.entries(declared)) {
    if (isAllergenStrictness(raw)) resolved[ruleCode] = raw
  }
  return resolved
}

function stringArray(value: unknown): string[] {
  return array(value).map(string)
}

async function rpc(client: SupabaseClient<Database>, name: string, args: Record<string, unknown>) {
  const result = await client.rpc(name as keyof Database["public"]["Functions"], args as never)
  if (result.error !== null || result.data === null) throw new Error("PLANNER_DATA_UNAVAILABLE")
  return result.data
}

/** PostgreSQL `undefined_function`, and the PostgREST schema cache's word for the same thing. */
const MISSING_FUNCTION_CODES: ReadonlySet<string> = new Set(["42883", "PGRST202"])

/**
 * Whether this process has already found the plan-history function absent.
 *
 * Process-scoped like the step-condition flag above and for the same reason: a serverless instance
 * is short-lived, so applying the migration heals the next instance without a deploy.
 */
let planHistoryFunctionMissing = false

/**
 * What this household cooked in the weeks before this one.
 *
 * Tolerant of a database that predates the function, because the deploy order is not ours to
 * choose: Vercel publishes on merge while a production migration waits for an operator. A read that
 * names a function PostgreSQL does not have fails the whole statement with 42883, and taking plan
 * generation down to avoid repeating last week's dinner is a bad trade — so an absent function is
 * "history not stated", and the planner plans exactly as it did before this existed.
 *
 * Distinguish that from an empty array, which is a real answer: this household has cooked nothing
 * in the window. Both score the same today; only one of them is worth a warning in the log.
 */
async function recentMealOptionIds(
  client: SupabaseClient<Database>,
  householdId: string,
  weekStart: string
): Promise<readonly string[] | undefined> {
  if (planHistoryFunctionMissing) return undefined
  const result = await client.rpc("get_recent_meal_option_ids", {
    p_household_id: householdId,
    p_week_start: weekStart,
    p_week_count: PLANNER_CONFIG_V1.recentWeekLookback
  })
  if (result.error !== null) {
    const code = result.error.code
    if (typeof code === "string" && MISSING_FUNCTION_CODES.has(code)) {
      planHistoryFunctionMissing = true
      console.warn(
        JSON.stringify({
          event: "planner_schema_degraded",
          detail: "plan_history_function_missing",
          action: "apply supabase/migrations/20260923010000_planner_recent_week_history.sql"
        })
      )
      return undefined
    }
    throw new Error("PLANNER_DATA_UNAVAILABLE")
  }
  return Array.isArray(result.data)
    ? result.data.filter((id): id is string => typeof id === "string")
    : []
}

const STEP_COLUMNS = "id, sort_order, instruction_vi, timer_minutes"
const STEP_COLUMNS_WITH_CONDITIONS = `${STEP_COLUMNS}, heat_level, temperature_celsius` as const

/** PostgreSQL `undefined_column`, and the PostgREST schema cache's word for the same thing. */
const MISSING_COLUMN_CODES: ReadonlySet<string> = new Set(["42703", "PGRST204"])

/**
 * Whether this process has already found the condition columns absent.
 *
 * Without it every recipe in the plan would pay a failed round trip before falling back. It is
 * process-scoped on purpose: a serverless instance is short-lived, so applying the migration heals
 * the next instance without a deploy.
 */
let stepConditionColumnsMissing = false

function isMissingColumn(error: { readonly code?: string | null } | null): boolean {
  return error !== null && typeof error.code === "string" && MISSING_COLUMN_CODES.has(error.code)
}

interface RecipeStepRow {
  readonly id: string
  readonly sort_order: number
  readonly instruction_vi: string
  readonly timer_minutes: number | null
  readonly heat_level: RecipeHeatLevel | null
  readonly temperature_celsius: number | null
}

/**
 * Reads the ordered steps, tolerating a database that predates their condition columns.
 *
 * A deploy can reach production before the migration it needs: Vercel publishes on merge, while a
 * production migration is an operator action that waits for approval. On 2026-09-23 that window
 * took plan generation down outright — the select named `heat_level`, PostgreSQL answered
 * `42703 undefined_column`, and every meal failed to load behind a generic error.
 *
 * So a missing column degrades to the shape that predates it. Null is the honest answer here rather
 * than a default papering over absent data: a column that does not exist cannot hold a heat level,
 * so the recipe has not stated one, which is exactly what null means everywhere else in this
 * feature. Any other error still fails the load — a plan built on half-read data would be worse
 * than no plan.
 *
 * The write path must keep doing the opposite. Dropping a heat level on the way in would lose what
 * an author wrote, so `saveRecipeVersionDraft` still fails loudly when the column is missing.
 */
async function recipeStepRows(
  client: SupabaseClient<Database>,
  recipeVersionId: string
): Promise<readonly RecipeStepRow[] | null> {
  if (!stepConditionColumnsMissing) {
    const detailed = await client
      .from("recipe_steps")
      .select(STEP_COLUMNS_WITH_CONDITIONS)
      .eq("recipe_version_id", recipeVersionId)
      .order("sort_order")
    if (detailed.error === null) return detailed.data
    if (!isMissingColumn(detailed.error)) return null
    stepConditionColumnsMissing = true
    console.warn(
      JSON.stringify({
        event: "planner_schema_degraded",
        detail: "recipe_step_conditions_missing",
        action: "apply supabase/migrations/20260923000000_recipe_step_heat.sql"
      })
    )
  }

  const plain = await client
    .from("recipe_steps")
    .select(STEP_COLUMNS)
    .eq("recipe_version_id", recipeVersionId)
    .order("sort_order")
  if (plain.error !== null) return null
  return plain.data.map((step) => ({ ...step, heat_level: null, temperature_celsius: null }))
}

async function recipeEditorial(
  client: SupabaseClient<Database>,
  recipeVersionId: string
): Promise<readonly RecipeStepInput[]> {
  const [steps, linkResult] = await Promise.all([
    recipeStepRows(client, recipeVersionId),
    client
      .from("recipe_step_ingredients")
      .select("recipe_step_id, recipe_ingredient_id, reference_order")
      .eq("recipe_version_id", recipeVersionId)
      .order("reference_order")
  ])
  if (steps === null || linkResult.error !== null) {
    throw new Error("PLANNER_DATA_UNAVAILABLE")
  }
  const links = new Map<string, string[]>()
  for (const link of linkResult.data) {
    const current = links.get(link.recipe_step_id) ?? []
    current.push(link.recipe_ingredient_id)
    links.set(link.recipe_step_id, current)
  }
  return steps.map((step) => ({
    order: step.sort_order,
    instructionVi: step.instruction_vi,
    timerMinutes: step.timer_minutes,
    heatLevel: step.heat_level,
    temperatureCelsius: step.temperature_celsius,
    ingredientIds: links.get(step.id) ?? []
  }))
}

async function loadUnits(client: SupabaseClient<Database>) {
  const { data, error } = await client
    .from("units")
    .select("id, code, dimension, to_dimension_base")
  if (error !== null) throw new Error("PLANNER_DATA_UNAVAILABLE")
  return new Map(data.map((unit) => [unit.id, unit] as const))
}

const PLANNER_LOADER_CONCURRENCY = 8

async function mapWithConcurrency<Item, Mapped>(
  items: readonly Item[],
  limit: number,
  map: (item: Item) => Promise<Mapped>
): Promise<Mapped[]> {
  const results = new Array<Mapped>(items.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex
      nextIndex += 1
      const item = items[index]
      if (index >= items.length || item === undefined) return
      results[index] = await map(item)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      await worker()
    })
  )
  return results
}

interface LoadedMealOptionComponent {
  readonly component: MealOptionRecipeInput
  readonly lineage: readonly PlannerCandidateInput["ingredientLineage"][number][]
  readonly prices: ReadonlyMap<string, FoodPriceInput>
  readonly priceBookContentHash: string
}

async function loadComponent(
  client: SupabaseClient<Database>,
  componentRow: UnknownRecord,
  priceBookId: string,
  units: Awaited<ReturnType<typeof loadUnits>>
): Promise<LoadedMealOptionComponent> {
  const lineage: PlannerCandidateInput["ingredientLineage"][number][] = []
  const priceById = new Map<string, FoodPriceInput>()

  const recipeData = object(
    await rpc(client, "get_published_recipe_calculation_input", {
      p_recipe_version_id: string(componentRow.recipeVersionId),
      p_price_book_id: priceBookId
    })
  )
  const recipe = object(recipeData.recipe)
  const priceBook = object(recipeData.priceBook)
  const priceBookContentHash = string(priceBook.contentHash)
  const steps = await recipeEditorial(client, string(recipe.recipeVersionId))
  const ingredients = array(recipe.ingredients).map((rawIngredient) => {
    const ingredient = object(rawIngredient)
    const food = object(ingredient.food)
    const fact = object(ingredient.fact)
    const conversion = object(fact.conversion)
    const sourceUnit = units.get(string(ingredient.unitId))
    const foodBaseUnit = units.get(string(food.baseUnitId))
    const baseDimension = string(food.baseDimension)
    if (
      sourceUnit === undefined ||
      foodBaseUnit === undefined ||
      foodBaseUnit.dimension !== baseDimension
    ) {
      throw new Error("INCOMPLETE_UNIT_LINEAGE")
    }
    const recipeIngredientId = string(ingredient.recipeIngredientId)
    lineage.push({
      mealOptionRecipeId: string(componentRow.mealOptionRecipeId),
      recipeIngredientId,
      foodId: string(food.foodId),
      foodFactVersionId: string(fact.foodFactVersionId),
      foodFactContentHash: string(fact.contentHash),
      foodFactStatus: "published",
      edibleFraction: string(fact.edibleFraction),
      baseUnitId: string(food.baseUnitId),
      baseDimension: foodBaseUnit.dimension,
      allergenAssessments: array(fact.allergenAssessments).map((raw) => {
        const assessment = object(raw)
        const status = string(assessment.status)
        if (!isAllergenAssessmentStatus(status)) {
          throw new Error("INVALID_ALLERGEN_LINEAGE")
        }
        return {
          allergenCode: string(assessment.allergenCode),
          status
        }
      }),
      categoryAncestry: stringArray(fact.categoryAncestry),
      dietaryTagCodes: stringArray(fact.dietaryTagCodes),
      nutrients: array(fact.nutrients).map((raw) => {
        const nutrient = object(raw)
        return {
          nutrientCode: string(nutrient.nutrientCode),
          amountPer100g: string(nutrient.amountPer100g)
        }
      })
    })
    return {
      recipeIngredientId,
      foodId: string(food.foodId),
      foodFactVersionId: string(fact.foodFactVersionId),
      quantity: string(ingredient.quantity),
      order: integer(ingredient.order),
      conversion: {
        unitId: sourceUnit.id,
        unitCode: sourceUnit.code,
        sourceDimension: sourceUnit.dimension,
        sourceToDimensionBase: String(sourceUnit.to_dimension_base),
        foodBaseUnitId: foodBaseUnit.id,
        foodBaseDimension: foodBaseUnit.dimension,
        foodBaseUnitToDimensionBase: String(foodBaseUnit.to_dimension_base),
        baseQuantityPerUnit: string(conversion.baseQuantityPerUnit),
        grossGramsPerUnit: string(conversion.grossGramsPerUnit),
        displayStep: string(conversion.displayStep)
      }
    }
  })
  const recipeFoodIds = new Set(ingredients.map((ingredient) => ingredient.foodId))
  for (const rawPrice of array(priceBook.prices)) {
    const price = object(rawPrice)
    const foodId = string(price.foodId)
    if (!recipeFoodIds.has(foodId)) continue
    const mapped: FoodPriceInput = {
      foodPriceId: string(price.foodPriceId),
      priceBookId: string(priceBook.priceBookId),
      foodId,
      foodFactVersionId: string(price.foodFactVersionId),
      baseUnitId: string(price.baseUnitId),
      packageBaseQuantity: string(price.packageBaseQuantity),
      packagePriceVnd: integer(price.packagePriceVnd),
      purchaseIncrement: string(price.purchaseIncrement),
      observedAt: string(price.observedAt)
    }
    priceById.set(mapped.foodPriceId, mapped)
  }
  const component: MealOptionRecipeInput = {
    mealOptionRecipeId: string(componentRow.mealOptionRecipeId),
    recipeId: string(componentRow.recipeId),
    recipeVersionId: string(componentRow.recipeVersionId),
    recipeVersionNumber: integer(componentRow.recipeVersionNumber),
    recipeContentHash: string(componentRow.recipeContentHash),
    recipeStatus: "published",
    quantityMultiplier: string(componentRow.quantityMultiplier),
    mealRole: string(componentRow.mealRole) as MealOptionRecipeInput["mealRole"],
    sortOrder: integer(componentRow.sortOrder),
    recipe: {
      recipeId: string(recipe.recipeId),
      recipeVersionId: string(recipe.recipeVersionId),
      yieldAdultEquivalent: string(recipe.yieldAdultEquivalent),
      activeMinutes: integer(recipe.activeMinutes),
      elapsedMinutes: integer(recipe.elapsedMinutes),
      ingredients,
      steps
    }
  }

  return { component, lineage, prices: priceById, priceBookContentHash }
}

async function candidate(
  client: SupabaseClient<Database>,
  mealOptionVersionId: string,
  priceBookId: string,
  units: Awaited<ReturnType<typeof loadUnits>>
): Promise<PlannerCandidateInput> {
  const aggregate = object(
    await rpc(client, "get_published_meal_option_calculation_input", {
      p_meal_option_version_id: mealOptionVersionId
    })
  )
  const identity = object(aggregate.mealOption)
  const version = object(aggregate.version)
  const componentRows = array(aggregate.components).map(object)
  const tagRows = array(aggregate.tags).map(object)

  // Components are fetched concurrently but merged strictly in source order, so lineage order,
  // price insertion order, and the resulting canonical snapshot stay byte-identical.
  const loaded = await mapWithConcurrency(
    componentRows,
    PLANNER_LOADER_CONCURRENCY,
    async (componentRow) => await loadComponent(client, componentRow, priceBookId, units)
  )

  const lineage: PlannerCandidateInput["ingredientLineage"][number][] = []
  const priceById = new Map<string, FoodPriceInput>()
  const components: MealOptionRecipeInput[] = []
  let priceBookContentHash = ""
  for (const entry of loaded) {
    components.push(entry.component)
    lineage.push(...entry.lineage)
    for (const [foodPriceId, price] of entry.prices) priceById.set(foodPriceId, price)
    priceBookContentHash = entry.priceBookContentHash
  }

  const tags: MealOptionTagInput[] = tagRows.map((raw) => ({
    tagId: string(raw.tagId),
    code: string(raw.code),
    kind: string(raw.kind) as MealOptionTagInput["kind"]
  }))
  return {
    identityStatus: "published",
    mealOptionCode: string(identity.code),
    mealOptionNameVi: string(identity.nameVi),
    mealOptionContentHash: string(version.contentHash),
    priceBookStatus: "published",
    priceBookContentHash,
    mealOption: {
      mealOptionId: string(identity.mealOptionId),
      mealOptionVersionId: string(version.mealOptionVersionId),
      versionNumber: integer(version.versionNumber),
      contentHash: string(version.contentHash),
      status: "published",
      yieldAdultEquivalent: string(version.yieldAdultEquivalent),
      activeMinutes: integer(version.activeMinutes),
      elapsedMinutes: integer(version.elapsedMinutes),
      components,
      tags
    },
    ingredientLineage: lineage,
    prices: [...priceById.values()]
  }
}

async function generation(client: SupabaseClient<Database>, raw: unknown): Promise<PlannerInputV1> {
  const root = object(raw)
  const household = object(root.household)
  const householdId = string(household.id)
  const priceBook = object(root.priceBook)
  const weekStart = string(root.weekStart)
  const [units, pantrySnapshot, recentMeals] = await Promise.all([
    loadUnits(client),
    loadPantrySnapshot(client, householdId),
    recentMealOptionIds(client, householdId, weekStart)
  ])
  // The RPC returns every published meal option. Hydrating one past the domain candidate limit is
  // enough for `normalizePlannerInput` to raise the same CATALOG_CANDIDATE_LIMIT_EXCEEDED error it
  // raises today, so the outcome is unchanged while the fan-out stays bounded.
  const hydrationIds = stringArray(root.mealOptionVersionIds).slice(
    0,
    PLANNER_CONFIG_V1.candidateLimit + 1
  )
  const candidates = await mapWithConcurrency(
    hydrationIds,
    PLANNER_LOADER_CONCURRENCY,
    async (id) => await candidate(client, id, string(priceBook.priceBookId), units)
  )
  const rules = stringArray(root.foodRules)
  const strictness = allergenStrictness(root.foodRuleStrictness)
  return {
    householdId,
    householdSetupVersion: integer(household.version),
    weekStart,
    timezone: string(household.timezone),
    calculationDate: string(root.calculationDate),
    weeklyPlanBudgetVnd: integer(household.weekly_plan_budget_vnd),
    maxElapsedMinutes: integer(household.max_elapsed_minutes),
    memberGroups: array(root.memberGroups).map((rawGroup) => {
      const group = object(rawGroup)
      return {
        memberKind: string(group.member_kind),
        ageBand: string(group.age_band),
        memberCount: integer(group.member_count)
      }
    }),
    hardRuleCodes: rules.filter(
      (code) =>
        HOUSEHOLD_RULE_OPTION_BY_CODE.get(code as HouseholdRuleCode)?.ruleKind !== "soft_preference"
    ),
    allergenStrictness: strictness,
    softPreferenceCodes: rules.filter(
      (code) =>
        HOUSEHOLD_RULE_OPTION_BY_CODE.get(code as HouseholdRuleCode)?.ruleKind === "soft_preference"
    ),
    ...(recentMeals === undefined ? {} : { recentMealOptionIds: recentMeals }),
    pantrySnapshot,
    candidates
  }
}

function readyPlanFromRevision(revision: UnknownRecord): ReadyPlan {
  const calculation = object(revision.calculation_snapshot)
  const items = array(calculation.items)
  const selected = array(calculation.selectedMealOptions)
  const purchaseBasket = object(calculation.purchaseBasket)
  const score = object(calculation.score)
  if (items.length !== 7 || selected.length !== 7 || !Array.isArray(purchaseBasket.lines)) {
    throw new Error("INVALID_PLAN_SNAPSHOT")
  }
  return {
    items: items as unknown as ReadyPlan["items"],
    selected: selected as unknown as ReadyPlan["selected"],
    purchaseBasket: purchaseBasket as unknown as ReadyPlan["purchaseBasket"],
    totalEstimatedCostVnd: integer(revision.total_estimated_cost_vnd),
    score: score as unknown as ReadyPlan["score"],
    stableIdSequence: items.map((raw) => string(object(raw).mealOptionVersionId)).join("|"),
    frontierMetrics: []
  }
}

export function readHistoricalPlannerPriceBookId(revisionValue: unknown): string {
  const revision = object(revisionValue)
  const inputSnapshot = object(revision.input_snapshot)
  const manifest = array(inputSnapshot.candidateManifest)
  for (const rawCandidate of manifest) {
    const prices = array(object(rawCandidate).prices)
    const first = prices[0]
    if (first !== undefined) return string(object(first).priceBookId)
  }
  throw new Error("INVALID_PLAN_PRICE_BOOK_SNAPSHOT")
}

export function createSupabasePlannerInputLoader(
  client: SupabaseClient<Database>
): PlannerInputLoader {
  return {
    hydrateGeneration(raw) {
      return generation(client, raw)
    },
    async hydrateReplacement(raw) {
      const root = object(raw)
      const plan = object(root.plan)
      const revision = object(root.revision)
      const currentPlan = readyPlanFromRevision(revision)
      const generationRaw = await rpc(client, "get_planner_generation_input", {
        p_household_id: string(plan.household_id),
        p_week_start: string(plan.week_start),
        p_calculation_date: string(revision.calculation_date)
      })
      const currentGeneration = object(generationRaw)
      const input = await generation(client, {
        ...currentGeneration,
        priceBook: { priceBookId: readHistoricalPlannerPriceBookId(revision) }
      })
      return {
        input,
        currentPlan,
        planVersion: integer(plan.version),
        currentRevisionId: string(plan.current_revision_id),
        householdSetupVersion: integer(revision.household_setup_version),
        householdInputFingerprint: string(revision.input_fingerprint)
      }
    }
  }
}
