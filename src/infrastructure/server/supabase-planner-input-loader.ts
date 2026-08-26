import type { SupabaseClient } from "@supabase/supabase-js"

import {
  HOUSEHOLD_RULE_OPTION_BY_CODE,
  type HouseholdRuleCode
} from "@/domain/household/household-rules"
import type { MealOptionRecipeInput, MealOptionTagInput } from "@/domain/meal-option/meal-option"
import type { PlannerCandidateInput, PlannerInputV1 } from "@/domain/planner/planner-input"
import type { ReadyPlan } from "@/domain/planner/search-week"
import type { FoodPriceInput } from "@/domain/pricing/pricing"
import type { RecipeStepInput } from "@/domain/recipe/recipe"
import type { Database } from "@/infrastructure/supabase/database.types"

import type { PlannerInputLoader } from "./supabase-planner-repository"

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

function stringArray(value: unknown): string[] {
  return array(value).map(string)
}

async function rpc(client: SupabaseClient<Database>, name: string, args: Record<string, unknown>) {
  const result = await client.rpc(name as keyof Database["public"]["Functions"], args as never)
  if (result.error !== null || result.data === null) throw new Error("PLANNER_DATA_UNAVAILABLE")
  return result.data
}

async function recipeEditorial(
  client: SupabaseClient<Database>,
  recipeVersionId: string
): Promise<readonly RecipeStepInput[]> {
  const [stepResult, linkResult] = await Promise.all([
    client
      .from("recipe_steps")
      .select("id, sort_order, instruction_vi, timer_minutes")
      .eq("recipe_version_id", recipeVersionId)
      .order("sort_order"),
    client
      .from("recipe_step_ingredients")
      .select("recipe_step_id, recipe_ingredient_id, reference_order")
      .eq("recipe_version_id", recipeVersionId)
      .order("reference_order")
  ])
  if (stepResult.error !== null || linkResult.error !== null) {
    throw new Error("PLANNER_DATA_UNAVAILABLE")
  }
  const links = new Map<string, string[]>()
  for (const link of linkResult.data) {
    const current = links.get(link.recipe_step_id) ?? []
    current.push(link.recipe_ingredient_id)
    links.set(link.recipe_step_id, current)
  }
  return stepResult.data.map((step) => ({
    order: step.sort_order,
    instructionVi: step.instruction_vi,
    timerMinutes: step.timer_minutes,
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
  const lineage: PlannerCandidateInput["ingredientLineage"][number][] = []
  const priceById = new Map<string, FoodPriceInput>()
  let priceBookContentHash = ""

  const components: MealOptionRecipeInput[] = []
  for (const componentRow of componentRows) {
    const recipeData = object(
      await rpc(client, "get_published_recipe_calculation_input", {
        p_recipe_version_id: string(componentRow.recipeVersionId),
        p_price_book_id: priceBookId
      })
    )
    const recipe = object(recipeData.recipe)
    const priceBook = object(recipeData.priceBook)
    priceBookContentHash = string(priceBook.contentHash)
    const steps = await recipeEditorial(client, string(recipe.recipeVersionId))
    const ingredients = array(recipe.ingredients).map((rawIngredient) => {
      const ingredient = object(rawIngredient)
      const food = object(ingredient.food)
      const fact = object(ingredient.fact)
      const conversion = object(fact.conversion)
      const sourceUnit = units.get(string(ingredient.unitId))
      const foodBaseUnit = units.get(string(food.baseUnitId))
      if (sourceUnit === undefined || foodBaseUnit === undefined) {
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
        allergenAssessments: array(fact.allergenAssessments).map((raw) => {
          const assessment = object(raw)
          const status = string(assessment.status)
          if (!["absent", "contains", "may_contain", "unknown"].includes(status)) {
            throw new Error("INVALID_ALLERGEN_LINEAGE")
          }
          return {
            allergenCode: string(assessment.allergenCode),
            status: status as "absent" | "contains" | "may_contain" | "unknown"
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
    for (const rawPrice of array(priceBook.prices)) {
      const price = object(rawPrice)
      const mapped: FoodPriceInput = {
        foodPriceId: string(price.foodPriceId),
        priceBookId: string(priceBook.priceBookId),
        foodId: string(price.foodId),
        foodFactVersionId: string(price.foodFactVersionId),
        baseUnitId: string(price.baseUnitId),
        packageBaseQuantity: string(price.packageBaseQuantity),
        packagePriceVnd: integer(price.packagePriceVnd),
        purchaseIncrement: string(price.purchaseIncrement),
        observedAt: string(price.observedAt)
      }
      priceById.set(mapped.foodPriceId, mapped)
    }
    components.push({
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
    })
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
  const priceBook = object(root.priceBook)
  const units = await loadUnits(client)
  const candidates: PlannerCandidateInput[] = []
  for (const id of stringArray(root.mealOptionVersionIds)) {
    candidates.push(await candidate(client, id, string(priceBook.priceBookId), units))
  }
  const rules = stringArray(root.foodRules)
  return {
    householdId: string(household.id),
    householdSetupVersion: integer(household.version),
    weekStart: string(root.weekStart),
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
    softPreferenceCodes: rules.filter(
      (code) =>
        HOUSEHOLD_RULE_OPTION_BY_CODE.get(code as HouseholdRuleCode)?.ruleKind === "soft_preference"
    ),
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
      const input = await generation(client, generationRaw)
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
