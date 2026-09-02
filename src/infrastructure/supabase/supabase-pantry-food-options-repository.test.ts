import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, test, vi } from "vitest"

import type { Database } from "@/infrastructure/supabase/database.types"

import { createSupabasePantryFoodOptionsRepository } from "./supabase-pantry-food-options-repository"

function queryResult(data: unknown, error: unknown = null) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    not: vi.fn(),
    in: vi.fn()
  }
  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.not.mockResolvedValue({ data, error })
  builder.in.mockResolvedValue({ data, error })
  return builder
}

describe("Supabase pantry food options repository", () => {
  test("returns stable published food options with only fact-supported units", async () => {
    const foods = queryResult([
      {
        id: "food-b",
        name_vi: "Rau muống",
        current_fact_version_id: "fact-b",
        base_unit_id: "unit-g"
      },
      {
        id: "food-a",
        name_vi: "Gạo",
        current_fact_version_id: "fact-a",
        base_unit_id: "unit-g"
      }
    ])
    const conversions = queryResult([
      { food_fact_version_id: "fact-a", unit_id: "unit-kg" },
      { food_fact_version_id: "fact-a", unit_id: "unit-g" },
      { food_fact_version_id: "fact-b", unit_id: "unit-g" }
    ])
    const units = queryResult([
      { id: "unit-g", code: "g", name_vi: "gam" },
      { id: "unit-kg", code: "kg", name_vi: "kilôgam" }
    ])
    units.select.mockResolvedValue({
      data: [
        { id: "unit-g", code: "g", name_vi: "gam" },
        { id: "unit-kg", code: "kg", name_vi: "kilôgam" }
      ],
      error: null
    })

    const from = vi.fn((table: string) => {
      if (table === "foods") return foods
      if (table === "food_fact_unit_conversions") return conversions
      return units
    })
    const client = { from } as unknown as SupabaseClient<Database>

    await expect(createSupabasePantryFoodOptionsRepository(client).load()).resolves.toEqual([
      {
        foodId: "food-a",
        foodNameVi: "Gạo",
        foodFactVersionId: "fact-a",
        baseUnitId: "unit-g",
        units: [
          { unitId: "unit-g", unitCode: "g", unitNameVi: "gam" },
          { unitId: "unit-kg", unitCode: "kg", unitNameVi: "kilôgam" }
        ]
      },
      {
        foodId: "food-b",
        foodNameVi: "Rau muống",
        foodFactVersionId: "fact-b",
        baseUnitId: "unit-g",
        units: [{ unitId: "unit-g", unitCode: "g", unitNameVi: "gam" }]
      }
    ])
    expect(foods.eq).toHaveBeenCalledWith("status", "published")
    expect(conversions.in).toHaveBeenCalledWith("food_fact_version_id", ["fact-b", "fact-a"])
  })

  test("fails closed when catalog reads or unit lineage are incomplete", async () => {
    const failedFoods = queryResult(null, { code: "XX000" })
    const failedClient = {
      from: vi.fn(() => failedFoods)
    } as unknown as SupabaseClient<Database>
    await expect(createSupabasePantryFoodOptionsRepository(failedClient).load()).rejects.toThrow(
      "PANTRY_FOOD_OPTIONS_UNAVAILABLE"
    )
  })
})
