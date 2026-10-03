import { expect, test } from "vitest"
import type { ShoppingListItemV2 } from "@/application/shopping/shopping-list-repository"
import { purchaseQuantityLabel, shoppingAmountLabel } from "./purchase-quantity-label"
const fish = {
  version: "purchase-v2",
  purchaseRule: { mode: "loose_mass", saleStepBaseQuantity: "50" },
  quoteBaseQuantity: "1000",
  purchaseBaseQuantity: "600",
  purchaseUnitCount: "12",
  baseUnitId: "g"
} as ShoppingListItemV2
test("loose fish displays actual weight rather than a fraction of a package", () =>
  expect(purchaseQuantityLabel(fish, () => "g")).toBe("600 g"))
test("fixed egg boxes preserve whole pieces and leftovers", () => {
  const eggs = {
    ...fish,
    wholeUnit: { unitCode: "item", baseQuantityPerPiece: "50" },
    purchaseRule: { mode: "fixed_pack" as const, packIncrement: "1" },
    quoteBaseQuantity: "500",
    purchaseBaseQuantity: "500",
    purchaseUnitCount: "1"
  }
  expect(purchaseQuantityLabel(eggs, () => "g")).toBe("1 gói × 10 cái")
  expect(shoppingAmountLabel(eggs, "150", () => "g")).toBe("3 cái")
  expect(shoppingAmountLabel(eggs, "350", () => "g")).toBe("7 cái")
  expect(
    purchaseQuantityLabel({ ...fish, purchaseBaseQuantity: "0", purchaseUnitCount: "0" }, () => "g")
  ).toBe("Đã có đủ trong kho")
})
