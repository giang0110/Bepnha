import { describe, expect, test } from "vitest"
import {
  convertKitchenMeasurement,
  getKitchenUnitDefinition,
  getIngredientCategoryDefinition,
  getVisualHandEstimates,
  getCommonAromaticsCheatSheet,
  getCommonSeasoningCheatSheet,
  KITCHEN_UNITS,
  COMMON_INGREDIENT_CATEGORIES
} from "./kitchen-measurement-converter"

describe("kitchen-measurement-converter domain", () => {
  test("provides all standard kitchen unit definitions", () => {
    expect(KITCHEN_UNITS).toContain("tsp")
    expect(KITCHEN_UNITS).toContain("tbsp")
    expect(KITCHEN_UNITS).toContain("rice_bowl")
    expect(KITCHEN_UNITS).toContain("gram")
    expect(KITCHEN_UNITS).toContain("ml")

    const tsp = getKitchenUnitDefinition("tsp")
    expect(tsp.shortLabelVi).toBe("thìa cà phê")
    expect(tsp.volumeMl).toBe(5)

    const tbsp = getKitchenUnitDefinition("tbsp")
    expect(tbsp.shortLabelVi).toBe("thìa canh")
    expect(tbsp.volumeMl).toBe(15)

    const bowl = getKitchenUnitDefinition("rice_bowl")
    expect(bowl.shortLabelVi).toBe("bát con")
    expect(bowl.volumeMl).toBe(250)
  })

  test("provides ingredient category densities and spoon mass", () => {
    expect(COMMON_INGREDIENT_CATEGORIES).toContain("fish_sauce")
    expect(COMMON_INGREDIENT_CATEGORIES).toContain("table_salt")
    expect(COMMON_INGREDIENT_CATEGORIES).toContain("granulated_sugar")
    expect(COMMON_INGREDIENT_CATEGORIES).toContain("cooking_oil")

    const fishSauce = getIngredientCategoryDefinition("fish_sauce")
    expect(fishSauce.nameVi).toBe("Nước mắm")
    expect(fishSauce.tbspGrams).toBe(17)

    const salt = getIngredientCategoryDefinition("table_salt")
    expect(salt.nameVi).toBe("Muối ăn")
    expect(salt.tspGrams).toBe(5)
    expect(salt.tbspGrams).toBe(15)

    const oil = getIngredientCategoryDefinition("cooking_oil")
    expect(oil.nameVi).toBe("Dầu ăn")
    expect(oil.tbspGrams).toBe(14)
  })

  test("converts between volume units correctly without ingredient", () => {
    // 3 tsp = 1 tbsp
    const res1 = convertKitchenMeasurement({
      amount: 3,
      fromUnit: "tsp",
      toUnit: "tbsp"
    })
    expect(res1.convertedAmount).toBe(1)
    expect(res1.displayResultVi).toContain("1 thìa canh")

    // 1 tbsp = 15 ml
    const res2 = convertKitchenMeasurement({
      amount: 1,
      fromUnit: "tbsp",
      toUnit: "ml"
    })
    expect(res2.convertedAmount).toBe(15)
    expect(res2.displayResultVi).toContain("15 ml")

    // 1 rice bowl = 250 ml
    const res3 = convertKitchenMeasurement({
      amount: 2,
      fromUnit: "rice_bowl",
      toUnit: "ml"
    })
    expect(res3.convertedAmount).toBe(500)
    expect(res3.displayResultVi).toContain("500 ml")
  })

  test("converts between mass units correctly without ingredient", () => {
    // 1 kg = 1000 g
    const res = convertKitchenMeasurement({
      amount: 1.5,
      fromUnit: "kg",
      toUnit: "gram"
    })
    expect(res.convertedAmount).toBe(1500)
    expect(res.displayResultVi).toContain("1500 g")

    // 500 g = 0.5 kg
    const res2 = convertKitchenMeasurement({
      amount: 500,
      fromUnit: "gram",
      toUnit: "kg"
    })
    expect(res2.convertedAmount).toBe(0.5)
  })

  test("converts mass to volume using ingredient specific density", () => {
    // 34g fish sauce -> 2 tbsp (1 tbsp = 17g)
    const res1 = convertKitchenMeasurement({
      amount: 34,
      fromUnit: "gram",
      toUnit: "tbsp",
      ingredient: "fish_sauce"
    })
    expect(res1.convertedAmount).toBe(2)
    expect(res1.displayResultVi).toContain("2 thìa canh")

    // 15g salt -> 1 tbsp or 3 tsp
    const res2 = convertKitchenMeasurement({
      amount: 15,
      fromUnit: "gram",
      toUnit: "tbsp",
      ingredient: "table_salt"
    })
    expect(res2.convertedAmount).toBe(1)

    const res3 = convertKitchenMeasurement({
      amount: 10,
      fromUnit: "gram",
      toUnit: "tsp",
      ingredient: "table_salt"
    })
    expect(res3.convertedAmount).toBe(2)
  })

  test("converts volume spoons to mass for sugar and seasoning powder", () => {
    // 2 tbsp sugar -> 24g (1 tbsp = 12g)
    const res1 = convertKitchenMeasurement({
      amount: 2,
      fromUnit: "tbsp",
      toUnit: "gram",
      ingredient: "granulated_sugar"
    })
    expect(res1.convertedAmount).toBe(24)
    expect(res1.displayResultVi).toContain("24 g")

    // 1.5 tsp seasoning powder -> 6g (1 tsp = 4g)
    const res2 = convertKitchenMeasurement({
      amount: 1.5,
      fromUnit: "tsp",
      toUnit: "gram",
      ingredient: "seasoning_powder"
    })
    expect(res2.convertedAmount).toBe(6)
  })

  test("converts rice bowl to grams of raw rice", () => {
    // 2 bowls of raw rice = 300g (1 bowl = 150g)
    const res = convertKitchenMeasurement({
      amount: 2,
      fromUnit: "rice_bowl",
      toUnit: "gram",
      ingredient: "raw_rice"
    })
    expect(res.convertedAmount).toBe(300)
    expect(res.displayResultVi).toContain("300 g")
  })

  test("handles zero or negative amount gracefully", () => {
    const res = convertKitchenMeasurement({
      amount: 0,
      fromUnit: "tbsp",
      toUnit: "gram"
    })
    expect(res.convertedAmount).toBe(0)
    expect(res.displayResultVi).toBe("0")

    const resNeg = convertKitchenMeasurement({
      amount: -5,
      fromUnit: "gram",
      toUnit: "tbsp"
    })
    expect(resNeg.convertedAmount).toBe(0)
    expect(resNeg.displayResultVi).toBe("0")
  })

  test("handles same source and target unit", () => {
    const res = convertKitchenMeasurement({
      amount: 10,
      fromUnit: "gram",
      toUnit: "gram"
    })
    expect(res.convertedAmount).toBe(10)
    expect(res.displayResultVi).toContain("10 g")
  })

  test("provides visual hand estimate guide for Vietnamese home cooking", () => {
    const estimates = getVisualHandEstimates()
    expect(estimates.length).toBeGreaterThanOrEqual(4)

    const palm = estimates.find((e) => e.code === "palm_meat")
    expect(palm).toBeDefined()
    expect(palm?.nameVi.toLowerCase()).toContain("lòng bàn tay")
    expect(palm?.estimatedGrams).toBe("100 - 120g")

    const handful = estimates.find((e) => e.code === "handful_greens")
    expect(handful).toBeDefined()
    expect(handful?.nameVi.toLowerCase()).toContain("nắm tay")
    expect(handful?.estimatedGrams).toBe("150 - 200g")
  })

  test("provides aromatics cheat sheet (tỏi, ớt, gừng, hành tím)", () => {
    const aromatics = getCommonAromaticsCheatSheet()
    expect(aromatics.length).toBeGreaterThanOrEqual(4)

    const garlic = aromatics.find((a) => a.nameVi.includes("Tỏi"))
    expect(garlic).toBeDefined()
    expect(garlic?.unitEstimateVi).toContain("tép")

    const ginger = aromatics.find((a) => a.nameVi.includes("Gừng"))
    expect(ginger).toBeDefined()
    expect(ginger?.unitEstimateVi).toContain("đốt ngón tay")
  })

  test("provides seasoning cheat sheet table", () => {
    const table = getCommonSeasoningCheatSheet()
    expect(table.length).toBeGreaterThanOrEqual(6)

    const fishSauce = table.find((s) => s.ingredient === "fish_sauce")
    expect(fishSauce).toBeDefined()
    expect(fishSauce?.oneTbspGrams).toBe(17)
  })
})
