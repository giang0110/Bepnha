import type { NormalizedPlannerInputV1 } from "@/domain/planner/planner-input"
import type { ReadyPlan } from "@/domain/planner/search-week"
import { ExactDecimal, decimalToCanonical } from "@/domain/shared/decimal"

import {
  GROCERY_CATEGORY_CONFIG_VERSION,
  resolveGroceryCategory,
  type GroceryCategoryCode
} from "./grocery-category-config"
import type {
  BuildShoppingListSnapshotResult,
  ShoppingFactRefV1,
  ShoppingListSnapshotLineV1,
  ShoppingProjectionFatalCode,
  ShoppingSourceV1,
  ShoppingWarning
} from "./shopping-list"

interface Aggregate {
  readonly foodId: string
  readonly baseUnitId: string
  readonly baseDimension: "mass" | "volume" | "count"
  requiredBaseQuantity: ExactDecimal
  readonly sources: ShoppingSourceV1[]
  readonly facts: Map<string, ShoppingFactRefV1>
  readonly categoryEvidence: Map<
    string,
    { readonly foodFactVersionId: string; readonly categoryAncestry: readonly string[] }
  >
}

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1
}

function failure(code: ShoppingProjectionFatalCode, foodId?: string): BuildShoppingListSnapshotResult {
  return { ok: false, error: foodId === undefined ? { code } : { code, foodId } }
}

function sourceOrder(left: ShoppingSourceV1, right: ShoppingSourceV1): number {
  return (
    left.dayIndex - right.dayIndex ||
    compareText(left.mealOptionVersionId, right.mealOptionVersionId) ||
    compareText(left.mealOptionRecipeId, right.mealOptionRecipeId) ||
    compareText(left.recipeIngredientId, right.recipeIngredientId) ||
    compareText(left.foodFactVersionId, right.foodFactVersionId)
  )
}

function categoryFor(
  aggregate: Aggregate
): { readonly category: GroceryCategoryCode; readonly warning?: ShoppingWarning } {
  const evidence = [...aggregate.categoryEvidence.values()].sort((left, right) =>
    compareText(left.foodFactVersionId, right.foodFactVersionId)
  )
  const resolved = evidence.map((item) => resolveGroceryCategory(item.categoryAncestry))
  if (resolved.some((item) => item === null)) {
    return {
      category: "other",
      warning: {
        code: "CATEGORY_UNMAPPED",
        foodId: aggregate.foodId,
        factCategoryEvidence: evidence
      }
    }
  }
  const groups = new Set(resolved as GroceryCategoryCode[])
  if (groups.size !== 1) {
    return {
      category: "other",
      warning: {
        code: "CATEGORY_AMBIGUITY",
        foodId: aggregate.foodId,
        factCategoryEvidence: evidence
      }
    }
  }
  return { category: [...groups][0]! }
}

export function buildShoppingListSnapshot(
  input: NormalizedPlannerInputV1,
  plan: ReadyPlan
): BuildShoppingListSnapshotResult {
  if (plan.items.length !== 7 || plan.selected.length !== 7) {
    return failure("INCOMPLETE_SHOPPING_LINEAGE")
  }

  const candidateByVersion = new Map(
    input.candidates.map((candidate) => [candidate.mealOption.mealOptionVersionId, candidate] as const)
  )
  const aggregates = new Map<string, Aggregate>()

  for (const item of [...plan.items].sort((left, right) => left.dayIndex - right.dayIndex)) {
    const candidate = candidateByVersion.get(item.mealOptionVersionId)
    if (
      candidate === undefined ||
      candidate.mealOption.mealOptionId !== item.mealOptionId ||
      item.snapshot.mealOptionVersionId !== item.mealOptionVersionId
    ) {
      return failure("INCOMPLETE_SHOPPING_LINEAGE")
    }

    const lineageByKey = new Map(
      candidate.ingredientLineage.map((lineage) => [
        [
          lineage.mealOptionRecipeId,
          lineage.recipeIngredientId,
          lineage.foodId,
          lineage.foodFactVersionId
        ].join("|"),
        lineage
      ])
    )
    const componentById = new Map(
      item.snapshot.mealOption.components.map((component) => [component.mealOptionRecipeId, component])
    )

    for (const ingredient of item.snapshot.scaledIngredients) {
      const lineage = lineageByKey.get(
        [
          ingredient.mealOptionRecipeId,
          ingredient.recipeIngredientId,
          ingredient.foodId,
          ingredient.foodFactVersionId
        ].join("|")
      )
      const component = componentById.get(ingredient.mealOptionRecipeId)
      if (
        lineage === undefined ||
        component === undefined ||
        lineage.baseUnitId !== ingredient.baseUnitId
      ) {
        return failure("INCOMPLETE_SHOPPING_LINEAGE", ingredient.foodId)
      }

      let aggregate = aggregates.get(ingredient.foodId)
      if (aggregate === undefined) {
        aggregate = {
          foodId: ingredient.foodId,
          baseUnitId: ingredient.baseUnitId,
          baseDimension: lineage.baseDimension,
          requiredBaseQuantity: new ExactDecimal(0),
          sources: [],
          facts: new Map(),
          categoryEvidence: new Map()
        }
        aggregates.set(ingredient.foodId, aggregate)
      } else if (
        aggregate.baseUnitId !== ingredient.baseUnitId ||
        aggregate.baseDimension !== lineage.baseDimension
      ) {
        return failure("INCOMPATIBLE_CANONICAL_DIMENSION", ingredient.foodId)
      }

      aggregate.requiredBaseQuantity = aggregate.requiredBaseQuantity.plus(
        new ExactDecimal(ingredient.baseQuantity)
      )
      aggregate.sources.push({
        dayIndex: item.dayIndex,
        mealOptionId: item.mealOptionId,
        mealOptionVersionId: item.mealOptionVersionId,
        mealOptionRecipeId: ingredient.mealOptionRecipeId,
        recipeVersionId: component.recipeVersionId,
        recipeIngredientId: ingredient.recipeIngredientId,
        foodId: ingredient.foodId,
        foodFactVersionId: ingredient.foodFactVersionId,
        baseUnitId: ingredient.baseUnitId,
        requiredBaseQuantity: ingredient.baseQuantity
      })
      aggregate.facts.set(lineage.foodFactVersionId, {
        foodFactVersionId: lineage.foodFactVersionId,
        contentHash: lineage.foodFactContentHash
      })
      aggregate.categoryEvidence.set(lineage.foodFactVersionId, {
        foodFactVersionId: lineage.foodFactVersionId,
        categoryAncestry: [...lineage.categoryAncestry]
      })
    }
  }

  const basketByFood = new Map<string, ReadyPlan["purchaseBasket"]["lines"][number]>()
  for (const line of plan.purchaseBasket.lines) {
    if (basketByFood.has(line.foodId)) {
      return failure("PURCHASE_BASKET_PROJECTION_MISMATCH", line.foodId)
    }
    basketByFood.set(line.foodId, line)
  }
  if (basketByFood.size !== aggregates.size) {
    return failure("PURCHASE_BASKET_PROJECTION_MISMATCH")
  }

  const warnings: ShoppingWarning[] = plan.purchaseBasket.warnings.map((warning) => ({ ...warning }))
  const lines: ShoppingListSnapshotLineV1[] = []
  for (const aggregate of [...aggregates.values()].sort((left, right) =>
    compareText(left.foodId, right.foodId)
  )) {
    const basket = basketByFood.get(aggregate.foodId)
    const requiredBaseQuantity = decimalToCanonical(aggregate.requiredBaseQuantity)
    if (
      basket === undefined ||
      basket.baseUnitId !== aggregate.baseUnitId ||
      basket.requiredBaseQuantity !== requiredBaseQuantity
    ) {
      return failure("PURCHASE_BASKET_PROJECTION_MISMATCH", aggregate.foodId)
    }
    const resolvedCategory = categoryFor(aggregate)
    if (resolvedCategory.warning !== undefined) warnings.push(resolvedCategory.warning)
    lines.push({
      ...basket,
      groceryCategoryCode: resolvedCategory.category,
      factRefs: [...aggregate.facts.values()].sort((left, right) =>
        compareText(left.foodFactVersionId, right.foodFactVersionId)
      ),
      sources: [...aggregate.sources].sort(sourceOrder)
    })
  }

  const lineCostTotal = lines.reduce((sum, line) => sum + line.lineCostVnd, 0)
  if (
    lineCostTotal !== plan.purchaseBasket.totalEstimatedCostVnd ||
    plan.purchaseBasket.totalEstimatedCostVnd !== plan.totalEstimatedCostVnd
  ) {
    return failure("PURCHASE_BASKET_PROJECTION_MISMATCH")
  }

  warnings.sort((left, right) => {
    const food = compareText(left.foodId, right.foodId)
    if (food !== 0) return food
    if (left.code === right.code) return 0
    return compareText(left.code, right.code)
  })

  return {
    ok: true,
    value: {
      version: "shopping-list-v1",
      groceryCategoryConfigVersion: GROCERY_CATEGORY_CONFIG_VERSION,
      lines,
      totalEstimatedCostVnd: plan.purchaseBasket.totalEstimatedCostVnd,
      warnings
    }
  }
}
