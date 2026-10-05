import { z } from "zod"

import type { CurrentPlanView } from "../../application/planner/planner-use-cases.js"
import { buildPlanTrustView } from "../../application/planner/plan-trust.js"
import { CATALOG_DIMENSIONS, REQUIRED_NUTRIENT_CODES } from "../../domain/catalog/catalog.js"
import { MEAL_OPTION_ROLES } from "../../domain/meal-option/meal-option.js"
import type { ReadyPlan } from "../../domain/planner/search-week.js"
import { canonicalJson } from "../../domain/shared/canonical-json.js"
import { parseCanonicalDecimal } from "../../domain/shared/decimal.js"

const text = z.string().min(1)
const nonnegativeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const positiveInteger = nonnegativeInteger.min(1)
const decimal = z
  .string()
  .refine((value) => parseCanonicalDecimal(value, { allowNegative: false }).ok)
const positiveDecimal = decimal.refine(
  (value) => parseCanonicalDecimal(value, { allowNegative: false, allowZero: false }).ok
)
// Multiplying valid catalog decimals can produce more places than an individual input permits.
// Preserve the stored engine result instead of rounding it or applying input precision limits.
function calculatedAmount(allowZero = true) {
  return z.string().refine((value) => {
    // Engine precision counts significant digits. A small serving ratio may legitimately have
    // more fractional places; only canonical finite shape/sign are checked for stored outputs.
    const parsed = parseCanonicalDecimal(value, {
      maxScale: value.length,
      maxIntegerDigits: Math.max(1, value.length),
      allowNegative: false,
      allowZero
    })
    return parsed.ok && parsed.value.isFinite()
  })
}
const calculatedDecimal = calculatedAmount()
const hash = z.string().regex(/^[0-9a-f]{64}$/u)
const texts = z.array(text)
const date = z.iso.date()
const conversion = z
  .object({
    unitId: text,
    unitCode: text,
    sourceDimension: z.enum(CATALOG_DIMENSIONS),
    sourceToDimensionBase: positiveDecimal,
    foodBaseUnitId: text,
    foodBaseDimension: z.enum(CATALOG_DIMENSIONS),
    foodBaseUnitToDimensionBase: positiveDecimal,
    baseQuantityPerUnit: positiveDecimal,
    grossGramsPerUnit: positiveDecimal,
    displayStep: positiveDecimal
  })
  .passthrough()
const recipe = z
  .object({
    recipeId: text,
    recipeVersionId: text,
    yieldAdultEquivalent: positiveDecimal,
    activeMinutes: positiveInteger,
    elapsedMinutes: positiveInteger,
    ingredients: z
      .array(
        z
          .object({
            recipeIngredientId: text,
            foodId: text,
            foodFactVersionId: text,
            quantity: positiveDecimal,
            order: positiveInteger,
            conversion
          })
          .passthrough()
      )
      .min(1),
    steps: z
      .array(
        z
          .object({
            order: positiveInteger,
            instructionVi: text,
            timerMinutes: nonnegativeInteger.nullable(),
            // Historical recipes before the heat-condition rollout did not state these fields.
            heatLevel: z.enum(["low", "medium", "high"]).nullable().optional(),
            temperatureCelsius: z.number().int().min(40).max(300).nullable().optional(),
            ingredientIds: texts
          })
          .passthrough()
      )
      .min(1)
  })
  .passthrough()
const mealOption = z
  .object({
    mealOptionId: text,
    mealOptionVersionId: text,
    versionNumber: positiveInteger,
    contentHash: hash,
    status: z.literal("published"),
    yieldAdultEquivalent: positiveDecimal,
    activeMinutes: positiveInteger,
    elapsedMinutes: positiveInteger,
    components: z
      .array(
        z
          .object({
            mealOptionRecipeId: text,
            recipeId: text,
            recipeVersionId: text,
            recipeVersionNumber: positiveInteger,
            recipeContentHash: hash,
            recipeStatus: z.literal("published"),
            quantityMultiplier: positiveDecimal,
            mealRole: z.enum(MEAL_OPTION_ROLES),
            sortOrder: positiveInteger,
            recipe
          })
          .passthrough()
      )
      .min(1),
    tags: z.array(
      z
        .object({ tagId: text, code: text, kind: z.enum(["protein_hint", "cooking_style"]) })
        .passthrough()
    )
  })
  .passthrough()
const staleWarning = z
  .object({
    code: z.literal("STALE_PRICE"),
    foodId: text,
    foodPriceId: text,
    observedAt: date,
    ageDays: nonnegativeInteger
  })
  .passthrough()
const warning = z.discriminatedUnion("code", [
  staleWarning,
  z
    .object({
      code: z.literal("PLAN_OVER_BUDGET"),
      budgetVnd: positiveInteger,
      estimatedPlanCostVnd: nonnegativeInteger,
      overageVnd: nonnegativeInteger
    })
    .passthrough(),
  z.object({ code: z.literal("NO_UNDER_BUDGET_PLAN_FOUND_IN_DETERMINISTIC_SEARCH") }).passthrough()
])
const basketLine = z
  .object({
    foodId: text,
    baseUnitId: text,
    requiredBaseQuantity: positiveDecimal,
    // Engines before pantry settlement did not persist deduction projections.
    pantryDeductedBaseQuantity: decimal.optional(),
    purchaseRequiredBaseQuantity: decimal.optional(),
    packageBaseQuantity: positiveDecimal,
    purchaseIncrement: positiveDecimal,
    purchasePackageCount: decimal,
    purchaseBaseQuantity: decimal,
    leftoverBaseQuantity: decimal,
    packagePriceVnd: nonnegativeInteger,
    lineCostVnd: nonnegativeInteger,
    foodPriceId: text,
    priceBookId: text,
    priceFoodFactVersionId: text,
    observedAt: date,
    freshness: z.enum(["current", "stale_usable"])
  })
  .passthrough()
const selectedMeal = z
  .object({
    mealOptionId: text,
    mealOptionVersionId: text,
    mealOptionContentHash: hash,
    mealOptionCode: text,
    mealOptionNameVi: text,
    elapsedMinutes: positiveInteger,
    adultEquivalent: positiveDecimal,
    mealScaleFactor: calculatedAmount(false),
    mealOption,
    scaledIngredients: z
      .array(
        z
          .object({
            sourceId: text,
            mealOptionRecipeId: text,
            recipeIngredientId: text,
            foodId: text,
            foodFactVersionId: text,
            baseUnitId: text,
            baseQuantity: positiveDecimal,
            grossGrams: positiveDecimal,
            componentSortOrder: positiveInteger,
            ingredientOrder: positiveInteger
          })
          .passthrough()
      )
      .min(1),
    nutrition: z
      .object({
        totalEdibleGrams: calculatedAmount(false),
        nutrients: z
          .array(
            z
              .object({
                nutrientCode: z.enum(REQUIRED_NUTRIENT_CODES),
                rawAmount: calculatedDecimal,
                displayAmount: calculatedDecimal,
                unitCode: z.enum(["kcal", "g", "mg"]),
                coveragePercent: z.literal("100")
              })
              .passthrough()
          )
          .length(REQUIRED_NUTRIENT_CODES.length)
          .refine(
            (values) =>
              new Set(values.map((value) => value.nutrientCode)).size ===
              REQUIRED_NUTRIENT_CODES.length
          )
      })
      .passthrough(),
    primaryProteinGroup: text,
    cookingStyleCodes: texts,
    mainRecipeVersionIds: texts,
    roles: texts,
    foodCategoryCodes: texts,
    foodCategoryCodesByFood: z.record(z.string(), texts).optional(),
    requirements: z
      .array(
        z
          .object({
            sourceId: text,
            foodId: text,
            foodFactVersionId: text,
            baseUnitId: text,
            requiredBaseQuantity: positiveDecimal
          })
          .passthrough()
      )
      .min(1),
    prices: z
      .array(
        z
          .object({
            foodPriceId: text,
            priceBookId: text,
            foodId: text,
            foodFactVersionId: text,
            baseUnitId: text,
            packageBaseQuantity: positiveDecimal,
            packagePriceVnd: nonnegativeInteger,
            purchaseIncrement: positiveDecimal,
            observedAt: date
          })
          .passthrough()
      )
      .min(1),
    basketLines: z.array(basketLine),
    warnings: z.array(warning)
  })
  .passthrough()
const calculationSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            dayIndex: nonnegativeInteger.max(6),
            mealSlot: z.literal("primary"),
            mealOptionId: text,
            mealOptionVersionId: text,
            adultEquivalent: positiveDecimal,
            scaleFactor: calculatedAmount(false),
            snapshot: selectedMeal
          })
          .passthrough()
      )
      .length(7),
    selectedMealOptions: z.array(selectedMeal).length(7),
    purchaseBasket: z
      .object({
        lines: z.array(basketLine),
        warnings: z.array(staleWarning),
        totalEstimatedCostVnd: nonnegativeInteger
      })
      .passthrough(),
    score: z
      .object({
        totalQualityPenalty: nonnegativeInteger,
        components: z.record(z.string(), nonnegativeInteger),
        metrics: z.record(z.string(), nonnegativeInteger),
        explanations: texts
      })
      .passthrough()
  })
  .passthrough()
const revisionSchema = z
  .object({
    id: text,
    engine_version: z.enum([
      "planner-engine-v1",
      "planner-engine-v2",
      "planner-engine-v3",
      "planner-engine-v4",
      "planner-engine-v5"
    ]),
    revision_number: positiveInteger,
    household_setup_version: positiveInteger,
    budget_vnd: positiveInteger,
    budget_status: z.enum(["within", "over"]),
    calculation_date: date,
    total_estimated_cost_vnd: nonnegativeInteger,
    warnings: z.array(warning),
    calculation_snapshot: calculationSchema
  })
  .passthrough()

/** Validate stored evidence without recomputing eligibility, quantities, nutrition or cost. */
export function readyLegacyPlanFromRevision(raw: unknown): ReadyPlan {
  const revision = revisionSchema.parse(raw)
  const calculation = revision.calculation_snapshot
  const { items, selectedMealOptions: selected, purchaseBasket } = calculation
  if (
    new Set(items.map((item) => item.dayIndex)).size !== 7 ||
    items.some(
      (item, index) =>
        item.mealOptionId !== item.snapshot.mealOptionId ||
        item.mealOptionVersionId !== item.snapshot.mealOptionVersionId ||
        item.adultEquivalent !== item.snapshot.adultEquivalent ||
        item.scaleFactor !== item.snapshot.mealScaleFactor ||
        item.snapshot.mealOptionId !== item.snapshot.mealOption.mealOptionId ||
        item.snapshot.mealOptionVersionId !== item.snapshot.mealOption.mealOptionVersionId ||
        canonicalJson(item.snapshot) !== canonicalJson(selected[index])
    ) ||
    purchaseBasket.totalEstimatedCostVnd !== revision.total_estimated_cost_vnd
  )
    throw new Error("INVALID_PLAN_SNAPSHOT")
  // Keep the original immutable objects, including fields added by their own historical engine.
  const stored = (raw as { calculation_snapshot: ReadyPlanSnapshot }).calculation_snapshot
  return {
    items: stored.items,
    selected: stored.selectedMealOptions,
    purchaseBasket: stored.purchaseBasket,
    totalEstimatedCostVnd: revision.total_estimated_cost_vnd,
    score: stored.score,
    stableIdSequence: items.map((item) => item.mealOptionVersionId).join("|"),
    frontierMetrics: []
  }
}

type ReadyPlanSnapshot = {
  items: ReadyPlan["items"]
  selectedMealOptions: ReadyPlan["selected"]
  purchaseBasket: ReadyPlan["purchaseBasket"]
  score: ReadyPlan["score"]
}

export function currentLegacyPlanFromStored(raw: unknown): CurrentPlanView {
  const root = z
    .object({ plan: z.object({ id: text }).passthrough(), revision: revisionSchema })
    .passthrough()
    .parse(raw)
  const revision = root.revision
  const plan = readyLegacyPlanFromRevision((raw as { revision: unknown }).revision)
  return {
    planId: root.plan.id,
    revisionId: revision.id,
    planVersion: revision.revision_number,
    householdSetupVersion: revision.household_setup_version,
    // Persistence already decided the status. Do not reinterpret a historical planner decision.
    status: revision.budget_status === "within" ? "ready_within_budget" : "ready_over_budget",
    budgetVnd: revision.budget_vnd,
    plan,
    warnings: revision.warnings,
    trust: buildPlanTrustView(plan, revision.calculation_date)
  }
}
