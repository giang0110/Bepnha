import { beforeEach, describe, expect, test, vi } from "vitest"

import { loadRecentPantryFoods, rememberRecentPantryFood } from "./recent-pantry-foods"

const KEY = "bepnha:recent-pantry-foods:v1"

describe("recent pantry foods", () => {
  beforeEach(() => localStorage.clear())

  test("keeps eight distinct foods in most recently saved order", () => {
    for (let index = 0; index < 10; index++) rememberRecentPantryFood("household", `food-${index}`)
    rememberRecentPantryFood("household", "food-4")
    expect(loadRecentPantryFoods("household")).toEqual([
      "food-4",
      "food-9",
      "food-8",
      "food-7",
      "food-6",
      "food-5",
      "food-3",
      "food-2"
    ])
  })

  test("isolates households and stores only identity shortcuts", () => {
    rememberRecentPantryFood("first", "rice")
    rememberRecentPantryFood("second", "egg")
    expect(loadRecentPantryFoods("first")).toEqual(["rice"])
    expect(loadRecentPantryFoods("second")).toEqual(["egg"])
    expect(JSON.parse(localStorage.getItem(KEY) ?? "null")).toEqual([
      { householdId: "second", foodId: "egg" },
      { householdId: "first", foodId: "rice" }
    ])
  })

  test("deduplicates a valid stored list", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        { householdId: "household", foodId: "rice" },
        { householdId: "household", foodId: "rice" },
        { householdId: "household", foodId: "egg" }
      ])
    )
    expect(loadRecentPantryFoods("household")).toEqual(["rice", "egg"])
  })

  test.each([
    "not json",
    "null",
    "{}",
    JSON.stringify([{ householdId: "household", foodId: "rice", quantity: "999" }]),
    JSON.stringify([{ householdId: "household", foodId: "" }]),
    JSON.stringify([{ householdId: "household", foodId: "x".repeat(129) }]),
    JSON.stringify(
      Array.from({ length: 9 }, (_, index) => ({
        householdId: "household",
        foodId: `food-${index}`
      }))
    )
  ])("ignores corrupt or unbounded history: %s", (encoded) => {
    localStorage.setItem(KEY, encoded)
    expect(loadRecentPantryFoods("household")).toEqual([])
    rememberRecentPantryFood("household", "fresh-food")
    expect(loadRecentPantryFoods("household")).toEqual(["fresh-food"])
  })

  test("does not store malformed identities", () => {
    rememberRecentPantryFood("household", "rice")
    rememberRecentPantryFood("", "egg")
    rememberRecentPantryFood("household", " ")
    rememberRecentPantryFood("household", "x".repeat(129))
    expect(loadRecentPantryFoods("household")).toEqual(["rice"])
  })

  test("does not throw when storage access or quota is refused", () => {
    const unavailable = {
      getItem: () => {
        throw new Error("storage blocked")
      },
      setItem: () => {
        throw new Error("quota exceeded")
      }
    }
    expect(loadRecentPantryFoods("household", unavailable)).toEqual([])
    expect(() => rememberRecentPantryFood("household", "rice", unavailable)).not.toThrow()
  })

  test("does not throw when the browser storage getter is blocked", () => {
    const getter = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("storage disabled")
    })
    try {
      expect(loadRecentPantryFoods("household")).toEqual([])
      expect(() => rememberRecentPantryFood("household", "rice")).not.toThrow()
    } finally {
      getter.mockRestore()
    }
  })
})
