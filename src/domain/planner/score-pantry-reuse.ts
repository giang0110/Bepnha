import type { CanonicalFoodDeduction, CanonicalFoodRequirement } from "@/domain/pricing/pricing"
import { ExactDecimal, ROUND_HALF_UP } from "@/domain/shared/decimal"

export interface PantryReuseScore {
  readonly penalty: number
  readonly eligibleFoodCount: number
  readonly coveredFoodCount: number
}

interface AggregatedRequirement {
  readonly baseUnitId: string
  readonly required: InstanceType<typeof ExactDecimal>
}

export function scorePantryReuse(
  requirements: readonly CanonicalFoodRequirement[],
  deductions: readonly CanonicalFoodDeduction[],
  maxPenalty: number
): PantryReuseScore {
  if (!Number.isSafeInteger(maxPenalty) || maxPenalty < 0) {
    throw new Error("INVALID_PANTRY_REUSE_MAX_PENALTY")
  }

  const requiredByFood = new Map<string, AggregatedRequirement>()
  for (const requirement of requirements) {
    const required = new ExactDecimal(requirement.requiredBaseQuantity)
    if (required.isNegative()) throw new Error("INVALID_PANTRY_REUSE_REQUIRED_QUANTITY")
    const existing = requiredByFood.get(requirement.foodId)
    if (existing !== undefined && existing.baseUnitId !== requirement.baseUnitId) {
      throw new Error("PANTRY_REUSE_BASE_UNIT_MISMATCH")
    }
    requiredByFood.set(requirement.foodId, {
      baseUnitId: requirement.baseUnitId,
      required: (existing?.required ?? new ExactDecimal(0)).plus(required)
    })
  }

  const availableByFood = new Map<string, CanonicalFoodDeduction>()
  for (const deduction of deductions) {
    const existing = availableByFood.get(deduction.foodId)
    if (existing !== undefined) throw new Error("DUPLICATE_PANTRY_REUSE_DEDUCTION")
    const available = new ExactDecimal(deduction.availableBaseQuantity)
    if (available.isNegative()) throw new Error("INVALID_PANTRY_REUSE_AVAILABLE_QUANTITY")
    const required = requiredByFood.get(deduction.foodId)
    if (required !== undefined && required.baseUnitId !== deduction.baseUnitId) {
      throw new Error("PANTRY_REUSE_BASE_UNIT_MISMATCH")
    }
    availableByFood.set(deduction.foodId, deduction)
  }

  const eligible = [...requiredByFood.entries()]
    .filter(([, requirement]) => requirement.required.isPositive())
    .sort(([left], [right]) => left.localeCompare(right))
  if (eligible.length === 0) {
    return { penalty: 0, eligibleFoodCount: 0, coveredFoodCount: 0 }
  }

  let coveredFoodCount = 0
  const coverageSum = eligible.reduce((sum, [foodId, requirement]) => {
    const deduction = availableByFood.get(foodId)
    if (deduction === undefined) return sum
    const available = new ExactDecimal(deduction.availableBaseQuantity)
    if (available.isPositive()) coveredFoodCount += 1
    const covered = ExactDecimal.min(available, requirement.required)
    return sum.plus(covered.div(requirement.required))
  }, new ExactDecimal(0))

  const averageCoverage = coverageSum.div(eligible.length)
  const penalty = new ExactDecimal(maxPenalty)
    .times(new ExactDecimal(1).minus(averageCoverage))
    .toDecimalPlaces(0, ROUND_HALF_UP)
    .toNumber()

  return {
    penalty: Math.min(maxPenalty, Math.max(0, penalty)),
    eligibleFoodCount: eligible.length,
    coveredFoodCount
  }
}
