import { describe, expect, test } from "vitest"

import { applyPantryDeduction } from "./apply-pantry-deduction"

describe("applyPantryDeduction", () => {
  test("keeps the full requirement when pantry is zero", () => {
    expect(applyPantryDeduction("2800", "0")).toEqual({
      ok: true,
      value: {
        deductedBaseQuantity: "0",
        remainingBaseQuantity: "2800"
      }
    })
  })

  test("subtracts a partial pantry amount exactly", () => {
    expect(applyPantryDeduction("2800", "350.500")).toEqual({
      ok: true,
      value: {
        deductedBaseQuantity: "350.5",
        remainingBaseQuantity: "2449.5"
      }
    })
  })

  test("returns zero remaining when pantry exactly covers the requirement", () => {
    expect(applyPantryDeduction("2800", "2800")).toEqual({
      ok: true,
      value: {
        deductedBaseQuantity: "2800",
        remainingBaseQuantity: "0"
      }
    })
  })

  test("floors remaining requirement at zero when pantry exceeds demand", () => {
    expect(applyPantryDeduction("2800", "3000")).toEqual({
      ok: true,
      value: {
        deductedBaseQuantity: "2800",
        remainingBaseQuantity: "0"
      }
    })
  })

  test.each([
    ["-1", "0"],
    ["1", "-1"],
    ["01", "0"],
    ["1", "1e3"]
  ])("rejects invalid canonical non-negative inputs: %s / %s", (required, pantry) => {
    expect(applyPantryDeduction(required, pantry)).toEqual({
      ok: false,
      error: { code: "INVALID_PANTRY_DEDUCTION_QUANTITY" }
    })
  })
})
