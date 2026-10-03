import { describe, expect, test } from "vitest"
import type { FoodFactUnitConversion } from "@/domain/catalog/catalog"
import type { FoodQuantityPolicyV1 } from "./food-quantity-policy"
import { normalizeCookingQuantity } from "./normalize-cooking-quantity"
import type { ScaledRecipeIngredient } from "./scale-recipe"

const conversion: FoodFactUnitConversion = {
  unitId: "unit-item",
  unitCode: "item",
  sourceDimension: "count",
  sourceToDimensionBase: "1",
  foodBaseUnitId: "unit-item",
  foodBaseDimension: "count",
  foodBaseUnitToDimensionBase: "1",
  baseQuantityPerUnit: "1",
  grossGramsPerUnit: "56.7",
  displayStep: "1"
}
const policy: FoodQuantityPolicyV1 = {
  id: "10000000-0000-4000-8000-000000000001",
  versionNumber: 1,
  version: "food-quantity-v1",
  foodFactVersionId: "egg-v1",
  baseUnitId: "unit-item",
  baseDimension: "count",
  foodForm: "whole_count",
  stepBaseQuantity: "1",
  rounding: "ceil",
  provenance: "Reviewed whole raw egg, weighed unit conversion",
  contentHash: "a".repeat(64)
}
const egg: ScaledRecipeIngredient = {
  recipeIngredientId: "ingredient-egg",
  foodId: "food-egg",
  foodFactVersionId: "egg-v1",
  order: 1,
  unitId: "unit-item",
  sourceQuantity: "2.4",
  baseUnitId: "unit-item",
  baseQuantity: "2.4",
  grossGrams: "136.08"
}
const gram: FoodFactUnitConversion = {
  ...conversion,
  unitId: "unit-g",
  unitCode: "g",
  sourceDimension: "mass",
  foodBaseUnitId: "unit-g",
  foodBaseDimension: "mass",
  baseQuantityPerUnit: "1",
  grossGramsPerUnit: "1",
  displayStep: "5"
}
const massPolicy: FoodQuantityPolicyV1 = {
  ...policy,
  baseUnitId: "unit-g",
  baseDimension: "mass",
  foodForm: "portionable_mass",
  stepBaseQuantity: "1",
  rounding: "half_up"
}
function mass(quantity: string): ScaledRecipeIngredient {
  return {
    ...egg,
    unitId: "unit-g",
    baseUnitId: "unit-g",
    sourceQuantity: quantity,
    baseQuantity: quantity,
    grossGrams: quantity
  }
}
function actual(result: ReturnType<typeof normalizeCookingQuantity>) {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.code)
  return result.value.actualIngredient
}

describe("practical cooking quantities", () => {
  test("uses three whole eggs for a theoretical 2.4 and pins the policy evidence", () => {
    const result = normalizeCookingQuantity(egg, conversion, policy)
    expect(result).toMatchObject({
      ok: true,
      value: {
        actualIngredient: { sourceQuantity: "3", baseQuantity: "3", grossGrams: "170.1" },
        theoreticalIngredient: egg,
        policyRef: { id: policy.id, contentHash: policy.contentHash },
        adjustmentReason: "ROUND_UP_TO_WHOLE_UNIT"
      }
    })
  })
  test("rounds separate meals before their weekly total", () => {
    const oneMeal = { ...egg, sourceQuantity: "1.2", baseQuantity: "1.2", grossGrams: "68.04" }
    expect(
      [oneMeal, oneMeal].map(
        (ingredient) =>
          actual(normalizeCookingQuantity(ingredient, conversion, policy)).baseQuantity
      )
    ).toEqual(["2", "2"])
  })
  test("keeps 0.3g seasoning even when the legacy display step is5g", () => {
    expect(
      actual(
        normalizeCookingQuantity(mass("0.3"), gram, {
          ...massPolicy,
          foodForm: "seasoning_mass",
          stepBaseQuantity: "0.1"
        })
      ).baseQuantity
    ).toBe("0.3")
  })
  test("uses half-up rounding for portionable mass", () => {
    expect(actual(normalizeCookingQuantity(mass("600.5"), gram, massPolicy))).toMatchObject({
      sourceQuantity: "601",
      baseQuantity: "601",
      grossGrams: "601"
    })
  })
  test("keeps a minimum physical quantum for a positive tiny amount", () => {
    expect(actual(normalizeCookingQuantity(mass("0.01"), gram, massPolicy)).baseQuantity).toBe("1")
    expect(
      actual(
        normalizeCookingQuantity(mass("0.01"), gram, {
          ...massPolicy,
          foodForm: "seasoning_mass",
          stepBaseQuantity: "0.1"
        })
      ).baseQuantity
    ).toBe("0.1")
  })
  test("converts kg source to actual g without losing physical mass", () => {
    const kg = {
      ...gram,
      unitId: "unit-kg",
      unitCode: "kg",
      sourceToDimensionBase: "1000",
      baseQuantityPerUnit: "1000",
      grossGramsPerUnit: "1000"
    }
    const ingredient = { ...mass("600.4"), unitId: "unit-kg", sourceQuantity: "0.6004" }
    expect(actual(normalizeCookingQuantity(ingredient, kg, massPolicy))).toMatchObject({
      sourceQuantity: "0.6",
      baseQuantity: "600",
      grossGrams: "600"
    })
  })
  test("expresses1g quantum even when the food base unit is kg", () => {
    const kgBase = {
      ...gram,
      foodBaseUnitId: "unit-kg",
      foodBaseUnitToDimensionBase: "1000",
      baseQuantityPerUnit: "0.001"
    }
    const ingredient = { ...mass("600.4"), baseUnitId: "unit-kg", baseQuantity: "0.6004" }
    expect(
      actual(
        normalizeCookingQuantity(ingredient, kgBase, {
          ...massPolicy,
          baseUnitId: "unit-kg",
          stepBaseQuantity: "0.001"
        })
      )
    ).toMatchObject({ sourceQuantity: "600", baseQuantity: "0.6", grossGrams: "600" })
  })
  test("uses0.1ml for divisible volume", () => {
    const volume = {
      ...gram,
      sourceDimension: "volume" as const,
      foodBaseDimension: "volume" as const,
      unitId: "unit-ml",
      unitCode: "ml",
      foodBaseUnitId: "unit-ml"
    }
    expect(
      actual(
        normalizeCookingQuantity(
          { ...mass("125.26"), unitId: "unit-ml", baseUnitId: "unit-ml" },
          volume,
          {
            ...massPolicy,
            baseUnitId: "unit-ml",
            baseDimension: "volume",
            foodForm: "divisible_volume",
            stepBaseQuantity: "0.1"
          }
        )
      ).baseQuantity
    ).toBe("125.3")
  })
  test("requires an explicit count conversion for a whole piece", () => {
    expect(
      normalizeCookingQuantity(mass("230"), gram, {
        ...massPolicy,
        foodForm: "whole_piece",
        rounding: "ceil",
        stepBaseQuantity: "200"
      })
    ).toMatchObject({ ok: false, error: { code: "MISSING_WHOLE_PIECE_CONVERSION" } })
    const piece = {
      ...gram,
      unitId: "unit-piece",
      unitCode: "piece",
      sourceDimension: "count" as const,
      baseQuantityPerUnit: "200",
      grossGramsPerUnit: "200"
    }
    expect(
      actual(
        normalizeCookingQuantity(
          { ...mass("230"), unitId: "unit-piece", sourceQuantity: "1.15" },
          piece,
          { ...massPolicy, foodForm: "whole_piece", rounding: "ceil", stepBaseQuantity: "200" }
        )
      )
    ).toMatchObject({ sourceQuantity: "2", baseQuantity: "400", grossGrams: "400" })
  })
  test.each([
    { foodFactVersionId: "wrong-fact" },
    { baseUnitId: "wrong-unit" },
    { baseDimension: "volume" },
    { stepBaseQuantity: "0" },
    { stepBaseQuantity: "0.5" },
    { rounding: "half_up" },
    { provenance: "" },
    { contentHash: "invalid" }
  ])("rejects inconsistent policy %j", (changed) => {
    expect(
      normalizeCookingQuantity(egg, conversion, { ...policy, ...changed } as FoodQuantityPolicyV1)
        .ok
    ).toBe(false)
  })
  test.each([
    { unitId: "wrong-unit" },
    { foodBaseUnitId: "wrong-unit" },
    { baseQuantityPerUnit: "0" },
    { grossGramsPerUnit: "0" },
    { sourceToDimensionBase: "2" }
  ])("rejects inconsistent conversion %j", (changed) => {
    expect(normalizeCookingQuantity(egg, { ...conversion, ...changed }, policy).ok).toBe(false)
  })
  test("rejects a theoretical quantity inconsistent with its pinned conversion", () => {
    expect(normalizeCookingQuantity({ ...egg, grossGrams: "0" }, conversion, policy)).toMatchObject(
      { ok: false, error: { code: "INVALID_COOKING_QUANTITY" } }
    )
  })
})
