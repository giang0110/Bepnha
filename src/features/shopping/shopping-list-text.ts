import { purchaseQuantityLabel, purchaseRemainderLabel } from "./purchase-quantity-label"
import type {
  AnyReadyShoppingList as ReadyShoppingList,
  AnyShoppingListItem as ShoppingListItem
} from "@/application/shopping/shopping-list-repository"
import { GROCERY_CATEGORIES } from "@/domain/shopping/grocery-category-config"
import {
  categoryDestination,
  type ShoppingDestination
} from "@/domain/shopping/shopping-destinations"

const VI_COLLATOR = new Intl.Collator("vi", { sensitivity: "base" })

function formatVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value)
}

function formatWeekStart(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match === null ? value : `${match[3]}/${match[2]}/${match[1]}`
}

function line(item: ShoppingListItem, unitLabel: (baseUnitId: string) => string): string {
  const mark = item.checked ? "[x]" : "[ ]"
  if (("version" in item ? item.purchaseUnitCount : item.purchasePackageCount) === "0") {
    return `${mark} ${item.foodNameVi} — ${"version" in item ? purchaseQuantityLabel(item, unitLabel) : "đã đủ trong tủ bếp"}`
  }
  const packages = purchaseQuantityLabel(item, unitLabel)
  const remainder = purchaseRemainderLabel(item, unitLabel)
  return `${mark} ${item.foodNameVi} — ${packages} (~${formatVnd(item.lineCostVnd)} VND)${remainder === null ? "" : `\n  ${remainder}`}`
}

/**
 * The shopping list as plain text, for handing to whoever is actually going to the market.
 *
 * Plain text rather than a link on purpose: a link someone can open without signing in would be a
 * new unauthenticated read path into household data, which is a security surface that needs its own
 * design and approval. Text costs nothing, works in every messaging app in Vietnam, and reaches a
 * phone that has never heard of this app.
 *
 * Grouped by the same aisles and sorted by the same collator as the screen, so the person holding
 * the message and the person who sent it are reading the same list in the same order. Ticked items
 * are kept, marked, rather than dropped — a shopper needs to see that something was deliberately
 * skipped, not silently absent.
 */
export function shoppingListText(
  value: ReadyShoppingList,
  unitLabel: (baseUnitId: string) => string,
  destination: ShoppingDestination = "all"
): string {
  const targetItems =
    destination === "all"
      ? value.items
      : value.items.filter((item) => categoryDestination(item.groceryCategoryCode) === destination)

  const sections = GROCERY_CATEGORIES.map((category) => {
    const items = targetItems
      .filter((item) => item.groceryCategoryCode === category.code)
      .toSorted(
        (left, right) =>
          VI_COLLATOR.compare(left.foodNameVi, right.foodNameVi) ||
          left.foodId.localeCompare(right.foodId)
      )
    return items.length === 0
      ? null
      : `${category.labelVi}\n${items.map((item) => line(item, unitLabel)).join("\n")}`
  }).filter((section): section is string => section !== null)

  const totalCost = targetItems.reduce((total, item) => total + item.lineCostVnd, 0)
  const remaining = targetItems
    .filter((item) => !item.checked)
    .reduce((total, item) => total + item.lineCostVnd, 0)

  const destinationPrefix =
    destination === "wet_market"
      ? "Đi chợ (Chợ dân sinh) — "
      : destination === "supermarket"
        ? "Đi chợ (Siêu thị / Tạp hóa) — "
        : "Đi chợ — "

  const header = `${destinationPrefix}tuần từ ${formatWeekStart(value.weekStart)}`
  const footer =
    remaining === totalCost
      ? `Tổng ước tính: ${formatVnd(totalCost)} VND`
      : `Còn phải mua: ${formatVnd(remaining)} VND / tổng ${formatVnd(totalCost)} VND`

  return [header, ...sections, footer].join("\n\n")
}
