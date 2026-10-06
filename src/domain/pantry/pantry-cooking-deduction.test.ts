import { describe, expect, test } from "vitest"

import {
  calculatePantryCookingDeduction,
  type CookingDeductionFoodOption,
  type CookingDeductionMealIngredient,
  type CookingDeductionPantryItem
} from "./pantry-cooking-deduction"

describe("calculatePantryCookingDeduction", () => {
  const sampleFoodOptions: readonly CookingDeductionFoodOption[] = [
    {
      foodId: "food-rice",
      foodNameVi: "Gạo tẻ",
      foodFactVersionId: "fact-rice-v1",
      baseUnitId: "unit-g",
      units: [
        { unitId: "unit-g", unitCode: "g", unitNameVi: "gam", baseQuantityPerUnit: "1" },
        { unitId: "unit-kg", unitCode: "kg", unitNameVi: "kg", baseQuantityPerUnit: "1000" }
      ]
    },
    {
      foodId: "food-egg",
      foodNameVi: "Trứng gà",
      foodFactVersionId: "fact-egg-v1",
      baseUnitId: "unit-g",
      units: [
        { unitId: "unit-item", unitCode: "item", unitNameVi: "quả", baseQuantityPerUnit: "50" },
        { unitId: "unit-g", unitCode: "g", unitNameVi: "gam", baseQuantityPerUnit: "1" }
      ],
      wholeUnitPolicy: {
        baseQuantityPerPiece: "50"
      }
    },
    {
      foodId: "food-shallot",
      foodNameVi: "Hành tím",
      foodFactVersionId: "fact-shallot-v1",
      baseUnitId: "unit-g",
      units: [{ unitId: "unit-g", unitCode: "g", unitNameVi: "gam", baseQuantityPerUnit: "1" }]
    },
    {
      foodId: "food-pork",
      foodNameVi: "Thịt ba chỉ",
      foodFactVersionId: "fact-pork-v1",
      baseUnitId: "unit-g",
      units: [{ unitId: "unit-g", unitCode: "g", unitNameVi: "gam", baseQuantityPerUnit: "1" }]
    }
  ]

  test("returns empty array when pantry is empty or ingredients are empty", () => {
    expect(calculatePantryCookingDeduction([], [], sampleFoodOptions)).toEqual([])
    expect(
      calculatePantryCookingDeduction(
        [
          {
            pantryItemId: "p-1",
            foodId: "food-rice",
            foodFactVersionId: "fact-rice-v1",
            quantity: "1000",
            unitId: "unit-g",
            baseQuantity: "1000",
            baseUnitId: "unit-g",
            version: 1
          }
        ],
        [],
        sampleFoodOptions
      )
    ).toEqual([])
  })

  test("returns empty array when no meal ingredients match pantry items", () => {
    const pantry: CookingDeductionPantryItem[] = [
      {
        pantryItemId: "p-1",
        foodId: "food-rice",
        foodFactVersionId: "fact-rice-v1",
        quantity: "1000",
        unitId: "unit-g",
        baseQuantity: "1000",
        baseUnitId: "unit-g",
        version: 1
      }
    ]
    const ingredients: CookingDeductionMealIngredient[] = [
      { foodId: "food-pork", baseQuantity: "300", baseUnitId: "unit-g" }
    ]
    expect(calculatePantryCookingDeduction(pantry, ingredients, sampleFoodOptions)).toEqual([])
  })

  test("calculates partial deduction accurately when pantry has surplus", () => {
    const pantry: CookingDeductionPantryItem[] = [
      {
        pantryItemId: "p-rice",
        foodId: "food-rice",
        foodFactVersionId: "fact-rice-v1",
        quantity: "1000",
        unitId: "unit-g",
        baseQuantity: "1000",
        baseUnitId: "unit-g",
        version: 2
      }
    ]
    const ingredients: CookingDeductionMealIngredient[] = [
      { foodId: "food-rice", baseQuantity: "400", baseUnitId: "unit-g" }
    ]

    const result = calculatePantryCookingDeduction(pantry, ingredients, sampleFoodOptions)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      pantryItemId: "p-rice",
      foodId: "food-rice",
      foodNameVi: "Gạo tẻ",
      foodFactVersionId: "fact-rice-v1",
      unitId: "unit-g",
      unitNameVi: "gam",
      currentQuantity: "1000",
      usedQuantity: "400",
      remainingQuantity: "600",
      action: "update",
      expectedVersion: 2
    })
  })

  test("marks action as remove when pantry item is exactly depleted", () => {
    const pantry: CookingDeductionPantryItem[] = [
      {
        pantryItemId: "p-shallot",
        foodId: "food-shallot",
        foodFactVersionId: "fact-shallot-v1",
        quantity: "50",
        unitId: "unit-g",
        baseQuantity: "50",
        baseUnitId: "unit-g",
        version: 3
      }
    ]
    const ingredients: CookingDeductionMealIngredient[] = [
      { foodId: "food-shallot", baseQuantity: "50", baseUnitId: "unit-g" }
    ]

    const result = calculatePantryCookingDeduction(pantry, ingredients, sampleFoodOptions)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      pantryItemId: "p-shallot",
      foodId: "food-shallot",
      foodNameVi: "Hành tím",
      foodFactVersionId: "fact-shallot-v1",
      unitId: "unit-g",
      unitNameVi: "gam",
      currentQuantity: "50",
      usedQuantity: "50",
      remainingQuantity: "0",
      action: "remove",
      expectedVersion: 3
    })
  })

  test("caps deduction to available pantry amount and marks remove when meal requirement exceeds pantry", () => {
    const pantry: CookingDeductionPantryItem[] = [
      {
        pantryItemId: "p-pork",
        foodId: "food-pork",
        foodFactVersionId: "fact-pork-v1",
        quantity: "150",
        unitId: "unit-g",
        baseQuantity: "150",
        baseUnitId: "unit-g",
        version: 1
      }
    ]
    const ingredients: CookingDeductionMealIngredient[] = [
      { foodId: "food-pork", baseQuantity: "400", baseUnitId: "unit-g" }
    ]

    const result = calculatePantryCookingDeduction(pantry, ingredients, sampleFoodOptions)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      pantryItemId: "p-pork",
      foodId: "food-pork",
      foodNameVi: "Thịt ba chỉ",
      foodFactVersionId: "fact-pork-v1",
      unitId: "unit-g",
      unitNameVi: "gam",
      currentQuantity: "150",
      usedQuantity: "150",
      remainingQuantity: "0",
      action: "remove",
      expectedVersion: 1
    })
  })

  test("aggregates multiple ingredients using the same foodId across meal components", () => {
    const pantry: CookingDeductionPantryItem[] = [
      {
        pantryItemId: "p-shallot",
        foodId: "food-shallot",
        foodFactVersionId: "fact-shallot-v1",
        quantity: "60",
        unitId: "unit-g",
        baseQuantity: "60",
        baseUnitId: "unit-g",
        version: 1
      }
    ]
    const ingredients: CookingDeductionMealIngredient[] = [
      { foodId: "food-shallot", baseQuantity: "15", baseUnitId: "unit-g" },
      { foodId: "food-shallot", baseQuantity: "25", baseUnitId: "unit-g" }
    ]

    const result = calculatePantryCookingDeduction(pantry, ingredients, sampleFoodOptions)
    expect(result).toHaveLength(1)
    expect(result[0]?.usedQuantity).toBe("40")
    expect(result[0]?.remainingQuantity).toBe("20")
    expect(result[0]?.action).toBe("update")
  })

  test("converts pantry units when pantry item is stored in non-base unit (e.g. kg vs g)", () => {
    const pantry: CookingDeductionPantryItem[] = [
      {
        pantryItemId: "p-rice-kg",
        foodId: "food-rice",
        foodFactVersionId: "fact-rice-v1",
        quantity: "2",
        unitId: "unit-kg",
        baseQuantity: "2000",
        baseUnitId: "unit-g",
        version: 4
      }
    ]
    const ingredients: CookingDeductionMealIngredient[] = [
      { foodId: "food-rice", baseQuantity: "500", baseUnitId: "unit-g" }
    ]

    const result = calculatePantryCookingDeduction(pantry, ingredients, sampleFoodOptions)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      pantryItemId: "p-rice-kg",
      foodId: "food-rice",
      foodNameVi: "Gạo tẻ",
      foodFactVersionId: "fact-rice-v1",
      unitId: "unit-kg",
      unitNameVi: "kg",
      currentQuantity: "2",
      usedQuantity: "0.5",
      remainingQuantity: "1.5",
      action: "update",
      expectedVersion: 4
    })
  })

  test("respects wholeUnitPolicy by ceiling fractional pieces used", () => {
    const pantry: CookingDeductionPantryItem[] = [
      {
        pantryItemId: "p-egg",
        foodId: "food-egg",
        foodFactVersionId: "fact-egg-v1",
        quantity: "5",
        unitId: "unit-item",
        baseQuantity: "250",
        baseUnitId: "unit-g",
        version: 1
      }
    ]
    // 80g of eggs = 1.6 eggs -> ceil to 2 eggs (100g)
    const ingredients: CookingDeductionMealIngredient[] = [
      { foodId: "food-egg", baseQuantity: "80", baseUnitId: "unit-g" }
    ]

    const result = calculatePantryCookingDeduction(pantry, ingredients, sampleFoodOptions)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      pantryItemId: "p-egg",
      foodId: "food-egg",
      foodNameVi: "Trứng gà",
      foodFactVersionId: "fact-egg-v1",
      unitId: "unit-item",
      unitNameVi: "quả",
      currentQuantity: "5",
      usedQuantity: "2",
      remainingQuantity: "3",
      action: "update",
      expectedVersion: 1
    })
  })

  test("removes wholeUnitPolicy food when required pieces deplete all pantry stock", () => {
    const pantry: CookingDeductionPantryItem[] = [
      {
        pantryItemId: "p-egg",
        foodId: "food-egg",
        foodFactVersionId: "fact-egg-v1",
        quantity: "2",
        unitId: "unit-item",
        baseQuantity: "100",
        baseUnitId: "unit-g",
        version: 1
      }
    ]
    // 120g of eggs = 2.4 eggs -> requires 3 eggs, but pantry only has 2 -> uses all 2
    const ingredients: CookingDeductionMealIngredient[] = [
      { foodId: "food-egg", baseQuantity: "120", baseUnitId: "unit-g" }
    ]

    const result = calculatePantryCookingDeduction(pantry, ingredients, sampleFoodOptions)
    expect(result).toHaveLength(1)
    expect(result[0]?.usedQuantity).toBe("2")
    expect(result[0]?.remainingQuantity).toBe("0")
    expect(result[0]?.action).toBe("remove")
  })
})
