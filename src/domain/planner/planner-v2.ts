import {
  calculateAdultEquivalent,
  type NormalizedPortionMemberGroup
} from "../portion/calculate-adult-equivalent.js"
import { normalizePlannerInput } from "./normalize-planner-input.js"
import { PORTION_CONFIG_V2 } from "../portion/portion-config.js"
import { PLANNER_CONFIG_V2 } from "./planner-config.js"
import { calculateMemberMealPortions } from "../portion/calculate-member-meal-portions.js"
import { validateMemberProfiles } from "../household/validate-member-profiles.js"
import {
  candidatePublicationIsValid,
  completeLineage,
  nutritionComplete,
  eligibilityDiagnostic,
  HARD_RULE_REJECTION_RANK
} from "./evaluate-eligibility.js"
import { evaluateHardRules } from "../catalog/evaluate-hard-rules.js"
import { isHardRuleCode } from "../catalog/hard-rule-mapping.js"
import { scaleMealOptionForAdultEquivalent } from "../meal-option/scale-meal-option.js"
import { validateMealOptionVersion } from "../meal-option/validate-meal-option.js"
import { calculateRecipeNutrition } from "../nutrition/calculate-recipe-nutrition.js"
import { normalizeCookingQuantity } from "../recipe/normalize-cooking-quantity.js"
import { calculatePurchaseBasketV2 } from "../pricing/calculate-purchase-basket-v2.js"
import { calculateRecipeConsumptionCostV2 } from "../pricing/calculate-recipe-consumption-cost.js"
import type { CanonicalFoodDeduction } from "../pricing/pricing.js"
import { scoreWeeklyPlan, EMPTY_MEAL_OPTION_RATINGS } from "./score-week.js"
import {
  searchBoundedWeek,
  selectFinalPlan,
  qualityLowerBound,
  violatesWeeklyHardRules
} from "./search-week.js"
import {
  ExactDecimal,
  ROUND_HALF_UP,
  roundDecimal,
  parseCanonicalDecimal
} from "../shared/decimal.js"
import { canonicalJson } from "../shared/canonical-json.js"
import type {
  PlannerCandidateInput,
  PlannerInputV1,
  NormalizedPlannerInputV1
} from "./planner-input.js"
import type { HouseholdNutritionSetupV1 } from "../household/member-profile.js"
import type { FoodQuantityPolicyV1 } from "../recipe/food-quantity-policy.js"
import type { CookingQuantityResult } from "../recipe/normalize-cooking-quantity.js"
import type { FoodPriceInputV2, PurchaseBasketV2 } from "../pricing/purchasing-v2.js"
import type { EligibleMealOption, EligibilityRejection } from "./evaluate-eligibility.js"
import type { MemberMealPortion } from "../portion/calculate-member-meal-portions.js"
import type { PortionConfigV2 } from "../portion/portion-config.js"
import type { PlannerConfigV2 } from "./planner-config.js"
import type { WeeklyPlanScore } from "./score-week.js"
import type { FrontierMetric } from "./search-week.js"
import type { PlannerFatalCode, PlannerWarning } from "./planner-outcome.js"
import type { ExplicitMealIngredient } from "../meal-option/scale-meal-option.js"
export interface PlannerCandidateInputV2 extends Omit<PlannerCandidateInput, "prices"> {
  readonly prices: readonly FoodPriceInputV2[]
  readonly quantityPolicies: readonly FoodQuantityPolicyV1[]
}
export interface PlannerInputV2 extends Omit<PlannerInputV1, "candidates"> {
  readonly inputVersion: "planner-input-v2"
  readonly nutritionSetup?: HouseholdNutritionSetupV1
  readonly pantryQuantityPolicies?: readonly FoodQuantityPolicyV1[]
  readonly pantryWholePieceBaseQuantities?: Readonly<Record<string, string>>
  readonly candidates: readonly PlannerCandidateInputV2[]
}
export interface NormalizedPlannerInputV2 extends Omit<
  NormalizedPlannerInputV1,
  "candidates" | "portionConfig" | "plannerConfig" | "memberGroups"
> {
  readonly inputVersion: "planner-input-v2"
  readonly memberGroups: readonly NormalizedPortionMemberGroup[]
  readonly nutritionSetup?: HouseholdNutritionSetupV1
  readonly pantryQuantityPolicies?: readonly FoodQuantityPolicyV1[]
  readonly pantryWholePieceBaseQuantities?: Readonly<Record<string, string>>
  readonly candidates: readonly PlannerCandidateInputV2[]
  readonly portionConfig: PortionConfigV2
  readonly plannerConfig: PlannerConfigV2
  readonly energyTargetConfig: { readonly version: "energy-target-v1" }
}
export type NormalizePlannerInputResultV2 =
  | { readonly ok: true; readonly value: NormalizedPlannerInputV2 }
  | {
      readonly ok: false
      readonly error: {
        readonly code:
          | PlannerFatalCode
          | "INVALID_INDIVISIBLE_PANTRY_QUANTITY"
          | "PANTRY_QUANTITY_POLICY_REQUIRED"
      }
    }
export type QuantityAdjustmentV2 = Extract<
  CookingQuantityResult,
  { readonly ok: true }
>["value"] & {
  readonly sourceId: string
  readonly conversion: ExplicitMealIngredient["conversion"]
}
export interface EligibleMealOptionV2 extends Omit<
  EligibleMealOption,
  "scaledIngredients" | "prices" | "basketLines"
> {
  readonly scaledIngredients: readonly ExplicitMealIngredient[]
  readonly quantityAdjustments: readonly QuantityAdjustmentV2[]
  readonly quantityPolicies: readonly FoodQuantityPolicyV1[]
  readonly memberPortions: readonly (MemberMealPortion & { readonly actualMealKcal: string })[]
  readonly consumptionCost: Extract<
    ReturnType<typeof calculateRecipeConsumptionCostV2>,
    { readonly ok: true }
  >["value"]
  readonly standardServingKcal: string
  readonly prices: readonly FoodPriceInputV2[]
  readonly basketLines: PurchaseBasketV2["lines"]
}
export interface WeeklyPlanScoreV2 extends Omit<WeeklyPlanScore, "components" | "metrics"> {
  readonly components: WeeklyPlanScore["components"] & { readonly energyGoalFit: number }
  readonly metrics: WeeklyPlanScore["metrics"] & { readonly appliedEnergyTargetCount: number }
}
export interface ReadyPlanV2 {
  readonly items: readonly {
    readonly dayIndex: number
    readonly mealSlot: "primary"
    readonly mealOptionId: string
    readonly mealOptionVersionId: string
    readonly adultEquivalent: string
    readonly scaleFactor: string
    readonly snapshot: EligibleMealOptionV2
  }[]
  readonly selected: readonly EligibleMealOptionV2[]
  readonly purchaseBasket: PurchaseBasketV2
  readonly totalEstimatedCostVnd: number
  readonly score: WeeklyPlanScoreV2
  readonly stableIdSequence: string
  readonly frontierMetrics: readonly FrontierMetric[]
  /** Private revision evidence; never returned as a current-plan DTO or cached on a device. */
  readonly inputBinding: Omit<NormalizedPlannerInputV2, "candidates">
  readonly catalogBinding: ReturnType<typeof catalogBindingV2>
}
export type EligibilityResultV2 =
  | {
      readonly ok: true
      readonly value: {
        readonly eligible: readonly EligibleMealOptionV2[]
        readonly warnings: readonly PlannerWarning[]
        readonly rejected: readonly EligibilityRejection[]
      }
    }
  | {
      readonly ok: false
      readonly error: {
        readonly code: PlannerFatalCode
        readonly ruleCode?: string
        readonly scope?: string
      }
    }
export type PlannerSearchResultV2 =
  | {
      readonly status: "ready_within_budget" | "ready_over_budget"
      readonly plan: ReadyPlanV2
      readonly warnings: readonly PlannerWarning[]
    }
  | { readonly ok: false; readonly error: { readonly code: PlannerFatalCode } }
export type MealReplacementPreviewResultV2 =
  | {
      readonly ok: true
      readonly value: {
        readonly status: "ready_within_budget" | "ready_over_budget"
        readonly plan: ReadyPlanV2
        readonly weeklyCostDeltaVnd: number
        readonly warnings: readonly PlannerWarning[]
      }
    }
  | { readonly ok: false; readonly error: { readonly code: PlannerFatalCode } }
const canon = (value: InstanceType<typeof ExactDecimal>) => roundDecimal(value, 18, ROUND_HALF_UP)
const lexical = (a: string, b: string) => (a === b ? 0 : a < b ? -1 : 1)
export function normalizePlannerInputV2(input: PlannerInputV2): NormalizePlannerInputResultV2 {
  if (input.inputVersion !== "planner-input-v2")
    return { ok: false, error: { code: "INVALID_PLANNER_INPUT" } }
  if (input.candidates.length > PLANNER_CONFIG_V2.candidateLimit)
    return { ok: false, error: { code: "CATALOG_CANDIDATE_LIMIT_EXCEEDED" } }
  // V1 owns the unchanged household/rule/calendar validation. Catalog validation remains versioned.
  const common = normalizePlannerInput({ ...input, candidates: [] })
  if (!common.ok) return common
  const members = calculateAdultEquivalent(common.value.memberGroups)
  if (!members.ok) return { ok: false, error: { code: "INVALID_PLANNER_INPUT" } }
  const duplicate = (values: readonly string[]) => new Set(values).size !== values.length
  if (
    duplicate(input.candidates.map((c) => c.mealOption.mealOptionVersionId)) ||
    input.candidates.some(
      (c) =>
        duplicate(c.prices.map((p) => p.foodPriceId)) ||
        duplicate(c.prices.map((p) => p.foodId)) ||
        duplicate(c.quantityPolicies.map((p) => p.foodFactVersionId)) ||
        duplicate(c.quantityPolicies.map((p) => p.id)) ||
        duplicate(c.ingredientLineage.map((l) => `${l.mealOptionRecipeId}:${l.recipeIngredientId}`))
    )
  )
    return { ok: false, error: { code: "INVALID_PLANNER_INPUT" } }
  if (
    common.value.pantrySnapshot.items.some(
      (p) => p.baseDimension === "count" && !new ExactDecimal(p.baseQuantity).isInteger()
    )
  )
    return { ok: false, error: { code: "INVALID_INDIVISIBLE_PANTRY_QUANTITY" } }
  const stockPolicies = input.pantryQuantityPolicies ?? []
  if (
    duplicate(stockPolicies.map((p) => p.foodFactVersionId)) ||
    duplicate(stockPolicies.map((p) => p.id))
  )
    return { ok: false, error: { code: "INVALID_PLANNER_INPUT" } }
  const pieceQuantities = input.pantryWholePieceBaseQuantities
  if (
    pieceQuantities !== undefined &&
    Object.values(pieceQuantities).some(
      (q) => !parseCanonicalDecimal(q, { allowZero: false, allowNegative: false }).ok
    )
  )
    return { ok: false, error: { code: "INVALID_PLANNER_INPUT" } }
  for (const stock of common.value.pantrySnapshot.items) {
    const policies = [...stockPolicies, ...input.candidates.flatMap((c) => c.quantityPolicies)]
    const policy = policies.find((p) => p.foodFactVersionId === stock.foodFactVersionId)
    if (
      !policy &&
      input.candidates.some(
        (c) =>
          c.ingredientLineage.some((l) => l.foodId === stock.foodId) &&
          c.quantityPolicies.some((p) => p.foodForm === "whole_piece")
      )
    )
      return { ok: false, error: { code: "PANTRY_QUANTITY_POLICY_REQUIRED" } }
    if (policy?.foodForm !== "whole_piece") continue
    const measured = input.candidates
      .flatMap((c) => c.mealOption.components.flatMap((component) => component.recipe.ingredients))
      .find(
        (i) =>
          i.foodFactVersionId === stock.foodFactVersionId &&
          i.conversion?.sourceDimension === "count"
      )?.conversion
    const quantum =
      pieceQuantities?.[stock.foodFactVersionId] ??
      (measured
        ? canon(new ExactDecimal(measured.baseQuantityPerUnit).div(measured.sourceToDimensionBase))
        : undefined)
    if (
      quantum === undefined ||
      policy.baseUnitId !== stock.baseUnitId ||
      !new ExactDecimal(policy.stepBaseQuantity).div(quantum).isInteger()
    )
      return { ok: false, error: { code: "PANTRY_QUANTITY_POLICY_REQUIRED" } }
    if (!new ExactDecimal(stock.baseQuantity).div(quantum).isInteger())
      return { ok: false, error: { code: "INVALID_INDIVISIBLE_PANTRY_QUANTITY" } }
  }
  let nutritionSetup: HouseholdNutritionSetupV1 | undefined
  if (input.nutritionSetup !== undefined) {
    const shape = calculateMemberMealPortions(common.value.memberGroups, input.nutritionSetup, "1")
    const profiles = validateMemberProfiles(
      input.nutritionSetup.memberProfiles,
      members.value.memberGroups
    )
    if (!shape.ok || !profiles.ok) return { ok: false, error: { code: "INVALID_PLANNER_INPUT" } }
    nutritionSetup = {
      version: "household-nutrition-v1",
      plannedMealSharePercent: input.nutritionSetup.plannedMealSharePercent,
      memberProfiles: profiles.value
    }
  }
  const candidates = input.candidates
    .map((c) => ({
      ...c,
      ingredientLineage: [...c.ingredientLineage].sort((a, b) =>
        lexical(
          `${a.mealOptionRecipeId}:${a.recipeIngredientId}`,
          `${b.mealOptionRecipeId}:${b.recipeIngredientId}`
        )
      ),
      prices: [...c.prices].sort(
        (a, b) => lexical(a.foodId, b.foodId) || lexical(a.foodPriceId, b.foodPriceId)
      ),
      quantityPolicies: [...c.quantityPolicies].sort(
        (a, b) =>
          lexical(a.foodFactVersionId, b.foodFactVersionId) || a.versionNumber - b.versionNumber
      )
    }))
    .sort((a, b) => lexical(a.mealOption.mealOptionVersionId, b.mealOption.mealOptionVersionId))
  const { nutritionSetup: _ignored, ...raw } = common.value as typeof common.value & {
    nutritionSetup?: HouseholdNutritionSetupV1
  }
  void _ignored
  return {
    ok: true,
    value: {
      ...raw,
      memberGroups: members.value.memberGroups,
      ...(input.pantryQuantityPolicies === undefined
        ? {}
        : {
            pantryQuantityPolicies: [...stockPolicies].sort((a, b) =>
              lexical(a.foodFactVersionId, b.foodFactVersionId)
            )
          }),
      ...(pieceQuantities === undefined
        ? {}
        : {
            pantryWholePieceBaseQuantities: Object.fromEntries(
              Object.entries(pieceQuantities).sort(([a], [b]) => lexical(a, b))
            )
          }),
      inputVersion: "planner-input-v2",
      ...(nutritionSetup === undefined ? {} : { nutritionSetup }),
      candidates,
      portionConfig: PORTION_CONFIG_V2,
      plannerConfig: PLANNER_CONFIG_V2,
      energyTargetConfig: { version: "energy-target-v1" }
    }
  }
}
function nutritionFor(
  candidate: PlannerCandidateInputV2,
  ingredients: readonly ExplicitMealIngredient[]
) {
  const lineages = new Map(
    candidate.ingredientLineage.map((l) => [`${l.mealOptionRecipeId}:${l.recipeIngredientId}`, l])
  )
  const mapped = ingredients.flatMap((ingredient, index) => {
    const l = lineages.get(ingredient.sourceId)
    return l === undefined ||
      l.foodId !== ingredient.foodId ||
      l.foodFactVersionId !== ingredient.foodFactVersionId ||
      l.baseUnitId !== ingredient.baseUnitId ||
      l.baseDimension !== ingredient.conversion.foodBaseDimension
      ? []
      : [
          {
            recipeIngredientId: ingredient.sourceId,
            order: index + 1,
            grossGrams: ingredient.grossGrams,
            edibleFraction: l.edibleFraction,
            nutrients: l.nutrients
          }
        ]
  })
  if (mapped.length !== ingredients.length) return null
  const result = calculateRecipeNutrition(mapped)
  return result.ok
    ? {
        totalEdibleGrams: canon(new ExactDecimal(result.value.totalEdibleGrams)),
        nutrients: result.value.nutrients.map((n) => ({
          ...n,
          rawAmount: canon(new ExactDecimal(n.rawAmount))
        }))
      }
    : null
}
export function evaluatePlannerEligibilityV2(input: NormalizedPlannerInputV2): EligibilityResultV2 {
  const unsupported = input.hardRuleCodes.find((c) => !isHardRuleCode(c) || c === "allergen_other")
  if (unsupported !== undefined)
    return { ok: false, error: { code: "UNSUPPORTED_HARD_RULE", ruleCode: unsupported } }
  const eligible: EligibleMealOptionV2[] = []
  const rejected: EligibilityRejection[] = []
  for (const candidate of input.candidates) {
    const reject = (stage: EligibilityRejection["stage"], code: string) =>
      rejected.push({ mealOptionVersionId: candidate.mealOption.mealOptionVersionId, stage, code })
    if (!candidatePublicationIsValid(candidate)) {
      reject(1, "PUBLICATION_INVALID")
      continue
    }
    if (!completeLineage(candidate)) {
      reject(2, "INCOMPLETE_LINEAGE")
      continue
    }
    const hard = evaluateHardRules(
      input.hardRuleCodes,
      candidate.ingredientLineage.map((l) => ({
        recipeIngredientId: `${l.mealOptionRecipeId}:${l.recipeIngredientId}`,
        allergenAssessments: l.allergenAssessments,
        categoryAncestry: l.categoryAncestry,
        dietaryTagCodes: l.dietaryTagCodes
      })),
      input.allergenStrictness
    )
    if (hard.status !== "eligible") {
      reject(HARD_RULE_REJECTION_RANK[hard.status], hard.status)
      continue
    }
    if (candidate.mealOption.elapsedMinutes > input.maxElapsedMinutes) {
      reject(4, "TIME_LIMIT_EXCEEDED")
      continue
    }
    if (!nutritionComplete(candidate)) {
      reject(6, "INCOMPLETE_NUTRITION")
      continue
    }
    const standard = scaleMealOptionForAdultEquivalent(candidate.mealOption, "1")
    if (!standard.ok) {
      reject(6, standard.error.code)
      continue
    }
    const standardNutrition = nutritionFor(candidate, standard.value.ingredients)
    const standardServingKcal = standardNutrition?.nutrients.find(
      (n) => n.nutrientCode === "energy_kcal"
    )?.rawAmount
    if (standardServingKcal === undefined || !new ExactDecimal(standardServingKcal).gt(0)) {
      reject(6, "INVALID_STANDARD_SERVING_ENERGY")
      continue
    }
    const portions = calculateMemberMealPortions(
      input.memberGroups,
      input.nutritionSetup,
      standardServingKcal
    )
    if (!portions.ok) {
      reject(6, portions.error.code)
      continue
    }
    const scaled = scaleMealOptionForAdultEquivalent(
      candidate.mealOption,
      portions.value.adultEquivalent
    )
    if (!scaled.ok) {
      reject(6, scaled.error.code)
      continue
    }
    const adjusted = scaled.value.ingredients.map((ingredient) => {
      const policy =
        candidate.quantityPolicies.find(
          (p) => p.foodFactVersionId === ingredient.foodFactVersionId
        ) ?? null
      return {
        ingredient,
        result: normalizeCookingQuantity(
          {
            recipeIngredientId: ingredient.recipeIngredientId,
            foodId: ingredient.foodId,
            foodFactVersionId: ingredient.foodFactVersionId,
            order: ingredient.ingredientOrder,
            unitId: ingredient.unitId,
            sourceQuantity: ingredient.sourceQuantity,
            baseUnitId: ingredient.baseUnitId,
            baseQuantity: ingredient.baseQuantity,
            grossGrams: ingredient.grossGrams
          },
          ingredient.conversion,
          policy
        )
      }
    })
    const indivisibleMismatch = scaled.value.ingredients.some((ingredient) => {
      const policy = candidate.quantityPolicies.find(
        (p) => p.foodFactVersionId === ingredient.foodFactVersionId
      )
      if (policy?.foodForm !== "whole_piece") return false
      const price = candidate.prices.find((p) => p.foodId === ingredient.foodId)
      const c = ingredient.conversion
      if (
        !price ||
        price.foodFactVersionId !== ingredient.foodFactVersionId ||
        c.sourceDimension !== "count"
      )
        return true
      const piece = new ExactDecimal(c.baseQuantityPerUnit).div(c.sourceToDimensionBase)
      const quantum =
        price.purchaseRule.mode === "fixed_pack"
          ? new ExactDecimal(price.quoteBaseQuantity).mul(price.purchaseRule.packIncrement)
          : new ExactDecimal(price.purchaseRule.saleStepBaseQuantity)
      return (
        !quantum.div(piece).isInteger() ||
        (price.purchaseRule.mode === "fixed_pack" &&
          !new ExactDecimal(price.quoteBaseQuantity).div(piece).isInteger()) ||
        input.pantrySnapshot.items.some(
          (stock) =>
            stock.foodId === ingredient.foodId &&
            (stock.foodFactVersionId !== ingredient.foodFactVersionId ||
              !new ExactDecimal(stock.baseQuantity).div(piece).isInteger())
        )
      )
    })
    if (indivisibleMismatch) {
      reject(6, "INCOMPATIBLE_WHOLE_UNIT_PRICE_OR_STOCK")
      continue
    }
    const bad = adjusted.find((a) => !a.result.ok)
    if (bad !== undefined && !bad.result.ok) {
      reject(6, bad.result.error.code)
      continue
    }
    const quantityAdjustments = adjusted.flatMap((a) =>
      a.result.ok
        ? [
            {
              ...a.result.value,
              sourceId: a.ingredient.sourceId,
              conversion: a.ingredient.conversion
            }
          ]
        : []
    )
    const scaledIngredients = adjusted.flatMap((a) =>
      a.result.ok
        ? [
            {
              ...a.ingredient,
              sourceQuantity: a.result.value.actualIngredient.sourceQuantity,
              baseQuantity: a.result.value.actualIngredient.baseQuantity,
              grossGrams: a.result.value.actualIngredient.grossGrams
            }
          ]
        : []
    )
    const requirements = scaledIngredients.map((i) => ({
      sourceId: i.sourceId,
      foodId: i.foodId,
      foodFactVersionId: i.foodFactVersionId,
      baseUnitId: i.baseUnitId,
      requiredBaseQuantity: i.baseQuantity
    }))
    const basket = calculatePurchaseBasketV2(
      requirements,
      candidate.prices,
      input.calculationDate,
      input.priceFreshnessConfig
    )
    if (!basket.ok) {
      reject(5, basket.error.code)
      continue
    }
    const consumptionCost = calculateRecipeConsumptionCostV2(
      scaledIngredients.map((i, index) => ({
        recipeIngredientId: i.sourceId,
        foodId: i.foodId,
        foodFactVersionId: i.foodFactVersionId,
        baseUnitId: i.baseUnitId,
        baseQuantity: i.baseQuantity,
        order: index + 1
      })),
      candidate.prices,
      input.calculationDate,
      input.priceFreshnessConfig
    )
    if (!consumptionCost.ok) {
      reject(5, consumptionCost.error.code)
      continue
    }
    const nutrition = nutritionFor(candidate, scaledIngredients)
    if (nutrition === null) {
      reject(6, "INCOMPLETE_NUTRITION_LINEAGE")
      continue
    }
    const structure = validateMealOptionVersion(candidate.mealOption)
    if (!structure.ok) {
      reject(7, structure.error.code)
      continue
    }
    const totalKcal = nutrition.nutrients.find((n) => n.nutrientCode === "energy_kcal")!.rawAmount
    const memberPortions = portions.value.portions.map((p) => ({
      ...p,
      actualMealKcal: canon(
        new ExactDecimal(totalKcal).mul(p.coefficientPerMember).div(portions.value.adultEquivalent)
      )
    }))
    eligible.push({
      mealOptionId: structure.value.mealOptionId,
      mealOptionVersionId: structure.value.mealOptionVersionId,
      mealOptionContentHash: structure.value.contentHash,
      mealOptionCode: candidate.mealOptionCode,
      mealOptionNameVi: candidate.mealOptionNameVi,
      elapsedMinutes: structure.value.elapsedMinutes,
      adultEquivalent: scaled.value.adultEquivalent,
      mealScaleFactor: scaled.value.mealScaleFactor,
      mealOption: candidate.mealOption,
      scaledIngredients,
      quantityAdjustments,
      quantityPolicies: candidate.quantityPolicies,
      memberPortions,
      standardServingKcal,
      nutrition,
      consumptionCost: consumptionCost.value,
      primaryProteinGroup: structure.value.primaryProteinGroup,
      cookingStyleCodes: structure.value.cookingStyleCodes,
      mainRecipeVersionIds: structure.value.mainRecipeVersionIds,
      roles: structure.value.components.map((c) => c.mealRole).sort(),
      foodCategoryCodes: [
        ...new Set(candidate.ingredientLineage.flatMap((l) => l.categoryAncestry))
      ].sort(),
      foodCategoryCodesByFood: Object.fromEntries(
        candidate.ingredientLineage
          .map((l) => [l.foodId, [...l.categoryAncestry].sort()] as const)
          .sort(([a], [b]) => lexical(a, b))
      ),
      requirements,
      prices: candidate.prices,
      basketLines: basket.value.lines,
      warnings: basket.value.warnings
    })
  }
  rejected.sort(
    (a, b) =>
      lexical(a.mealOptionVersionId, b.mealOptionVersionId) ||
      a.stage - b.stage ||
      lexical(a.code, b.code)
  )
  if (eligible.length === 0)
    return {
      ok: false,
      error: { code: eligibilityDiagnostic(rejected), scope: "EXACT_LOADED_CATALOG_SNAPSHOT" }
    }
  const warnings = eligible
    .flatMap((e) => e.warnings)
    .sort((a, b) =>
      a.code === "STALE_PRICE" && b.code === "STALE_PRICE"
        ? lexical(a.foodId, b.foodId) || lexical(a.foodPriceId, b.foodPriceId)
        : 0
    )
  return { ok: true, value: { eligible, warnings, rejected } }
}
function energyPenaltyPairs(selected: readonly EligibleMealOptionV2[]) {
  return selected.flatMap((m) =>
    m.memberPortions
      .filter((p) => p.energyTargetStatus === "applied" && p.mealTargetKcal !== null)
      .map((p) =>
        ExactDecimal.min(
          1,
          new ExactDecimal(p.actualMealKcal).minus(p.mealTargetKcal!).abs().div(p.mealTargetKcal!)
        )
          .mul("0.75")
          .plus(
            ExactDecimal.min(1, new ExactDecimal(p.coefficientPerMember).minus(1).abs()).mul("0.25")
          )
      )
  )
}
export function scoreWeeklyPlanV2(
  selected: readonly EligibleMealOptionV2[],
  basket: PurchaseBasketV2,
  input: NormalizedPlannerInputV2
): WeeklyPlanScoreV2 {
  const deductions = pantryDeductionsV2(input)
  const old = scoreWeeklyPlan(
    selected,
    basket,
    input.softPreferenceCodes,
    input.plannerConfig,
    deductions,
    input.recentMealOptionIds ?? [],
    input.mealOptionRatings ?? EMPTY_MEAL_OPTION_RATINGS
  )
  const pairs = energyPenaltyPairs(selected)
  const energyGoalFit =
    pairs.length === 0
      ? 0
      : pairs
          .reduce((s, p) => s.plus(p), new ExactDecimal(0))
          .div(pairs.length)
          .mul(input.plannerConfig.scoringWeights.energyGoalFit)
          .toDecimalPlaces(0, ROUND_HALF_UP)
          .toNumber()
  return {
    ...old,
    totalQualityPenalty: old.totalQualityPenalty + energyGoalFit,
    components: { ...old.components, energyGoalFit },
    metrics: { ...old.metrics, appliedEnergyTargetCount: pairs.length },
    explanations: [
      ...old.explanations,
      pairs.length === 0
        ? "ENERGY_GOALS_NOT_APPLIED"
        : "ENERGY_GOAL_FIT_ACTUAL_KCAL_AND_PORTION_DEVIATION"
    ]
  }
}
export function pantryDeductionsV2(input: PlannerInputV2): readonly CanonicalFoodDeduction[] {
  return input.pantrySnapshot.items.map((i) => ({
    foodId: i.foodId,
    baseUnitId: i.baseUnitId,
    availableBaseQuantity: i.baseQuantity
  }))
}
export function purchaseBasketForV2(
  input: NormalizedPlannerInputV2,
  selected: readonly EligibleMealOptionV2[]
): PurchaseBasketV2 | null {
  const prices = new Map<string, FoodPriceInputV2>()
  for (const price of selected.flatMap((m) => m.prices)) {
    const old = prices.get(price.foodId)
    if (old !== undefined && canonicalJson(old) !== canonicalJson(price)) return null
    prices.set(price.foodId, price)
  }
  const requirements = selected.flatMap((m) => m.requirements)
  const requiredFoods = new Set(requirements.map((r) => r.foodId))
  const result = calculatePurchaseBasketV2(
    requirements,
    [...prices.values()].sort((a, b) => lexical(a.foodId, b.foodId)),
    input.calculationDate,
    input.priceFreshnessConfig,
    pantryDeductionsV2(input).filter((d) => requiredFoods.has(d.foodId))
  )
  return result.ok ? result.value : null
}
export function catalogBindingV2(input: NormalizedPlannerInputV2) {
  return input.candidates.map((c) => ({
    mealOptionId: c.mealOption.mealOptionId,
    mealOptionVersionId: c.mealOption.mealOptionVersionId,
    mealOptionContentHash: c.mealOptionContentHash,
    recipeVersions: c.mealOption.components
      .map((r) => ({ recipeVersionId: r.recipeVersionId, contentHash: r.recipeContentHash }))
      .sort((a, b) => lexical(a.recipeVersionId, b.recipeVersionId)),
    foodFacts: c.ingredientLineage
      .map((l) => ({ foodFactVersionId: l.foodFactVersionId, contentHash: l.foodFactContentHash }))
      .sort((a, b) => lexical(a.foodFactVersionId, b.foodFactVersionId)),
    prices: c.prices.map((p) => ({
      priceBookId: p.priceBookId,
      foodPriceId: p.foodPriceId,
      fingerprint: canonicalJson({ ...p, priceBookContentHash: c.priceBookContentHash }),
      purchaseTermsContentHash: p.purchaseTermsContentHash
    })),
    quantityPolicies: c.quantityPolicies.map((p) => ({
      foodQuantityPolicyVersionId: p.id,
      foodFactVersionId: p.foodFactVersionId,
      versionNumber: p.versionNumber,
      contentHash: p.contentHash,
      fingerprint: canonicalJson(p)
    }))
  }))
}
function privateInputBinding(input: NormalizedPlannerInputV2) {
  const { candidates, ...binding } = input
  void candidates
  return binding
}
function completedPlanV2(
  input: NormalizedPlannerInputV2,
  selected: readonly EligibleMealOptionV2[]
) {
  if (selected.length !== input.plannerConfig.dayCount || violatesWeeklyHardRules(selected))
    return null
  const basket = purchaseBasketForV2(input, selected)
  return basket === null
    ? null
    : {
        selected,
        basket,
        score: scoreWeeklyPlanV2(selected, basket, input),
        stableIdSequence: selected.map((m) => m.mealOptionVersionId).join("|")
      }
}
function readyPlanV2(
  input: NormalizedPlannerInputV2,
  chosen: NonNullable<ReturnType<typeof completedPlanV2>>,
  frontierMetrics: readonly FrontierMetric[]
): ReadyPlanV2 {
  return {
    items: chosen.selected.map((m, dayIndex) => ({
      dayIndex,
      mealSlot: "primary",
      mealOptionId: m.mealOptionId,
      mealOptionVersionId: m.mealOptionVersionId,
      adultEquivalent: m.adultEquivalent,
      scaleFactor: m.mealScaleFactor,
      snapshot: m
    })),
    selected: chosen.selected,
    purchaseBasket: chosen.basket,
    totalEstimatedCostVnd: chosen.basket.totalEstimatedCostVnd,
    score: chosen.score,
    stableIdSequence: chosen.stableIdSequence,
    frontierMetrics,
    inputBinding: privateInputBinding(input),
    catalogBinding: catalogBindingV2(input)
  }
}
export function searchWeekV2(
  input: NormalizedPlannerInputV2,
  eligible: readonly EligibleMealOptionV2[]
): PlannerSearchResultV2 {
  const appliedPerMeal =
    eligible[0]?.memberPortions.filter((p) => p.energyTargetStatus === "applied").length ?? 0
  const energyPenaltyByMeal = new Map(
    eligible.map((meal) => [
      meal.mealOptionVersionId,
      energyPenaltyPairs([meal]).reduce((sum, penalty) => sum.plus(penalty), new ExactDecimal(0))
    ])
  )
  const { complete, frontierMetrics } = searchBoundedWeek({
    eligible,
    config: input.plannerConfig,
    emptyBasket: { lines: [], warnings: [], totalEstimatedCostVnd: 0 },
    basketFor: (selected) => purchaseBasketForV2(input, selected),
    qualityLowerBound: (selected) =>
      qualityLowerBound(
        selected,
        input.softPreferenceCodes,
        input.plannerConfig,
        input.recentMealOptionIds ?? [],
        input.mealOptionRatings ?? EMPTY_MEAL_OPTION_RATINGS
      ) +
      (appliedPerMeal === 0
        ? 0
        : selected
            .reduce(
              (sum, meal) => sum.plus(energyPenaltyByMeal.get(meal.mealOptionVersionId)!),
              new ExactDecimal(0)
            )
            .div(appliedPerMeal * input.plannerConfig.dayCount)
            .mul(input.plannerConfig.scoringWeights.energyGoalFit)
            .toDecimalPlaces(0, ROUND_HALF_UP)
            .toNumber()),
    complete: (selected) => completedPlanV2(input, selected)
  })
  if (complete.length === 0)
    return { ok: false, error: { code: "NO_COMPLETE_PLAN_FOUND_IN_DETERMINISTIC_SEARCH" } }
  const chosen = selectFinalPlan(complete, input.weeklyPlanBudgetVnd)
  return {
    status: chosen.status,
    warnings: chosen.warnings,
    plan: readyPlanV2(input, chosen.plan, frontierMetrics)
  }
}
export function previewMealReplacementV2(
  input: NormalizedPlannerInputV2,
  currentPlan: ReadyPlanV2,
  dayIndex: number
): MealReplacementPreviewResultV2 {
  if (
    canonicalJson(privateInputBinding(input)) !== canonicalJson(currentPlan.inputBinding) ||
    canonicalJson(catalogBindingV2(input)) !== canonicalJson(currentPlan.catalogBinding)
  )
    return { ok: false, error: { code: "PLAN_INPUT_CHANGED_REGENERATION_REQUIRED" } }
  if (
    !Number.isInteger(dayIndex) ||
    dayIndex < 0 ||
    dayIndex >= input.plannerConfig.dayCount ||
    currentPlan.items.length !== 7 ||
    currentPlan.selected.length !== 7
  )
    return { ok: false, error: { code: "REPLACEMENT_UNAVAILABLE_WITHIN_DETERMINISTIC_SEARCH" } }
  const eligibility = evaluatePlannerEligibilityV2(input)
  if (!eligibility.ok) return eligibility
  const target = currentPlan.selected[dayIndex]!
  const alternatives = eligibility.value.eligible
    .filter(
      (c) =>
        c.mealOptionId !== target.mealOptionId &&
        c.mealOptionVersionId !== target.mealOptionVersionId
    )
    .map((c) =>
      completedPlanV2(
        input,
        currentPlan.selected.map((m, i) => (i === dayIndex ? c : m))
      )
    )
    .filter((c): c is NonNullable<typeof c> => c !== null)
  if (alternatives.length === 0)
    return { ok: false, error: { code: "REPLACEMENT_UNAVAILABLE_WITHIN_DETERMINISTIC_SEARCH" } }
  const chosen = selectFinalPlan(alternatives, input.weeklyPlanBudgetVnd)
  const plan = readyPlanV2(input, chosen.plan, currentPlan.frontierMetrics)
  return {
    ok: true,
    value: {
      status: chosen.status,
      plan: {
        ...plan,
        items: plan.items.map((item, i) => (i === dayIndex ? item : currentPlan.items[i]!))
      },
      weeklyCostDeltaVnd: plan.totalEstimatedCostVnd - currentPlan.totalEstimatedCostVnd,
      warnings: chosen.warnings
    }
  }
}
