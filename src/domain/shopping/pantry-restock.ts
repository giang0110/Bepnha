import { ExactDecimal } from "../shared/decimal.js"

/**
 * What a finished shopping trip would change in the pantry.
 *
 * A line qualifies when the household ticked it — they actually bought it — and it still has
 * something to settle: a leftover to put in, a pantry deduction to take out, or both. A line that
 * has already been settled is excluded, which is the whole reason the screen can stop offering a
 * button that would do nothing.
 *
 * Both directions matter. The leftover goes in, because what this week needs will be cooked and
 * only the surplus is durable. The deduction comes out, because the plan already spent that part of
 * the pantry when it decided how little to buy — leaving it in was what made the pantry grow
 * forever and every later week under-buy.
 *
 * The authoritative change happens in `apply_shopping_to_pantry`, which holds the locks and the
 * per-item latch. This mirror exists so the screen can count what is waiting without asking.
 */
export interface PantryRestockCandidate {
  readonly shoppingListItemId: string
  readonly foodId: string
  readonly leftoverBaseQuantity: string
  readonly pantryDeductedBaseQuantity: string
}

interface RestockInput {
  readonly shoppingListItemId: string
  readonly foodId: string
  readonly leftoverBaseQuantity: string
  readonly pantryDeductedBaseQuantity: string
  readonly checked: boolean
  readonly transferredToPantry: boolean
}

export function pantryRestockCandidates(
  items: readonly RestockInput[]
): readonly PantryRestockCandidate[] {
  return items
    .filter(
      (item) =>
        item.checked &&
        !item.transferredToPantry &&
        (new ExactDecimal(item.leftoverBaseQuantity).greaterThan(0) ||
          new ExactDecimal(item.pantryDeductedBaseQuantity).greaterThan(0))
    )
    .map((item) => ({
      shoppingListItemId: item.shoppingListItemId,
      foodId: item.foodId,
      leftoverBaseQuantity: item.leftoverBaseQuantity,
      pantryDeductedBaseQuantity: item.pantryDeductedBaseQuantity
    }))
}
