import type {
  ReadyShoppingList,
  ShoppingListItem
} from "@/application/shopping/shopping-list-repository"
import { GROCERY_CATEGORIES } from "@/domain/shopping/grocery-category-config"

const VI_COLLATOR = new Intl.Collator("vi", { sensitivity: "base" })

function formatVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value)
}

function formatQuantity(value: string): string {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value)
  if (match === null) return value
  const whole = BigInt(match[1]!).toLocaleString("vi-VN")
  const fractional = match[2]?.replace(/0+$/u, "") ?? ""
  return fractional === "" ? whole : `${whole},${fractional}`
}

function formatWeekStart(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match === null ? value : `${match[3]}/${match[2]}/${match[1]}`
}

function line(item: ShoppingListItem, unitLabel: (baseUnitId: string) => string): string {
  const unit = unitLabel(item.baseUnitId)
  const mark = item.checked ? "[x]" : "[ ]"
  if (item.purchasePackageCount === "0") {
    return `${mark} ${item.foodNameVi} — đã đủ trong tủ bếp`
  }
  const packages = `${formatQuantity(item.purchasePackageCount)} gói × ${formatQuantity(item.packageBaseQuantity)} ${unit}`
  return `${mark} ${item.foodNameVi} — ${packages} (~${formatVnd(item.lineCostVnd)} VND)`
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
  unitLabel: (baseUnitId: string) => string
): string {
  const sections = GROCERY_CATEGORIES.map((category) => {
    const items = value.items
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

  const remaining = value.items
    .filter((item) => !item.checked)
    .reduce((total, item) => total + item.lineCostVnd, 0)

  const header = `Đi chợ — tuần từ ${formatWeekStart(value.weekStart)}`
  const footer =
    remaining === value.totalEstimatedCostVnd
      ? `Tổng ước tính: ${formatVnd(value.totalEstimatedCostVnd)} VND`
      : `Còn phải mua: ${formatVnd(remaining)} VND / tổng ${formatVnd(value.totalEstimatedCostVnd)} VND`

  return [header, ...sections, footer].join("\n\n")
}
