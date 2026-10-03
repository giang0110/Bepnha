import { expect, test } from "vitest"
import { pantryQuantityIsWhole } from "./whole-unit-quantity"
const option = {
  foodId: "egg",
  foodFactVersionId: "fact",
  foodNameVi: "Trứng",
  baseUnitId: "g",
  wholeUnitPolicy: { policyId: "p", contentHash: "h", baseQuantityPerPiece: "50" },
  units: [
    { unitId: "item", unitCode: "item", unitNameVi: "quả", baseQuantityPerUnit: "50" },
    { unitId: "g", unitCode: "g", unitNameVi: "gam", baseQuantityPerUnit: "1" }
  ]
}
test("validates measured whole pieces in both count and gram input without rounding", () => {
  expect(pantryQuantityIsWhole(option, "2.4", "item")).toBe(false)
  expect(pantryQuantityIsWhole(option, "125", "g")).toBe(false)
  expect(pantryQuantityIsWhole(option, "150", "g")).toBe(true)
  expect(pantryQuantityIsWhole(option, "3", "item")).toBe(true)
  expect(pantryQuantityIsWhole(option, "125", "g", "old-fact")).toBe(true)
})
