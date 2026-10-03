import type { PantryFoodOption } from "@/application/pantry/pantry-food-options-repository"
import { ExactDecimal } from "@/domain/shared/decimal"
export function pantryQuantityIsWhole(
  option: PantryFoodOption,
  quantity: string,
  unitId: string,
  foodFactVersionId = option.foodFactVersionId
): boolean {
  if (!option.wholeUnitPolicy || foodFactVersionId !== option.foodFactVersionId) return true
  const unit = option.units.find((u) => u.unitId === unitId)
  if (!unit?.baseQuantityPerUnit) return false
  try {
    return new ExactDecimal(quantity)
      .mul(unit.baseQuantityPerUnit)
      .div(option.wholeUnitPolicy.baseQuantityPerPiece)
      .isInteger()
  } catch {
    return false
  }
}
