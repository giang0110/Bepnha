import type {
  ShoppingListItem,
  ShoppingListItemV2
} from "@/application/shopping/shopping-list-repository"
import { ExactDecimal, decimalToCanonical } from "@/domain/shared/decimal"
type Item = ShoppingListItem | ShoppingListItemV2
export function displayQuantity(value: string): string {
  const match = /^(\d+)(?:\.(\d+))?$/u.exec(value)
  if (!match) return value
  const fractional = match[2]?.replace(/0+$/u, "") ?? ""
  return `${BigInt(match[1]!).toLocaleString("vi-VN")}${fractional ? `,${fractional}` : ""}`
}
export function shoppingAmountLabel(
  item: Item,
  quantity: string,
  unitLabel: (id: string) => string
): string {
  if ("version" in item && item.wholeUnit) {
    const pieces = new ExactDecimal(quantity).div(item.wholeUnit.baseQuantityPerPiece)
    if (pieces.isInteger())
      return `${displayQuantity(decimalToCanonical(pieces))} ${item.wholeUnit.unitCode === "item" ? "cái" : item.wholeUnit.unitCode}`
  }
  return `${displayQuantity(quantity)} ${unitLabel(item.baseUnitId)}`
}
export function purchaseQuantityLabel(item: Item, unitLabel: (id: string) => string): string {
  if (("version" in item ? item.purchaseUnitCount : item.purchasePackageCount) === "0")
    return "Đã có đủ trong kho"
  if ("version" in item) {
    if (item.purchaseRule.mode !== "fixed_pack")
      return shoppingAmountLabel(item, item.purchaseBaseQuantity, unitLabel)
    return `${displayQuantity(item.purchaseUnitCount)} gói × ${shoppingAmountLabel(item, item.quoteBaseQuantity, unitLabel)}`
  }
  return `${displayQuantity(item.purchasePackageCount)} gói × ${shoppingAmountLabel(item, item.packageBaseQuantity, unitLabel)}`
}

export function purchaseRemainderLabel(
  item: Item,
  unitLabel: (id: string) => string
): string | null {
  if (
    new ExactDecimal(item.purchaseBaseQuantity).isZero() ||
    new ExactDecimal(item.leftoverBaseQuantity).isZero()
  )
    return null
  return `Còn cần mua ${shoppingAmountLabel(item, item.purchaseRequiredBaseQuantity, unitLabel)} · Dư dự kiến ${shoppingAmountLabel(item, item.leftoverBaseQuantity, unitLabel)}`
}
