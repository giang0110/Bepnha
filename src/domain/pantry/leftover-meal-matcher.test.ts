import { describe, expect, test } from "vitest"
import {
  CANONICAL_DISH_RECIPES,
  findLeftoverMealSuggestions,
  matchIngredients,
  summarizeLeftoverEfficiency
} from "./leftover-meal-matcher"

describe("leftover-meal-matcher domain", () => {
  test("defines canonical Vietnamese family dish recipes with primary ingredients", () => {
    expect(CANONICAL_DISH_RECIPES.length).toBeGreaterThanOrEqual(20)
    const thitKhoTrung = CANONICAL_DISH_RECIPES.find((d) => d.id === "thit_kho_trung")
    expect(thitKhoTrung).toBeDefined()
    expect(thitKhoTrung?.primaryIngredients).toEqual(["Thịt ba chỉ", "Trứng gà"])
  })

  test("matches ingredient names flexibly considering Vietnamese common aliases", () => {
    expect(matchIngredients("Trứng gà", ["Trứng gà ta"])).toBe(true)
    expect(matchIngredients("Thịt ba chỉ", ["Thịt ba rọi"])).toBe(true)
    expect(matchIngredients("Bắp cải", ["Bắp cải trắng"])).toBe(true)
    expect(matchIngredients("Cá lóc", ["Cá lóc tươi"])).toBe(true)
    expect(matchIngredients("Đậu hũ trắng", ["Đậu hũ non"])).toBe(true)
    expect(matchIngredients("Thịt gà ta", ["Thịt bò"])).toBe(false)
  })

  test("identifies dishes ready to cook (ready_to_cook) when all primary ingredients exist", () => {
    const pantryItems = ["Trứng gà ta", "Cà chua", "Hành lá"]
    const results = findLeftoverMealSuggestions(pantryItems)

    const readyDishes = results.filter((d) => d.status === "ready_to_cook")
    const readyNames = readyDishes.map((d) => d.dishNameVi)

    expect(readyNames).toContain("Canh cà chua trứng")
    expect(readyNames).toContain("Trứng chiên hành")

    const canhCaChuaTrung = readyDishes.find((d) => d.dishNameVi === "Canh cà chua trứng")
    expect(canhCaChuaTrung?.matchPercentage).toBe(100)
    expect(canhCaChuaTrung?.missingIngredients).toHaveLength(0)
  })

  test("identifies dishes almost ready (almost_ready) when exactly one primary ingredient is missing", () => {
    const pantryItems = ["Cà chua"]
    const results = findLeftoverMealSuggestions(pantryItems)

    const dauHuSotCa = results.find((d) => d.dishNameVi === "Đậu hũ sốt cà chua")
    expect(dauHuSotCa).toBeDefined()
    expect(dauHuSotCa?.status).toBe("almost_ready")
    expect(dauHuSotCa?.matchedIngredients).toContain("Cà chua")
    expect(dauHuSotCa?.missingIngredients).toContain("Đậu hũ trắng")
  })

  test("sorts suggestions with ready_to_cook first, then almost_ready, descending by match score", () => {
    const pantryItems = ["Thịt gà ta", "Gừng", "Cà chua"]
    const results = findLeftoverMealSuggestions(pantryItems)

    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.status).toBe("ready_to_cook")
    expect(results[0]?.dishNameVi).toBe("Gà kho gừng")

    // The rest should follow ready_to_cook before almost_ready
    let seenAlmostReady = false
    for (const item of results) {
      if (item.status === "almost_ready") {
        seenAlmostReady = true
      } else if (item.status === "ready_to_cook" && seenAlmostReady) {
        throw new Error("ready_to_cook dish should not appear after almost_ready")
      }
    }
  })

  test("returns empty suggestions when pantry has no matching ingredients", () => {
    const results = findLeftoverMealSuggestions(["Muối tinh", "Đường cát"])
    expect(results).toHaveLength(0)
  })

  test("matches new canonical dishes such as Canh ngao nấu chua, Gà rang gừng, Thịt ba chỉ luộc", () => {
    const pantryItems = ["Ngao", "Cà chua", "Rau muống"]
    const results = findLeftoverMealSuggestions(pantryItems)
    const dishNames = results.map((d) => d.dishNameVi)

    expect(dishNames).toContain("Canh ngao nấu chua")
    expect(dishNames).toContain("Rau muống luộc")
  })

  test("summarizes leftover efficiency with actionable advice", () => {
    const pantryItems = ["Thịt gà ta", "Gừng"]
    const summary = summarizeLeftoverEfficiency(pantryItems)

    expect(summary.readyToCookCount).toBeGreaterThanOrEqual(1)
    expect(summary.adviceVi).toContain("Tủ bếp sẵn sàng nấu ngay")
    expect(summary.suggestedDishes.length).toBeGreaterThan(0)
    expect(summary.urgentRescueCount).toBeGreaterThan(0)
  })

  test("prioritizes dishes using perishable fresh ingredients (leafy greens, meat) over durable staples", () => {
    // Both "Rau muống xào tỏi" (leafy greens, score 5) and "Bắp cải xào" (durable cabbage, score 4) are ready_to_cook
    const pantryItems = ["Rau muống", "Bắp cải", "Tỏi"]
    const results = findLeftoverMealSuggestions(pantryItems)

    const readyDishes = results.filter((d) => d.status === "ready_to_cook")
    expect(readyDishes.length).toBeGreaterThanOrEqual(2)

    // "Rau muống xào tỏi" uses urgent leafy greens, so its perishability priority score is higher
    const rauMuongIndex = readyDishes.findIndex((d) => d.dishNameVi === "Rau muống xào tỏi")
    const bapCaiIndex = readyDishes.findIndex((d) => d.dishNameVi === "Bắp cải xào")

    expect(rauMuongIndex).toBeGreaterThanOrEqual(0)
    expect(bapCaiIndex).toBeGreaterThanOrEqual(0)
    expect(rauMuongIndex).toBeLessThan(bapCaiIndex)

    const rauMuongDish = readyDishes[rauMuongIndex]!
    expect(rauMuongDish.hasUrgentIngredients).toBe(true)
    expect(rauMuongDish.urgentIngredients).toContain("Rau muống")
  })
})
