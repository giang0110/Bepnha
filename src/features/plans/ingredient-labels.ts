import type { PantryFoodOption } from "@/application/pantry/pantry-food-options-repository"

import type { PlanIngredientView } from "./planner-api"

export interface IngredientLabels {
  readonly foodNames: ReadonlyMap<string, string>
  readonly unitCodes: ReadonlyMap<string, string>
}

export const EMPTY_INGREDIENT_LABELS: IngredientLabels = {
  foodNames: new Map(),
  unitCodes: new Map()
}

export function ingredientLabels(options: readonly PantryFoodOption[]): IngredientLabels {
  const foodNames = new Map<string, string>()
  const unitCodes = new Map<string, string>()
  for (const option of options) {
    foodNames.set(option.foodId, option.foodNameVi)
    for (const unit of option.units) unitCodes.set(unit.unitId, unit.unitCode)
  }
  return { foodNames, unitCodes }
}

/**
 * Describes one scaled ingredient the way a person shops for it.
 *
 * The identifiers are the fallback rather than the answer: a food the lookup does not know is still
 * worth showing with its quantity, and showing its id says plainly that something is missing. The
 * previous version guessed the unit by matching the identifier against `unit-g`, which is the shape
 * test fixtures use — production identifiers are uuids, so every line fell through to "đơn vị cơ sở"
 * and told the reader nothing at all.
 */
export function describeIngredient(
  ingredient: PlanIngredientView,
  labels: IngredientLabels
): string {
  const name = labels.foodNames.get(ingredient.foodId)
  const unit = labels.unitCodes.get(ingredient.baseUnitId)
  const quantity =
    unit === undefined ? ingredient.baseQuantity : `${ingredient.baseQuantity} ${unit}`
  return name === undefined ? `${ingredient.foodId} — ${quantity}` : `${name} — ${quantity}`
}
