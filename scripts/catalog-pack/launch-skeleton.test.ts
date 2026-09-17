// @vitest-environment node

import { describe, expect, it } from "vitest"

import { buildLaunchSkeleton } from "./launch-skeleton-cli.ts"
import { FOODS, MEALS, RECIPES } from "./launch-skeleton-spec.ts"
import { SHEET_FILE_NAMES, SHEET_HEADERS, sheetsToPack } from "./catalog-sheet-tables.ts"

const bundle = buildLaunchSkeleton()
const rows = (file: keyof typeof bundle) => bundle[file].slice(1)
const column = (file: keyof typeof bundle, name: string) => SHEET_HEADERS[file].indexOf(name)

describe("the spec is internally consistent", () => {
  it("has no duplicate codes", () => {
    for (const codes of [
      FOODS.map((food) => food.code),
      RECIPES.map((recipe) => recipe.code),
      MEALS.map((meal) => meal.code)
    ]) {
      expect(new Set(codes).size).toBe(codes.length)
    }
  })

  it("references only foods and recipes that exist", () => {
    const foods = new Set(FOODS.map((food) => food.code))
    const recipes = new Set(RECIPES.map((recipe) => recipe.code))

    for (const recipe of RECIPES) {
      for (const ingredient of recipe.ingredients) expect(foods).toContain(ingredient)
    }
    for (const meal of MEALS) {
      for (const [code] of meal.components) expect(recipes).toContain(code)
    }
  })

  it("clears the launch thresholds with margin", () => {
    expect(MEALS.length).toBeGreaterThanOrEqual(21)
    expect(new Set(MEALS.map((meal) => meal.proteinHintCode)).size).toBeGreaterThanOrEqual(3)
  })

  it("prices and declares a fact for every food, so none is unreachable or unpriced", () => {
    expect(rows("prices.csv")).toHaveLength(FOODS.length)
    expect(rows("foods.csv")).toHaveLength(FOODS.length)
  })

  it("gives every food all ten allergens and all six nutrients", () => {
    expect(rows("food_allergens.csv")).toHaveLength(FOODS.length * 10)
    expect(rows("food_nutrients.csv")).toHaveLength(FOODS.length * 6)
  })
})

describe("no measurement is invented", () => {
  it.each([
    ["food_allergens.csv", "status"],
    ["food_nutrients.csv", "amountPer100g"],
    ["foods.csv", "edibleFraction"],
    ["prices.csv", "observedAt"],
    ["recipe_ingredients.csv", "quantity"]
  ] as const)("leaves every %s.%s marked for a person", (file, name) => {
    const index = column(file, name)

    for (const row of rows(file)) expect(row[index]).toMatch(/^CAN-DIEN/u)
  })

  it("never writes a numeric price, cooking time or serving count", () => {
    for (const [file, names] of [
      ["prices.csv", ["packagePriceVnd"]],
      ["recipes.csv", ["activeMinutes", "elapsedMinutes"]],
      ["meal_options.csv", ["activeMinutes", "elapsedMinutes"]]
    ] as const) {
      for (const name of names) {
        const index = column(file, name)
        for (const row of rows(file)) expect(row[index]).toBe("")
      }
    }
  })

  it("never concludes an allergen is absent", () => {
    const index = column("food_allergens.csv", "status")
    const statuses = new Set(rows("food_allergens.csv").map((row) => row[index]))

    for (const status of statuses) {
      expect(status).not.toBe("absent")
      expect(status).not.toBe("contains")
    }
  })

  it("fills a conversion only where it is definitional", () => {
    const unit = column("food_conversions.csv", "unitCode")
    const grams = column("food_conversions.csv", "grossGramsPerUnit")

    for (const row of rows("food_conversions.csv")) {
      // One gram weighs one gram. A millilitre's weight is density and an item's is a measurement.
      if (row[unit] === "g") expect(row[grams]).toBe("1")
      else expect(row[grams]).toMatch(/^CAN-DIEN/u)
    }
  })
})

describe("the tables load through the ordinary reader", () => {
  it("reads back with no structural complaint about the tables themselves", () => {
    const { pack, errors } = sheetsToPack(bundle)

    expect(errors).toEqual([])
    expect(pack).not.toBeNull()
  })

  it("writes a header for every table the reader expects", () => {
    for (const name of SHEET_FILE_NAMES) {
      expect(bundle[name][0]).toEqual([...SHEET_HEADERS[name]])
    }
  })
})
