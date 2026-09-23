import type { ShoppingListItem } from "@/application/shopping/shopping-list-repository"

export interface ShoppingProgress {
  readonly checkedCount: number
  readonly totalCount: number
  /** What the unticked lines still add up to. Derived, never authoritative. */
  readonly remainingCostVnd: number
  /** What the ticked lines came to, so the two figures visibly account for the whole list. */
  readonly pickedUpCostVnd: number
}

/**
 * How much of the trip is left, in items and in money.
 *
 * The page already showed a total and a ticked count, which between them answer neither question a
 * shopper actually has halfway down an aisle: how much is still in front of me, and how much have I
 * already committed. Both are sums over lines the plan fixed — nothing here prices anything or
 * decides what to buy; `totalEstimatedCostVnd` on the stored list stays the authoritative figure
 * and the page keeps showing it.
 *
 * A line with no purchase left to make still costs 0 and still counts as an item, because the
 * shopper still has to look at it and decide it is already covered.
 */
export function shoppingProgress(items: readonly ShoppingListItem[]): ShoppingProgress {
  let checkedCount = 0
  let remainingCostVnd = 0
  let pickedUpCostVnd = 0

  for (const item of items) {
    if (item.checked) {
      checkedCount += 1
      pickedUpCostVnd += item.lineCostVnd
    } else {
      remainingCostVnd += item.lineCostVnd
    }
  }

  return { checkedCount, totalCount: items.length, remainingCostVnd, pickedUpCostVnd }
}
