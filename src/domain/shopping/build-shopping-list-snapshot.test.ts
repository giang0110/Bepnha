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
  return { raw, normalized: normalized.value, plan }
}

describe("buildShoppingListSnapshot", () => {
  test("consolidates the same stable food across seven days before package/display rounding", () => {
    const { normalized, plan } = fixture()
    const result = buildShoppingListSnapshot(normalized, plan)
    expect(result).toMatchObject({
      ok: true,
      value: {
        version: "shopping-list-v1",
        groceryCategoryConfigVersion: "grocery-category-v1",
        totalEstimatedCostVnd: plan.totalEstimatedCostVnd,
        lines: [
          {
            foodId: "option-food",
            baseUnitId: "unit-g",
            requiredBaseQuantity: "2800",
            purchaseBaseQuantity: "3000",
            leftoverBaseQuantity: "200",
            groceryCategoryCode: "meat_seafood",
            sources: [{ dayIndex: 0 }, { dayIndex: 1 }, { dayIndex: 2 }]
          }
        ]
      }
    })
    if (!result.ok) throw new Error("projection failed")
    expect(result.value.lines[0]?.sources).toHaveLength(7)
    expect(result.value.lines[0]?.factRefs).toEqual([
      { foodFactVersionId: "option-fact-v1", contentHash: "d".repeat(64) }
    ])
    expect(result.value.warnings).toContainEqual(
      expect.objectContaining({ code: "STALE_PRICE", foodId: "option-food" })
    )
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
    const { normalized, plan } = fixture()
    const first = plan.purchaseBasket.lines[0]!
    const result = buildShoppingListSnapshot(normalized, {
      ...plan,
      purchaseBasket: {
        ...plan.purchaseBasket,
        lines: [{ ...first, requiredBaseQuantity: "2799" }]
      }
    })
    expect(result).toEqual({
      ok: false,
      error: { code: "PURCHASE_BASKET_PROJECTION_MISMATCH", foodId: "option-food" }
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
    const eligibility = evaluatePlannerEligibility(normalized.value)
    if (!eligibility.ok) throw new Error("invalid category eligibility")
    const option = eligibility.value.eligible[0]!
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
    expect(result).toMatchObject({
      ok: true,
      value: {
        lines: [{ groceryCategoryCode: "other" }],
        warnings: [{ code: "CATEGORY_UNMAPPED", foodId: "option-food" }]
      }
    })
  })
})
