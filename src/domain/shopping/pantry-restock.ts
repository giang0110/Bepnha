import { ExactDecimal } from "../shared/decimal.js"

/**
 * What a finished shopping trip would put into the pantry.
 *
 * A line qualifies when the household ticked it — they actually bought it — and the purchase leaves
 * something over. The leftover is the durable part: what this week needs will be cooked, so adding
 * the whole package would overstate the pantry and next week's plan would under-buy.
 *
 * The authoritative transfer happens in `apply_shopping_to_pantry`, which holds the locks and the
 * idempotency key. This mirror exists so the screen can say how many items are waiting and disable
 * a button that would do nothing, without asking the database to find out.
 */
export interface PantryRestockCandidate {
  readonly shoppingListItemId: string
  readonly foodId: string
  readonly leftoverBaseQuantity: string
}

interface RestockInput {
  readonly shoppingListItemId: string
  readonly foodId: string
  readonly leftoverBaseQuantity: string
  readonly checked: boolean
}

export function pantryRestockCandidates(
  items: readonly RestockInput[]
): readonly PantryRestockCandidate[] {
  return items
    .filter((item) => item.checked && new ExactDecimal(item.leftoverBaseQuantity).greaterThan(0))
    .map((item) => ({
      shoppingListItemId: item.shoppingListItemId,
      foodId: item.foodId,
      leftoverBaseQuantity: item.leftoverBaseQuantity
    }))
}
