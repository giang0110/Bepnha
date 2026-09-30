import type { GroceryCategoryCode } from "./grocery-category-config"

export type ShoppingDestination = "all" | "wet_market" | "supermarket"
export type ShoppingCheckStatusFilter = "all" | "remaining" | "checked"

export interface ShoppingDestinationOption {
  readonly id: ShoppingDestination
  readonly labelVi: string
  readonly shortLabelVi: string
  readonly iconName: string
}

export const SHOPPING_DESTINATIONS: readonly ShoppingDestinationOption[] = Object.freeze([
  { id: "all", labelVi: "Tất cả các quầy", shortLabelVi: "Tất cả", iconName: "basket" },
  {
    id: "wet_market",
    labelVi: "Chợ dân sinh (Đồ tươi)",
    shortLabelVi: "Chợ dân sinh",
    iconName: "bowl"
  },
  {
    id: "supermarket",
    labelVi: "Siêu thị / Tạp hóa (Gia vị & Đồ khô)",
    shortLabelVi: "Siêu thị / Tạp hóa",
    iconName: "clock"
  }
])

export function categoryDestination(
  categoryCode: GroceryCategoryCode
): "wet_market" | "supermarket" {
  switch (categoryCode) {
    case "fresh_produce":
    case "meat_seafood":
    case "eggs_tofu_dairy":
      return "wet_market"
    case "staples":
    case "seasonings":
    case "other":
    default:
      return "supermarket"
  }
}

export function filterItemsByDestination<
  T extends { readonly groceryCategoryCode: GroceryCategoryCode }
>(items: readonly T[], destination: ShoppingDestination): readonly T[] {
  if (destination === "all") return items
  return items.filter((item) => categoryDestination(item.groceryCategoryCode) === destination)
}

export function filterItemsByCheckStatus<T extends { readonly checked: boolean }>(
  items: readonly T[],
  status: ShoppingCheckStatusFilter
): readonly T[] {
  if (status === "all") return items
  if (status === "remaining") return items.filter((item) => !item.checked)
  return items.filter((item) => item.checked)
}
