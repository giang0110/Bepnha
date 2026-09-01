import { describe, expect, test } from "vitest"

import { evaluatePlannerEligibility } from "@/domain/planner/evaluate-eligibility"
import { normalizePlannerInput } from "@/domain/planner/normalize-planner-input"
import { plannerCandidate, plannerInput } from "@/domain/planner/planner-test-fixture"
import type { ReadyPlan } from "@/domain/planner/search-week"
import { calculatePurchaseBasket } from "@/domain/pricing/calculate-purchase-basket"
import { canonicalJson } from "@/domain/shared/canonical-json"

import { buildShoppingListSnapshot } from "./build-shopping-list-snapshot"

function fixture() {
  const raw = plannerInput()
  const normalized = normalizePlannerInput(raw)
  if (!normalized.ok) throw new Error("invalid fixture")
  const eligibility = evaluatePlannerEligibility(normalized.value)
  if (!eligibility.ok) throw new Error("invalid eligibility fixture")
  const option = eligibility.value.eligible[0]!
  const candidate = normalized.value.candidates[0]!
  const requirements = Array.from({ length: 7 }, (_, dayIndex) =>
    option.requirements.map((requirement) => ({
      ...requirement,
      sourceId: `${dayIndex}:${requirement.sourceId}`
    }))
  ).flat()
  const basket = calculatePurchaseBasket(
    requirements,
    option.prices,
    normalized.value.calculationDate,
    normalized.value.priceFreshnessConfig
  )
  if (!basket.ok) throw new Error("invalid basket fixture")
  const items: ReadyPlan["items"] = Array.from({ length: 7 }, (_, dayIndex) => ({
    dayIndex,
    mealSlot: "primary" as const,
    mealOptionId: option.mealOptionId,
    mealOptionVersionId: option.mealOptionVersionId,
    adultEquivalent: option.adultEquivalent,
    scaleFactor: option.mealScaleFactor,
    snapshot: option
  }))
  const plan: ReadyPlan = {
    items,
    selected: Array.from({ length: 7 }, () => option),
    purchaseBasket: basket.value,
    totalEstimatedCostVnd: basket.value.totalEstimatedCostVnd,
    score: {} as ReadyPlan["score"],
    stableIdSequence: Array.from({ length: 7 }, () => option.mealOptionVersionId).join("|"),
    frontierMetrics: []
  }
  return { raw, normalized: normalized.value, plan, candidate, option, requirements }
}

describe("buildShoppingListSnapshot", () => {
  test("consolidates the same stable food across seven days before package/display rounding", () => {
    const { normalized, plan, candidate } = fixture()
    const lineage = candidate.ingredientLineage[0]!
    const foodId = lineage.foodId
    const foodFactVersionId = lineage.foodFactVersionId
    const result = buildShoppingListSnapshot(normalized, plan)
    expect(result).toMatchObject({
      ok: true,
      value: {
        version: "shopping-list-v1",
        groceryCategoryConfigVersion: "grocery-category-v1",
        totalEstimatedCostVnd: plan.totalEstimatedCostVnd,
        lines: [
          {
            foodId,
            baseUnitId: "unit-g",
            requiredBaseQuantity: "2800",
            pantryDeductedBaseQuantity: "0",
            purchaseRequiredBaseQuantity: "2800",
            purchaseBaseQuantity: "3000",
            leftoverBaseQuantity: "200",
            groceryCategoryCode: "meat_seafood"
          }
        ]
      }
    })
    if (!result.ok) throw new Error("projection failed")
    expect(result.value.lines[0]?.sources).toHaveLength(7)
    expect(result.value.lines[0]?.sources.map((source) => source.dayIndex)).toEqual([
      0, 1, 2, 3, 4, 5, 6
    ])
    expect(result.value.lines[0]?.factRefs).toEqual([
      { foodFactVersionId, contentHash: "d".repeat(64) }
    ])
    expect(result.value.warnings).toContainEqual(
      expect.objectContaining({ code: "STALE_PRICE", foodId })
    )
  })

  test("preserves authoritative pantry deduction and package rounding evidence", () => {
    const { normalized, plan, candidate, option, requirements } = fixture()
    const foodId = candidate.ingredientLineage[0]!.foodId
    const pantryBasket = calculatePurchaseBasket(
      requirements,
      option.prices,
      normalized.calculationDate,
      normalized.priceFreshnessConfig,
      [{ foodId, baseUnitId: "unit-g", availableBaseQuantity: "800" }]
    )
    if (!pantryBasket.ok) throw new Error("invalid pantry basket fixture")

    const result = buildShoppingListSnapshot(normalized, {
      ...plan,
      purchaseBasket: pantryBasket.value,
      totalEstimatedCostVnd: pantryBasket.value.totalEstimatedCostVnd
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("projection failed")
    const line = result.value.lines[0]!
    expect(line.requiredBaseQuantity).toBe("2800")
    expect(line.pantryDeductedBaseQuantity).toBe("800")
    expect(line.purchaseRequiredBaseQuantity).toBe("2000")
    expect(line.purchasePackageCount).toBe("2")
    expect(line.purchaseBaseQuantity).toBe("2000")
    expect(line.leftoverBaseQuantity).toBe("0")
    expect(line.lineCostVnd).toBe(200_000)
    expect(result.value.totalEstimatedCostVnd).toBe(200_000)
  })

  test("is stable under item order and mutable display-name changes", () => {
    const { raw, normalized, plan } = fixture()
    const first = buildShoppingListSnapshot(normalized, plan)
    const renamed = normalizePlannerInput({
      ...raw,
      candidates: raw.candidates.map((candidate) => ({
        ...candidate,
        mealOptionNameVi: "Tên hiển thị đã sửa"
      }))
    })
    if (!renamed.ok) throw new Error("invalid rename fixture")
    const second = buildShoppingListSnapshot(renamed.value, {
      ...plan,
      items: [...plan.items].reverse()
    })
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (first.ok && second.ok) expect(canonicalJson(first.value)).toBe(canonicalJson(second.value))
  })

  test("fails instead of recalculating when the Phase 3 basket requirement is inconsistent", () => {
    const { normalized, plan, candidate } = fixture()
    const first = plan.purchaseBasket.lines[0]!
    const foodId = candidate.ingredientLineage[0]!.foodId
    const result = buildShoppingListSnapshot(normalized, {
      ...plan,
      purchaseBasket: {
        ...plan.purchaseBasket,
        lines: [{ ...first, requiredBaseQuantity: "2799" }]
      }
    })
    expect(result).toEqual({
      ok: false,
      error: { code: "PURCHASE_BASKET_PROJECTION_MISMATCH", foodId }
    })
  })

  test("uses deterministic other + warning for unmapped pinned category ancestry", () => {
    const raw = plannerInput([
      {
        ...plannerCandidate(),
        ingredientLineage: plannerCandidate().ingredientLineage.map((lineage) => ({
          ...lineage,
          categoryAncestry: ["food"]
        }))
      }
    ])
    const normalized = normalizePlannerInput(raw)
    if (!normalized.ok) throw new Error("invalid category fixture")
    const candidate = normalized.value.candidates[0]!
    const eligibility = evaluatePlannerEligibility(normalized.value)
    if (!eligibility.ok) throw new Error("invalid category eligibility")
    const option = eligibility.value.eligible[0]!
    const foodId = candidate.ingredientLineage[0]!.foodId
    const basket = calculatePurchaseBasket(
      Array.from({ length: 7 }, () => option.requirements).flat(),
      option.prices,
      normalized.value.calculationDate,
      normalized.value.priceFreshnessConfig
    )
    if (!basket.ok) throw new Error("invalid category basket")
    const plan: ReadyPlan = {
      items: Array.from({ length: 7 }, (_, dayIndex) => ({
        dayIndex,
        mealSlot: "primary",
        mealOptionId: option.mealOptionId,
        mealOptionVersionId: option.mealOptionVersionId,
        adultEquivalent: option.adultEquivalent,
        scaleFactor: option.mealScaleFactor,
        snapshot: option
      })),
      selected: Array.from({ length: 7 }, () => option),
      purchaseBasket: basket.value,
      totalEstimatedCostVnd: basket.value.totalEstimatedCostVnd,
      score: {} as ReadyPlan["score"],
      stableIdSequence: "fixture",
      frontierMetrics: []
    }
    const result = buildShoppingListSnapshot(normalized.value, plan)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("projection failed")
    expect(result.value.lines).toEqual([
      expect.objectContaining({ groceryCategoryCode: "other", foodId })
    ])
    expect(result.value.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "CATEGORY_UNMAPPED", foodId }),
        expect.objectContaining({ code: "STALE_PRICE", foodId })
      ])
    )
  })
})
