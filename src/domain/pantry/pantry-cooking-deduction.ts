import {
  ExactDecimal,
  type ExactDecimalValue,
  ROUND_HALF_UP,
  decimalToCanonical,
  parseCanonicalDecimal,
  roundDecimal
} from "../shared/decimal.js"

export interface CookingDeductionPantryItem {
  readonly pantryItemId: string
  readonly foodId: string
  readonly foodFactVersionId: string
  readonly quantity: string
  readonly unitId: string
  readonly baseQuantity: string
  readonly baseUnitId: string
  readonly version: number
}

export interface CookingDeductionMealIngredient {
  readonly foodId: string
  readonly baseQuantity: string
  readonly baseUnitId: string
}

export interface CookingDeductionFoodOption {
  readonly foodId: string
  readonly foodNameVi: string
  readonly foodFactVersionId: string
  readonly baseUnitId: string
  readonly units: readonly {
    readonly unitId: string
    readonly unitCode: string
    readonly unitNameVi: string
    readonly baseQuantityPerUnit?: string
  }[]
  readonly wholeUnitPolicy?: {
    readonly baseQuantityPerPiece: string
  }
}

export interface CookingPantryDeductionResultItem {
  readonly pantryItemId: string
  readonly foodId: string
  readonly foodNameVi: string
  readonly foodFactVersionId: string
  readonly unitId: string
  readonly unitNameVi: string
  readonly currentQuantity: string
  readonly usedQuantity: string
  readonly remainingQuantity: string
  readonly action: "update" | "remove"
  readonly expectedVersion: number
}

/**
 * Calculates the inventory deduction for pantry items after cooking a meal.
 * Matches pantry items with meal ingredients by foodId, aggregates ingredients across
 * meal recipes, respects whole-unit packaging (like eggs), converts units according to
 * food fact conversions, and determines whether each pantry item should be updated or removed.
 */
export function calculatePantryCookingDeduction(
  pantryItems: readonly CookingDeductionPantryItem[],
  mealIngredients: readonly CookingDeductionMealIngredient[],
  foodOptions: readonly CookingDeductionFoodOption[]
): CookingPantryDeductionResultItem[] {
  if (pantryItems.length === 0 || mealIngredients.length === 0) {
    return []
  }

  // 1. Aggregate meal requirements by foodId
  const mealRequirementsByFood = new Map<string, ExactDecimalValue>()
  for (const ingredient of mealIngredients) {
    const parsed = parseCanonicalDecimal(ingredient.baseQuantity, {
      allowNegative: false,
      maxScale: 18,
      maxIntegerDigits: 34
    })
    if (!parsed.ok || parsed.value.isZero()) continue

    const currentTotal = mealRequirementsByFood.get(ingredient.foodId) ?? new ExactDecimal(0)
    mealRequirementsByFood.set(ingredient.foodId, currentTotal.plus(parsed.value))
  }

  if (mealRequirementsByFood.size === 0) {
    return []
  }

  // Map food options for fast lookup
  const optionsByFoodId = new Map<string, CookingDeductionFoodOption>()
  for (const option of foodOptions) {
    optionsByFoodId.set(option.foodId, option)
  }

  const results: CookingPantryDeductionResultItem[] = []

  // 2. Iterate pantry items and compute deduction for matched items
  for (const pantryItem of pantryItems) {
    const totalRequiredBase = mealRequirementsByFood.get(pantryItem.foodId)
    if (totalRequiredBase === undefined || totalRequiredBase.isZero()) {
      continue
    }

    const parsedAvailableBase = parseCanonicalDecimal(pantryItem.baseQuantity, {
      allowNegative: false,
      maxScale: 18,
      maxIntegerDigits: 34
    })
    const parsedCurrentQuantity = parseCanonicalDecimal(pantryItem.quantity, {
      allowNegative: false,
      maxScale: 6,
      maxIntegerDigits: 12
    })

    if (
      !parsedAvailableBase.ok ||
      !parsedCurrentQuantity.ok ||
      parsedAvailableBase.value.isZero()
    ) {
      continue
    }

    const option = optionsByFoodId.get(pantryItem.foodId)
    const foodNameVi = option?.foodNameVi ?? "Thực phẩm"
    const unit = option?.units.find((u) => u.unitId === pantryItem.unitId)
    const unitNameVi = unit?.unitNameVi ?? unit?.unitCode ?? "phần"

    // Determine baseQuantityPerUnit
    let baseQuantityPerUnit: ExactDecimalValue
    if (unit?.baseQuantityPerUnit) {
      baseQuantityPerUnit = new ExactDecimal(unit.baseQuantityPerUnit)
    } else if (pantryItem.unitId === pantryItem.baseUnitId) {
      baseQuantityPerUnit = new ExactDecimal(1)
    } else if (!parsedCurrentQuantity.value.isZero()) {
      baseQuantityPerUnit = parsedAvailableBase.value.div(parsedCurrentQuantity.value)
    } else {
      baseQuantityPerUnit = new ExactDecimal(1)
    }

    if (baseQuantityPerUnit.isZero()) {
      continue
    }

    // Determine used base quantity, taking into account wholeUnitPolicy
    let usedBaseQuantity: ExactDecimalValue
    if (option?.wholeUnitPolicy?.baseQuantityPerPiece) {
      const pieceBase = new ExactDecimal(option.wholeUnitPolicy.baseQuantityPerPiece)
      if (!pieceBase.isZero()) {
        const requiredPieces = totalRequiredBase.div(pieceBase).ceil()
        const requiredPieceBase = requiredPieces.mul(pieceBase)
        usedBaseQuantity = ExactDecimal.min(requiredPieceBase, parsedAvailableBase.value)
      } else {
        usedBaseQuantity = ExactDecimal.min(totalRequiredBase, parsedAvailableBase.value)
      }
    } else {
      usedBaseQuantity = ExactDecimal.min(totalRequiredBase, parsedAvailableBase.value)
    }

    const remainingBaseQuantity = ExactDecimal.max(
      parsedAvailableBase.value.minus(usedBaseQuantity),
      new ExactDecimal(0)
    )

    const usedInUnit = usedBaseQuantity.div(baseQuantityPerUnit)
    const usedQuantity = roundDecimal(usedInUnit, 6, ROUND_HALF_UP)

    // If practically zero used in unit, skip
    if (usedQuantity === "0") {
      continue
    }

    let remainingQuantity: string
    let action: "update" | "remove"

    if (remainingBaseQuantity.isZero()) {
      remainingQuantity = "0"
      action = "remove"
    } else {
      const remainingInUnit = remainingBaseQuantity.div(baseQuantityPerUnit)
      remainingQuantity = roundDecimal(remainingInUnit, 6, ROUND_HALF_UP)
      if (remainingQuantity === "0") {
        action = "remove"
      } else {
        action = "update"
      }
    }

    results.push({
      pantryItemId: pantryItem.pantryItemId,
      foodId: pantryItem.foodId,
      foodNameVi,
      foodFactVersionId: option?.foodFactVersionId ?? pantryItem.foodFactVersionId,
      unitId: pantryItem.unitId,
      unitNameVi,
      currentQuantity: decimalToCanonical(parsedCurrentQuantity.value),
      usedQuantity,
      remainingQuantity,
      action,
      expectedVersion: pantryItem.version
    })
  }

  return results
}
