import {
  catalogBindingV2,
  purchaseBasketForV2,
  type NormalizedPlannerInputV2,
  type ReadyPlanV2
} from "../planner/planner-v2.js"
import { canonicalJson } from "../shared/canonical-json.js"
import { ExactDecimal, decimalToCanonical } from "../shared/decimal.js"
import { normalizeCookingQuantity } from "../recipe/normalize-cooking-quantity.js"
import { categoryFor, sourceOrder } from "./build-shopping-list-snapshot.js"
import { GROCERY_CATEGORY_CONFIG_VERSION } from "./grocery-category-config.js"
import type {
  BuildShoppingListSnapshotResultV2,
  ShoppingFactRefV1,
  ShoppingListSnapshotLineV2,
  ShoppingQuantityPolicyRef,
  ShoppingSourceV2,
  ShoppingWarning
} from "./shopping-list.js"
export function buildShoppingListSnapshotV2(
  input: NormalizedPlannerInputV2,
  plan: ReadyPlanV2
): BuildShoppingListSnapshotResultV2 {
  const fail = (): BuildShoppingListSnapshotResultV2 => ({
    ok: false,
    error: { code: "INCOMPLETE_SHOPPING_LINEAGE" }
  })
  const { candidates, ...inputBinding } = input
  void candidates
  if (
    plan.items.length !== 7 ||
    plan.selected.length !== 7 ||
    canonicalJson(inputBinding) !== canonicalJson(plan.inputBinding) ||
    canonicalJson(plan.catalogBinding) !== canonicalJson(catalogBindingV2(input))
  )
    return fail()
  const aggregate = new Map<
    string,
    {
      baseUnitId: string
      baseDimension: string
      sources: ShoppingSourceV2[]
      facts: Map<string, ShoppingFactRefV1>
      policies: Map<string, ShoppingQuantityPolicyRef>
      categoryEvidence: Map<
        string,
        { foodFactVersionId: string; categoryAncestry: readonly string[] }
      >
    }
  >()
  for (const item of plan.items) {
    const candidate = input.candidates.find(
      (c) => c.mealOption.mealOptionVersionId === item.mealOptionVersionId
    )
    if (
      !candidate ||
      candidate.mealOption.mealOptionId !== item.mealOptionId ||
      canonicalJson(item.snapshot) !== canonicalJson(plan.selected[item.dayIndex])
    )
      return fail()
    for (const ingredient of item.snapshot.scaledIngredients) {
      const lineage = candidate.ingredientLineage.find(
        (l) =>
          l.foodFactVersionId === ingredient.foodFactVersionId &&
          l.recipeIngredientId === ingredient.recipeIngredientId &&
          l.mealOptionRecipeId === ingredient.mealOptionRecipeId
      )
      const adjustment = item.snapshot.quantityAdjustments.find(
        (a) => a.sourceId === ingredient.sourceId
      )
      const policy = candidate.quantityPolicies.find(
        (p) => p.foodFactVersionId === ingredient.foodFactVersionId
      )
      if (!lineage || !adjustment || !policy) return fail()
      const replay = normalizeCookingQuantity(
        adjustment.theoreticalIngredient,
        ingredient.conversion,
        policy
      )
      if (
        !replay.ok ||
        canonicalJson(replay.value) !==
          canonicalJson({
            actualIngredient: adjustment.actualIngredient,
            theoreticalIngredient: adjustment.theoreticalIngredient,
            policyRef: adjustment.policyRef,
            adjustmentReason: adjustment.adjustmentReason
          }) ||
        replay.value.actualIngredient.baseQuantity !== ingredient.baseQuantity ||
        replay.value.actualIngredient.sourceQuantity !== ingredient.sourceQuantity ||
        replay.value.actualIngredient.grossGrams !== ingredient.grossGrams
      )
        return fail()
      let a = aggregate.get(ingredient.foodId)
      if (!a) {
        a = {
          baseUnitId: ingredient.baseUnitId,
          baseDimension: ingredient.conversion.foodBaseDimension,
          sources: [],
          facts: new Map(),
          policies: new Map(),
          categoryEvidence: new Map()
        }
        aggregate.set(ingredient.foodId, a)
      }
      if (
        a.baseUnitId !== ingredient.baseUnitId ||
        a.baseDimension !== ingredient.conversion.foodBaseDimension
      )
        return {
          ok: false,
          error: { code: "INCOMPATIBLE_CANONICAL_DIMENSION", foodId: ingredient.foodId }
        }
      a.sources.push({
        dayIndex: item.dayIndex,
        mealOptionId: item.mealOptionId,
        mealOptionVersionId: item.mealOptionVersionId,
        mealOptionRecipeId: ingredient.mealOptionRecipeId,
        recipeVersionId: candidate.mealOption.components.find(
          (c) => c.mealOptionRecipeId === ingredient.mealOptionRecipeId
        )!.recipeVersionId,
        recipeIngredientId: ingredient.recipeIngredientId,
        foodId: ingredient.foodId,
        foodFactVersionId: ingredient.foodFactVersionId,
        baseUnitId: ingredient.baseUnitId,
        requiredBaseQuantity: ingredient.baseQuantity,
        quantityPolicyRef: adjustment.policyRef
      })
      a.facts.set(lineage.foodFactVersionId, {
        foodFactVersionId: lineage.foodFactVersionId,
        contentHash: lineage.foodFactContentHash
      })
      a.policies.set(policy.id, adjustment.policyRef)
      a.categoryEvidence.set(lineage.foodFactVersionId, {
        foodFactVersionId: lineage.foodFactVersionId,
        categoryAncestry: lineage.categoryAncestry
      })
    }
  }
  const replayBasket = purchaseBasketForV2(input, plan.selected)
  if (
    !replayBasket ||
    canonicalJson(replayBasket) !== canonicalJson(plan.purchaseBasket) ||
    replayBasket.lines.length !== aggregate.size ||
    replayBasket.totalEstimatedCostVnd !== plan.totalEstimatedCostVnd
  )
    return { ok: false, error: { code: "PURCHASE_BASKET_PROJECTION_MISMATCH" } }
  const warnings: ShoppingWarning[] = [...replayBasket.warnings]
  const lines: ShoppingListSnapshotLineV2[] = []
  for (const basket of replayBasket.lines) {
    const a = aggregate.get(basket.foodId)
    if (
      !a ||
      basket.baseUnitId !== a.baseUnitId ||
      basket.requiredBaseQuantity !==
        decimalToCanonical(
          a.sources.reduce((s, i) => s.plus(i.requiredBaseQuantity), new ExactDecimal(0))
        )
    )
      return fail()
    const category = categoryFor({ foodId: basket.foodId, categoryEvidence: a.categoryEvidence })
    if (category.warning) warnings.push(category.warning)
    lines.push({
      ...basket,
      groceryCategoryCode: category.category,
      factRefs: [...a.facts.values()].sort((l, r) =>
        l.foodFactVersionId.localeCompare(r.foodFactVersionId)
      ),
      policyRefs: [...a.policies.values()].sort((l, r) => l.id.localeCompare(r.id)),
      sources: a.sources.sort(sourceOrder)
    })
  }
  warnings.sort((l, r) => l.foodId.localeCompare(r.foodId) || l.code.localeCompare(r.code))
  return {
    ok: true,
    value: {
      version: "shopping-list-v2",
      groceryCategoryConfigVersion: GROCERY_CATEGORY_CONFIG_VERSION,
      lines,
      totalEstimatedCostVnd: replayBasket.totalEstimatedCostVnd,
      warnings
    }
  }
}
